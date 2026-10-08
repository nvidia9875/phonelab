"""HTTP のセキュリティヘッダ（10/9 セキュリティの見直し）。

- CSP: スクリプトは自分のオリジンだけ。フォントは Google Fonts だけ。外への通信は自分の API だけ
- センサーは自分のオリジンだけが使える（位置情報は永久に使わない）
- 検証用の /spike だけはインラインのスクリプトがあるので、別の CSP
"""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

APP_CSP_PARTS = (
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
)
APP_CSP = "; ".join(APP_CSP_PARTS)
SPIKE_CSP = APP_CSP.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'").replace(
    "style-src 'self'", "style-src 'self' 'unsafe-inline'"
)
PERMISSIONS = "accelerometer=(self), gyroscope=(self), microphone=(self), camera=(self), geolocation=(), payment=(), usb=()"
HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Permissions-Policy": PERMISSIONS,
    "Cross-Origin-Opener-Policy": "same-origin",
}


class SecurityHeaders(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        for name, value in HEADERS.items():
            response.headers.setdefault(name, value)
        csp = SPIKE_CSP if request.url.path == "/spike" else APP_CSP
        response.headers.setdefault("Content-Security-Policy", csp)
        if request.url.path.startswith("/api/"):
            # API の応答（合言葉・セッションの印・記録）を途中のキャッシュに残さない
            response.headers.setdefault("Cache-Control", "no-store")
        return response
