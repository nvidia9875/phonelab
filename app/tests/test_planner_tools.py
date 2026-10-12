"""Planner のツール（X6、PHONELAB_PLANNER_TOOLS=1）— 候補と学級の決まりを Planner が自分で読む。"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from server.agent.runner import build_runner
from server.main import app, get_plan_limiter, get_planner_runner
from server.ratelimit import SlidingWindowLimiter


def plan(**overrides) -> dict:
    base = {
        "claim_variable": "strength",
        "claim_direction": "faster",
        "experiment_id": "sound_pluck_strength",
        "why_this": "はじく強さだけを変えれば、予想をそのまま試せます",
        "question_back": None,
    }
    return {"name": "set_model_response", "args": {**base, **overrides}}


@pytest.fixture
def client(scripted_llm, monkeypatch):
    monkeypatch.setenv("PHONELAB_PLANNER_TOOLS", "1")
    app.dependency_overrides[get_planner_runner] = lambda: build_runner(
        scripted_llm, with_tools=True
    )
    app.dependency_overrides[get_plan_limiter] = lambda: SlidingWindowLimiter(
        limit=100, window_s=60
    )
    yield TestClient(app)
    app.dependency_overrides.clear()


def body(**overrides):
    base = {
        "theme_id": "sound",
        "school": "jhs",
        "text": "強くはじくとゴムが速く震えるから、音が高くなると思う",
        "done_variant_ids": ["sound_string_length"],
        "planner_calls": 0,
    }
    return {**base, **overrides}


def texts(request) -> str:
    return "".join(p.text or "" for c in request.contents for p in (c.parts or []))


def tool_results(request) -> list[dict]:
    return [
        p.function_response.response
        for c in request.contents
        for p in (c.parts or [])
        if p.function_response
    ]


def test_the_planner_reads_the_candidates_with_a_tool(client, scripted_llm):
    scripted_llm.script = [{"name": "list_experiments"}, plan()]

    data = client.post("/api/plan", json=body()).json()

    assert data["variant_id"] == "sound_pluck_strength"
    # 候補はプロンプトに並べず、ツールで読む。やり終えた実験はツールの結果にも出ない
    assert "sound_pluck_strength:" not in texts(scripted_llm.requests[0])
    ids = [e["id"] for e in tool_results(scripted_llm.requests[-1])[0]["experiments"]]
    assert ids == ["sound_pluck_strength", "sound_tension"]
    # ツールを読んだあとの呼び出しは数えない（1 回の計画 = 1 回）
    assert data["planner_calls"] == 1


def test_the_tool_calls_are_capped(client, scripted_llm):
    scripted_llm.script = [{"name": "get_class_rules"}] * 4 + [plan()]

    client.post("/api/plan", json=body())

    last = tool_results(scripted_llm.requests[-1])
    assert last[-1] == {"error": "ツールを呼べる回数の上限です。読んだ範囲で答えてください"}
