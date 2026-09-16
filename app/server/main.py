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
from server.agent.planner import PlanContext, build_plan_prompt, planner_model
from server.agent.policy import check_prediction
from server.agent.policy_plugin import PLANNER_CALLS_PER_EXPERIMENT
from server.agent.runner import (
    CHAT_TURNS_PER_RECORD,
    build_runner,
    build_tutor_runner,
    run_planner,
    run_tutor,
)
from server.agent.tutor import ChatTurn, TutorContext, build_tutor_prompt, chat_model
from server.classroom import ClassStore, normalize_code, seed_demo
from server.ratelimit import SlidingWindowLimiter
from server.routes_class import get_class_store
from server.routes_class import router as class_router
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
    except Exception:
        logger.exception("学級の初期化に失敗（学級の API は動かない可能性）")
    yield


app = FastAPI(title="PhoneLab", version="0.0.1", lifespan=lifespan)
app.include_router(class_router)

MAX_CLASS_CODE_CHARS = 20
HALTED_DETAIL = "先生が学級の測定を止めています。解除されるまで待ってください"


async def class_is_halted(store: ClassStore, code: str | None) -> bool:
    """学級コード付きの呼び出しは、停止中なら Runner を動かさない（PolicyPlugin の before_run と二重に）"""
    if not code:
        return False
    record = await store.get(normalize_code(code))
    return record is not None and record.policy.halted


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
    return build_runner(planner_model())


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

PLAN_REQUESTS_PER_WINDOW = 30
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
) -> PlanResponse:
    """決定論の Policy → Planner（Gemini、構造化出力）→ PolicyPlugin の突き合わせ。答えは渡さない。"""
    if not limiter.allow(client_key(request)):
        raise HTTPException(status_code=429, detail="少し時間をおいてから、もう一度送ってください")
    halted = await class_is_halted(store, body.class_code)
    if halted:
        raise HTTPException(status_code=409, detail=HALTED_DETAIL)

    candidates = candidates_for(body.theme_id, body.done_variant_ids)
    first = candidates[0]
    variables = {v.variable for v in CATALOG[body.theme_id].variants}

    with _tracer.start_as_current_span("phonelab.plan") as span:
        span.set_attribute("phonelab.theme", body.theme_id)
        span.set_attribute("phonelab.text_len", len(body.text))
        span.set_attribute("phonelab.planner_calls", body.planner_calls)
        trace_id = format(span.get_span_context().trace_id, "032x")

        check = check_prediction(body.text)
        span.set_attribute("phonelab.policy", check.kind)
        if check.kind == "hint":
            return PlanResponse(
                kind="hint",
                question_back=check.message,
                planner_calls=body.planner_calls,
                source="policy",
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
                planner_calls=body.planner_calls,
                source="policy",
                trace_id=trace_id,
            )

        prompt = build_plan_prompt(
            PlanContext(
                school=body.school,
                theme_id=body.theme_id,
                text=body.text,
                candidates=candidates,
                previous_question_back=body.previous_question_back,
            )
        )
        try:
            reply = await asyncio.wait_for(
                run_planner(
                    runner,
                    text=prompt,
                    planner_calls=body.planner_calls,
                    candidates=[c.id for c in candidates],
                    class_halted=halted,
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

    if reply.skipped:
        return PlanResponse(
            kind="plan",
            variant_id=first.id,
            why="ラボ先生に聞ける回数の上限に達したので、カタログの順で進めます",
            planner_calls=reply.planner_calls,
            skipped=True,
            source="catalog",
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
            trace_id=trace_id,
        )
    out = reply.plan
    if out.question_back and not body.previous_question_back:
        return PlanResponse(
            kind="question",
            question_back=out.question_back[:MAX_QUESTION_BACK_CHARS],
            planner_calls=reply.planner_calls,
            source="agent",
            trace_id=trace_id,
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
        trace_id=trace_id,
    )


@app.get("/spike", response_class=HTMLResponse)
def spike() -> FileResponse:
    """スパイク B1: DeviceMotion で振り子の周期を二系統で測る検証ページ。"""
    return FileResponse(STATIC / "spike.html", media_type="text/html")


MAX_CHAT_CHARS = 500
MAX_CHAT_HISTORY = 20
MAX_HOLD_REASONS = 6
MIN_THINKING_CHARS = 8
CHAT_REQUESTS_PER_WINDOW = 30
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
    return build_tutor_runner(chat_model())


@lru_cache(maxsize=1)
def get_chat_limiter() -> SlidingWindowLimiter:
    return SlidingWindowLimiter(limit=CHAT_REQUESTS_PER_WINDOW, window_s=CHAT_WINDOW_S)


def client_key(request: Request) -> str:
    """Cloud Run（run.app）は利用者の IP を X-Forwarded-For の末尾に足す。先頭は利用者が書けるので使わない"""
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[-1].strip()
    return forwarded or (request.client.host if request.client else "unknown")


@app.post("/api/chat")
async def chat(
    body: ChatRequest,
    request: Request,
    runner: Annotated[Runner, Depends(get_tutor_runner)],
    limiter: Annotated[SlidingWindowLimiter, Depends(get_chat_limiter)],
    store: Annotated[ClassStore, Depends(get_class_store)],
) -> ChatResponse:
    """ラボ先生と実験をふり返る。先生の説明は、生徒が自分の考えを書いたあとだけ LLM に渡す。"""
    if not limiter.allow(client_key(request)):
        raise HTTPException(
            status_code=429, detail="少し時間をおいてから、もう一度話しかけてください"
        )
    halted = await class_is_halted(store, body.class_code)
    if halted:
        raise HTTPException(status_code=409, detail=HALTED_DETAIL)

    answer = MODEL_ANSWERS[body.variant_id]
    # 保留（有効な測定が無い）では渡さない。測る前に答えを知ってしまうから。docs/policy.md 3.8
    revealed = (
        body.reveal
        and body.situation != "hold"
        and len(body.student_thinking.strip()) >= MIN_THINKING_CHARS
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
        span.set_attribute("phonelab.turns_used", body.turns_used)
        span.set_attribute("phonelab.prompt_len", len(prompt))
        trace_id = format(span.get_span_context().trace_id, "032x")
        try:
            reply = await asyncio.wait_for(
                run_tutor(
                    runner,
                    prompt=prompt,
                    turns_used=body.turns_used,
                    leak_phrases=phrases_for(answer, body.situation),
                    locked=not revealed,
                    class_halted=halted,
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
        span.set_attribute("phonelab.skipped", reply.skipped)

    turns_used = body.turns_used if reply.skipped else body.turns_used + 1
    return ChatResponse(
        reply=reply.text,
        revealed=revealed and not reply.skipped,
        turns_used=turns_used,
        limit_reached=reply.skipped or turns_used >= CHAT_TURNS_PER_RECORD,
        trace_id=trace_id,
    )


# PWA（web/dist）。API ルートより後に置き、/assets 以外の未知パスは index.html に落とす（SPA）
if WEB_DIST.exists():
    app.mount("/assets", StaticFiles(directory=WEB_DIST / "assets"), name="assets")

    @app.get("/{path:path}", response_class=HTMLResponse, include_in_schema=False)
    def spa(path: str) -> FileResponse:
        if path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        candidate = WEB_DIST / path
        if path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(WEB_DIST / "index.html", media_type="text/html")

else:

    @app.get("/", response_class=HTMLResponse)
    def index_placeholder() -> str:
        return "<!doctype html><meta charset='utf-8'><title>PhoneLab</title><h1>PhoneLab</h1><p>web/dist がありません。</p>"
