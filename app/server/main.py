"""PhoneLab API — Cloud Run entrypoint.

フェーズ A の Hello Cloud Run。HTTPS で応答することだけを確認する。
（DeviceMotion は HTTPS が必須なので、スパイク B はこの URL の上で行う）
注意: /healthz は Google Front End が手前で 404 を返しコンテナに届かないので使わない。
"""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

STATIC = Path(__file__).parent / "static"
WEB_DIST = Path(__file__).resolve().parent.parent / "web" / "dist"

app = FastAPI(title="PhoneLab", version="0.0.1")


@app.get("/api/status")
def status() -> dict[str, str]:
    return {"status": "ok", "revision": os.environ.get("K_REVISION", "local")}




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
