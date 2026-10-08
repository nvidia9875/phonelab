"""PhoneLab API — Cloud Run entrypoint.

/api/* と、スパイクの検証ページ、PWA（web/dist）の配信。
（DeviceMotion は HTTPS が必須なので、スパイク B はこの URL の上で行う）
注意: /healthz は Google Front End が手前で 404 を返しコンテナに届かないので使わない。
"""

from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from google.adk.runners import Runner
from opentelemetry import trace
from pydantic import BaseModel, Field, field_validator

from server.agent.answers import MODEL_ANSWERS, phrases_for
from server.agent.catalog import CATALOG, candidates_for, short_changes
from server.agent.model_armor import armor_from_env
from server.agent.models import gemini
from server.agent.planner import (
    HoldCode,
    PlanContext,
    ReplanContext,
    build_plan_prompt,
    build_replan_prompt,
    planner_model,
    template_advice,
)
from server.agent.planner_tools import (
    CLASS_RULES_KEY,
    PLAN_CATALOG_KEY,
    catalog_for_tools,
    planner_tools_enabled,
)
from server.agent.policy import PredictionCheck, check_prediction
from server.agent.policy_plugin import PLANNER_CALLS_PER_EXPERIMENT, REPLAN_CALLS_PER_RECORD
from server.agent.runner import (
    CHAT_TURNS_PER_RECORD,
    build_replan_runner,
    build_runner,
    build_tutor_runner,
    run_planner,
    run_replan,
    run_tutor,
)
from server.agent.trail import (
    check_lines,
    chose_line,
    experiment_words,
    policy_before_line,
    read_line,
    trail,
    variable_words,
)
from server.agent.tutor import ChatTurn, TutorContext, build_tutor_prompt, chat_model
from server.classroom import ClassStore, normalize_code, seed_demo
from server.guards import (
    HALTED_DETAIL,
    MAX_CLASS_CODE_CHARS,
    RetryGate,
    call_count,
    check_limits,
    class_denies_theme,
    class_is_halted,
    class_rules,
    get_student_limiter,
)
from server.ratelimit import SlidingWindowLimiter
from server.routes_class import get_class_store, records_router, verify_student
from server.routes_class import router as class_router
from server.routes_insight import router as insight_router
from server.routes_next import router as next_router
from server.samples import seed_samples
from server.security_headers import SecurityHeaders
from server.telemetry import disable_content_capture, setup_cloud_tracing

STATIC = Path(__file__).parent / "static"
WEB_DIST = Path(__file__).resolve().parent.parent / "web" / "dist"
SPIKE_AGENT_FLAG = "PHONELAB_ENABLE_SPIKE_AGENT"
MAX_PREDICTION_CHARS = 500

logger = logging.getLogger(__name__)
disable_content_capture()
setup_cloud_tracing()
_tracer = trace.get_tracer("phonelab.api")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """起動時に審査員向けの学級 DEMO-2026 を作る（PHONELAB_DEMO_PIN があるとき）"""
    try:
        await seed_demo(get_class_store())
        await seed_samples(get_class_store())
    except Exception:
        logger.exception("学級の初期化に失敗（学級の API は動かない可能性）")
    yield


app = FastAPI(title="PhoneLab", version="0.0.1", lifespan=lifespan)
app.add_middleware(SecurityHeaders)
app.include_router(class_router)
app.include_router(records_router)
app.include_router(next_router)
app.include_router(insight_router)


async def judged_on_server(
    store: ClassStore,
    code: str,
    number: str | None,
    secret: str | None,
    record_id: str | None,
    variant_id: str,
) -> bool:
    """この記録は、この生徒のもので、聞いている実験そのもので、向きの決まった判定が出ているか。
    要約が届いていなければ開かない（9/18 Codex I3）。別の実験の判定や、ばらつきで保留した判定では開かない（10/2 採点 2-6）"""
    if not number or not record_id:
        return False
    await verify_student(store, normalize_code(code), number.strip().upper(), secret)
    current = await store.get_current(normalize_code(code), number.strip().upper())
    result = (current or {}).get("result") or {}
    return bool(
        current
        and str(current.get("record_id")) == record_id
        and current.get("variant_id") == variant_id
        and current.get("status") in ("judged", "signed")
        and result.get("observed") in ("faster", "slower", "same")
    )


