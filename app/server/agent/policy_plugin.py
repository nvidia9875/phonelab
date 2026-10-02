"""統制層 PolicyPlugin — docs/architecture.md 2.1、docs/policy.md 3.5・3.6。

Runner に一度登録すれば、どのエージェントのモデル呼び出しにも効く。
  before_run_callback:   先生が学級の測定を止めていたら（state の class_halted）、エージェントを走らせない（D8 / D13）
  before_model_callback: 生徒の文を Model Armor で検査し（1 回の実行で 1 回、注入対策の第 1 層）、検知したらモデルを呼ばない。
                         呼び出し回数が上限ならモデルを呼ばずに応答を返す（スキップ）。
                         生成設定（温度・出力トークン上限・思考の量）をエージェント側の設定より優先して強制する
  before_tool_callback:  ツールを持つエージェント（学級の見立て）は、許したツールだけ、回数の上限まで、学級にいる番号だけを読める
  after_model_callback:  先生の説明がまだ閉じているのに、応答が説明の言い回しを含んだら、問い返しの文に差し替える
                         Planner の構造化出力が候補に無い実験を指していたら候補の先頭に、理由に結果が混じっていたら中立の文に差し替える
Planner（実験を選ぶ）とラボ先生（ふり返りの会話）で、数える回数と上限だけを変えて同じ統制をかける。
"""

from __future__ import annotations

import re
from typing import Any

from google.adk.agents.callback_context import CallbackContext
from google.adk.agents.invocation_context import InvocationContext
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.adk.plugins.base_plugin import BasePlugin
from google.adk.tools import BaseTool, ToolContext
from google.genai import types
from opentelemetry import trace

from server.agent.class_agent import KNOWN_NUMBERS_KEY, InsightOutput, parse_insight
from server.agent.model_armor import ArmorClient
from server.agent.next_step import parse_next
from server.agent.planner import parse_plan, parse_replan

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
REPLAN_CANDIDATES_KEY = "replan_candidates"
REPLAN_CALLS_KEY = "replan_calls"
REPLAN_CALLS_PER_RECORD = 3
NEUTRAL_ADVICE = (
    "やり方を一つだけ変えて、同じ条件でもう一度測ってみましょう。結果は測って見つけます"
)
NEXT_CANDIDATES_KEY = "next_candidates"
NEXT_CALLS_KEY = "next_calls"
NEUTRAL_QUESTION = "では、次の変数を変えたら、どうなると思う？ 予想を書いてから測ってみよう"
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

