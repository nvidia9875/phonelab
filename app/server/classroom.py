"""学級（classes/{class_code}）— docs/policy.md 5 章、docs/record-schema.md 6 章。

学級コードで入場し、先生の許可・有効化・停止をここに置く。PWA も教員画面も API 経由でだけ触る。
本番は Firestore、テストとローカルはメモリ。教師 PIN はハッシュだけ持つ（Secret ではなく学級の文書に）。
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
from dataclasses import asdict, dataclass, replace
from datetime import UTC, datetime
from typing import Protocol

logger = logging.getLogger(__name__)

SENSORS: tuple[str, ...] = ("accelerometer", "gyroscope", "microphone", "camera")
DEFAULT_ALLOWED: tuple[str, ...] = ("accelerometer", "gyroscope", "microphone")
DEMO_CLASS_CODE = "DEMO-2026"
DEMO_PIN_ENV = "PHONELAB_DEMO_PIN"
STORE_ENV = (
    "PHONELAB_CLASS_STORE"  # "memory" | "firestore"（未設定なら Cloud Run 上でだけ firestore）
)
FIRESTORE_DB_ENV = "PHONELAB_FIRESTORE_DB"


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


@dataclass(frozen=True)
class ClassPolicy:
    class_code: str
    school: str
    allowed_sensors: tuple[str, ...] = DEFAULT_ALLOWED
    teacher_enabled: tuple[str, ...] = ()
    halted: bool = False
    max_seconds: int = 30
    hints_per_experiment: int = 3
    updated_at: str = ""

    def to_dict(self) -> dict[str, object]:
        d = asdict(self)
        d["allowed_sensors"] = list(self.allowed_sensors)
        d["teacher_enabled"] = list(self.teacher_enabled)
        return d


@dataclass(frozen=True)
class ClassRecord:
    policy: ClassPolicy
    pin_hash: str
    salt: str

    def verify(self, pin: str) -> bool:
        return hmac.compare_digest(hash_pin(pin, self.salt), self.pin_hash)


def hash_pin(pin: str, salt: str) -> str:
    return hashlib.sha256(f"{salt}:{pin}".encode()).hexdigest()


def normalize_code(code: str) -> str:
    return code.strip().upper()


SECRET_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # 0/O/1/I を除く


def new_secret() -> str:
    """生徒の合言葉。番号を最初に使った端末に一度だけ見せ、家の端末でも同じ番号を使うときに入れる"""
    return "".join(secrets.choice(SECRET_ALPHABET) for _ in range(6))


@dataclass(frozen=True)
class StudentAuth:
    secret_hash: str
    salt: str

    def verify(self, secret: str) -> bool:
        return hmac.compare_digest(hash_pin(secret.strip().upper(), self.salt), self.secret_hash)


def auth_for(secret: str) -> StudentAuth:
    salt = secrets.token_hex(8)
    return StudentAuth(secret_hash=hash_pin(secret.strip().upper(), salt), salt=salt)


def new_class(code: str, school: str, pin: str) -> ClassRecord:
    salt = secrets.token_hex(8)
    policy = ClassPolicy(class_code=normalize_code(code), school=school, updated_at=now_iso())
    return ClassRecord(policy=policy, pin_hash=hash_pin(pin, salt), salt=salt)


# 生徒の端末が送る記録の要約（生データ無し）。教員画面はこれだけを見る。中身の形は routes_class.RecordSummary
Summary = dict[str, object]


@dataclass(frozen=True)
class StudentRow:
    number: str
    last_seen_at: str
    current: Summary | None


class ClassStore(Protocol):
    async def get(self, code: str) -> ClassRecord | None: ...
    async def put(self, record: ClassRecord) -> None: ...
    async def touch_student(self, code: str, number: str) -> None: ...
    async def get_student_auth(self, code: str, number: str) -> StudentAuth | None: ...
    async def set_student_auth(self, code: str, number: str, auth: StudentAuth | None) -> None: ...
    async def put_record(self, code: str, number: str, summary: Summary) -> None: ...
    async def get_current(self, code: str, number: str) -> Summary | None: ...
    async def list_students(self, code: str) -> list[StudentRow]: ...


class MemoryClassStore:
    """テストとローカル用。プロセスの中だけ"""

    def __init__(self) -> None:
        self._classes: dict[str, ClassRecord] = {}
        self.students: dict[str, dict[str, str]] = {}
        self._current: dict[str, dict[str, Summary]] = {}
        self._history: dict[str, dict[str, dict[str, Summary]]] = {}
        self._auth: dict[str, dict[str, StudentAuth]] = {}

    def seed(self, record: ClassRecord) -> None:
        self._classes[record.policy.class_code] = record

    async def get(self, code: str) -> ClassRecord | None:
        return self._classes.get(normalize_code(code))

    async def put(self, record: ClassRecord) -> None:
        self._classes[record.policy.class_code] = record

    async def touch_student(self, code: str, number: str) -> None:
        self.students.setdefault(normalize_code(code), {})[number] = now_iso()

    async def put_record(self, code: str, number: str, summary: Summary) -> None:
        code = normalize_code(code)
        self._current.setdefault(code, {})[number] = summary
        self._history.setdefault(code, {}).setdefault(number, {})[str(summary["record_id"])] = (
            summary
        )
        self.students.setdefault(code, {})[number] = now_iso()

    async def get_student_auth(self, code: str, number: str) -> StudentAuth | None:
        return self._auth.get(normalize_code(code), {}).get(number)

    async def set_student_auth(self, code: str, number: str, auth: StudentAuth | None) -> None:
        bucket = self._auth.setdefault(normalize_code(code), {})
        if auth is None:
            bucket.pop(number, None)
        else:
            bucket[number] = auth

    async def get_current(self, code: str, number: str) -> Summary | None:
        return self._current.get(normalize_code(code), {}).get(number)

    async def list_students(self, code: str) -> list[StudentRow]:
        code = normalize_code(code)
        seen = self.students.get(code, {})
        current = self._current.get(code, {})
        return sorted(
            (StudentRow(number=n, last_seen_at=t, current=current.get(n)) for n, t in seen.items()),
            key=lambda r: r.number,
        )


class FirestoreClassStore:
    """classes/{code}: policy の項目 + pin_hash + salt。classes/{code}/students/{no}: last_seen_at"""

    def __init__(self, project: str | None = None, database: str | None = None) -> None:
        from google.cloud import firestore

        self._client = firestore.AsyncClient(
            project=project, database=database or os.environ.get(FIRESTORE_DB_ENV, "(default)")
        )

    def _doc(self, code: str):
        return self._client.collection("classes").document(normalize_code(code))

    async def get(self, code: str) -> ClassRecord | None:
        snap = await self._doc(code).get()
        if not snap.exists:
            return None
        data = snap.to_dict() or {}
        policy = ClassPolicy(
            class_code=normalize_code(code),
            school=str(data.get("school", "jhs")),
            allowed_sensors=tuple(data.get("allowed_sensors", DEFAULT_ALLOWED)),
            teacher_enabled=tuple(data.get("teacher_enabled", ())),
            halted=bool(data.get("halted", False)),
            max_seconds=int(data.get("max_seconds", 30)),
            hints_per_experiment=int(data.get("hints_per_experiment", 3)),
            updated_at=str(data.get("updated_at", "")),
        )
        return ClassRecord(
            policy=policy, pin_hash=str(data.get("pin_hash", "")), salt=str(data.get("salt", ""))
        )

    async def put(self, record: ClassRecord) -> None:
        data = record.policy.to_dict()
        data.pop("class_code", None)
        data["pin_hash"] = record.pin_hash
        data["salt"] = record.salt
        await self._doc(record.policy.class_code).set(data)

    async def touch_student(self, code: str, number: str) -> None:
        await (
            self._doc(code)
            .collection("students")
            .document(number)
            .set({"last_seen_at": now_iso()}, merge=True)
        )

    async def put_record(self, code: str, number: str, summary: Summary) -> None:
        student = self._doc(code).collection("students").document(number)
        await student.set({"last_seen_at": now_iso(), "current": summary}, merge=True)
        await student.collection("records").document(str(summary["record_id"])).set(summary)

    async def get_student_auth(self, code: str, number: str) -> StudentAuth | None:
        snap = await self._doc(code).collection("students").document(number).get()
        data = snap.to_dict() if snap.exists else None
        if not data or not data.get("secret_hash"):
            return None
        return StudentAuth(
            secret_hash=str(data["secret_hash"]), salt=str(data.get("secret_salt", ""))
        )

    async def set_student_auth(self, code: str, number: str, auth: StudentAuth | None) -> None:
        student = self._doc(code).collection("students").document(number)
        fields = {
            "secret_hash": auth.secret_hash if auth else None,
            "secret_salt": auth.salt if auth else None,
        }
        await student.set({**fields, "last_seen_at": now_iso()}, merge=True)

    async def get_current(self, code: str, number: str) -> Summary | None:
        snap = await self._doc(code).collection("students").document(number).get()
        data = snap.to_dict() if snap.exists else None
        return data.get("current") if data else None

    async def list_students(self, code: str) -> list[StudentRow]:
        rows: list[StudentRow] = []
        async for snap in self._doc(code).collection("students").stream():
            data = snap.to_dict() or {}
            rows.append(
                StudentRow(
                    number=snap.id,
                    last_seen_at=str(data.get("last_seen_at", "")),
                    current=data.get("current"),
                )
            )
        return sorted(rows, key=lambda r: r.number)


def store_from_env() -> ClassStore:
    mode = os.environ.get(STORE_ENV) or ("firestore" if os.environ.get("K_SERVICE") else "memory")
    if mode == "firestore":
        logger.info("学級の保存先: Firestore")
        return FirestoreClassStore(project=os.environ.get("GOOGLE_CLOUD_PROJECT"))
    logger.info("学級の保存先: メモリ（%s=%s）", STORE_ENV, mode)
    return MemoryClassStore()


async def seed_demo(store: ClassStore) -> None:
    """審査員向けの学級 DEMO-2026。PIN は env で渡す（無ければ作らない）。既にあれば触らない"""
    pin = os.environ.get(DEMO_PIN_ENV)
    if not pin:
        return
    if await store.get(DEMO_CLASS_CODE) is not None:
        return
    await store.put(new_class(DEMO_CLASS_CODE, "jhs", pin))
    logger.info("学級 %s を作成", DEMO_CLASS_CODE)


def updated(policy: ClassPolicy, **changes: object) -> ClassPolicy:
    return replace(policy, updated_at=now_iso(), **changes)  # type: ignore[arg-type]