@app.get("/api/status")
def status() -> dict[str, str]:
    return {"status": "ok", "revision": os.environ.get("K_REVISION", "local")}


class SpikeAgentRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_PREDICTION_CHARS)
    planner_calls: int = Field(default=0, ge=0, le=PLANNER_CALLS_PER_EXPERIMENT)


class SpikeAgentResponse(BaseModel):
    reply: str
    skipped: bool
    planner_calls: int
    trace_id: str


def require_spike_agent_enabled() -> None:
    """公開 URL から Gemini を呼べる入口なので、env で明示したときだけ開ける。"""
    if os.environ.get(SPIKE_AGENT_FLAG) != "1":
        raise HTTPException(status_code=404)


@lru_cache(maxsize=1)
def get_planner_runner() -> Runner:
    return build_runner(
        gemini(planner_model()), with_tools=planner_tools_enabled(), armor=armor_from_env()
    )


@app.post("/api/spike/agent", dependencies=[Depends(require_spike_agent_enabled)])
async def spike_agent(
    body: SpikeAgentRequest,
    runner: Annotated[Runner, Depends(get_planner_runner)],
) -> SpikeAgentResponse:
    """スパイク B5: ADK Runner + PolicyPlugin を通して Planner を 1 回呼ぶ。"""
    with _tracer.start_as_current_span("phonelab.spike_agent") as span:
        span.set_attribute("phonelab.text_len", len(body.text))
        trace_id = format(span.get_span_context().trace_id, "032x")
        try:
            reply = await run_planner(runner, text=body.text, planner_calls=body.planner_calls)
        except Exception as exc:
            logger.exception("Planner の実行に失敗 (trace_id=%s)", trace_id)
            raise HTTPException(status_code=502, detail="Agent の呼び出しに失敗しました") from exc

    return SpikeAgentResponse(
        reply=reply.text,
        skipped=reply.skipped,
        planner_calls=reply.planner_calls,
        trace_id=trace_id,
    )


# ---- Planner: 予想を読んで実験を一つ選ぶ（docs/architecture.md 2.2、docs/policy.md 3.2〜3.4） ----

PLAN_REQUESTS_PER_WINDOW = 240
PLAN_WINDOW_S = 600
PLAN_TIMEOUT_S = 12  # 端末はこれを超えたら端末内の縮退（stub）で進む
MAX_DONE_IDS = 10
MAX_QUESTION_BACK_CHARS = 200

PlanKind = Literal["plan", "question", "hint", "rejected"]
PlanSource = Literal["agent", "policy", "catalog"]


class PlanRequest(BaseModel):
    theme_id: str
    school: Literal["jhs", "hs"]
    text: str = Field(min_length=1, max_length=MAX_PREDICTION_CHARS)
    done_variant_ids: list[Annotated[str, Field(max_length=60)]] = Field(
        default_factory=list, max_length=MAX_DONE_IDS
    )
    previous_question_back: str | None = Field(default=None, max_length=MAX_QUESTION_BACK_CHARS)
    planner_calls: int = Field(default=0, ge=0, le=PLANNER_CALLS_PER_EXPERIMENT)
    class_code: str | None = Field(default=None, max_length=MAX_CLASS_CODE_CHARS)
    number: str | None = Field(default=None, max_length=8)
    # 学級の生徒は合言葉と記録 id を付ける。回数はサーバが数える
    secret: str | None = Field(default=None, max_length=6)
    record_id: str | None = Field(default=None, max_length=12)

    @field_validator("theme_id")
    @classmethod
    def known_theme(cls, value: str) -> str:
        if value not in CATALOG:
            raise ValueError("カタログにないテーマです")
        return value


