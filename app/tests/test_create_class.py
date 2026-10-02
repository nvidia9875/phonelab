"""scripts/create_class.py — 運用者が学級を発行する・PIN を再発行する"""

from __future__ import annotations

import asyncio

import pytest

from scripts.create_class import create, rotate_pin
from server.classroom import MemoryClassStore


def test_issues_a_class_with_a_six_digit_pin_that_only_the_hash_keeps():
    store = MemoryClassStore()

    code, pin = asyncio.run(create(store, None, "jhs"))

    record = asyncio.run(store.get(code))
    assert code.startswith("CLS-")
    assert len(pin) == 6 and pin.isdigit()
    assert record.verify(pin)
    assert pin not in record.pin_hash


def test_does_not_overwrite_an_existing_class():
    store = MemoryClassStore()
    asyncio.run(create(store, "2a-sato", "jhs"))

    with pytest.raises(SystemExit):
        asyncio.run(create(store, "2A-SATO", "jhs"))


def test_refuses_codes_the_join_screen_would_not_accept():
    with pytest.raises(SystemExit):
        asyncio.run(create(MemoryClassStore(), "2年A組", "jhs"))


def test_rotating_the_pin_retires_the_old_one():
    store = MemoryClassStore()
    code, old = asyncio.run(create(store, "2A-SATO", "jhs"))

    new = asyncio.run(rotate_pin(store, code))

    record = asyncio.run(store.get(code))
    assert record.verify(new)
    assert not record.verify(old) or new == old
