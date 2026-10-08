"""/api/class/* — 生徒の入場と、先生の許可・有効化・停止。docs/policy.md 5 章。

停止の配送はポーリング（測定中 2 秒ごとに GET /api/class/{code}）。→ docs/architecture.md 4.3
"""

from __future__ import annotations

import logging
import re
import time
from functools import lru_cache
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, field_validator

from server import teacher_session
from server.agent.catalog import CATALOG
from server.agent.planner import HoldCode
from server.classroom import (
    SENSORS,
    ClassPolicy,
    ClassRecord,
    ClassStore,
    StudentRow,
    auth_for,
    new_secret,
    normalize_code,
    store_from_env,
)
from server.ratelimit import SlidingWindowLimiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/class")

CODE_RE = re.compile(r"^[A-Z0-9-]{3,20}$")
NUMBER_RE = r"^[A-Za-z0-9-]{1,8}$"
PIN_ATTEMPTS_PER_WINDOW = 10
PIN_WINDOW_S = 600
# 学級全体の間違いの上限（接続元を変えながら試すのを止める。先生が数人で間違えても届かない数）
CLASS_PIN_ATTEMPTS_PER_WINDOW = 30
CLASS_WIDE_KEY = "*"
# 記録の送信は、合言葉の合った生徒ごとに数える（1 人 10 分 120 回）。
# 学校は全員が同じ外向き IP なので、IP の上限は 40 人分の余裕を持たせる（10/2 の採点で 31 人の学級が止まると指摘）
RECORD_POSTS_PER_STUDENT = 120
RECORD_POSTS_PER_IP = 120 * 40
RECORD_WINDOW_S = 600
MAX_EVENTS = 12  # 判断の跡の行が増えたので 8 → 12（10/2）
NOT_FOUND = "学級コードが見つかりません。先生に確認してください"
PIN_LOCKED = "PIN の入力が多すぎます。少し待ってください（入っている教員画面はそのまま使えます）"

Sensor = Literal["accelerometer", "gyroscope", "microphone", "camera"]


SECRET_RE = r"^[A-Za-z0-9]{6}$"
NUMBER_TAKEN = "この番号はもう別の端末で使われています。その端末に出た合言葉を入れるか、先生に番号のリセットを頼んでください"
BAD_SECRET = "合言葉が合いません"


class JoinRequest(BaseModel):
    number: str = Field(pattern=NUMBER_RE)
    # 家の端末など 2 台目から同じ番号で入るときの合言葉。最初の入場では無し
    secret: str | None = Field(default=None, pattern=SECRET_RE)


class JoinOut(BaseModel):
    class_code: str
    school: str
    allowed_sensors: list[str]
    teacher_enabled: list[str]
    halted: bool
    max_seconds: int
    hints_per_experiment: int
    updated_at: str
    number: str
    # 最初の入場でだけ返す。端末はこれを保存し、家の端末で同じ番号を使うときに見せる
    secret: str | None = None


class TeacherAuth(BaseModel):
    """PIN か、PIN で入ったときに渡したセッションの印のどちらか"""

    pin: str = Field(default="", max_length=32)
    token: str | None = Field(default=None, max_length=64)


class HaltRequest(TeacherAuth):
    halted: bool


class PolicyRequest(TeacherAuth):
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
    # 採用値と許容誤差（特徴量の要約。波形などの生データではない）
    a: float | None = None
    b: float | None = None
    tolerance: float | None = None


class EventIn(BaseModel):
    t: str = Field(max_length=8)
    k: str = Field(max_length=20)
    body: str = Field(max_length=300)


Stage = Literal["predict", "plan", "setup_A", "measure_A", "setup_B", "measure_B", "result"]
TraceId = Annotated[str, Field(pattern=r"^[0-9a-f]{32}$")]
# 1 記録のトレース: 計画 5・再計画 3・次の一手 3・会話 10 の上限の合計より少し多く（web の MAX_TRACES と同じ）
MAX_TRACES = 24
MAX_MEASUREMENTS = 12


class TraceIn(BaseModel):
    """どの段の呼び出しのトレースか（10/2 採点 4 回目: 段と id を対応づける）"""

    stage: Literal["計画", "再計画", "次の一手", "会話"]
    id: TraceId


class MeasurementIn(BaseModel):
    """測定 1 回ぶんの要約。二つの測り方の値・落ちた検査・生データのハッシュ（波形は送らない）"""

    condition: Literal["A", "B"]
    values: list[float | None] = Field(default_factory=list, max_length=2)
    failed: list[HoldCode] = Field(default_factory=list, max_length=13)
    pass_: bool = Field(alias="pass")
    raw_hash: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    at: str = Field(max_length=40)

    model_config = {"populate_by_name": True}