ARMOR_TEXT_KEY = "armor_text"
ARMOR_CHECKED_KEY = "armor_checked"
ARMOR_BLOCKED_KEY = "phonelab.armor_blocked"
ARMOR_BLOCKED_TEXT = "この文には、ラボ先生への指示や、授業に合わない言葉が含まれていたので、ラボ先生には渡しませんでした。予想を自分の言葉で書き直してください。"
TOOL_CALLS_KEY = "tool_calls"
# 断った呼び出しも含めた試行の数。上限はこちらで数える（断られた呼び出しを繰り返してモデルの回数を使い切らないように。10/2 本番で起きた）
TOOL_ATTEMPTS_KEY = "tool_attempts"
TIMELINE_CALLS_KEY = "timeline_calls"
TIMELINE_LIMIT = 3
TOOL_DENIED_KEY = "phonelab.tool_denied"
# ADK が構造化出力をツール経由で返すときの内部ツール。統制の対象外（中身は after_model と同じ検査をかける）
STRUCTURED_OUTPUT_TOOL = "set_model_response"
HALT_WORDS = re.compile(r"止め|停止|中止|やめさせ")
MAX_INSIGHT_CHARS = 80
INSIGHT_FIXED_KEY = "phonelab.insight_fixed"

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
        allowed_tools: tuple[str, ...] = (),
        tool_limit: int = 0,
        count_tool_followups: bool = True,
        armor: ArmorClient | None = None,
        name: str = "phonelab_policy",
    ) -> None:
        super().__init__(name=name)
        self._armor = armor
        # False なら、ツールの結果を読ませるためのモデル呼び出しは回数に数えない（1 回の計画 = 1 回）
        self._count_tool_followups = count_tool_followups
        self._allowed_tools = allowed_tools
        self._tool_limit = tool_limit
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
        blocked = await self._screen(callback_context)
        if blocked:
            return blocked
        calls = int(callback_context.state.get(self._calls_key, 0))
        followup = _is_tool_followup(llm_request)

        with _tracer.start_as_current_span("phonelab.policy") as span:
            span.set_attribute("phonelab.check", SKIP_REASON_CALL_LIMIT)
            span.set_attribute("phonelab.calls_key", self._calls_key)
            span.set_attribute("phonelab.calls", calls)
            span.set_attribute("phonelab.call_limit", self._call_limit)
            if calls >= self._call_limit and not (followup and not self._count_tool_followups):
                span.set_attribute("phonelab.decision", "skip_model")
                return _text_response(self._limit_text, {SKIP_REASON_KEY: SKIP_REASON_CALL_LIMIT})
            span.set_attribute("phonelab.decision", "allow")

        if self._count_tool_followups or not followup:
            callback_context.state[self._calls_key] = calls + 1
        update: dict[str, object] = {
            "temperature": self._temperature,
            "max_output_tokens": self._max_output_tokens,
        }
        if self._thinking_level:
            update["thinking_config"] = types.ThinkingConfig(thinking_level=self._thinking_level)
        base = llm_request.config or types.GenerateContentConfig()
        if self._must_answer_now(callback_context.state, calls):
            # ツールの枠を使い切ったか、モデルを呼べるのが最後の 1 回なら、ツールを外して答えさせる
            update["tools"] = _without(base.tools, self._allowed_tools)
            with _tracer.start_as_current_span("phonelab.policy") as span:
                span.set_attribute("phonelab.check", "tool_budget")
                span.set_attribute("phonelab.decision", "remove_tools")
        llm_request.config = base.model_copy(update=update)
        return None

    def _must_answer_now(self, state, calls: int) -> bool:
        if not self._allowed_tools:
            return False
        attempts = int(state.get(TOOL_ATTEMPTS_KEY, 0))
        last_call = self._count_tool_followups and calls + 1 >= self._call_limit
        return attempts >= self._tool_limit or last_call

    async def _screen(self, callback_context: CallbackContext) -> LlmResponse | None:
        """生徒の文（state の armor_text）を、この実行で最初のモデル呼び出しの前に一度だけ Model Armor に通す"""
        state = callback_context.state
        text = state.get(ARMOR_TEXT_KEY)
        if self._armor is None or not text or state.get(ARMOR_CHECKED_KEY):
            return None
        state[ARMOR_CHECKED_KEY] = True
        with _tracer.start_as_current_span("phonelab.model_armor") as span:
            verdict = await self._armor.screen(str(text))
            span.set_attribute("phonelab.armor_matched", verdict.matched)
            span.set_attribute("phonelab.armor_filters", ",".join(verdict.filters))
            if verdict.error:
                span.set_attribute("phonelab.armor_error", verdict.error)
            if not verdict.matched:
                return None
            span.set_attribute("phonelab.decision", "skip_model")
        return _text_response(ARMOR_BLOCKED_TEXT, {ARMOR_BLOCKED_KEY: ",".join(verdict.filters)})

    async def before_tool_callback(
        self, *, tool: BaseTool, tool_args: dict[str, Any], tool_context: ToolContext
    ) -> dict[str, Any] | None:
        """許したツールだけ、上限まで。番号の引数は学級にいる番号だけ。断るときはツールを走らせずに理由を返す"""
        if tool.name == STRUCTURED_OUTPUT_TOOL:
            return None
        state = tool_context.state
        attempts = int(state.get(TOOL_ATTEMPTS_KEY, 0))
        state[TOOL_ATTEMPTS_KEY] = attempts + 1
        with _tracer.start_as_current_span("phonelab.policy") as span:
            span.set_attribute("phonelab.check", "tool_call")
            span.set_attribute("phonelab.tool", tool.name)
            span.set_attribute("phonelab.tool_attempts", attempts)
            denied = self._deny_tool(tool.name, tool_args, state, attempts)
            span.set_attribute("phonelab.decision", "deny" if denied else "allow")
            if denied:
                span.set_attribute("phonelab.deny_reason", denied)
                state[TOOL_DENIED_KEY] = int(state.get(TOOL_DENIED_KEY, 0)) + 1
                return {"error": denied}
        state[TOOL_CALLS_KEY] = int(state.get(TOOL_CALLS_KEY, 0)) + 1
        if tool.name == "get_student_timeline":
            state[TIMELINE_CALLS_KEY] = int(state.get(TIMELINE_CALLS_KEY, 0)) + 1
        return None

    def _deny_tool(self, name: str, args: dict[str, Any], state, attempts: int) -> str | None:
        if name not in self._allowed_tools:
            return "このツールは使えません"
        if attempts >= self._tool_limit:
            return "ツールを呼べる回数の上限です。読んだ範囲で答えてください"
        if name == "get_student_timeline":
            if int(state.get(TIMELINE_CALLS_KEY, 0)) >= TIMELINE_LIMIT:
                return f"一人ずつの流れを読めるのは {TIMELINE_LIMIT} 人までです"
            if str(args.get("number", "")) not in (state.get(KNOWN_NUMBERS_KEY) or []):
                return "その番号は学級にいません"
        return None

    async def after_model_callback(
        self, *, callback_context: CallbackContext, llm_response: LlmResponse
    ) -> LlmResponse | None:
        state = callback_context.state
        if state.get(KNOWN_NUMBERS_KEY) is not None:
            return _check_insight(
                [str(n) for n in state.get(KNOWN_NUMBERS_KEY) or []], llm_response
            )
        candidates = [str(c) for c in (state.get(PLAN_CANDIDATES_KEY) or [])]
        if candidates:
            return _check_plan(candidates, llm_response)
        if state.get(NEXT_CANDIDATES_KEY) is not None:
            return _check_next([str(c) for c in state.get(NEXT_CANDIDATES_KEY) or []], llm_response)
        if state.get(REPLAN_CANDIDATES_KEY) is not None:
            return _check_replan(
                [str(c) for c in state.get(REPLAN_CANDIDATES_KEY) or []], llm_response
            )
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


