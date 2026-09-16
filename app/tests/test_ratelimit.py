"""公開 URL から Gemini を呼べる入口の、クライアントごとの回数制限。"""

from __future__ import annotations

from server.ratelimit import SlidingWindowLimiter


def test_allows_up_to_the_limit_within_the_window():
    now = [1000.0]
    limiter = SlidingWindowLimiter(limit=3, window_s=60, clock=lambda: now[0])

    results = [limiter.allow("203.0.113.1") for _ in range(4)]

    assert results == [True, True, True, False]


def test_forgets_requests_older_than_the_window():
    now = [1000.0]
    limiter = SlidingWindowLimiter(limit=1, window_s=60, clock=lambda: now[0])

    assert limiter.allow("a") is True
    assert limiter.allow("a") is False
    now[0] += 61
    assert limiter.allow("a") is True


def test_counts_each_client_separately():
    limiter = SlidingWindowLimiter(limit=1, window_s=60, clock=lambda: 0.0)

    assert limiter.allow("a") is True
    assert limiter.allow("b") is True


def test_forgets_clients_whose_requests_have_all_left_the_window():
    now = [1000.0]
    limiter = SlidingWindowLimiter(limit=1, window_s=60, clock=lambda: now[0], sweep_every=1)

    limiter.allow("a")
    now[0] += 61
    limiter.allow("b")

    assert limiter.tracked_clients == 1
