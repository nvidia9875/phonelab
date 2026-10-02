"""審査用のサンプル記録（E1）。"""

from __future__ import annotations

import asyncio

from server.classroom import MemoryClassStore, new_class
from server.routes_class import RecordSummary
from server.samples import sample_summaries, seed_samples


def store() -> MemoryClassStore:
    s = MemoryClassStore()
    s.seed(new_class("DEMO-2026", "jhs", "1234"))
    return s


def test_every_sample_is_a_valid_record_summary():
    for summary in sample_summaries().values():
        RecordSummary.model_validate(summary)


def test_samples_cover_held_rejected_and_judged(monkeypatch):
    statuses = {s["status"] for s in sample_summaries().values()}
    assert {"held", "judged", "signed", "open"} <= statuses
    assert any(s.get("rejection_title") for s in sample_summaries().values())


def test_seeds_only_when_enabled_and_never_overwrites(monkeypatch):
    s = store()
    assert asyncio.run(seed_samples(s)) == 0

    monkeypatch.setenv("PHONELAB_DEMO_SAMPLES", "1")
    assert asyncio.run(seed_samples(s)) == 6
    assert asyncio.run(seed_samples(s)) == 0  # 2 回目は何も書かない
    # 見本の番号には合言葉が付いていて、誰も知らない
    assert asyncio.run(s.get_student_auth("DEMO-2026", "D-01")) is not None
