"""エージェントの入口に共通の検査 — 回数の上限、学級の停止、学級の許可。

/api/plan・/api/replan・/api/next・/api/chat・教員の見立てが同じ順で使う。
"""

from __future__ import annotations

import re
from dataclasses import dataclass, replace
from functools import lru_cache

from fastapi import HTTPException, Request

from server.classroom import ClassStore, normalize_code
from server.ratelimit import SlidingWindowLimiter

MAX_CLASS_CODE_CHARS = 20
HALTED_DETAIL = "先生が学級の測定を止めています。解除されるまで待ってください"
# 学校は 31 人が同じ外向き IP なので、IP だけの上限は学級 1 つ分（生徒 40 人 × 6 回）を超える値にし、
# 学級コード＋番号が付いていればその単位でも数える
PER_STUDENT_REQUESTS_PER_WINDOW = 30
STUDENT_WINDOW_S = 600


def client_key(request: Request) -> str:
    """Cloud Run（run.app）は利用者の IP を X-Forwarded-For の末尾に足す。先頭は利用者が書けるので使わない"""
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[-1].strip()
    return forwarded or (request.client.host if request.client else "unknown")


def student_key(class_code: str | None, number: str | None) -> str | None:
    if class_code and number:
        return f"{normalize_code(class_code)}|{number.strip().upper()}"
    return None


@lru_cache(maxsize=1)
def get_student_limiter() -> SlidingWindowLimiter:
    return SlidingWindowLimiter(limit=PER_STUDENT_REQUESTS_PER_WINDOW, window_s=STUDENT_WINDOW_S)


def check_limits(
    request: Request,
    ip_limiter: SlidingWindowLimiter,
    student_limiter: SlidingWindowLimiter,
    class_code: str | None,
    number: str | None,
    detail: str,
) -> None:
    key = student_key(class_code, number)
    if key and not student_limiter.allow(key):
        raise HTTPException(status_code=429, detail=detail)
    if not ip_limiter.allow(client_key(request)):
        raise HTTPException(status_code=429, detail=detail)


async def class_denies_theme(store: ClassStore, code: str | None, theme) -> str | None:
    """学級の許可を、画面だけでなく Planner の入口でも検査する（9/18 Codex I2）"""
    if not code:
        return None
    record = await store.get(normalize_code(code))
    if record is None:
        return None
    policy = record.policy
    if any(sensor not in policy.allowed_sensors for sensor in theme.sensors):
        return "この実験で使うセンサーは、学級で許可されていません。先生に聞くか、別の実験を選んでください"
    if theme.home and theme.id not in policy.teacher_enabled:
        return "この実験は、先生が有効化したときだけできます"
    return None


async def class_is_halted(store: ClassStore, code: str | None) -> bool:
    """学級コード付きの呼び出しは、停止中なら Runner を動かさない（PolicyPlugin の before_run と二重に）"""
    if not code:
        return False
    record = await store.get(normalize_code(code))
    return record is not None and record.policy.halted


def trace_id_of(span) -> str:
    return format(span.get_span_context().trace_id, "032x")


async def class_rules(store: ClassStore, code: str | None) -> dict[str, object] | None:
    """Planner のツール（get_class_rules）が返す学級の決まり。PIN・停止の状態は渡さない"""
    if not code:
        return None
    record = await store.get(normalize_code(code))
    if record is None:
        return None
    policy = record.policy
    return {
        "allowed_sensors": list(policy.allowed_sensors),
        "teacher_enabled_home_experiments": list(policy.teacher_enabled),
        "max_seconds": policy.max_seconds,
    }


COUNTER_KEY_RE = re.compile(r"^[A-Za-z0-9-]{1,12}$")


@dataclass(frozen=True)
class CallCount:
    """エージェントを呼んだ回数。学級の生徒（合言葉が合う）ならサーバの数え、そうでなければ端末の申告"""

    start: int
    key: tuple[str, str, str] | None = None
    reserved: int = 0

    async def reserve(self, store: ClassStore, limit: int) -> CallCount:
        """モデルを呼ぶ前に枠を 1 つ取る。取れなければ start を上限にして返す（統制層がモデルを呼ばない）"""
        if not self.key:
            return self
        before = await store.reserve_counter(*self.key, self.start, limit)
        if before is None:
            return replace(self, start=limit, reserved=0)
        return replace(self, start=before, reserved=1)

    async def settle(self, store: ClassStore, used: int) -> None:
        """実際に呼んだ回数との差を足す（自己修正で 2 回なら +1、呼ばなかったら -1 で枠を返す）"""
        if self.key and used != self.reserved:
            await store.add_counter(*self.key, used - self.reserved)


class RetryGate:
    """自己修正のやり直しの前にも枠を 1 つ取る（取れなければやり直さない）。取った数を settle に足す。
    10/2 採点 3 回目: やり直しを事後に数えていたので、上限 5 に対して 9 回呼べた"""

    def __init__(self, count: CallCount, store: ClassStore, limit: int) -> None:
        self._count = count
        self._store = store
        self._limit = limit
        self.taken = 0

    async def __call__(self) -> bool:
        if not self._count.key:
            return True
        if await self._store.reserve_counter(*self._count.key, 0, self._limit) is None:
            return False
        self.taken += 1
        return True

    async def settle(self, used: int) -> None:
        await replace(self._count, reserved=self._count.reserved + self.taken).settle(
            self._store, used
        )


async def call_count(
    store: ClassStore,
    *,
    kind: str,
    claimed: int,
    class_code: str | None,
    number: str | None,
    secret: str | None,
    record_id: str | None,
) -> CallCount:
    """端末の申告（claimed）とサーバの数えの大きい方から始める（10/2 採点 2-4: 回数が自己申告だった）。
    合言葉が違えば 403。学級に入っていない端末は申告のまま（IP ごとの回数制限はかかる）"""
    if not class_code:
        return CallCount(start=claimed)
    if not number:
        # 学級コードを付けて番号を省くと、端末の申告に戻れた（10/2 採点 3 回目 2-4）
        raise HTTPException(status_code=403, detail="学級の番号が要ります")
    if not (secret and record_id and COUNTER_KEY_RE.match(record_id)):
        # 学級の生徒は合言葉と記録 id が要る（省けば端末の申告に戻れた。10/2 採点 2-4）
        raise HTTPException(status_code=403, detail="合言葉と記録 id が要ります")
    from server.routes_class import verify_student

    code, no = normalize_code(class_code), number.strip().upper()
    await verify_student(store, code, no, secret)
    key = f"{kind}-{record_id}"
    stored = await store.get_counter(code, no, key)
    return CallCount(start=max(claimed, stored), key=(code, no, key))
