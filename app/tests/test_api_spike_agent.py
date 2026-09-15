"""POST /api/spike/agent — スパイク B5 の入口。"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from server.agent.runner import build_runner
from server.main import SPIKE_AGENT_FLAG, app, get_planner_runner


@pytest.fixture
def client(fake_llm, monkeypatch):
    monkeypatch.setenv(SPIKE_AGENT_FLAG, "1")
    app.dependency_overrides[get_planner_runner] = lambda: build_runner(fake_llm)
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_returns_404_when_flag_is_off(client, monkeypatch):
    monkeypatch.delenv(SPIKE_AGENT_FLAG)

    res = client.post("/api/spike/agent", json={"text": "重いほど速く揺れる"})

    assert res.status_code == 404


def test_rejects_empty_text(client):
    res = client.post("/api/spike/agent", json={"text": ""})

    assert res.status_code == 422


def test_rejects_planner_calls_out_of_range(client):
    res = client.post("/api/spike/agent", json={"text": "重いほど速く揺れる", "planner_calls": 99})

    assert res.status_code == 422


def test_returns_reply_and_trace_id(client, fake_llm):
    res = client.post("/api/spike/agent", json={"text": "重いほど速く揺れる"})

    assert res.status_code == 200
    body = res.json()
    assert body["reply"] == fake_llm.reply
    assert body["skipped"] is False
    assert body["planner_calls"] == 1
    assert len(body["trace_id"]) == 32


def test_reports_skip_at_limit(client, fake_llm):
    res = client.post("/api/spike/agent", json={"text": "重いほど速く揺れる", "planner_calls": 5})

    assert res.status_code == 200
    assert res.json()["skipped"] is True
    assert fake_llm.requests == []