class ClaimOut(BaseModel):
    variable: str
    direction: str


class RejectionOut(BaseModel):
    title: str
    reasons: list[str]
    quoted: str
    alternative_variant_id: str


class PlanResponse(BaseModel):
    kind: PlanKind
    variant_id: str | None = None
    claim: ClaimOut | None = None
    why: str = ""
    question_back: str | None = None
    rejection: RejectionOut | None = None
    planner_calls: int
    skipped: bool = False
    # Policy が Planner の出力を直した（候補外の id、理由に混じった結果、読めない出力）
    policy_fixed: bool = False
    # 1 回目が検査に落ち、理由を伝えて作り直してもらったら、その理由と結果
    fix_reasons: list[str] = Field(default_factory=list)
    self_corrected: bool = False
    # 判断の跡（何を読み、何を選び、統制層が何を直したか）。本文は入れない
    trail: list[str] = Field(default_factory=list)
    source: PlanSource
    trace_id: str


@lru_cache(maxsize=1)
def get_plan_limiter() -> SlidingWindowLimiter:
    return SlidingWindowLimiter(limit=PLAN_REQUESTS_PER_WINDOW, window_s=PLAN_WINDOW_S)


@app.post("/api/plan")
async def plan(
    body: PlanRequest,
    request: Request,
    runner: Annotated[Runner, Depends(get_planner_runner)],
    limiter: Annotated[SlidingWindowLimiter, Depends(get_plan_limiter)],
    store: Annotated[ClassStore, Depends(get_class_store)],
    student_limiter: Annotated[SlidingWindowLimiter, Depends(get_student_limiter)],
) -> PlanResponse:
    """決定論の Policy → Planner（Gemini、構造化出力）→ PolicyPlugin の突き合わせ。答えは渡さない。"""
    check_limits(
        request,
        limiter,
        student_limiter,
        body.class_code,
        body.number,
        "少し時間をおいてから、もう一度送ってください",
    )
    halted = await class_is_halted(store, body.class_code)
    if halted:
        raise HTTPException(status_code=409, detail=HALTED_DETAIL)
    count = await call_count(
        store,
        kind="plan",
        claimed=body.planner_calls,
        class_code=body.class_code,
        number=body.number,
        secret=body.secret,
        record_id=body.record_id,
    )
    planner_calls = count.start

    candidates = candidates_for(body.theme_id, body.done_variant_ids)
    first = candidates[0]
    theme = CATALOG[body.theme_id]
    variables = {v.variable for v in theme.variants}
    denied = await class_denies_theme(store, body.class_code, theme)

    with _tracer.start_as_current_span("phonelab.plan") as span:
        span.set_attribute("phonelab.theme", body.theme_id)
        span.set_attribute("phonelab.text_len", len(body.text))
        span.set_attribute("phonelab.planner_calls", planner_calls)
        trace_id = format(span.get_span_context().trace_id, "032x")

        check = check_prediction(body.text)
        if denied:
            check = PredictionCheck(kind="hint", message=denied)
        span.set_attribute("phonelab.policy", "class_policy" if denied else check.kind)
        read = read_line(f"予想（{len(body.text)} 字）と、選べる実験 {len(candidates)} 件")
        if check.kind == "hint":
            return PlanResponse(
                kind="hint",
                question_back=check.message,
                planner_calls=planner_calls,
                source="policy",
                trail=trail(read, policy_before_line("class_policy" if denied else "hint")),
                trace_id=trace_id,
            )
        if check.kind == "reject" and check.rejection:
            rejection = check.rejection
            return PlanResponse(
                kind="rejected",
                variant_id=first.id,
                rejection=RejectionOut(
                    title=rejection.title,
                    reasons=list(rejection.reasons),
                    quoted=rejection.quoted,
                    alternative_variant_id=first.id,
                ),
                planner_calls=planner_calls,
                source="policy",
                trail=trail(read, policy_before_line("reject")),
                trace_id=trace_id,
            )

        with_tools = planner_tools_enabled()
        prompt = build_plan_prompt(
            PlanContext(
                school=body.school,
                theme_id=body.theme_id,
                text=body.text,
                candidates=candidates,
                previous_question_back=body.previous_question_back,
            ),
            with_tools=with_tools,
        )
        tool_state = (
            {
                PLAN_CATALOG_KEY: catalog_for_tools(theme, candidates),
                CLASS_RULES_KEY: await class_rules(store, body.class_code),
            }
            if with_tools
            else None
        )
        count = await count.reserve(store, PLANNER_CALLS_PER_EXPERIMENT)
        planner_calls = count.start
        gate = RetryGate(count, store, PLANNER_CALLS_PER_EXPERIMENT)
        try:
            reply = await asyncio.wait_for(
                run_planner(
                    runner,
                    text=prompt,
                    planner_calls=planner_calls,
                    candidates=[c.id for c in candidates],
                    class_halted=halted,
                    tool_state=tool_state,
                    armor_text=body.text,
                    student_text=body.text,
                    before_retry=gate,
                ),
                timeout=PLAN_TIMEOUT_S,
            )
        except TimeoutError as exc:
            logger.warning("Planner が %s 秒を超えた (trace_id=%s)", PLAN_TIMEOUT_S, trace_id)
            raise HTTPException(status_code=504, detail="ラボ先生の返事が遅れています") from exc
        except Exception as exc:
            logger.exception("Planner の実行に失敗 (trace_id=%s)", trace_id)
            raise HTTPException(status_code=502, detail="ラボ先生につながりませんでした") from exc
        span.set_attribute("phonelab.skipped", reply.skipped)
        span.set_attribute("phonelab.plan_readable", reply.plan is not None)
        span.set_attribute("phonelab.policy_fixed", reply.off_catalog or reply.why_replaced)
        span.set_attribute("phonelab.self_corrected", reply.self_corrected)
    await gate.settle(reply.planner_calls - planner_calls)

    checked = check_lines(reply.fix_reasons, reply.retried, reply.self_corrected)
    fixes = {"fix_reasons": list(reply.fix_reasons), "self_corrected": reply.self_corrected}
    if reply.armor_blocked:
        return PlanResponse(
            kind="rejected",
            variant_id=first.id,
            rejection=RejectionOut(
                title="Model Armor が、ラボ先生への指示か授業に合わない言葉を検知",
                reasons=[
                    "予想の中の指示は、実験の命令としては読みません",
                    "この文はラボ先生（Gemini）に渡していません",
                    "自分の言葉で予想を書き直すか、代わりの実験から始められます",
                ],
                quoted="",
                alternative_variant_id=first.id,
            ),
            planner_calls=reply.planner_calls,
            source="policy",
            trail=trail(
                read,
                "AI に渡す前のチェック（Model Armor）: 命令や授業に合わない言葉 → 止めた（AI は呼ばない）",
            ),
            trace_id=trace_id,
        )
    if reply.skipped:
        return PlanResponse(
            kind="plan",
            variant_id=first.id,
            why="ラボ先生に聞ける回数の上限に達したので、カタログの順で進めます",
            planner_calls=reply.planner_calls,
            skipped=True,
            source="catalog",
            trail=trail(read, policy_before_line("limit"), chose_line(experiment_words(first.id))),
            trace_id=trace_id,
        )
    if reply.plan is None:
        return PlanResponse(
            kind="plan",
            variant_id=first.id,
            why=f"まず{short_changes(first)}だけを変えて、予想の土台を確かめます",
            planner_calls=reply.planner_calls,
            policy_fixed=True,
            source="catalog",
            trail=trail(
                read,
                policy_before_line("allow"),
                checked,
                chose_line(f"{experiment_words(first.id)}（カタログの順）"),
            ),
            trace_id=trace_id,
            **fixes,
        )
    out = reply.plan
    if out.question_back and not body.previous_question_back:
        return PlanResponse(
            kind="question",
            question_back=out.question_back[:MAX_QUESTION_BACK_CHARS],
            planner_calls=reply.planner_calls,
            source="agent",
            trail=trail(
                read, policy_before_line("allow"), chose_line("理由を一つ問い返す"), checked
            ),
            trace_id=trace_id,
            **fixes,
        )
    return PlanResponse(
        kind="plan",
        variant_id=out.experiment_id,
        claim=ClaimOut(
            variable=out.claim_variable if out.claim_variable in variables else "unknown",
            direction=out.claim_direction,
        ),
        why=out.why_this,
        planner_calls=reply.planner_calls,
        policy_fixed=reply.off_catalog or reply.why_replaced,
        source="agent",
        trail=trail(
            read,
            policy_before_line("allow"),
            chose_line(
                f"{experiment_words(out.experiment_id)}"
                f"（予想は「{variable_words(body.theme_id, out.claim_variable)}」を変える話と読んだ）"
            ),
            checked,
        ),
        trace_id=trace_id,
        **fixes,
    )


