"""先生のセッションの印。"""

from __future__ import annotations

from dataclasses import replace

from server import teacher_session
from server.classroom import hash_pin, new_class


def test_a_token_is_valid_until_it_expires():
    record = new_class("DEMO-2026", "jhs", "1234")
    token = teacher_session.issue(record, now=1000)

    assert teacher_session.verify(record, token, now=1000 + 60)
    assert not teacher_session.verify(record, token, now=1000 + teacher_session.SESSION_S + 1)


def test_changing_the_pin_invalidates_old_tokens():
    record = new_class("DEMO-2026", "jhs", "1234")
    token = teacher_session.issue(record)
    changed = replace(record, pin_hash=hash_pin("9999", record.salt))

    assert not teacher_session.verify(changed, token)


def test_a_token_from_another_class_or_a_forged_one_is_refused():
    a = new_class("DEMO-2026", "jhs", "1234")
    b = new_class("OTHER-1", "jhs", "1234")
    token = teacher_session.issue(a)

    assert not teacher_session.verify(b, token)
    assert not teacher_session.verify(a, token.split(".")[0] + ".deadbeef")
    assert not teacher_session.verify(a, "garbage")


def test_reading_the_database_is_not_enough_to_forge_a_token():
    """10/9 Codex #8: 鍵は学級の salt と PIN のハッシュだけだった。サーバだけが持つ秘密鍵も要る"""
    import hashlib
    import hmac
    import time

    record = new_class("DEMO-2026", "jhs", "1234")
    expires = int(time.time()) + 600
    old_style = hmac.new(
        f"{record.salt}:{record.pin_hash}".encode(),
        f"{record.policy.class_code}|{expires}".encode(),
        hashlib.sha256,
    ).hexdigest()[:32]

    assert not teacher_session.verify(record, f"{expires}.{old_style}")


def test_a_token_claiming_to_live_longer_than_a_session_is_refused():
    record = new_class("DEMO-2026", "jhs", "1234")
    far = teacher_session.issue(record, now=10_000_000)

    assert not teacher_session.verify(record, far, now=1000)


def test_teacher_pins_are_stored_with_a_slow_hash_and_old_classes_still_work():
    from server.classroom import SCRYPT_PREFIX

    record = new_class("DEMO-2026", "jhs", "1234")
    assert record.pin_hash.startswith(SCRYPT_PREFIX)
    assert record.verify("1234") and not record.verify("1235")
    legacy = replace(record, pin_hash=hash_pin("1234", record.salt))
    assert legacy.verify("1234")


def test_rotating_the_pin_does_not_undo_a_halt_pressed_at_the_same_time():
    """10/9 Codex #12: 再発行が文書全体を書き戻すと、その間に押された停止が消えた"""
    import asyncio

    from scripts.create_class import create, rotate_pin
    from server.classroom import MemoryClassStore

    store = MemoryClassStore()
    code, _ = asyncio.run(create(store, "2A-SATO", "jhs"))
    asyncio.run(store.update_policy(code, halted=True))

    asyncio.run(rotate_pin(store, code))

    assert asyncio.run(store.get(code)).policy.halted is True
