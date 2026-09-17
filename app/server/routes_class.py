"""/api/class/* — 生徒の入場と、先生の許可・有効化・停止。docs/policy.md 5 章。

停止の配送はポーリング（測定中 2 秒ごとに GET /api/class/{code}）。→ docs/architecture.md 4.3
"""

from __future__ import annotations

import re
from functools import lru_cache
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from server.classroom import (
    SENSORS,
    ClassPolicy,
    ClassRecord,
    ClassStore,
    StudentRow,
    normalize_code,
    store_from_env,
    updated,
)
from server.ratelimit import SlidingWindowLimiter

router = APIRouter(prefix="/api/class")

CODE_RE = re.compile(r"^[A-Z0-9-]{3,20}$")
NUMBER_RE = r"^[A-Za-z0-9-]{1,8}$"
PIN_ATTEMPTS_PER_WINDOW = 10
PIN_WINDOW_S = 600
RECORD_POSTS_PER_WINDOW = 120
RECORD_WINDOW_S = 600
MAX_EVENTS = 8
NOT_FOUND = "学級コードが見つかりません。先生に確認してください"

Sensor = Literal["accelerometer", "gyroscope", "microphone", "camera"]


class JoinRequest(BaseModel):
    number: str = Field(pattern=NUMBER_RE)


class HaltRequest(BaseModel):
    pin: str = Field(min_length=1, max_length=32)
    halted: bool


class PolicyRequest(BaseModel):
    pin: str = Field(min_length=1, max_length=32)
    allowed_sensors: list[Sensor] = Field(max_length=len(SENSORS))
    teacher_enabled: list[Annotated[str, Field(max_length=60)]] = Field(
        default_factory=list, max_length=20
    )


class ClaimIn(BaseModel):
    variable: str = Field(max_length=20)
    direction: Literal["faster", "slower", "same", "unknown"]


class ResultIn(BaseModel):
    observed: Literal["faster", "slower", "same", "unknown"]
    consistent: bool | None
    statement: str = Field(max_length=200)


class EventIn(BaseModel):
    t: str = Field(max_length=8)
    k: str = Field(max_length=20)
    body: str = Field(max_length=300)


class RecordSummary(BaseModel):
    """生徒の端末が送る記録の要約。波形・音声などの生データは含まない（D2）"""

    record_id: str = Field(pattern=r"^[A-Za-z0-9-]{1,12}$")
    theme_id: str = Field(max_length=40)
    variant_id: str | None = Field(default=None, max_length=60)
    status: Literal["open", "held", "judged", "signed", "stopped"]
    stage: str = Field(max_length=20)
    prediction: str = Field(default="", max_length=500)
    claim: ClaimIn | None = None
    hold_codes: list[Annotated[str, Field(max_length=30)]] = Field(
        default_factory=list, max_length=10
    )
    retries: dict[Literal["A", "B"], int] = Field(default_factory=dict)
    result: ResultIn | None = None
    plan_source: str | None = Field(default=None, max_length=10)
    trace_id: str | None = Field(default=None, max_length=32)
    rejection_title: str | None = Field(default=None, max_length=120)
    chat_turns: int = Field(default=0, ge=0, le=50)
    events: list[EventIn] = Field(default_factory=list, max_length=MAX_EVENTS)
    updated_at: str = Field(max_length=40)


class RecordPost(BaseModel):
    class_code: str = Field(max_length=20)
    number: str = Field(pattern=NUMBER_RE)
    record: RecordSummary


class DashboardRequest(BaseModel):
    pin: str = Field(min_length=1, max_length=32)


class StudentOut(BaseModel):
    number: str
    last_seen_at: str
    current: RecordSummary | None


class DashboardOut(BaseModel):
    class_code: str
    halted: bool
    teacher_enabled: list[str]
    students: list[StudentOut]
    fetched_at: str


class ClassOut(BaseModel):
    class_code: str
    school: str
    allowed_sensors: list[str]
    teacher_enabled: list[str]
    halted: bool
    max_seconds: int
    hints_per_experiment: int
    updated_at: str


@lru_cache(maxsize=1)
def get_class_store() -> ClassStore:
    return store_from_env()


@lru_cache(maxsize=1)
def get_pin_limiter() -> SlidingWindowLimiter:
    return SlidingWindowLimiter(limit=PIN_ATTEMPTS_PER_WINDOW, window_s=PIN_WINDOW_S)


@lru_cache(maxsize=1)
def get_record_limiter() -> SlidingWindowLimiter:
    return SlidingWindowLimiter(limit=RECORD_POSTS_PER_WINDOW, window_s=RECORD_WINDOW_S)


def _out(policy: ClassPolicy, response: Response) -> ClassOut:
    response.headers["Cache-Control"] = "no-store"
    return ClassOut(**policy.to_dict())  # type: ignore[arg-type]