# ---- Replanner: 保留の理由を読んで次の一手を提案する（結果を見て計画を修正する小さなループ） ----

REPLAN_TIMEOUT_S = 12
MAX_HOLD_CODES = 10
HoldAction = Literal["retry", "switch"]


class ReplanRequest(BaseModel):
    theme_id: str
    variant_id: str
    condition: Literal["A", "B"]
    hold_codes: list[HoldCode] = Field(default_factory=list, max_length=MAX_HOLD_CODES)
    retries: int = Field(default=0, ge=0, le=10)
    prediction: str = Field(default="", max_length=MAX_PREDICTION_CHARS)
    done_variant_ids: list[Annotated[str, Field(max_length=60)]] = Field(
        default_factory=list, max_length=MAX_DONE_IDS
    )
    replan_calls: int = Field(default=0, ge=0, le=REPLAN_CALLS_PER_RECORD)
    class_code: str | None = Field(default=None, max_length=MAX_CLASS_CODE_CHARS)
    number: str | None = Field(default=None, max_length=8)
    secret: str | None = Field(default=None, max_length=6)
    record_id: str | None = Field(default=None, max_length=12)

    @field_validator("theme_id")
    @classmethod
    def known_theme(cls, value: str) -> str:
        if value not in CATALOG:
            raise ValueError("カタログにないテーマです")
        return value

    @field_validator("variant_id")
    @classmethod
    def known_variant(cls, value: str) -> str:
        if not any(v.id == value for t in CATALOG.values() for v in t.variants):
            raise ValueError("カタログにない実験です")
        return value


