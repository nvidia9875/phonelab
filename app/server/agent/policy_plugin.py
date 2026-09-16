"""統制層 PolicyPlugin — docs/architecture.md 2.1、docs/policy.md 3.5・3.6。

Runner に一度登録すれば、どのエージェントのモデル呼び出しにも効く。
  before_run_callback:   先生が学級の測定を止めていたら（state の class_halted）、エージェントを走らせない（D8 / D13）
  before_model_callback: 呼び出し回数が上限ならモデルを呼ばずに応答を返す（スキップ）。
                         生成設定（温度・出力トークン上限・思考の量）をエージェント側の設定より優先して強制する
  after_model_callback:  先生の説明がまだ閉じているのに、応答が説明の言い回しを含んだら、問い返しの文に差し替える
                         Planner の構造化出力が候補に無い実験を指していたら候補の先頭に、理由に結果が混じっていたら中立の文に差し替える
Planner（実験を選ぶ）とラボ先生（ふり返りの会話）で、数える回数と上限だけを変えて同じ統制をかける。
"""

from __future__ import annotations

import re

from google.adk.agents.callback_context import CallbackContext
from google.adk.agents.invocation_context import InvocationContext
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.adk.plugins.base_plugin import BasePlugin
from google.genai import types
from opentelemetry import trace

from server.agent.planner import parse_plan

PLANNER_CALLS_PER_EXPERIMENT = 5  # docs/policy.md 上限表 planner_calls_per_experiment
PLANNER_TEMPERATURE = 0.2
PLANNER_MAX_OUTPUT_TOKENS = 1024

CLASS_HALTED_KEY = "class_halted"
HALTED_TEXT = "先生が学級の測定を止めています。解除されるまで待ってください。"

PLANNER_CALLS_KEY = "planner_calls"
SKIP_REASON_KEY = "phonelab.skip_reason"
SKIP_REASON_CALL_LIMIT = "call_limit"
LIMIT_REACHED_TEXT = (
    "この実験でラボ先生に聞ける回数の上限に達しました。"
    "いまの計画のまま測るか、先生に相談してください。"
)

PLAN_CANDIDATES_KEY = "plan_candidates"
PLAN_OFF_CATALOG_KEY = "phonelab.plan_off_catalog"
PLAN_WHY_REPLACED_KEY = "phonelab.plan_why_replaced"
# 「なぜこの実験か」に混じってはいけない、結果の言葉
RESULT_WORDS = re.compile(
    r"速くな|遅くな|高くな|低くな|変わらな|同じにな|長くな|短くな|ほぼ同じ|ならない"
)
NEUTRAL_WHY = "この実験なら、予想した変数だけを変えて確かめられます。結果は測って見つけます"

ANSWER_LOCKED_KEY = "answer_locked"
LEAK_PHRASES_KEY = "leak_phrases"
ANSWER_LEAK_KEY = "phonelab.answer_leak"
LEAK_FALLBACK_TEXT = "その理由は、あなたの考えを書いてから、いっしょに見ていきましょう。いま、どうしてそうなったと思いますか？"

_tracer = trace.get_tracer("phonelab.policy")