class RecordSummary(BaseModel):
    """生徒の端末が送る記録の要約。波形・音声などの生データは含まない（D2）。
    テーマ・実験・段階はカタログと列挙だけ受け付ける（任意の文字列を学級の見立てに届けない。10/2 採点 2-6）"""

    record_id: str = Field(pattern=r"^[A-Za-z0-9-]{1,12}$")
    theme_id: str = Field(max_length=40)
    variant_id: str | None = Field(default=None, max_length=60)
    status: Literal["open", "held", "judged", "signed", "stopped"]
    stage: Stage
    prediction: str = Field(default="", max_length=500)
    claim: ClaimIn | None = None
    hold_codes: list[HoldCode] = Field(default_factory=list, max_length=10)
    retries: dict[Literal["A", "B"], int] = Field(default_factory=dict)
    result: ResultIn | None = None
    plan_source: str | None = Field(default=None, max_length=10)
    trace_id: str | None = Field(default=None, max_length=32)
    # この記録でエージェントを呼んだトレース（計画・再計画・次の一手）と、端末の SHA-256（全桁）
    # 段の名前のない古い形（10/2 まで）。新しい端末は traces を送る
    trace_ids: list[TraceId] = Field(default_factory=list, max_length=6)
    traces: list[TraceIn] = Field(default_factory=list, max_length=MAX_TRACES)
    measurements: list[MeasurementIn] = Field(default_factory=list, max_length=MAX_MEASUREMENTS)
    hash: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    rejection_title: str | None = Field(default=None, max_length=120)
    chat_turns: int = Field(default=0, ge=0, le=50)
    events: list[EventIn] = Field(default_factory=list, max_length=MAX_EVENTS)
    updated_at: str = Field(max_length=40)

    @field_validator("theme_id")
    @classmethod
    def known_theme(cls, value: str) -> str:
        if value not in CATALOG:
            raise ValueError("カタログにないテーマです")
        return value

    @field_validator("variant_id")
    @classmethod
    def known_variant(cls, value: str | None) -> str | None:
        if value is not None and not any(
            v.id == value for t in CATALOG.values() for v in t.variants
        ):
            raise ValueError("カタログにない実験です")
        return value


class RecordPost(BaseModel):
    class_code: str = Field(max_length=20)
    number: str = Field(pattern=NUMBER_RE)
    secret: str = Field(pattern=SECRET_RE)
    record: RecordSummary


class DashboardRequest(TeacherAuth):
    pass


class StudentOut(BaseModel):
    number: str
    last_seen_at: str
    current: RecordSummary | None


class DashboardOut(BaseModel):
    # PIN で入ったら、以後はこの印で（授業中に PIN のロックアウトに巻き込まれない）
    session_token: str | None = None
    class_code: str
    halted: bool
    allowed_sensors: list[str]
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
    return SlidingWindowLimiter(limit=RECORD_POSTS_PER_IP, window_s=RECORD_WINDOW_S)


@lru_cache(maxsize=1)
def get_student_record_limiter() -> SlidingWindowLimiter:
    return SlidingWindowLimiter(limit=RECORD_POSTS_PER_STUDENT, window_s=RECORD_WINDOW_S)


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


async def authorize_teacher(
    store: ClassStore,
    request: Request,
    code: str,
    pin: str,
    token: str | None = None,
) -> ClassRecord:
    """先生を確かめる。セッションの印が有効ならそれで通す。PIN は学級 × 接続元で**間違えた回数**を数え、
    上限に達したら、その間は正しい PIN でも 429（上限のあとに正しい候補だけ通ると総当たりできた。10/2 採点 2-6）。
    正しい PIN は数えない（教員画面の 5 秒ごとの更新で上限を食いつぶさない。9/18 Codex F2）"""
    record = await _load(store, code)
    if teacher_session.verify(record, token):
        return record
    code = record.policy.class_code
    ip_key = _client_ip(request)
    now = time.time()
    # 間違いは Firestore で数える（インスタンスのメモリだと Cloud Run の台数ぶん多く試せた。10/9）。
    # 接続元ごとに加えて学級全体でも数える（接続元を変えながらの総当たりを止める）
    if (
        await store.pin_failures(code, ip_key, PIN_WINDOW_S, now) >= PIN_ATTEMPTS_PER_WINDOW
        or await store.pin_failures(code, CLASS_WIDE_KEY, PIN_WINDOW_S, now)
        >= CLASS_PIN_ATTEMPTS_PER_WINDOW
    ):
        raise HTTPException(status_code=429, detail=PIN_LOCKED)
    if pin and record.verify(pin):
        return record
    mine = await store.add_pin_failure(code, ip_key, PIN_WINDOW_S, now)
    everyone = await store.add_pin_failure(code, CLASS_WIDE_KEY, PIN_WINDOW_S, now)
    logger.warning(
        "先生の PIN の間違い class=%s 接続元の回数=%d 学級の回数=%d", code, mine, everyone
    )
    if mine > PIN_ATTEMPTS_PER_WINDOW or everyone > CLASS_PIN_ATTEMPTS_PER_WINDOW:
        raise HTTPException(status_code=429, detail=PIN_LOCKED)
    raise HTTPException(status_code=403, detail="PIN が違います")


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
    request: Request,
    response: Response,
    store: Annotated[ClassStore, Depends(get_class_store)],
    limiter: Annotated[SlidingWindowLimiter, Depends(get_pin_limiter)],
) -> JoinOut:
    """学級コードと番号で入場。名前は受け取らない。
    番号を最初に使った端末に合言葉を一度だけ渡し、2 台目からは合言葉が要る（他人の番号に記録を書けないように）"""
    record = await _load(store, code)
    number = body.number.upper()
    existing = await store.get_student_auth(record.policy.class_code, number)
    issued: str | None = None
    if existing is None:
        issued = new_secret()
        await store.set_student_auth(record.policy.class_code, number, auth_for(issued))
    elif body.secret is None:
        raise HTTPException(status_code=409, detail=NUMBER_TAKEN)
    elif not existing.verify(body.secret):
        if not limiter.allow(f"{record.policy.class_code}|{number}|{_client_ip(request)}"):
            raise HTTPException(
                status_code=429, detail="合言葉の入力が多すぎます。少し待ってください"
            )
        raise HTTPException(status_code=403, detail=BAD_SECRET)
    await store.touch_student(record.policy.class_code, number)
    response.headers["Cache-Control"] = "no-store"
    return JoinOut(**record.policy.to_dict(), number=number, secret=issued)  # type: ignore[arg-type]