class ReplanResponse(BaseModel):
    action: HoldAction
    experiment_id: str | None = None
    advice: str
    source: PlanSource
    policy_fixed: bool = False
    fix_reasons: list[str] = Field(default_factory=list)
    self_corrected: bool = False
    trail: list[str] = Field(default_factory=list)
    replan_calls: int
    trace_id: str


@lru_cache(maxsize=1)
def get_replan_runner() -> Runner:
    return build_replan_runner(gemini(planner_model()))


@app.post("/api/replan")
async def replan(
    body: ReplanRequest,
    request: Request,
    runner: Annotated[Runner, Depends(get_replan_runner)],
    limiter: Annotated[SlidingWindowLimiter, Depends(get_plan_limiter)],
    store: Annotated[ClassStore, Depends(get_class_store)],
    student_limiter: Annotated[SlidingWindowLimiter, Depends(get_student_limiter)],
) -> ReplanResponse:
    """保留の理由（検査コード）を読み、同じ実験で直して測り直すか、別の実験へ切り替えるかを一つ提案する"""
    check_limits(
        request, limiter, student_limiter, body.class_code, body.number, "少し時間をおいてから"
    )
    halted = await class_is_halted(store, body.class_code)
    if halted:
        raise HTTPException(status_code=409, detail=HALTED_DETAIL)
    count = await call_count(
        store,
        kind="replan",
        claimed=body.replan_calls,
        class_code=body.class_code,
        number=body.number,
        secret=body.secret,
        record_id=body.record_id,
    )
    others = tuple(
        v for v in candidates_for(body.theme_id, body.done_variant_ids) if v.id != body.variant_id
    )
    prompt = build_replan_prompt(
        ReplanContext(
            theme_id=body.theme_id,
            variant_id=body.variant_id,
            condition=body.condition,
            hold_codes=tuple(body.hold_codes),
            retries=body.retries,
            prediction=body.prediction,
            candidates=others,
        )
    )
    with _tracer.start_as_current_span("phonelab.replan") as span:
        span.set_attribute("phonelab.theme", body.theme_id)
        span.set_attribute("phonelab.hold_codes", ",".join(body.hold_codes))
        span.set_attribute("phonelab.retries", body.retries)
        trace_id = format(span.get_span_context().trace_id, "032x")
        count = await count.reserve(store, REPLAN_CALLS_PER_RECORD)
        gate = RetryGate(count, store, REPLAN_CALLS_PER_RECORD)
        try:
            reply = await asyncio.wait_for(
                run_replan(
                    runner,
                    prompt=prompt,
                    replan_calls=count.start,
                    candidates=[v.id for v in others],
                    variant_id=body.variant_id,
                    class_halted=halted,
                    before_retry=gate,
                ),
                timeout=REPLAN_TIMEOUT_S,
            )
        except TimeoutError as exc:
            raise HTTPException(status_code=504, detail="ラボ先生の返事が遅れています") from exc
        except Exception as exc:
            logger.exception("Replanner の実行に失敗 (trace_id=%s)", trace_id)
            raise HTTPException(status_code=502, detail="ラボ先生につながりませんでした") from exc
        span.set_attribute("phonelab.skipped", reply.skipped)
        span.set_attribute("phonelab.plan_readable", reply.plan is not None)

    await gate.settle(reply.calls_used)
    calls = min(count.start + reply.calls_used, REPLAN_CALLS_PER_RECORD)
    read = read_line(
        f"保留の理由 {len(body.hold_codes)} 件・同じ条件の保留 {body.retries} 回・ほかの実験 {len(others)} 件"
    )
    fixes = {"fix_reasons": list(reply.fix_reasons), "self_corrected": reply.self_corrected}
    checked = check_lines(reply.fix_reasons, reply.retried, reply.self_corrected)
    if reply.skipped or reply.plan is None:
        return ReplanResponse(
            action="retry",
            advice=template_advice(body.hold_codes),
            source="catalog",
            policy_fixed=reply.plan is None and not reply.skipped,
            replan_calls=calls,
            trail=trail(
                read,
                policy_before_line("limit") if reply.skipped else checked,
                chose_line("定型の測り直し"),
            ),
            trace_id=trace_id,
            **fixes,
        )
    out = reply.plan
    chose = (
        f"別の実験 {out.experiment_id} へ" if out.action == "switch" else "同じ実験で直して測り直す"
    )
    return ReplanResponse(
        action=out.action,
        experiment_id=out.experiment_id if out.action == "switch" else None,
        advice=out.advice[:200] or template_advice(body.hold_codes),
        source="agent",
        policy_fixed=reply.off_catalog or reply.advice_replaced or reply.condition_changed,
        replan_calls=calls,
        trail=trail(read, chose_line(chose), checked),
        trace_id=trace_id,
        **fixes,
    )


