"""POST /api/chat — ラボ先生とふり返る会話の入口。"""

from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient

import server.main as main_module
from server.agent.answers import MODEL_ANSWERS
from server.agent.policy_plugin import LEAK_FALLBACK_TEXT
from server.agent.runner import build_tutor_runner
from server.classroom import MemoryClassStore, new_class
from server.main import app, get_chat_limiter, get_tutor_runner
from server.ratelimit import SlidingWindowLimiter
from server.routes_class import get_class_store
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


def test_does_not_send_the_model_answer_while_the_measurement_is_held(client, fake_llm):
    """保留（有効な測定がまだ無い）では、考えを書いても説明は渡さない。測る前に答えを知ってしまうから"""
    res = client.post(
        "/api/chat",
        json=body(situation="hold", result_statement="", reveal=True, student_thinking=THINKING),
    )

    assert res.json()["revealed"] is False
    assert MODEL_ANSWERS["sound_pluck_strength"].explanation not in prompt_sent(fake_llm)


def test_keys_the_rate_limit_on_the_address_cloud_run_appends(fake_llm):
    """run.app は利用者の IP を X-Forwarded-For の末尾に足す。先頭は利用者が自由に書ける"""
    limiter = SlidingWindowLimiter(limit=1, window_s=60)
    app.dependency_overrides[get_tutor_runner] = lambda: build_tutor_runner(fake_llm)
    app.dependency_overrides[get_chat_limiter] = lambda: limiter
    try:
        client = TestClient(app)
        first = client.post(
            "/api/chat", json=body(), headers={"x-forwarded-for": "1.1.1.1, 203.0.113.9"}
        )
        second = client.post(
            "/api/chat", json=body(), headers={"x-forwarded-for": "2.2.2.2, 203.0.113.9"}
        )
    finally:
        app.dependency_overrides.clear()

    assert first.status_code == 200
    assert second.status_code == 429


def test_does_not_serve_the_app_for_unknown_api_paths(client):
    assert client.get("/api/does-not-exist").status_code == 404
    assert client.get("/api/chat").status_code in (404, 405)


def test_replaces_a_reply_that_gives_the_result_away_while_held(client, fake_llm):
    """保留では結果もまだ秘密。モデルが自分の知識で「高さは変わらない」と言ったら問い返しに差し替える（9/16 に本番で漏れた）"""
    fake_llm.reply = "実は、輪ゴムをはじく強さを変えても、音の高さはあまり変わらず、変わるのは音の大きさなんです。"

    res = client.post(
        "/api/chat",
        json=body(
            situation="hold", result_statement="", hold_reasons=["音が小さく、雑音と区別できません"]
        ),
    )

    assert res.json()["reply"] == LEAK_FALLBACK_TEXT


def test_lets_the_teacher_restate_the_result_once_it_is_on_screen(client, fake_llm):
    """判定が出たあとは、結果そのものは画面に出ているので言ってよい（理由はまだ言わない）"""
    fake_llm.reply = "測定では、音の高さはあまり変わりませんでしたね。何が変わったと思いますか？"

    res = client.post("/api/chat", json=body())

    assert res.json()["reply"] == fake_llm.reply


def test_does_not_serve_files_outside_the_web_folder(client):
    """`..%2F` で server/agent/answers.py が読めた（9/18 Codex レビュー F1）。公開ディレクトリの外は index.html に落とす"""
    res = client.get("/..%2F..%2Fserver%2Fagent%2Fanswers.py")

    assert res.status_code in (200, 404)
    assert "leak_phrases" not in res.text
    assert "MODEL_ANSWERS" not in res.text


def class_summary(status="held", observed="same", variant_id="sound_pluck_strength"):
    judged = status == "judged"
    return {
        "record_id": "7641",
        "theme_id": "sound",
        "variant_id": variant_id,
        "status": status,
        "stage": "result" if judged else "measure_A",
        "prediction": "強くはじくと高くなると思う",
        "claim": {"variable": "strength", "direction": "faster"},
        "hold_codes": [] if judged else ["low_snr"],
        "retries": {"A": 0, "B": 0},
        "result": {"observed": observed, "consistent": False, "statement": "変わらなかった"}
        if judged
        else None,
        "plan_source": "agent",
        "trace_id": None,
        "rejection_title": None,
        "chat_turns": 0,
        "events": [],
        "updated_at": "2026-09-18T00:00:00Z",
    }


@pytest.fixture
def class_client(fake_llm):
    store = MemoryClassStore()
    store.seed(new_class("DEMO-2026", "jhs", "1234"))
    app.dependency_overrides[get_class_store] = lambda: store
    app.dependency_overrides[get_tutor_runner] = lambda: build_tutor_runner(fake_llm)
    app.dependency_overrides[get_chat_limiter] = lambda: SlidingWindowLimiter(
        limit=100, window_s=60
    )
    client = TestClient(app)
    secret = client.post("/api/class/DEMO-2026/join", json={"number": "S-04"}).json()["secret"]
    yield client, secret
    app.dependency_overrides.clear()


def send_summary(client, secret, status, **overrides):
    body = {
        "class_code": "DEMO-2026",
        "number": "S-04",
        "secret": secret,
        "record": class_summary(status, **overrides),
    }
    assert client.post("/api/records", json=body).status_code == 200


def test_in_a_class_the_explanation_opens_only_when_the_server_knows_the_record_is_judged(
    class_client, fake_llm
):
    """端末の申告（situation・reveal）でなく、サーバに届いた要約の状態で決める（9/18 Codex I3）"""
    client, secret = class_client
    ident = {"class_code": "DEMO-2026", "number": "S-04", "secret": secret, "record_id": "7641"}
    send_summary(client, secret, "held")

    lied = client.post(
        "/api/chat",
        json=body(reveal=True, student_thinking=THINKING, situation="mismatch", **ident),
    )
    assert lied.json()["revealed"] is False
    assert MODEL_ANSWERS["sound_pluck_strength"].explanation not in prompt_sent(fake_llm)

    send_summary(client, secret, "judged")
    fake_llm.requests.clear()
    honest = client.post(
        "/api/chat",
        json=body(reveal=True, student_thinking=THINKING, situation="mismatch", **ident),
    )
    assert honest.json()["revealed"] is True


def test_in_a_class_a_wrong_secret_cannot_open_the_explanation(class_client):
    client, _ = class_client
    ident = {"class_code": "DEMO-2026", "number": "S-04", "secret": "ZZZZZZ", "record_id": "7641"}
    res = client.post("/api/chat", json=body(reveal=True, student_thinking=THINKING, **ident))

    assert res.status_code == 403


@pytest.mark.parametrize(
    "overrides",
    [
        {"observed": "unknown"},  # ばらつきに埋もれて保留した判定
        {"variant_id": "sound_string_length"},  # 判定が出たのは別の実験
    ],
)
def test_in_a_class_the_explanation_stays_closed_for_an_undecided_or_other_experiment(
    class_client, fake_llm, overrides
):
    """10/2 採点 2-6: 説明の解禁を、聞いている実験そのものと、向きの決まった判定に限る"""
    client, secret = class_client
    ident = {"class_code": "DEMO-2026", "number": "S-04", "secret": secret, "record_id": "7641"}
    send_summary(client, secret, "judged", **overrides)

    res = client.post(
        "/api/chat",
        json=body(reveal=True, student_thinking=THINKING, situation="mismatch", **ident),
    )

    assert res.json()["revealed"] is False
    assert MODEL_ANSWERS["sound_pluck_strength"].explanation not in prompt_sent(fake_llm)
