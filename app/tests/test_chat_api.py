"""POST /api/chat — ラボ先生とふり返る会話の入口。"""

from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient

import server.main as main_module
from server.agent.answers import MODEL_ANSWERS
from server.agent.runner import build_tutor_runner
from server.main import app, get_chat_limiter, get_tutor_runner
from server.ratelimit import SlidingWindowLimiter
from tests.conftest import FakeLlm

THINKING = "強くはじくと大きくなるだけで、震える速さは同じだからだと思う"


def body(**overrides):
    base = {
        "variant_id": "sound_pluck_strength",
        "school": "jhs",
        "theme_title": "音の高さ",
        "variant_title": "同じ輪ゴムで、はじく強さだけ変える",
        "situation": "mismatch",
        "prediction": "強くはじくと音が高くなると思う",
        "result_statement": "はじく強さを変えても、音の高さは変わらなかった",
        "hold_reasons": [],
        "student_thinking": "",
        "messages": [],
        "message": "どうして変わらなかったの？",
        "turns_used": 0,
        "reveal": False,
    }
    return {**base, **overrides}


def prompt_sent(fake_llm) -> str:
    request = fake_llm.requests[0]
    return "".join(
        part.text or "" for content in request.contents for part in (content.parts or [])
    )


@pytest.fixture
def client(fake_llm):
    app.dependency_overrides[get_tutor_runner] = lambda: build_tutor_runner(fake_llm)
    app.dependency_overrides[get_chat_limiter] = lambda: SlidingWindowLimiter(
        limit=100, window_s=60
    )
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_replies_as_the_lab_teacher_and_counts_the_turn(client, fake_llm):
    res = client.post("/api/chat", json=body())

    assert res.status_code == 200
    data = res.json()
    assert data["reply"] == fake_llm.reply
    assert data["revealed"] is False
    assert data["turns_used"] == 1


def test_does_not_send_the_model_answer_before_the_student_writes_their_thinking(client, fake_llm):
    res = client.post("/api/chat", json=body(reveal=True, student_thinking=""))

    assert res.json()["revealed"] is False
    assert MODEL_ANSWERS["sound_pluck_strength"].explanation not in prompt_sent(fake_llm)


def test_sends_the_model_answer_after_the_student_writes_their_thinking(client, fake_llm):
    res = client.post("/api/chat", json=body(reveal=True, student_thinking=THINKING))

    assert res.json()["revealed"] is True
    assert MODEL_ANSWERS["sound_pluck_strength"].explanation in prompt_sent(fake_llm)


def test_includes_hold_reasons_when_the_measurement_was_held(client, fake_llm):
    client.post(
        "/api/chat",
        json=body(
            situation="hold", result_statement="", hold_reasons=["音が小さく、雑音と区別できません"]
        ),
    )

    assert "音が小さく、雑音と区別できません" in prompt_sent(fake_llm)


def test_rejects_an_experiment_that_is_not_in_the_catalog(client):
    assert client.post("/api/chat", json=body(variant_id="drop_phone")).status_code == 422


def test_rejects_a_message_that_is_too_long(client):
    assert client.post("/api/chat", json=body(message="あ" * 501)).status_code == 422


def test_limits_requests_per_client(fake_llm):
    limiter = SlidingWindowLimiter(limit=1, window_s=60)
    app.dependency_overrides[get_tutor_runner] = lambda: build_tutor_runner(fake_llm)
    app.dependency_overrides[get_chat_limiter] = lambda: limiter
    try:
        client = TestClient(app)
        assert client.post("/api/chat", json=body()).status_code == 200
        assert client.post("/api/chat", json=body()).status_code == 429
    finally:
        app.dependency_overrides.clear()


class SlowLlm(FakeLlm):
    """返事が遅い Gemini の代わり（9/16、gemini-3.8-flash が 25〜50 秒かかった）"""

    async def generate_content_async(self, llm_request, stream=False):
        await asyncio.sleep(1)
        async for response in super().generate_content_async(llm_request, stream):
            yield response


def test_returns_a_friendly_timeout_when_the_lab_teacher_is_too_slow(monkeypatch):
    monkeypatch.setattr(main_module, "CHAT_TIMEOUT_S", 0.05)
    app.dependency_overrides[get_tutor_runner] = lambda: build_tutor_runner(SlowLlm())
    app.dependency_overrides[get_chat_limiter] = lambda: SlidingWindowLimiter(
        limit=100, window_s=60
    )
    try:
        res = TestClient(app).post("/api/chat", json=body())
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 504
    assert "ラボ先生" in res.json()["detail"]
