"""POST /api/class/{code}/insight — 学級の見立て（X3）。先生が押したときだけ動く。

PIN で先生を確かめ、学級の要約を決定論で作って state に置き、ClassAgent（ツール 2 つ、読み取り専用）に読ませる。
同じ学級は 30 秒のあいだ同じ見立てを返す（教員画面を何度押してもモデルを呼びすぎない）。
モデルが読めない・遅いときは、決まりごとだけで作った見立てを返す。
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections import Counter
from datetime import UTC, datetime
from functools import lru_cache
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from google.adk.runners import Runner
from opentelemetry import trace
from pydantic import BaseModel, Field

from server.agent.class_agent import build_snapshot
from server.agent.models import gemini
from server.agent.planner import planner_model
from server.agent.runner import InsightReply, build_insight_runner, run_insight
from server.classroom import ClassStore, now_iso
from server.guards import trace_id_of
from server.ratelimit import SlidingWindowLimiter
from server.routes_class import (
    DashboardRequest,
    authorize_teacher,
    get_class_store,
    get_pin_limiter,
)

router = APIRouter(prefix="/api/class")
logger = logging.getLogger(__name__)
_tracer = trace.get_tracer("phonelab.api")

INSIGHT_TIMEOUT_S = 20
INSIGHT_CACHE_S = 30
INSIGHTS_PER_WINDOW = 20
INSIGHT_WINDOW_S = 600


class InsightResponse(BaseModel):
    lines: list[str]
    visit_first: list[str]
    suggestion: str
    source: Literal["agent", "rules"]
    policy_fixed: bool = False
    trail: list[str] = Field(default_factory=list)
    model_calls: int = 0
    tool_calls: int = 0
    tools_denied: int = 0
    cached: bool = False
    generated_at: str
    trace_id: str


_cache: dict[str, tuple[float, InsightResponse]] = {}


@lru_cache(maxsize=1)
def get_insight_runner() -> Runner:
    return build_insight_runner(gemini(planner_model()))


@lru_cache(maxsize=1)
def get_insight_limiter() -> SlidingWindowLimiter:
    return SlidingWindowLimiter(limit=INSIGHTS_PER_WINDOW, window_s=INSIGHT_WINDOW_S)


def clear_insight_cache() -> None:
    _cache.clear()


@router.post("/{code}/insight")
async def insight(
    code: str,
    body: DashboardRequest,
    request: Request,
    response: Response,
    store: Annotated[ClassStore, Depends(get_class_store)],
    pin_limiter: Annotated[SlidingWindowLimiter, Depends(get_pin_limiter)],
    limiter: Annotated[SlidingWindowLimiter, Depends(get_insight_limiter)],
    runner: Annotated[Runner, Depends(get_insight_runner)],
) -> InsightResponse:
    """ラボ先生が学級の様子を読み、先生に 3 行で伝える。操作はしない"""
    record = await authorize_teacher(store, pin_limiter, request, code, body.pin)
    class_code = record.policy.class_code
    response.headers["Cache-Control"] = "no-store"
    hit = _cache.get(class_code)
    if hit and time.monotonic() - hit[0] < INSIGHT_CACHE_S:
        return hit[1].model_copy(update={"cached": True})
    if not limiter.allow(class_code):
        raise HTTPException(
            status_code=429, detail="見立てを聞く回数が多すぎます。少し待ってください"
        )

    rows = await store.list_students(class_code)
    snapshot, timelines = build_snapshot(
        [(r.number, r.last_seen_at, r.current) for r in rows], datetime.now(UTC)
    )
    known = [r.number for r in rows]
    with _tracer.start_as_current_span("phonelab.insight") as span:
        span.set_attribute("phonelab.students", len(rows))
        trace_id = trace_id_of(span)
        reply: InsightReply | None = None
        if rows:
            try:
                reply = await asyncio.wait_for(
                    run_insight(
                        runner, snapshot=snapshot, timelines=timelines, known_numbers=known
                    ),
                    timeout=INSIGHT_TIMEOUT_S,
                )
            except Exception:
                logger.exception("学級の見立てに失敗 (trace_id=%s)", trace_id)
        if reply:
            span.set_attribute("phonelab.tool_calls", reply.tool_calls)
            span.set_attribute("phonelab.tools_denied", reply.tools_denied)
            span.set_attribute("phonelab.model_calls", reply.model_calls)
    out = _from_agent(reply, len(rows), trace_id)
    if out is None:
        if rows:
            logger.warning(
                "学級の見立てを決まりごとで返した (trace_id=%s, reply=%s)",
                trace_id,
                "none"
                if reply is None
                else f"skipped={reply.skipped} readable={reply.plan is not None} "
                f"model_calls={reply.model_calls} tool_calls={reply.tool_calls}",
            )
        out = _from_rules(snapshot, trace_id)
    _cache[class_code] = (time.monotonic(), out)
    return out


def _from_agent(reply: InsightReply | None, students: int, trace_id: str) -> InsightResponse | None:
    if reply is None or reply.skipped or reply.plan is None or not reply.plan.lines:
        return None
    plan = reply.plan
    lines = [
        f"読んだ: 学級の要約（{students} 人、予想の本文は渡さない）と、一人ずつの流れ",
        f"ツール: {reply.tool_calls} 回（断った {reply.tools_denied} 回）・モデル {reply.model_calls} 回",
        "モデルの後の検査: "
        + ("停止の勧め・要約に無い人数・学級にいない番号を落とした" if reply.fixed else "通過"),
        "操作: しない（ボタンを押すのは先生）",
    ]
    return InsightResponse(
        lines=plan.lines,
        visit_first=plan.visit_first,
        suggestion=plan.suggestion,
        source="agent",
        policy_fixed=reply.fixed,
        trail=lines,
        model_calls=reply.model_calls,
        tool_calls=reply.tool_calls,
        tools_denied=reply.tools_denied,
        generated_at=now_iso(),
        trace_id=trace_id,
    )


def _from_rules(snapshot: dict, trace_id: str) -> InsightResponse:
    """モデルを使わない見立て: 保留の理由の多い順と、保留・却下の子"""
    rows = snapshot.get("rows", [])
    if not rows:
        lines = ["まだ誰も入場していません"]
    else:
        reasons = Counter(snapshot.get("hold_reasons", {})).most_common(2)
        held = [r for r in rows if r.get("status") == "held"]
        lines = [f"{len(rows)} 人のうち、保留 {len(held)} 人"]
        lines.extend(f"保留の理由「{word}」が {n} 人" for word, n in reasons)
    visit = [r["number"] for r in rows if r.get("status") == "held" or r.get("rejected")][:5]
    return InsightResponse(
        lines=lines[:3],
        visit_first=visit,
        suggestion="",
        source="rules",
        trail=["ラボ先生につながらないので、決まりごとだけで数えました（モデルは呼ばない）"],
        generated_at=now_iso(),
        trace_id=trace_id,
    )
