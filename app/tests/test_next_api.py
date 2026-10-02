"""POST /api/next — 結果のあとの次の一手（X1）。ループの最後（次の予想）をエージェントが閉じる。"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from server.agent.runner import build_next_runner
from server.main import app
from server.ratelimit import SlidingWindowLimiter
from server.routes_next import get_next_limiter, get_next_runner


def next_json(**overrides) -> str:
    base = {
        "action": "next",
        "experiment_id": "sound_string_length",
        "question": "では、震える長さを短くしたら、音の高さはどうなると思う？",
        "why": "強さでは予想どおりだったので、次は別の変数で考え方を試します",
    }
    return json.dumps({**base, **overrides}, ensure_ascii=False)


def body(**overrides):
    base = {
        "theme_id": "sound",
        "variant_id": "sound_pluck_strength",
        "school": "jhs",
        "prediction": "強くはじいても高さは変わらないと思う",
        "claim_direction": "same",
        "observed": "same",
        "consistent": True,
        "explained": True,
        "done_variant_ids": [],
        "next_calls": 0,
    }
    return {**base, **overrides}


def prompt_of(request) -> str:
    return "".join(
        part.text or "" for content in request.contents for part in (content.parts or [])
    )


@pytest.fixture
def client(fake_llm):
    fake_llm.reply = next_json()
    app.dependency_overrides[get_next_runner] = lambda: build_next_runner(fake_llm)
    app.dependency_overrides[get_next_limiter] = lambda: SlidingWindowLimiter(
        limit=100, window_s=60
    )
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_picks_the_next_experiment_and_asks_for_a_new_prediction(client, fake_llm):
    res = client.post("/api/next", json=body())

    assert res.status_code == 200
    data = res.json()
    assert data["action"] == "next"
    assert data["experiment_id"] == "sound_string_length"
    assert data["question"].endswith("どうなると思う？")
    assert data["source"] == "agent"
    assert data["next_calls"] == 1
    prompt = prompt_of(fake_llm.requests[0])
    assert "合った" in prompt
    assert "sound_pluck_strength:" not in prompt  # やり終えた実験は候補に出さない


def test_does_not_call_the_model_when_no_experiment_is_left(client, fake_llm):
    data = client.post("/api/next", json=body(done_variant_ids=["sound_string_length"])).json()

    assert data["action"] == "reflect"
    assert data["source"] == "catalog"
    assert fake_llm.requests == []
    assert any("AI は呼ばない" in line for line in data["trail"])


def test_an_off_catalog_pick_is_redone_then_replaced(client, fake_llm):
    fake_llm.reply = next_json(experiment_id="energy_height")

    data = client.post("/api/next", json=body()).json()

    assert data["experiment_id"] == "sound_string_length"
    assert data["policy_fixed"] is True
    assert data["fix_reasons"] == ["off_catalog"]
    assert len(fake_llm.requests) == 2


def test_a_question_that_gives_away_the_result_is_neutralised(client, fake_llm):
    fake_llm.reply = next_json(question="短くすると高くなるよね？")

    data = client.post("/api/next", json=body()).json()

    assert "高くな" not in data["question"]
    assert data["policy_fixed"] is True


def test_can_send_the_student_to_reflect_first(client, fake_llm):
    fake_llm.reply = next_json(
        action="reflect", experiment_id=None, question="", why="食い違いを先にふり返ろう"
    )

    data = client.post(
        "/api/next", json=body(consistent=False, explained=False, observed="faster")
    ).json()

    assert data["action"] == "reflect"
    assert data["experiment_id"] is None


def test_a_reflect_question_with_result_words_becomes_a_reflect_question_not_a_next_one(
    client, fake_llm
):
    """10/2 評価: ふり返りの問いが「次の変数を変えたら…」に差し替わっていた"""
    fake_llm.reply = next_json(
        action="reflect", experiment_id=None, question="重いと速くなると思ったのはなぜ？", why=""
    )

    data = client.post(
        "/api/next", json=body(consistent=False, explained=False, observed="same")
    ).json()

    assert data["action"] == "reflect"
    assert "次の変数" not in data["question"]
    assert "なぜ" in data["question"] or "どうして" in data["question"]


def test_falls_back_to_the_catalog_when_the_limit_is_reached(client, fake_llm):
    data = client.post("/api/next", json=body(next_calls=3)).json()

    assert data["source"] == "catalog"
    assert data["experiment_id"] == "sound_string_length"
    assert "どうなると思う？" in data["question"]
    assert fake_llm.requests == []


def test_rejects_a_variant_from_another_theme(client):
    assert client.post("/api/next", json=body(variant_id="energy_height")).status_code == 422


def test_the_fallback_also_reflects_first_on_an_unexplained_mismatch(client, fake_llm):
    """10/2 採点 3 回目 2-7: 上限や読めない出力のときも、食い違って理由がまだならふり返りが先"""
    data = client.post(
        "/api/next",
        json=body(consistent=False, explained=False, observed="faster", next_calls=3),
    ).json()

    assert data["action"] == "reflect"
    assert data["source"] == "catalog"
    assert fake_llm.requests == []
