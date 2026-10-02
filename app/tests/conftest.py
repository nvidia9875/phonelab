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
    # 先に積んだものから順に返し、尽きたら reply（自己修正のやり直しを試すため）
    replies: list[str] = Field(default_factory=list)
    requests: list[LlmRequest] = Field(default_factory=list)

    async def generate_content_async(
        self, llm_request: LlmRequest, stream: bool = False
    ) -> AsyncGenerator[LlmResponse, None]:
        self.requests.append(llm_request)
        text = self.replies.pop(0) if self.replies else self.reply
        yield LlmResponse(content=types.Content(role="model", parts=[types.Part(text=text)]))


@pytest.fixture
def fake_llm() -> FakeLlm:
    return FakeLlm()


class ScriptedLlm(BaseLlm):
    """ツールを呼ぶエージェント用。script の応答（文字列は本文、dict は関数呼び出し）を順に返す。"""

    model: str = "fake-llm"
    script: list[object] = Field(default_factory=list)
    requests: list[LlmRequest] = Field(default_factory=list)

    async def generate_content_async(
        self, llm_request: LlmRequest, stream: bool = False
    ) -> AsyncGenerator[LlmResponse, None]:
        self.requests.append(llm_request)
        step = self.script.pop(0) if self.script else "{}"
        if isinstance(step, dict):
            part = types.Part(
                function_call=types.FunctionCall(name=step["name"], args=step.get("args", {}))
            )
        else:
            part = types.Part(text=str(step))
        yield LlmResponse(content=types.Content(role="model", parts=[part]))


@pytest.fixture
def scripted_llm() -> ScriptedLlm:
    return ScriptedLlm()
