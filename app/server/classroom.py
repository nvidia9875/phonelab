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


def new_class(code: str, school: str, pin: str) -> ClassRecord:
    salt = secrets.token_hex(8)
    policy = ClassPolicy(class_code=normalize_code(code), school=school, updated_at=now_iso())
    return ClassRecord(policy=policy, pin_hash=hash_pin(pin, salt), salt=salt)


class ClassStore(Protocol):
    async def get(self, code: str) -> ClassRecord | None: ...
    async def put(self, record: ClassRecord) -> None: ...
    async def touch_student(self, code: str, number: str) -> None: ...


class MemoryClassStore:
    """テストとローカル用。プロセスの中だけ"""

    def __init__(self) -> None:
        self._classes: dict[str, ClassRecord] = {}
        self.students: dict[str, dict[str, str]] = {}

    def seed(self, record: ClassRecord) -> None:
        self._classes[record.policy.class_code] = record

    async def get(self, code: str) -> ClassRecord | None:
        return self._classes.get(normalize_code(code))

    async def put(self, record: ClassRecord) -> None:
        self._classes[record.policy.class_code] = record

    async def touch_student(self, code: str, number: str) -> None:
        self.students.setdefault(normalize_code(code), {})[number] = now_iso()


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
