"""統制層 PolicyPlugin — docs/architecture.md 2.1。

Runner に一度登録すれば、どのエージェントのモデル呼び出しにも効く。
スパイク B5 で持つのは before_model_callback の二つだけ:
  ① planner_calls が上限ならモデルを呼ばずに応答を返す（スキップ）
  ② 生成設定（温度・出力トークン上限）をエージェント側の設定より優先して強制する
「直前の plan を再提示」は plan が state に入る C3 で足す。
"""

from __future__ import annotations

from google.adk.agents.callback_context import CallbackContext
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.adk.plugins.base_plugin import BasePlugin
from google.genai import types
from opentelemetry import trace

PLANNER_CALLS_PER_EXPERIMENT = 5  # docs/policy.md 上限表 planner_calls_per_experiment
PLANNER_TEMPERATURE = 0.2
PLANNER_MAX_OUTPUT_TOKENS = 1024

PLANNER_CALLS_KEY = "planner_calls"
SKIP_REASON_KEY = "phonelab.skip_reason"
SKIP_REASON_PLANNER_CALL_LIMIT = "planner_call_limit"
LIMIT_REACHED_TEXT = (
    "この実験で Agent に聞ける回数の上限に達しました。"
    "いまの計画のまま測るか、先生に相談してください。"
)

_tracer = trace.get_tracer("phonelab.policy")


class PolicyPlugin(BasePlugin):
    def __init__(self, planner_call_limit: int = PLANNER_CALLS_PER_EXPERIMENT) -> None:
        super().__init__(name="phonelab_policy")
        self._planner_call_limit = planner_call_limit

    async def before_model_callback(
        self, *, callback_context: CallbackContext, llm_request: LlmRequest
    ) -> LlmResponse | None:
        calls = int(callback_context.state.get(PLANNER_CALLS_KEY, 0))

        with _tracer.start_as_current_span("phonelab.policy") as span:
            span.set_attribute("phonelab.check", SKIP_REASON_PLANNER_CALL_LIMIT)
            span.set_attribute("phonelab.planner_calls", calls)
            span.set_attribute("phonelab.planner_call_limit", self._planner_call_limit)
            if calls >= self._planner_call_limit:
                span.set_attribute("phonelab.decision", "skip_model")
                return _limit_reached_response()
            span.set_attribute("phonelab.decision", "allow")

        callback_context.state[PLANNER_CALLS_KEY] = calls + 1
        base = llm_request.config or types.GenerateContentConfig()
        llm_request.config = base.model_copy(
            update={
                "temperature": PLANNER_TEMPERATURE,
                "max_output_tokens": PLANNER_MAX_OUTPUT_TOKENS,
            }
        )
        return None


def _limit_reached_response() -> LlmResponse:
    return LlmResponse(
        content=types.Content(role="model", parts=[types.Part(text=LIMIT_REACHED_TEXT)]),
        custom_metadata={SKIP_REASON_KEY: SKIP_REASON_PLANNER_CALL_LIMIT},
    )