def _check_replan(candidates: list[str], llm_response: LlmResponse) -> LlmResponse | None:
    """再計画の出力: 候補外への切り替えは測り直しに、助言に混じった結果の言葉は中立の文に"""
    plan = parse_replan(_response_text(llm_response))
    flags: dict[str, object] = {}
    with _tracer.start_as_current_span("phonelab.policy") as span:
        span.set_attribute("phonelab.check", "replan_output")
        if plan is None:
            span.set_attribute("phonelab.decision", "unreadable")
            return None
        if plan.action == "switch" and plan.experiment_id not in candidates:
            plan = plan.model_copy(update={"action": "retry", "experiment_id": None})
            flags[PLAN_OFF_CATALOG_KEY] = True
        if plan.action == "retry" and plan.experiment_id is not None:
            plan = plan.model_copy(update={"experiment_id": None})
        if RESULT_WORDS.search(plan.advice):
            plan = plan.model_copy(update={"advice": NEUTRAL_ADVICE})
            flags[PLAN_WHY_REPLACED_KEY] = True
        span.set_attribute("phonelab.decision", "fixed" if flags else "allow")
    if not flags:
        return None
    return _text_response(plan.model_dump_json(), flags)


def _check_next(candidates: list[str], llm_response: LlmResponse) -> LlmResponse | None:
    """次の一手: 候補外の id は候補の先頭に、問いかけ・理由に混じった結果の言葉は中立の文に"""
    plan = parse_next(_response_text(llm_response))
    flags: dict[str, object] = {}
    with _tracer.start_as_current_span("phonelab.policy") as span:
        span.set_attribute("phonelab.check", "next_output")
        if plan is None:
            span.set_attribute("phonelab.decision", "unreadable")
            return None
        if plan.action == "next" and plan.experiment_id not in candidates:
            if candidates:
                plan = plan.model_copy(update={"experiment_id": candidates[0]})
            else:
                plan = plan.model_copy(update={"action": "reflect", "experiment_id": None})
            flags[PLAN_OFF_CATALOG_KEY] = True
        if plan.action == "reflect" and plan.experiment_id is not None:
            plan = plan.model_copy(update={"experiment_id": None})
        if RESULT_WORDS.search(plan.question):
            plan = plan.model_copy(update={"question": NEUTRAL_QUESTION})
            flags[PLAN_WHY_REPLACED_KEY] = True
        if RESULT_WORDS.search(plan.why):
            plan = plan.model_copy(update={"why": NEUTRAL_WHY})
            flags[PLAN_WHY_REPLACED_KEY] = True
        span.set_attribute("phonelab.decision", "fixed" if flags else "allow")
    if not flags:
        return None
    return _text_response(plan.model_dump_json(), flags)


def sanitize_insight(out: InsightOutput, known: list[str]) -> tuple[InsightOutput, bool]:
    """学級の見立ての検査: 停止を勧める文を落とし、学級にいない番号を除き、長さと件数を切る"""
    lines = [line[:MAX_INSIGHT_CHARS] for line in out.lines if line and not HALT_WORDS.search(line)]
    visit = list(dict.fromkeys(n for n in out.visit_first if n in known))
    suggestion = "" if HALT_WORDS.search(out.suggestion) else out.suggestion[:MAX_INSIGHT_CHARS]
    fixed = InsightOutput(lines=lines[:3], visit_first=visit[:5], suggestion=suggestion)
    return fixed, fixed != out


def _check_insight(known: list[str], llm_response: LlmResponse) -> LlmResponse | None:
    text = _response_text(llm_response)
    if not text:
        return None  # ツールを呼ぶ途中の応答
    out = parse_insight(text)
    with _tracer.start_as_current_span("phonelab.policy") as span:
        span.set_attribute("phonelab.check", "insight_output")
        if out is None:
            span.set_attribute("phonelab.decision", "unreadable")
            return None
        fixed, changed = sanitize_insight(out, known)
        span.set_attribute("phonelab.decision", "fixed" if changed else "allow")
    if not changed:
        return None
    return _text_response(fixed.model_dump_json(), {INSIGHT_FIXED_KEY: True})


def _without(tools: list | None, names: tuple[str, ...]) -> list | None:
    """生成設定のツールから、名前が names のものを外す（構造化出力の内部ツールは残す）"""
    if not tools:
        return tools
    kept = []
    for tool in tools:
        decls = getattr(tool, "function_declarations", None)
        if not decls:
            kept.append(tool)
            continue
        rest = [d for d in decls if d.name not in names]
        if rest:
            kept.append(tool.model_copy(update={"function_declarations": rest}))
    return kept or None


def _is_tool_followup(llm_request: LlmRequest) -> bool:
    """直前の内容がツールの結果なら、同じ回答の続き（ツールを読んだあとの呼び出し）"""
    if not llm_request.contents:
        return False
    last = llm_request.contents[-1]
    return any(p.function_response for p in (last.parts or []))


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
