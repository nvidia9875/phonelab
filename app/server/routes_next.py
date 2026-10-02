"""POST /api/next — 結果のあとの次の一手（X1）。予想→計画→測定→判定→次の予想、のループを閉じる。

残りの実験が無ければモデルを呼ばずに「ふり返りへ」。モデルが読めない・上限ならカタログの順。
"""

from __future__ import annotations

import asyncio
import logging
from functools import lru_cache
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from google.adk.runners import Runner
from opentelemetry import trace
from pydantic import BaseModel, Field, field_validator

from server.agent.catalog import CATALOG, variant_by_id
from server.agent.models import gemini
from server.agent.next_step import (
    NEXT_CALLS_PER_RECORD,
    NextContext,
    build_next_prompt,
    template_question,
)
from server.agent.planner import planner_model
from server.agent.runner import build_next_runner, run_next
from server.agent.trail import (
    check_lines,
    chose_line,
    experiment_words,
    policy_before_line,
    read_line,
    trail,
)
from server.classroom import ClassStore
from server.guards import (
    HALTED_DETAIL,
    MAX_CLASS_CODE_CHARS,
    RetryGate,
    call_count,
    check_limits,
    class_is_halted,
    get_student_limiter,
    trace_id_of,
)
from server.ratelimit import SlidingWindowLimiter
from server.routes_class import get_class_store

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)
_tracer = trace.get_tracer("phonelab.api")

NEXT_TIMEOUT_S = 12
NEXT_REQUESTS_PER_WINDOW = 240
NEXT_WINDOW_S = 600
MAX_TEXT = 500
MAX_DONE_IDS = 10
REFLECT_WHY = (
    "このテーマの実験はひととおり終わりました。なぜそうなったかを、ラボ先生とふり返りましょう"
)

Direction = Literal["faster", "slower", "same", "unknown"]


class NextRequest(BaseModel):
    theme_id: str
    variant_id: str
    school: Literal["jhs", "hs"]
    prediction: str = Field(default="", max_length=MAX_TEXT)
    claim_direction: Direction = "unknown"
    observed: Direction = "unknown"
    consistent: bool | None = None
    explained: bool = False
    done_variant_ids: list[Annotated[str, Field(max_length=60)]] = Field(
        default_factory=list, max_length=MAX_DONE_IDS
    )
    next_calls: int = Field(default=0, ge=0, le=NEXT_CALLS_PER_RECORD)
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


class NextResponse(BaseModel):
    action: Literal["next", "reflect"]
    experiment_id: str | None = None
    question: str = ""
    why: str = ""
    source: Literal["agent", "catalog"]
    policy_fixed: bool = False
    fix_reasons: list[str] = Field(default_factory=list)
    self_corrected: bool = False
    trail: list[str] = Field(default_factory=list)
    next_calls: int
    trace_id: str


@lru_cache(maxsize=1)
def get_next_runner() -> Runner:
    return build_next_runner(gemini(planner_model()))


@lru_cache(maxsize=1)
def get_next_limiter() -> SlidingWindowLimiter:
    return SlidingWindowLimiter(limit=NEXT_REQUESTS_PER_WINDOW, window_s=NEXT_WINDOW_S)


