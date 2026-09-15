from __future__ import annotations

from collections.abc import AsyncGenerator

import pytest
from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types
from pydantic import Field


class FakeLlm(BaseLlm):
    """Gemini の代わり。受け取ったリクエストを記録し、固定の文を返す。"""

    model: str = "fake-llm"
    reply: str = "どの変数を変えると周期が変わると思う？"
    requests: list[LlmRequest] = Field(default_factory=list)

    async def generate_content_async(
        self, llm_request: LlmRequest, stream: bool = False
    ) -> AsyncGenerator[LlmResponse, None]:
        self.requests.append(llm_request)
        yield LlmResponse(content=types.Content(role="model", parts=[types.Part(text=self.reply)]))


@pytest.fixture
def fake_llm() -> FakeLlm:
    return FakeLlm()
