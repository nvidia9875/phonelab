"""PhoneLab API — Cloud Run entrypoint.

/api/* と、スパイクの検証ページ、PWA（web/dist）の配信。
（DeviceMotion は HTTPS が必須なので、スパイク B はこの URL の上で行う）
注意: /healthz は Google Front End が手前で 404 を返しコンテナに届かないので使わない。
"""

from __future__ import annotations

import asyncio
import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from google.adk.runners import Runner
from opentelemetry import trace
from pydantic import BaseModel, Field, field_validator

from server.agent.answers import MODEL_ANSWERS
from server.agent.planner import planner_model
from server.agent.policy_plugin import PLANNER_CALLS_PER_EXPERIMENT
from server.agent.runner import (
    CHAT_TURNS_PER_RECORD,
    build_runner,
    build_tutor_runner,
    run_planner,
    run_tutor,
)
from server.agent.tutor import ChatTurn, TutorContext, build_tutor_prompt, chat_model
from server.ratelimit import SlidingWindowLimiter
from server.telemetry import disable_content_capture, setup_cloud_tracing

STATIC = Path(__file__).parent / "static"
WEB_DIST = Path(__file__).resolve().parent.parent / "web" / "dist"
SPIKE_AGENT_FLAG = "PHONELAB_ENABLE_SPIKE_AGENT"
MAX_PREDICTION_CHARS = 500

logger = logging.getLogger(__name__)
disable_content_capture()
setup_cloud_tracing()
_tracer = trace.get_tracer("phonelab.api")

app = FastAPI(title="PhoneLab", version="0.0.1")


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
    """Cloud Run の前段が付ける X-Forwarded-For の先頭（利用者の IP）。無ければ接続元"""
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    return forwarded or (request.client.host if request.client else "unknown")


@app.post("/api/chat")
async def chat(
    body: ChatRequest,
    request: Request,
    runner: Annotated[Runner, Depends(get_tutor_runner)],
    limiter: Annotated[SlidingWindowLimiter, Depends(get_chat_limiter)],
) -> ChatResponse:
    """ラボ先生と実験をふり返る。先生の説明は、生徒が自分の考えを書いたあとだけ LLM に渡す。"""
    if not limiter.allow(client_key(request)):
        raise HTTPException(
            status_code=429, detail="少し時間をおいてから、もう一度話しかけてください"
        )

    answer = MODEL_ANSWERS[body.variant_id]
    revealed = body.reveal and len(body.student_thinking.strip()) >= MIN_THINKING_CHARS
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
                    leak_phrases=answer.leak_phrases,
                    locked=not revealed,
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
        candidate = WEB_DIST / path
        if path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(WEB_DIST / "index.html", media_type="text/html")

else:

    @app.get("/", response_class=HTMLResponse)
    def index_placeholder() -> str:
        return "<!doctype html><meta charset='utf-8'><title>PhoneLab</title><h1>PhoneLab</h1><p>web/dist がありません。</p>"