@app.get("/spike", response_class=HTMLResponse)
def spike() -> FileResponse:
    """スパイク B1: DeviceMotion で振り子の周期を二系統で測る検証ページ。"""
    return FileResponse(STATIC / "spike.html", media_type="text/html")


MAX_CHAT_CHARS = 500
MAX_CHAT_HISTORY = 20
MAX_HOLD_REASONS = 6
MIN_THINKING_CHARS = 8
CHAT_REQUESTS_PER_WINDOW = 240
CHAT_WINDOW_S = 600
# 返事を待たせすぎない。9/16 に gemini-3.8-flash が 25〜50 秒かかった時間帯があった
CHAT_TIMEOUT_S = 25


class ChatMessage(BaseModel):
    role: Literal["student", "teacher"]
    text: str = Field(min_length=1, max_length=MAX_CHAT_CHARS)


class ChatRequest(BaseModel):
    variant_id: str
    school: Literal["jhs", "hs"]
    theme_title: str = Field(min_length=1, max_length=60)
    variant_title: str = Field(min_length=1, max_length=80)
    situation: Literal["hold", "mismatch", "match", "unjudged"]
    prediction: str = Field(default="", max_length=MAX_CHAT_CHARS)
    result_statement: str = Field(default="", max_length=200)
    hold_reasons: list[Annotated[str, Field(max_length=120)]] = Field(
        default_factory=list, max_length=MAX_HOLD_REASONS
    )
    student_thinking: str = Field(default="", max_length=MAX_CHAT_CHARS)
    messages: list[ChatMessage] = Field(default_factory=list, max_length=MAX_CHAT_HISTORY)
    message: str = Field(min_length=1, max_length=MAX_CHAT_CHARS)
    turns_used: int = Field(default=0, ge=0, le=CHAT_TURNS_PER_RECORD)
    reveal: bool = False
    class_code: str | None = Field(default=None, max_length=MAX_CLASS_CODE_CHARS)
    number: str | None = Field(default=None, max_length=8)
    # 学級に入っている端末は、合言葉と記録 id を付ける。説明の解禁はサーバの記録の状態で決める
    secret: str | None = Field(default=None, max_length=6)
    record_id: str | None = Field(default=None, max_length=12)

    @field_validator("variant_id")
    @classmethod
    def known_variant(cls, value: str) -> str:
        if value not in MODEL_ANSWERS:
            raise ValueError("カタログにない実験です")
        return value