@router.post("/next")
async def next_step(
    body: NextRequest,
    request: Request,
    runner: Annotated[Runner, Depends(get_next_runner)],
    limiter: Annotated[SlidingWindowLimiter, Depends(get_next_limiter)],
    store: Annotated[ClassStore, Depends(get_class_store)],
    student_limiter: Annotated[SlidingWindowLimiter, Depends(get_student_limiter)],
) -> NextResponse:
    """今回の予想と測った結果の向きを読み、次に確かめる実験と、次の予想を書かせる問いかけを返す"""
    check_limits(
        request, limiter, student_limiter, body.class_code, body.number, "少し時間をおいてから"
    )
    theme = CATALOG[body.theme_id]
    if variant_by_id(body.theme_id, body.variant_id) is None:
        raise HTTPException(status_code=422, detail="このテーマにない実験です")
    halted = await class_is_halted(store, body.class_code)
    if halted:
        raise HTTPException(status_code=409, detail=HALTED_DETAIL)
    count = await call_count(
        store,
        kind="next",
        claimed=body.next_calls,
        class_code=body.class_code,
        number=body.number,
        secret=body.secret,
        record_id=body.record_id,
    )

    done = {*body.done_variant_ids, body.variant_id}
    remaining = tuple(v for v in theme.variants if v.id not in done)
    read = read_line(f"今回の予想と結果の向き・予想と測定の一致・残りの実験 {len(remaining)} 件")

    with _tracer.start_as_current_span("phonelab.next") as span:
        span.set_attribute("phonelab.theme", body.theme_id)
        span.set_attribute("phonelab.remaining", len(remaining))
        span.set_attribute("phonelab.consistent", str(body.consistent))
        trace_id = trace_id_of(span)
        if not remaining:
            span.set_attribute("phonelab.decision", "reflect_no_model")
            return NextResponse(
                action="reflect",
                why=REFLECT_WHY,
                source="catalog",
                next_calls=count.start,
                trail=trail(read, chose_line("ふり返りへ（残りの実験なし。モデルは呼ばない）")),
                trace_id=trace_id,
            )
        prompt = build_next_prompt(
            NextContext(
                school=body.school,
                theme_id=body.theme_id,
                done_variant_id=body.variant_id,
                prediction=body.prediction,
                claim_direction=body.claim_direction,
                observed=body.observed,
                consistent=body.consistent,
                explained=body.explained,
                candidates=remaining,
            )
        )
        count = await count.reserve(store, NEXT_CALLS_PER_RECORD)
        gate = RetryGate(count, store, NEXT_CALLS_PER_RECORD)
        try:
            reply = await asyncio.wait_for(
                run_next(
                    runner,
                    prompt=prompt,
                    next_calls=count.start,
                    candidates=[v.id for v in remaining],
                    class_halted=halted,
                    before_retry=gate,
                ),
                timeout=NEXT_TIMEOUT_S,
            )
        except TimeoutError as exc:
            raise HTTPException(status_code=504, detail="ラボ先生の返事が遅れています") from exc
        except Exception as exc:
            logger.exception("次の一手の実行に失敗 (trace_id=%s)", trace_id)
            raise HTTPException(status_code=502, detail="ラボ先生につながりませんでした") from exc
        span.set_attribute("phonelab.skipped", reply.skipped)
        span.set_attribute("phonelab.self_corrected", reply.self_corrected)

    await gate.settle(reply.calls_used)
    calls = min(count.start + reply.calls_used, NEXT_CALLS_PER_RECORD)
    fixes = {"fix_reasons": list(reply.fix_reasons), "self_corrected": reply.self_corrected}
    checked = check_lines(reply.fix_reasons, reply.retried, reply.self_corrected)
    if reply.skipped or reply.plan is None:
        first = remaining[0]
        return NextResponse(
            action="next",
            experiment_id=first.id,
            question=template_question(first, theme.unit),
            why="前の実験の続きとして、次はカタログの順に一つずつ変えます",
            source="catalog",
            policy_fixed=reply.plan is None and not reply.skipped,
            next_calls=calls,
            trail=trail(
                read,
                policy_before_line("limit") if reply.skipped else checked,
                chose_line(f"{experiment_words(first.id)}（カタログの順）"),
            ),
            trace_id=trace_id,
            **fixes,
        )
    out = reply.plan
    chosen = (
        f"{experiment_words(out.experiment_id)}と、次の予想の問いかけ"
        if out.action == "next"
        else "ふり返りへ（食い違いの理由がまだ書かれていない）"
    )
    question = out.question[:120]
    if out.action == "next" and not question:
        question = template_question(variant_by_id(body.theme_id, out.experiment_id), theme.unit)
    return NextResponse(
        action=out.action,
        experiment_id=out.experiment_id if out.action == "next" else None,
        question=question,
        why=out.why[:160],
        source="agent",
        policy_fixed=reply.off_catalog or reply.words_replaced,
        next_calls=calls,
        trail=trail(read, chose_line(chosen), checked),
        trace_id=trace_id,
        **fixes,
    )
