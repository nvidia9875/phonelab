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
        self, limit: int, window_s: float, clock: Callable[[], float] = time.monotonic
    ) -> None:
        self._limit = limit
        self._window_s = window_s
        self._clock = clock
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = self._clock()
        with self._lock:
            hits = self._hits.setdefault(key, deque())
            while hits and now - hits[0] >= self._window_s:
                hits.popleft()
            if len(hits) >= self._limit:
                return False
            hits.append(now)
            return True