async def _load(store: ClassStore, code: str) -> ClassRecord:
    code = normalize_code(code)
    if not CODE_RE.match(code):
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    record = await store.get(code)
    if record is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return record


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[-1].strip()
    return forwarded or (request.client.host if request.client else "unknown")


async def _teacher(
    store: ClassStore, limiter: SlidingWindowLimiter, request: Request, code: str, pin: str
) -> ClassRecord:
    """PIN を確かめる。総当たりを防ぐため、学級 × 接続元で回数を数える"""
    record = await _load(store, code)
    if not limiter.allow(f"{record.policy.class_code}|{_client_ip(request)}"):
        raise HTTPException(status_code=429, detail="PIN の入力が多すぎます。少し待ってください")
    if not record.verify(pin):
        raise HTTPException(status_code=403, detail="PIN が違います")
    return record


@router.get("/{code}")
async def class_status(
    code: str, response: Response, store: Annotated[ClassStore, Depends(get_class_store)]
) -> ClassOut:
    """生徒の端末が測定中に 2 秒ごとに呼ぶ。halted が true ならセンサーを止める"""
    record = await _load(store, code)
    return _out(record.policy, response)


@router.post("/{code}/join")
async def join(
    code: str,
    body: JoinRequest,
    response: Response,
    store: Annotated[ClassStore, Depends(get_class_store)],
) -> ClassOut:
    """学級コードと番号で入場。名前は受け取らない"""
    record = await _load(store, code)
    await store.touch_student(record.policy.class_code, body.number.upper())
    return _out(record.policy, response)


@router.post("/{code}/halt")
async def halt(
    code: str,
    body: HaltRequest,
    request: Request,
    response: Response,
    store: Annotated[ClassStore, Depends(get_class_store)],
    limiter: Annotated[SlidingWindowLimiter, Depends(get_pin_limiter)],
) -> ClassOut:
    """全端末の測定を止める／解除する。止めるのは人だけ（ClassAgent の提案にこの種類は無い）"""
    record = await _teacher(store, limiter, request, code, body.pin)
    policy = updated(record.policy, halted=body.halted)
    await store.put(ClassRecord(policy=policy, pin_hash=record.pin_hash, salt=record.salt))
    return _out(policy, response)


@router.put("/{code}/policy")
async def set_policy(
    code: str,
    body: PolicyRequest,
    request: Request,
    response: Response,
    store: Annotated[ClassStore, Depends(get_class_store)],
    limiter: Annotated[SlidingWindowLimiter, Depends(get_pin_limiter)],
) -> ClassOut:
    """許可するセンサーと、先生が有効化する実験（家でやる振り子など）"""
    record = await _teacher(store, limiter, request, code, body.pin)
    policy = updated(
        record.policy,
        allowed_sensors=tuple(dict.fromkeys(body.allowed_sensors)),
        teacher_enabled=tuple(dict.fromkeys(body.teacher_enabled)),
    )
    await store.put(ClassRecord(policy=policy, pin_hash=record.pin_hash, salt=record.salt))
    return _out(policy, response)


@router.post("/{code}/dashboard")
async def dashboard(
    code: str,
    body: DashboardRequest,
    request: Request,
    response: Response,
    store: Annotated[ClassStore, Depends(get_class_store)],
    limiter: Annotated[SlidingWindowLimiter, Depends(get_pin_limiter)],
) -> DashboardOut:
    """先生の 1 画面の元データ: 生徒ごとの「いまの記録」の要約。番号だけで名前は無い"""
    record = await _teacher(store, limiter, request, code, body.pin)
    rows = await store.list_students(record.policy.class_code)
    response.headers["Cache-Control"] = "no-store"
    return DashboardOut(
        class_code=record.policy.class_code,
        halted=record.policy.halted,
        teacher_enabled=list(record.policy.teacher_enabled),
        students=[_student_out(r) for r in rows],
        fetched_at=_now(),
    )


def _student_out(row: StudentRow) -> StudentOut:
    current: RecordSummary | None = None
    if row.current:
        try:
            current = RecordSummary.model_validate(row.current)
        except ValueError:
            current = None  # 古い形の要約は出さない
    return StudentOut(number=row.number, last_seen_at=row.last_seen_at, current=current)


def _now() -> str:
    from server.classroom import now_iso

    return now_iso()


records_router = APIRouter(prefix="/api/records")


@records_router.post("")
async def post_record(
    body: RecordPost,
    request: Request,
    store: Annotated[ClassStore, Depends(get_class_store)],
    limiter: Annotated[SlidingWindowLimiter, Depends(get_record_limiter)],
) -> dict[str, bool]:
    """生徒の端末が、記録が変わるたびに要約を送る（生データは端末の中）。学級が無ければ 404"""
    if not limiter.allow(_client_ip(request)):
        raise HTTPException(status_code=429, detail="送信が多すぎます")
    record = await _load(store, body.class_code)
    summary = body.record.model_dump()
    await store.put_record(record.policy.class_code, body.number.upper(), summary)
    return {"ok": True}
