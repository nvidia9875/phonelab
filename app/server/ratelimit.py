"""公開 URL から Gemini を呼べる入口の、クライアントごとの回数制限。

インスタンスごとのメモリで数える。Cloud Run は max-instances=3 なので、実際の上限はその 3 倍まで。
学級と生徒番号の単位の上限はサーバの状態（C8 Firestore）ができてから足す。
"""

from __future__ import annotations

import threading
import time
from collections import deque
from collections.abc import Callable


class SlidingWindowLimiter:
    def __init__(
        self,
        limit: int,
        window_s: float,
        clock: Callable[[], float] = time.monotonic,
        sweep_every: int = 256,
    ) -> None:
        self._limit = limit
        self._window_s = window_s
        self._clock = clock
        # 窓を過ぎた利用者は sweep_every 回に一度まとめて忘れる（IP を変え続けられても伸び続けない）
        self._sweep_every = max(1, sweep_every)
        self._calls = 0
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    @property
    def tracked_clients(self) -> int:
        with self._lock:
            return len(self._hits)

    def allow(self, key: str) -> bool:
        now = self._clock()
        with self._lock:
            self._calls += 1
            if self._calls % self._sweep_every == 0:
                self._sweep(now)
            hits = self._hits.setdefault(key, deque())
            while hits and now - hits[0] >= self._window_s:
                hits.popleft()
            if len(hits) >= self._limit:
                return False
            hits.append(now)
            return True

    def _sweep(self, now: float) -> None:
        stale = [k for k, h in self._hits.items() if not h or now - h[-1] >= self._window_s]
        for k in stale:
            del self._hits[k]
