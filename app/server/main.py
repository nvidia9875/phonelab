"""PhoneLab API — Cloud Run entrypoint.

フェーズ A の Hello Cloud Run。HTTPS で応答することだけを確認する。
（DeviceMotion は HTTPS が必須なので、スパイク B はこの URL の上で行う）
注意: /healthz は Google Front End が手前で 404 を返しコンテナに届かないので使わない。
"""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.responses import HTMLResponse

app = FastAPI(title="PhoneLab", version="0.0.1")


@app.get("/api/status")
def status() -> dict[str, str]:
    return {"status": "ok", "revision": os.environ.get("K_REVISION", "local")}


@app.get("/", response_class=HTMLResponse)
def index() -> str:
    return (
        "<!doctype html><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<title>PhoneLab</title>"
        "<h1>PhoneLab</h1><p>スマホが実験器具。AIは答えを言わない。</p>"
        "<p>準備中。</p>"
    )
