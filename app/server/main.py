"""PhoneLab API — Cloud Run entrypoint.

/api/* と、スパイクの検証ページ、PWA（web/dist）の配信。
（DeviceMotion は HTTPS が必須なので、スパイク B はこの URL の上で行う）
注意: /healthz は Google Front End が手前で 404 を返しコンテナに届かないので使わない。
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from google.adk.runners import Runner
from opentelemetry import trace
from pydantic import BaseModel, Field

from server.agent.planner import planner_model
from server.agent.policy_plugin import PLANNER_CALLS_PER_EXPERIMENT
from server.agent.runner import build_runner, run_planner
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