class PolicyPlugin(BasePlugin):
    def __init__(
        self,
        *,
        calls_key: str = PLANNER_CALLS_KEY,
        call_limit: int = PLANNER_CALLS_PER_EXPERIMENT,
        limit_text: str = LIMIT_REACHED_TEXT,
        temperature: float = PLANNER_TEMPERATURE,
        max_output_tokens: int = PLANNER_MAX_OUTPUT_TOKENS,
        thinking_level: str | None = None,
        name: str = "phonelab_policy",
    ) -> None:
        super().__init__(name=name)
        self._calls_key = calls_key
        self._call_limit = call_limit
        self._limit_text = limit_text
        self._temperature = temperature
        self._max_output_tokens = max_output_tokens
        self._thinking_level = thinking_level

    async def before_run_callback(
        self, *, invocation_context: InvocationContext
    ) -> types.Content | None:
        """先生の全端末停止。Runner の入口で止め、エージェントもモデルも動かさない"""
        if not invocation_context.session.state.get(CLASS_HALTED_KEY):
            return None
        with _tracer.start_as_current_span("phonelab.policy") as span:
            span.set_attribute("phonelab.check", "class_halted")
            span.set_attribute("phonelab.decision", "skip_run")
        return types.Content(role="model", parts=[types.Part(text=HALTED_TEXT)])

    async def before_model_callback(
        self, *, callback_context: CallbackContext, llm_request: LlmRequest
    ) -> LlmResponse | None:
        calls = int(callback_context.state.get(self._calls_key, 0))

        with _tracer.start_as_current_span("phonelab.policy") as span:
            span.set_attribute("phonelab.check", SKIP_REASON_CALL_LIMIT)
            span.set_attribute("phonelab.calls_key", self._calls_key)
            span.set_attribute("phonelab.calls", calls)
            span.set_attribute("phonelab.call_limit", self._call_limit)
            if calls >= self._call_limit:
                span.set_attribute("phonelab.decision", "skip_model")
                return _text_response(self._limit_text, {SKIP_REASON_KEY: SKIP_REASON_CALL_LIMIT})
            span.set_attribute("phonelab.decision", "allow")

        callback_context.state[self._calls_key] = calls + 1
        update: dict[str, object] = {
            "temperature": self._temperature,
            "max_output_tokens": self._max_output_tokens,
        }
        if self._thinking_level:
            update["thinking_config"] = types.ThinkingConfig(thinking_level=self._thinking_level)
        base = llm_request.config or types.GenerateContentConfig()
        llm_request.config = base.model_copy(update=update)
        return None

    async def after_model_callback(
        self, *, callback_context: CallbackContext, llm_response: LlmResponse
    ) -> LlmResponse | None:
        state = callback_context.state
        candidates = [str(c) for c in (state.get(PLAN_CANDIDATES_KEY) or [])]
        if candidates:
            return _check_plan(candidates, llm_response)
        if not state.get(ANSWER_LOCKED_KEY):
            return None
        text = _squash(_response_text(llm_response))
        phrases = [_squash(p) for p in state.get(LEAK_PHRASES_KEY, []) if p]
        leaked = any(p and p in text for p in phrases)
        with _tracer.start_as_current_span("phonelab.leak_check") as span:
            span.set_attribute("phonelab.answer_leak", leaked)
        if not leaked:
            return None
        return _text_response(LEAK_FALLBACK_TEXT, {ANSWER_LEAK_KEY: True})


def _check_plan(candidates: list[str], llm_response: LlmResponse) -> LlmResponse | None:
    """Planner の出力を候補と突き合わせる。直したところだけ印を付けて返す"""
    plan = parse_plan(_response_text(llm_response))
    flags: dict[str, object] = {}
    with _tracer.start_as_current_span("phonelab.policy") as span:
        span.set_attribute("phonelab.check", "plan_output")
        if plan is None:
            span.set_attribute("phonelab.decision", "unreadable")
            return None
        if plan.experiment_id not in candidates:
            plan = plan.model_copy(update={"experiment_id": candidates[0]})
            flags[PLAN_OFF_CATALOG_KEY] = True
        if RESULT_WORDS.search(plan.why_this):
            plan = plan.model_copy(update={"why_this": NEUTRAL_WHY})
            flags[PLAN_WHY_REPLACED_KEY] = True
        span.set_attribute("phonelab.decision", "fixed" if flags else "allow")
    if not flags:
        return None
    return _text_response(plan.model_dump_json(), flags)


def _squash(text: str) -> str:
    """空白を全部落として比べる。語句表は「約 1.4 倍」、Gemini は「約1.4倍」と書くため"""
    return "".join(text.split())


def _response_text(response: LlmResponse) -> str:
    if not response.content or not response.content.parts:
        return ""
    return "".join(p.text for p in response.content.parts if p.text and not p.thought)


def _text_response(text: str, metadata: dict[str, object]) -> LlmResponse:
    return LlmResponse(
        content=types.Content(role="model", parts=[types.Part(text=text)]),
        custom_metadata=metadata,
    )
