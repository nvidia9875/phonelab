"""HTTP のセキュリティヘッダ（10/9）"""

from __future__ import annotations

from fastapi.testclient import TestClient

from server.main import app


def test_every_response_carries_a_strict_csp_and_no_framing():
    res = TestClient(app).get("/api/status")

    csp = res.headers["content-security-policy"]
    assert "script-src 'self';" in csp
    assert "unsafe-inline" not in csp
    assert "frame-ancestors 'none'" in csp
    assert "connect-src 'self'" in csp
    assert res.headers["x-frame-options"] == "DENY"
    assert res.headers["x-content-type-options"] == "nosniff"
    assert "geolocation=()" in res.headers["permissions-policy"]


def test_api_responses_are_not_cached():
    res = TestClient(app).get("/api/status")

    assert res.headers["cache-control"] == "no-store"


def test_only_the_spike_page_allows_its_inline_script():
    res = TestClient(app).get("/spike")

    assert "script-src 'self' 'unsafe-inline'" in res.headers["content-security-policy"]
