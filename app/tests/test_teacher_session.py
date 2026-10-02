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