@router.post("/{code}/students/{number}/reset")
async def reset_student(
    code: str,
    number: str,
    body: DashboardRequest,
    request: Request,
    response: Response,
    store: Annotated[ClassStore, Depends(get_class_store)],
) -> dict[str, bool]:
    """先生が番号の合言葉を消す（端末を替えた・合言葉をなくした子のため）。次の入場で新しい合言葉が出る"""
    record = await authorize_teacher(store, request, code, body.pin, body.token)
    if not re.match(NUMBER_RE, number):
        raise HTTPException(status_code=404, detail="番号の形が違います")
    await store.set_student_auth(record.policy.class_code, number.upper(), None)
    response.headers["Cache-Control"] = "no-store"
    return {"ok": True}


@router.post("/{code}/halt")
async def halt(
    code: str,
    body: HaltRequest,
    request: Request,
    response: Response,
    store: Annotated[ClassStore, Depends(get_class_store)],
) -> ClassOut:
    """全端末の測定を止める／解除する。止めるのは人だけ（ClassAgent の提案にこの種類は無い）"""
    record = await authorize_teacher(store, request, code, body.pin, body.token)
    policy = await store.update_policy(record.policy.class_code, halted=body.halted)
    if policy is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return _out(policy, response)


@router.put("/{code}/policy")
async def set_policy(
    code: str,
    body: PolicyRequest,
    request: Request,
    response: Response,
    store: Annotated[ClassStore, Depends(get_class_store)],
) -> ClassOut:
    """許可するセンサーと、先生が有効化する実験（家でやる振り子など）"""
    record = await authorize_teacher(store, request, code, body.pin, body.token)
    # 停止（halted）には触れない。許可と有効化の 2 項目だけを書く
    policy = await store.update_policy(
        record.policy.class_code,
        allowed_sensors=tuple(dict.fromkeys(body.allowed_sensors)),
        teacher_enabled=tuple(dict.fromkeys(body.teacher_enabled)),
    )
    if policy is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return _out(policy, response)


@router.post("/{code}/dashboard")
async def dashboard(
    code: str,
    body: DashboardRequest,
    request: Request,
    response: Response,
    store: Annotated[ClassStore, Depends(get_class_store)],
) -> DashboardOut:
    """先生の 1 画面の元データ: 生徒ごとの「いまの記録」の要約。番号だけで名前は無い"""
    record = await authorize_teacher(store, request, code, body.pin, body.token)
    rows = await store.list_students(record.policy.class_code)
    response.headers["Cache-Control"] = "no-store"
    return DashboardOut(
        session_token=body.token
        if teacher_session.verify(record, body.token)
        else teacher_session.issue(record),
        class_code=record.policy.class_code,
        halted=record.policy.halted,
        allowed_sensors=list(record.policy.allowed_sensors),
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
    student_limiter: Annotated[SlidingWindowLimiter, Depends(get_student_record_limiter)],
) -> dict[str, bool]:
    """生徒の端末が、記録が変わるたびに要約を送る（生データは端末の中）。学級が無ければ 404"""
    if not limiter.allow(_client_ip(request)):
        raise HTTPException(status_code=429, detail="送信が多すぎます")
    record = await _load(store, body.class_code)
    number = body.number.upper()
    await verify_student(store, record.policy.class_code, number, body.secret)
    if not student_limiter.allow(f"{record.policy.class_code}|{number}"):
        raise HTTPException(status_code=429, detail="送信が多すぎます")
    summary = body.record.model_dump(by_alias=True)
    await store.put_record(record.policy.class_code, number, summary)
    return {"ok": True}


async def verify_student(store: ClassStore, code: str, number: str, secret: str | None) -> None:
    """記録の書き込みと説明の解禁は、番号の合言葉を持つ端末だけ（9/18 Codex F4）"""
    auth = await store.get_student_auth(code, number)
    if auth is None or not secret or not auth.verify(secret):
        raise HTTPException(status_code=403, detail=BAD_SECRET)