class ChatResponse(BaseModel):
    reply: str
    revealed: bool
    turns_used: int
    limit_reached: bool
    trace_id: str


@lru_cache(maxsize=1)
def get_tutor_runner() -> Runner:
    return build_tutor_runner(gemini(chat_model()), armor=armor_from_env())


@lru_cache(maxsize=1)
def get_chat_limiter() -> SlidingWindowLimiter:
    return SlidingWindowLimiter(limit=CHAT_REQUESTS_PER_WINDOW, window_s=CHAT_WINDOW_S)


@app.post("/api/chat")
async def chat(
    body: ChatRequest,
    request: Request,
    runner: Annotated[Runner, Depends(get_tutor_runner)],
    limiter: Annotated[SlidingWindowLimiter, Depends(get_chat_limiter)],
    store: Annotated[ClassStore, Depends(get_class_store)],
    student_limiter: Annotated[SlidingWindowLimiter, Depends(get_student_limiter)],
) -> ChatResponse:
    """ラボ先生と実験をふり返る。先生の説明は、生徒が自分の考えを書いたあとだけ LLM に渡す。"""
    check_limits(
        request,
        limiter,
        student_limiter,
        body.class_code,
        body.number,
        "少し時間をおいてから、もう一度話しかけてください",
    )
    halted = await class_is_halted(store, body.class_code)
    if halted:
        raise HTTPException(status_code=409, detail=HALTED_DETAIL)
    count = await call_count(
        store,
        kind="chat",
        claimed=body.turns_used,
        class_code=body.class_code,
        number=body.number,
        secret=body.secret,
        record_id=body.record_id,
    )

    answer = MODEL_ANSWERS[body.variant_id]
    # 保留（有効な測定が無い）では渡さない。測る前に答えを知ってしまうから。docs/policy.md 3.8
    revealed = (
        body.reveal
        and body.situation != "hold"
        and len(body.student_thinking.strip()) >= MIN_THINKING_CHARS
    )
    if body.class_code and revealed:
        # 学級に入っている端末は、端末の申告でなくサーバが持つ記録の要約で決める（9/18 Codex I3）
        revealed = await judged_on_server(
            store, body.class_code, body.number, body.secret, body.record_id, body.variant_id
        )
    context = TutorContext(
        school=body.school,
        theme_title=body.theme_title,
        variant_title=body.variant_title,
        situation=body.situation,
        prediction=body.prediction,
        result_statement=body.result_statement,
        hold_reasons=tuple(body.hold_reasons),
        student_thinking=body.student_thinking,
        messages=tuple(ChatTurn(role=m.role, text=m.text) for m in body.messages),
        message=body.message,
    )
    prompt = build_tutor_prompt(context, answer.explanation if revealed else None)

    with _tracer.start_as_current_span("phonelab.chat") as span:
        span.set_attribute("phonelab.situation", body.situation)
        span.set_attribute("phonelab.revealed", revealed)
        span.set_attribute("phonelab.turns_used", count.start)
        span.set_attribute("phonelab.prompt_len", len(prompt))
        trace_id = format(span.get_span_context().trace_id, "032x")
        count = await count.reserve(store, CHAT_TURNS_PER_RECORD)
        try:
            reply = await asyncio.wait_for(
                run_tutor(
                    runner,
                    prompt=prompt,
                    turns_used=count.start,
                    leak_phrases=phrases_for(answer, body.situation),
                    locked=not revealed,
                    class_halted=halted,
                    armor_text=body.message,
                ),
                timeout=CHAT_TIMEOUT_S,
            )
        except TimeoutError as exc:
            logger.warning("ラボ先生の返事が %s 秒を超えた (trace_id=%s)", CHAT_TIMEOUT_S, trace_id)
            raise HTTPException(
                status_code=504,
                detail="ラボ先生の返事が遅れています。少し待ってから、もう一度送ってください",
            ) from exc
        except Exception as exc:
            logger.exception("ラボ先生の応答に失敗 (trace_id=%s)", trace_id)
            raise HTTPException(
                status_code=502, detail="ラボ先生につながりませんでした。少し待ってから、もう一度"
            ) from exc
        span.set_attribute("phonelab.answer_leak", reply.leaked)
        span.set_attribute("phonelab.armor_blocked", reply.armor_blocked)
        span.set_attribute("phonelab.skipped", reply.skipped)

    turns_used = count.start if reply.skipped else count.start + 1
    await count.settle(store, turns_used - count.start)
    return ChatResponse(
        reply=reply.text,
        revealed=revealed and not reply.skipped,
        turns_used=turns_used,
        limit_reached=(reply.skipped and not reply.armor_blocked)
        or turns_used >= CHAT_TURNS_PER_RECORD,
        trace_id=trace_id,
    )


# PWA（web/dist）。API ルートより後に置き、/assets 以外の未知パスは index.html に落とす（SPA）
if WEB_DIST.exists():
    app.mount("/assets", StaticFiles(directory=WEB_DIST / "assets"), name="assets")

    @app.get("/{path:path}", response_class=HTMLResponse, include_in_schema=False)
    def spa(path: str) -> FileResponse:
        if path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        # 公開ディレクトリの外は返さない（`..%2F` で server/agent/answers.py が読めた。9/18 の Codex レビュー F1）
        candidate = (WEB_DIST / path).resolve()
        if path and candidate.is_relative_to(WEB_DIST.resolve()) and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(WEB_DIST / "index.html", media_type="text/html")

else:

    @app.get("/", response_class=HTMLResponse)
    def index_placeholder() -> str:
        return "<!doctype html><meta charset='utf-8'><title>PhoneLab</title><h1>PhoneLab</h1><p>web/dist がありません。</p>"
