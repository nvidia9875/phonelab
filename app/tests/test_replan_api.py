"""POST /api/replan — 保留の理由を読んで、次の一手（同じ条件で直して測り直す／別の実験へ）を提案する。

審査員の「エージェントは結果を見て計画を修正するか」への答え（9/18 Codex レビュー §8 ②）。
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from server.agent.runner import build_replan_runner
from server.main import app, get_plan_limiter, get_replan_runner
from server.ratelimit import SlidingWindowLimiter


def replan_json(**overrides) -> str:
    base = {
        "action": "retry",
        "experiment_id": None,
        "advice": "端末を輪ゴムの箱にもっと近づけて、合図のあと 1 秒待ってからはじきましょう",
    }
    return json.dumps({**base, **overrides}, ensure_ascii=False)


def body(**overrides):
    base = {
        "theme_id": "sound",
        "variant_id": "sound_pluck_strength",
        "condition": "A",
        "hold_codes": ["low_snr"],
        "retries": 1,
        "prediction": "強くはじくと高くなると思う",
        "done_variant_ids": [],
        "replan_calls": 0,
    }
    return {**base, **overrides}


def prompt_sent(fake_llm) -> str:
    request = fake_llm.requests[0]
    return "".join(
        part.text or "" for content in request.contents for part in (content.parts or [])
    )


@pytest.fixture
def client(fake_llm):
    fake_llm.reply = replan_json()
    app.dependency_overrides[get_replan_runner] = lambda: build_replan_runner(fake_llm)
    app.dependency_overrides[get_plan_limiter] = lambda: SlidingWindowLimiter(
        limit=100, window_s=60
    )
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_reads_the_hold_reasons_and_proposes_how_to_measure_again(client, fake_llm):
    res = client.post("/api/replan", json=body())

    assert res.status_code == 200
    data = res.json()
    assert data["action"] == "retry"
    assert data["advice"].startswith("端末を輪ゴムの箱に")
    assert data["source"] == "agent"
    prompt = prompt_sent(fake_llm)
    assert "雑音" in prompt  # 検査コードは言葉にして渡す
    assert "振動数" not in prompt  # 答えは渡さない


def test_can_propose_switching_to_another_experiment_of_the_theme(client, fake_llm):
    fake_llm.reply = replan_json(
        action="switch",
        experiment_id="sound_string_length",
        advice="この端末では強さの差が拾えないので、長さの実験に切り替えましょう",
    )

    data = client.post("/api/replan", json=body(retries=2)).json()

    assert data["action"] == "switch"
    assert data["experiment_id"] == "sound_string_length"


def test_a_switch_to_an_experiment_outside_the_theme_is_turned_into_a_retry(client, fake_llm):
    fake_llm.reply = replan_json(
        action="switch", experiment_id="energy_height", advice="別の実験へ"
    )

    data = client.post("/api/replan", json=body()).json()

    assert data["action"] == "retry"
    assert data["experiment_id"] is None
    assert data["policy_fixed"] is True


def test_advice_that_gives_the_result_away_is_neutralised(client, fake_llm):
    fake_llm.reply = replan_json(
        advice="強くはじいても高さは変わらないので、雑音を減らして測り直しましょう"
    )

    data = client.post("/api/replan", json=body()).json()

    assert "変わらない" not in data["advice"]
    assert data["policy_fixed"] is True


def test_falls_back_to_the_template_when_the_model_cannot_be_read(client, fake_llm):
    fake_llm.reply = "JSON ではない"

    data = client.post("/api/replan", json=body(hold_codes=["clipping"])).json()

    assert data["action"] == "retry"
    assert data["source"] == "catalog"
    assert "割れ" in data["advice"]


def test_rejects_unknown_experiments(client):
    assert client.post("/api/replan", json=body(variant_id="drop_phone")).status_code == 422


def test_advice_that_changes_the_condition_is_sent_back_and_then_neutralised(client, fake_llm):
    # 10/2 採点 4 回目: 音が割れたときに「さっきよりも弱くして」— はじく強さの実験の条件そのものを変えていた
    fake_llm.reply = replan_json(advice="音が割れたので、さっきよりも弱くしてはじきましょう")

    data = client.post("/api/replan", json=body(hold_codes=["clipping"])).json()

    assert "弱く" not in data["advice"]
    assert data["policy_fixed"] is True
    assert data["fix_reasons"] == ["condition_changed"]
    assert any("条件を変えさせる" in line for line in data["trail"])
    retry_prompt = "".join(
        part.text or ""
        for content in fake_llm.requests[-1].contents
        for part in content.parts or []
    )
    assert "変えてはいけない条件" in retry_prompt


def test_the_prompt_names_what_must_stay_the_same(client, fake_llm):
    client.post(
        "/api/replan",
        json=body(
            theme_id="energy",
            variant_id="energy_height",
            hold_codes=["saturation"],
            prediction="高いほど速い",
        ),
    )

    prompt = prompt_sent(fake_llm)
    assert "一定: 重さ、糸の長さ 80 cm" in prompt
    assert "【この実験で変えてはいけないもの】放す高さ" in prompt


def test_advice_that_keeps_the_condition_passes(client, fake_llm):
    fake_llm.reply = replan_json(
        advice="放す高さは変えずに、端末が袋の中で動かないように包み直して、そっと放しましょう"
    )

    data = client.post(
        "/api/replan",
        json=body(
            theme_id="energy",
            variant_id="energy_height",
            hold_codes=["saturation"],
            prediction="高いほど速い",
        ),
    ).json()

    assert data["advice"].startswith("放す高さは変えずに")
    assert data["policy_fixed"] is False
