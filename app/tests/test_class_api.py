"""/api/class — 学級コードで入場、先生の許可・有効化・停止、全端末停止。docs/policy.md 5 章、architecture.md 4.3。"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from server.agent.runner import build_runner
from server.classroom import MemoryClassStore, new_class, seed_demo
from server.main import app, get_plan_limiter, get_planner_runner
from server.ratelimit import SlidingWindowLimiter
from server.routes_class import get_class_store, get_pin_limiter

PIN = "1234"


@pytest.fixture
def store():
    s = MemoryClassStore()
    s.seed(new_class("DEMO-2026", "jhs", PIN))
    return s


@pytest.fixture
def client(store, fake_llm):
    app.dependency_overrides[get_class_store] = lambda: store
    app.dependency_overrides[get_pin_limiter] = lambda: SlidingWindowLimiter(limit=100, window_s=60)
    app.dependency_overrides[get_planner_runner] = lambda: build_runner(fake_llm)
    app.dependency_overrides[get_plan_limiter] = lambda: SlidingWindowLimiter(
        limit=100, window_s=60
    )
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_a_student_joins_with_the_class_code_and_gets_the_class_policy(client):
    res = client.post("/api/class/DEMO-2026/join", json={"number": "S-04"})

    assert res.status_code == 200
    data = res.json()
    assert data["class_code"] == "DEMO-2026"
    assert data["school"] == "jhs"
    assert data["halted"] is False
    assert set(data["allowed_sensors"]) == {"accelerometer", "gyroscope", "microphone"}
    assert "pin" not in json.dumps(data)
    assert len(data["secret"]) == 6  # 最初の入場でだけ合言葉が出る


def join(client, number="S-04", secret=None):
    body = {"number": number}
    if secret:
        body["secret"] = secret
    return client.post("/api/class/DEMO-2026/join", json=body)


def test_a_second_device_needs_the_secret_to_use_the_same_number(client):
    """他人の番号を横取りできない（9/18 Codex F4）。家の端末は合言葉で同じ番号に入る"""
    secret = join(client).json()["secret"]

    assert join(client).status_code == 409
    assert join(client, secret="ZZZZZZ").status_code == 403
    again = join(client, secret=secret)
    assert again.status_code == 200
    assert again.json()["secret"] is None  # 二度は見せない


def test_the_teacher_can_reset_a_number_so_the_student_gets_a_new_secret(client):
    first = join(client).json()["secret"]

    reset = client.post("/api/class/DEMO-2026/students/S-04/reset", json={"pin": PIN})
    assert reset.status_code == 200
    second = join(client).json()["secret"]

    assert second is not None and second != first


def test_an_unknown_class_code_is_refused(client):
    assert client.post("/api/class/NOPE-1/join", json={"number": "S-04"}).status_code == 404
    assert client.get("/api/class/NOPE-1").status_code == 404


def test_the_class_code_is_case_insensitive(client):
    assert client.post("/api/class/demo-2026/join", json={"number": "s-04"}).status_code == 200


def test_the_teacher_halts_every_device_with_the_pin_and_students_see_it(client):
    res = client.post("/api/class/DEMO-2026/halt", json={"pin": PIN, "halted": True})

    assert res.status_code == 200
    assert res.json()["halted"] is True
    assert client.get("/api/class/DEMO-2026").json()["halted"] is True
    assert client.get("/api/class/DEMO-2026").headers["cache-control"] == "no-store"


def test_a_wrong_pin_cannot_halt_or_change_the_policy(client):
    assert (
        client.post("/api/class/DEMO-2026/halt", json={"pin": "0000", "halted": True}).status_code
        == 403
    )
    assert client.get("/api/class/DEMO-2026").json()["halted"] is False


def test_the_teacher_changes_allowed_sensors_and_enables_home_experiments(client):
    res = client.put(
        "/api/class/DEMO-2026/policy",
        json={"pin": PIN, "allowed_sensors": ["microphone"], "teacher_enabled": ["pendulum"]},
    )

    assert res.status_code == 200
    data = res.json()
    assert data["allowed_sensors"] == ["microphone"]
    assert data["teacher_enabled"] == ["pendulum"]


def test_wrong_pin_attempts_are_rate_limited(store, fake_llm):
    app.dependency_overrides[get_class_store] = lambda: store
    limiter = SlidingWindowLimiter(limit=2, window_s=600)
    app.dependency_overrides[get_pin_limiter] = lambda: limiter
    try:
        client = TestClient(app)
        codes = [
            client.post(
                "/api/class/DEMO-2026/halt", json={"pin": "0000", "halted": True}
            ).status_code
            for _ in range(3)
        ]
    finally:
        app.dependency_overrides.clear()

    assert codes == [403, 403, 429]


def test_the_planner_refuses_to_run_while_the_class_is_halted(client, fake_llm):
    client.post("/api/class/DEMO-2026/halt", json={"pin": PIN, "halted": True})

    res = client.post(
        "/api/plan",
        json={
            "theme_id": "sound",
            "school": "jhs",
            "text": "強くはじくと高くなると思う",
            "done_variant_ids": [],
            "previous_question_back": None,
            "planner_calls": 0,
            "class_code": "DEMO-2026",
        },
    )

    assert res.status_code == 409
    assert fake_llm.requests == []


def test_seeds_the_demo_class_from_the_environment(monkeypatch):
    monkeypatch.setenv("PHONELAB_DEMO_PIN", "9876")
    store = MemoryClassStore()

    import asyncio

    asyncio.run(seed_demo(store))
    asyncio.run(seed_demo(store))  # 二度呼んでも上書きしない

    rec = asyncio.run(store.get("DEMO-2026"))
    assert rec is not None
    assert rec.policy.school == "jhs"
    assert rec.verify("9876") is True
    assert rec.verify("0000") is False


def summary(**overrides):
    base = {
        "record_id": "7641",
        "theme_id": "sound",
        "variant_id": "sound_pluck_strength",
        "status": "held",
        "stage": "measure_A",
        "prediction": "強くはじくと高くなると思う",
        "claim": {"variable": "strength", "direction": "faster"},
        "hold_codes": ["low_snr"],
        "retries": {"A": 1, "B": 0},
        "result": None,
        "plan_source": "agent",
        "trace_id": "a" * 32,
        "rejection_title": None,
        "chat_turns": 0,
        "events": [{"t": "10:12", "k": "予想", "body": "強くはじくと高くなると思う"}],
        "updated_at": "2026-09-17T01:00:00Z",
    }
    return {**base, **overrides}


def post_record(client, rec, number="S-04", secret=None):
    secret = secret or join(client, number).json()["secret"]
    body = {"class_code": "DEMO-2026", "number": number, "secret": secret, "record": rec}
    return client.post("/api/records", json=body), secret


def test_a_device_posts_its_record_summary_and_the_teacher_sees_it_on_the_dashboard(client):
    res, _ = post_record(client, summary())
    assert res.status_code == 200

    dash = client.post("/api/class/DEMO-2026/dashboard", json={"pin": PIN})

    assert dash.status_code == 200
    data = dash.json()
    assert data["halted"] is False
    rows = {s["number"]: s for s in data["students"]}
    assert rows["S-04"]["current"]["status"] == "held"
    assert rows["S-04"]["current"]["hold_codes"] == ["low_snr"]
    assert rows["S-04"]["current"]["claim"] == {"variable": "strength", "direction": "faster"}


def test_the_newest_summary_replaces_the_current_one(client):
    _, secret = post_record(client, summary())
    post_record(client, summary(status="judged", stage="result", hold_codes=[]), secret=secret)

    rows = client.post("/api/class/DEMO-2026/dashboard", json={"pin": PIN}).json()["students"]

    assert [s["current"]["status"] for s in rows if s["number"] == "S-04"] == ["judged"]


def test_the_dashboard_needs_the_pin(client):
    assert client.post("/api/class/DEMO-2026/dashboard", json={"pin": "0000"}).status_code == 403


def test_a_record_for_an_unknown_class_is_refused(client):
    body = {"class_code": "NOPE-1", "number": "S-04", "secret": "ABCDEF", "record": summary()}
    assert client.post("/api/records", json=body).status_code == 404


def test_a_record_for_someone_elses_number_is_refused(client):
    """他人の番号に記録を書けない（9/18 Codex F4）"""
    join(client, "S-11")  # S-11 は別の端末が使っている
    body = {"class_code": "DEMO-2026", "number": "S-11", "secret": "ABCDEF", "record": summary()}
    assert client.post("/api/records", json=body).status_code == 403


def test_a_record_summary_cannot_carry_raw_data(client):
    """生データ（波形など）は要約に入らない。知らない項目は落ちる、大きすぎる文は 422"""
    res, _ = post_record(client, summary(prediction="あ" * 501))

    assert res.status_code == 422


def test_the_planner_refuses_a_theme_whose_sensor_the_class_does_not_allow(client, fake_llm):
    """学級の許可は画面だけでなく Planner の入口でも効く（9/18 Codex I2）"""
    client.put(
        "/api/class/DEMO-2026/policy",
        json={"pin": PIN, "allowed_sensors": ["microphone"], "teacher_enabled": []},
    )

    res = client.post(
        "/api/plan",
        json={
            "theme_id": "energy",
            "school": "jhs",
            "text": "高いほど速くなると思う",
            "done_variant_ids": [],
            "previous_question_back": None,
            "planner_calls": 0,
            "class_code": "DEMO-2026",
        },
    )

    assert res.status_code == 200
    assert res.json()["kind"] == "hint"
    assert "許可" in res.json()["question_back"]
    assert fake_llm.requests == []


def test_correct_pins_are_not_counted_against_the_attempt_limit(store, fake_llm):
    """教員画面は 5 秒ごとに PIN 付きで更新する。正しい PIN で上限に当たってはいけない（9/18 Codex F2）"""
    app.dependency_overrides[get_class_store] = lambda: store
    limiter = SlidingWindowLimiter(limit=2, window_s=600)
    app.dependency_overrides[get_pin_limiter] = lambda: limiter
    try:
        client = TestClient(app)
        codes = [
            client.post("/api/class/DEMO-2026/dashboard", json={"pin": PIN}).status_code
            for _ in range(5)
        ]
        wrong = [
            client.post(
                "/api/class/DEMO-2026/halt", json={"pin": "0000", "halted": True}
            ).status_code
            for _ in range(3)
        ]
        still_ok = client.post("/api/class/DEMO-2026/dashboard", json={"pin": PIN}).status_code
    finally:
        app.dependency_overrides.clear()

    assert codes == [200] * 5
    assert wrong == [403, 403, 429]
    assert still_ok == 200
