"""エージェントの入口に共通の検査 — 回数の上限、学級の停止、学級の許可。

/api/plan・/api/replan・/api/next・/api/chat・教員の見立てが同じ順で使う。
"""

from __future__ import annotations

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
