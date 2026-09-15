"""run_planner のセッション後始末 — 後始末の失敗で本当のエラーを隠さない。"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator

import pytest
from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse

from server.agent.runner import build_runner, run_planner


class ModelDown(Exception):
    pass


class BrokenLlm(BaseLlm):
    model: str = "broken-llm"

    async def generate_content_async(
        self, llm_request: LlmRequest, stream: bool = False
    ) -> AsyncGenerator[LlmResponse, None]:
        raise ModelDown("Vertex AI に届かない")
        yield  # async generator にするため


def test_model_error_is_not_masked_by_cleanup_failure(monkeypatch):
    runner = build_runner(BrokenLlm())

    async def failing_delete(**_kwargs):
        raise RuntimeError("セッションの削除に失敗")

    monkeypatch.setattr(runner.session_service, "delete_session", failing_delete)

    with pytest.raises(ModelDown):
        asyncio.run(run_planner(runner, text="重いほど速く揺れる", planner_calls=0))
