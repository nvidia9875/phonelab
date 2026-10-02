"""Planner とラボ先生を 1 リクエスト = 1 セッションで回す — docs/architecture.md 2.1, 2.2。

永続状態（counters など）は Firestore に置く設計なので、セッションは使い捨てにして毎回消す。
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, replace

from google.adk.agents import BaseAgent
from google.adk.apps import App
from google.adk.models.base_llm import BaseLlm
from google.adk.plugins.base_plugin import BasePlugin
from google.adk.runners import Runner
from google.adk.sessions import BaseSessionService, InMemorySessionService
from google.genai import types
from opentelemetry import trace

from server.agent.class_agent import (
    INSIGHT_TOOLS,
    KNOWN_NUMBERS_KEY,
    SNAPSHOT_KEY,
    TIMELINES_KEY,
    InsightOutput,
    build_class_agent,
    parse_insight,
)
from server.agent.model_armor import ArmorClient
from server.agent.next_step import NEXT_CALLS_PER_RECORD, NextOutput, build_next_agent, parse_next
from server.agent.planner import (
    PLANNER_THINKING_LEVEL,
    PlanOutput,
    ReplanOutput,
    build_planner,
    build_replanner,
    parse_plan,
    parse_replan,
)
from server.agent.planner_tools import PLANNER_TOOL_LIMIT, PLANNER_TOOLS
from server.agent.policy_plugin import (
    ANSWER_LEAK_KEY,
    ANSWER_LOCKED_KEY,
    ARMOR_BLOCKED_KEY,
    ARMOR_TEXT_KEY,
    CLASS_HALTED_KEY,
    INSIGHT_FIXED_KEY,
    LEAK_PHRASES_KEY,
    NEXT_CALLS_KEY,
    NEXT_CANDIDATES_KEY,
    PLAN_CANDIDATES_KEY,
    PLAN_OFF_CATALOG_KEY,
    PLAN_WHY_REPLACED_KEY,
    PLANNER_CALLS_KEY,
    REPLAN_CALLS_KEY,
    REPLAN_CALLS_PER_RECORD,
    REPLAN_CANDIDATES_KEY,
    SKIP_REASON_KEY,
    STUDENT_TEXT_KEY,
    TOOL_CALLS_KEY,
    TOOL_DENIED_KEY,
    PolicyPlugin,
    sanitize_insight,
)
from server.agent.tutor import (
    TUTOR_MAX_OUTPUT_TOKENS,
    TUTOR_TEMPERATURE,
    TUTOR_THINKING_LEVEL,
    build_tutor,
)

APP_NAME = "phonelab"
SPIKE_USER_ID = "spike"
CHAT_USER_ID = "chat"
TEACHER_USER_ID = "teacher"
CHAT_TURNS_KEY = "chat_turns"
CHAT_TURNS_PER_RECORD = 10
CHAT_LIMIT_TEXT = (
    "この記録でラボ先生と話せる回数の上限に達しました。"
    "気になったことは、教室の先生に聞いてみてください。"
)

logger = logging.getLogger(__name__)
_tracer = trace.get_tracer("phonelab.agent")

# 検査（PolicyPlugin）に落ちた出力は、理由を添えて 1 回だけ作り直させる。それでも落ちたら Policy の差し替えで進む
SELF_CORRECT_ATTEMPTS = 1
FIX_UNREADABLE = "unreadable"
FIX_OFF_CATALOG = "off_catalog"
FIX_RESULT_WORDS = "result_words"
FEEDBACK: dict[str, str] = {
    FIX_UNREADABLE: "前回の出力は決められた JSON の形ではありませんでした。形を守って出し直してください。",
    FIX_OFF_CATALOG: "前回の experiment_id は【選べる実験】にありませんでした。必ずその中の id から選んでください。",
    FIX_RESULT_WORDS: "前回の文に結果の言葉（高くなる・変わらない・速くなる など）が入っていました。結果は書かず、なぜその実験で確かめられるか・何をすればよいかだけを書いてください。",
}


@dataclass(frozen=True)
class PlannerReply:
    text: str
    skipped: bool
    planner_calls: int
    # 構造化出力として読めたもの。上限で呼ばなかった／読めなかったときは None
    plan: PlanOutput | None = None
    off_catalog: bool = False
    why_replaced: bool = False
    # 先生の全端末停止で、Runner の入口で止まった
    halted: bool = False
    # Model Armor が検知した（モデルは呼んでいない）
    armor_blocked: bool = False
    # 1 回目が検査に落ちた理由（FIX_*）と、作り直しが検査を通ったか
    fix_reasons: tuple[str, ...] = ()
    # 作り直しを実際に走らせたか（上限・停止で走らなかったら False）
    retried: bool = False
    self_corrected: bool = False


@dataclass(frozen=True)
class ReplanReply:
    text: str
    skipped: bool
    plan: ReplanOutput | None
    off_catalog: bool
    advice_replaced: bool
    # モデルを呼んだ回数（作り直しを含む）
    calls_used: int = 0
    fix_reasons: tuple[str, ...] = ()
    # 作り直しを実際に走らせたか（上限・停止で走らなかったら False）
    retried: bool = False
    self_corrected: bool = False


@dataclass(frozen=True)
class NextReply:
    text: str
    skipped: bool
    plan: NextOutput | None
    off_catalog: bool
    words_replaced: bool
    calls_used: int = 0
    fix_reasons: tuple[str, ...] = ()
    # 作り直しを実際に走らせたか（上限・停止で走らなかったら False）
    retried: bool = False
    self_corrected: bool = False


@dataclass(frozen=True)
class TutorReply:
    text: str
    skipped: bool
    leaked: bool
    halted: bool = False
    armor_blocked: bool = False


@dataclass(frozen=True)
class _RunOutcome:
    text: str
    flags: frozenset[str]
    state: dict[str, object]


def _runner(agent: BaseAgent, plugins: list[BasePlugin]) -> Runner:
    """統制層（PolicyPlugin）は App に登録する（ADK 2.8 で Runner の plugins 引数は非推奨）"""
    return Runner(
        app=App(name=APP_NAME, root_agent=agent, plugins=plugins),
        session_service=InMemorySessionService(),
    )


def build_runner(
    model: str | BaseLlm,
    generate_content_config: types.GenerateContentConfig | None = None,
    with_tools: bool = False,
    armor: ArmorClient | None = None,
) -> Runner:
    return _runner(
        build_planner(model, generate_content_config, with_tools=with_tools),
        [
            PolicyPlugin(
                thinking_level=PLANNER_THINKING_LEVEL,
                allowed_tools=PLANNER_TOOLS if with_tools else (),
                tool_limit=PLANNER_TOOL_LIMIT if with_tools else 0,
                count_tool_followups=False,
                armor=armor,
            )
        ],
    )


def build_replan_runner(model: str | BaseLlm) -> Runner:
    return _runner(
        build_replanner(model),
        [
            PolicyPlugin(
                calls_key=REPLAN_CALLS_KEY,
                call_limit=REPLAN_CALLS_PER_RECORD,
                limit_text="この記録で提案できる回数の上限です。定型の提案で進めます。",
                thinking_level=PLANNER_THINKING_LEVEL,
            )
        ],
    )


async def run_replan(
    runner: Runner,
    *,
    prompt: str,
    replan_calls: int,
    candidates: list[str],
    class_halted: bool = False,
) -> ReplanReply:

    async def attempt(text: str, calls: int) -> ReplanReply:
        state: dict[str, object] = {
            REPLAN_CALLS_KEY: calls,
            REPLAN_CANDIDATES_KEY: list(candidates),
            CLASS_HALTED_KEY: class_halted,
        }
        outcome = await _run_once(runner, SPIKE_USER_ID, text, state)
        skipped = SKIP_REASON_KEY in outcome.flags or class_halted
        return ReplanReply(
            text=outcome.text,
            skipped=skipped,
            plan=None if skipped else parse_replan(outcome.text),
            off_catalog=PLAN_OFF_CATALOG_KEY in outcome.flags,
            advice_replaced=PLAN_WHY_REPLACED_KEY in outcome.flags,
            calls_used=0 if skipped else 1,
        )

    first = await attempt(prompt, replan_calls)
    reasons = _fix_reasons(
        first.skipped, first.plan is None, first.off_catalog, first.advice_replaced
    )
    if not reasons:
        return first
    second = await _self_correct(
        "replan", reasons, lambda fb: attempt(f"{prompt}\n{fb}", replan_calls + 1)
    )
    if second is None or second.skipped:
        return replace(first, fix_reasons=reasons)
    passed = not _fix_reasons(
        False, second.plan is None, second.off_catalog, second.advice_replaced
    )
    chosen = second if second.plan is not None else first
    return replace(
        chosen,
        calls_used=first.calls_used + second.calls_used,
        fix_reasons=reasons,
        retried=True,
        self_corrected=passed,
    )


def build_next_runner(model: str | BaseLlm) -> Runner:
    return _runner(
        build_next_agent(model),
        [
            PolicyPlugin(
                calls_key=NEXT_CALLS_KEY,
                call_limit=NEXT_CALLS_PER_RECORD,
                limit_text="この記録で次の一手を聞ける回数の上限です。カタログの順で進めます。",
                thinking_level=PLANNER_THINKING_LEVEL,
            )
        ],
    )


async def run_next(
    runner: Runner,
    *,
    prompt: str,
    next_calls: int,
    candidates: list[str],
    class_halted: bool = False,
) -> NextReply:
    """結果のあとの次の一手。検査に落ちたら 1 回だけ作り直させる"""

    async def attempt(text: str, calls: int) -> NextReply:
        state: dict[str, object] = {
            NEXT_CALLS_KEY: calls,
            NEXT_CANDIDATES_KEY: list(candidates),
            CLASS_HALTED_KEY: class_halted,
        }
        outcome = await _run_once(runner, SPIKE_USER_ID, text, state)
        skipped = SKIP_REASON_KEY in outcome.flags or class_halted
        return NextReply(
            text=outcome.text,
            skipped=skipped,
            plan=None if skipped else parse_next(outcome.text),
            off_catalog=PLAN_OFF_CATALOG_KEY in outcome.flags,
            words_replaced=PLAN_WHY_REPLACED_KEY in outcome.flags,
            calls_used=0 if skipped else 1,
        )

    first = await attempt(prompt, next_calls)
    reasons = _fix_reasons(
        first.skipped, first.plan is None, first.off_catalog, first.words_replaced
    )
    if not reasons:
        return first
    second = await _self_correct(
        "next", reasons, lambda fb: attempt(f"{prompt}\n{fb}", next_calls + 1)
    )
    if second is None or second.skipped:
        return replace(first, fix_reasons=reasons)
    passed = not _fix_reasons(False, second.plan is None, second.off_catalog, second.words_replaced)
    chosen = second if second.plan is not None else first
    return replace(
        chosen,
        calls_used=first.calls_used + second.calls_used,
        fix_reasons=reasons,
        retried=True,
        self_corrected=passed,
    )


INSIGHT_CALLS_KEY = "insight_model_calls"
# ツールを読むたびにモデルを呼ぶので、1 回の見立てで 6 回まで（全体 1 回 + 一人ずつ 3 人 + 答え + 余裕）
INSIGHT_MODEL_CALLS = 6
INSIGHT_TOOL_LIMIT = 4
INSIGHT_LIMIT_TEXT = "見立ての途中で上限に達しました。いまの一覧から見てください。"


@dataclass(frozen=True)
class InsightReply:
    skipped: bool
    plan: InsightOutput | None
    fixed: bool
    model_calls: int
    tool_calls: int
    tools_denied: int


def build_insight_runner(model: str | BaseLlm) -> Runner:
    return _runner(
        build_class_agent(model),
        [
            PolicyPlugin(
                calls_key=INSIGHT_CALLS_KEY,
                call_limit=INSIGHT_MODEL_CALLS,
                limit_text=INSIGHT_LIMIT_TEXT,
                thinking_level=PLANNER_THINKING_LEVEL,
                allowed_tools=INSIGHT_TOOLS,
                tool_limit=INSIGHT_TOOL_LIMIT,
            )
        ],
    )


async def run_insight(
    runner: Runner,
    *,
    snapshot: dict[str, object],
    timelines: dict[str, object],
    known_numbers: list[str],
    class_halted: bool = False,
) -> InsightReply:
    """学級の見立て。データは state に置き、ツールはそこから読むだけ（Firestore には触らない）"""
    state: dict[str, object] = {
        INSIGHT_CALLS_KEY: 0,
        SNAPSHOT_KEY: snapshot,
        TIMELINES_KEY: timelines,
        KNOWN_NUMBERS_KEY: list(known_numbers),
        # 見立ては停止中でも読める（停止中こそ様子を見たい）。止めるのは先生の操作だけ
        CLASS_HALTED_KEY: False,
    }
    outcome = await _run_once(
        runner, TEACHER_USER_ID, "いまの学級の様子を見立ててください。", state
    )
    skipped = SKIP_REASON_KEY in outcome.flags
    plan = None if skipped else parse_insight(outcome.text)
    fixed = INSIGHT_FIXED_KEY in outcome.flags
    if plan is not None:
        # 構造化出力をツール経由で返すモデルでは after_model を通らないので、ここでも同じ検査をかける
        plan, changed = sanitize_insight(plan, list(known_numbers))
        fixed = fixed or changed
    return InsightReply(
        skipped=skipped,
        plan=plan,
        fixed=fixed,
        model_calls=int(outcome.state.get(INSIGHT_CALLS_KEY, 0)),
        tool_calls=int(outcome.state.get(TOOL_CALLS_KEY, 0)),
        tools_denied=int(outcome.state.get(TOOL_DENIED_KEY, 0)),
    )


def build_tutor_runner(model: str | BaseLlm, armor: ArmorClient | None = None) -> Runner:
    return _runner(
        build_tutor(model),
        [
            PolicyPlugin(
                calls_key=CHAT_TURNS_KEY,
                call_limit=CHAT_TURNS_PER_RECORD,
                limit_text=CHAT_LIMIT_TEXT,
                temperature=TUTOR_TEMPERATURE,
                max_output_tokens=TUTOR_MAX_OUTPUT_TOKENS,
                thinking_level=TUTOR_THINKING_LEVEL,
                armor=armor,
            )
        ],
    )


async def run_planner(
    runner: Runner,
    *,
    text: str,
    planner_calls: int,
    candidates: tuple[str, ...] | list[str] = (),
    class_halted: bool = False,
    tool_state: dict[str, object] | None = None,
    armor_text: str | None = None,
    student_text: str | None = None,
) -> PlannerReply:
    """candidates を渡すと、PolicyPlugin が出力を候補と突き合わせる（スパイクは渡さない）。
    突き合わせで直されたら、理由を添えて 1 回だけ作り直させる（自己修正）"""

    async def attempt(prompt: str, calls: int) -> PlannerReply:
        state: dict[str, object] = {
            **(tool_state or {}),
            PLANNER_CALLS_KEY: calls,
            CLASS_HALTED_KEY: class_halted,
        }
        if armor_text and prompt == text:  # 作り直しでは同じ文をもう一度検査しない
            state[ARMOR_TEXT_KEY] = armor_text
        if student_text:
            state[STUDENT_TEXT_KEY] = student_text
        if candidates:
            state[PLAN_CANDIDATES_KEY] = list(candidates)
        outcome = await _run_once(runner, SPIKE_USER_ID, prompt, state)
        armored = ARMOR_BLOCKED_KEY in outcome.flags
        skipped = SKIP_REASON_KEY in outcome.flags or class_halted or armored
        return PlannerReply(
            text=outcome.text,
            skipped=skipped,
            armor_blocked=armored,
            planner_calls=int(outcome.state.get(PLANNER_CALLS_KEY, calls)),
            plan=None if skipped or not candidates else parse_plan(outcome.text),
            off_catalog=PLAN_OFF_CATALOG_KEY in outcome.flags,
            why_replaced=PLAN_WHY_REPLACED_KEY in outcome.flags,
            halted=class_halted,
        )

    first = await attempt(text, planner_calls)
    if not candidates:
        return first
    reasons = _fix_reasons(first.skipped, first.plan is None, first.off_catalog, first.why_replaced)
    if not reasons:
        return first
    second = await _self_correct(
        "plan", reasons, lambda fb: attempt(f"{text}\n{fb}", first.planner_calls)
    )
    if second is None or second.skipped:
        return replace(first, fix_reasons=reasons)
    passed = not _fix_reasons(False, second.plan is None, second.off_catalog, second.why_replaced)
    chosen = second if second.plan is not None else first
    return replace(
        chosen,
        planner_calls=second.planner_calls,
        fix_reasons=reasons,
        retried=True,
        self_corrected=passed,
    )


def _fix_reasons(
    skipped: bool, unreadable: bool, off_catalog: bool, result_words: bool
) -> tuple[str, ...]:
    """検査に落ちたところ。上限・停止でモデルを呼ばなかったときは直しようがないので空"""
    if skipped:
        return ()
    if unreadable:
        return (FIX_UNREADABLE,)
    return tuple(
        r for r, hit in ((FIX_OFF_CATALOG, off_catalog), (FIX_RESULT_WORDS, result_words)) if hit
    )


async def _self_correct(kind: str, reasons: tuple[str, ...], redo):
    """落ちた理由をモデルに返して作り直させる。Trace に phonelab.self_correct のスパンが出る"""
    if SELF_CORRECT_ATTEMPTS < 1:
        return None
    feedback = "【前回の出力の直すところ】" + " ".join(FEEDBACK[r] for r in reasons)
    with _tracer.start_as_current_span("phonelab.self_correct") as span:
        span.set_attribute("phonelab.agent", kind)
        span.set_attribute("phonelab.fix_reasons", ",".join(reasons))
        result = await redo(feedback)
        span.set_attribute("phonelab.skipped", bool(result.skipped))
        return result


async def run_tutor(
    runner: Runner,
    *,
    prompt: str,
    turns_used: int,
    leak_phrases: tuple[str, ...] | list[str],
    locked: bool,
    class_halted: bool = False,
    armor_text: str | None = None,
) -> TutorReply:
    state = {
        ARMOR_TEXT_KEY: armor_text,
        CHAT_TURNS_KEY: turns_used,
        ANSWER_LOCKED_KEY: locked,
        LEAK_PHRASES_KEY: list(leak_phrases),
        CLASS_HALTED_KEY: class_halted,
    }
    outcome = await _run_once(runner, CHAT_USER_ID, prompt, state)
    armored = ARMOR_BLOCKED_KEY in outcome.flags
    return TutorReply(
        text=outcome.text,
        skipped=SKIP_REASON_KEY in outcome.flags or class_halted or armored,
        leaked=ANSWER_LEAK_KEY in outcome.flags,
        halted=class_halted,
        armor_blocked=armored,
    )


async def _run_once(
    runner: Runner, user_id: str, text: str, state: dict[str, object]
) -> _RunOutcome:
    sessions = runner.session_service
    session = await sessions.create_session(
        app_name=APP_NAME, user_id=user_id, state=state, session_id=uuid.uuid4().hex
    )
    try:
        texts, flags = await _collect(runner, user_id, session.id, text)
        final = await sessions.get_session(
            app_name=APP_NAME, user_id=user_id, session_id=session.id
        )
    finally:
        await _discard_session(sessions, user_id, session.id)
    return _RunOutcome(
        text="".join(texts).strip(),
        flags=frozenset(flags),
        state=dict(final.state) if final else {},
    )


async def _discard_session(sessions: BaseSessionService, user_id: str, session_id: str) -> None:
    """後始末の失敗が、呼び出し側に届くべき本当のエラー（モデル呼び出しの失敗など）を上書きしないようにする。"""
    try:
        await sessions.delete_session(app_name=APP_NAME, user_id=user_id, session_id=session_id)
    except Exception:
        logger.exception("セッションの削除に失敗 (session_id=%s)", session_id)


async def _collect(
    runner: Runner, user_id: str, session_id: str, text: str
) -> tuple[list[str], set[str]]:
    message = types.Content(role="user", parts=[types.Part(text=text)])
    texts: list[str] = []
    flags: set[str] = set()
    async for event in runner.run_async(
        user_id=user_id, session_id=session_id, new_message=message
    ):
        if event.custom_metadata:
            flags.update(event.custom_metadata.keys())
        if event.is_final_response() and event.content and event.content.parts:
            texts.extend(p.text for p in event.content.parts if p.text and not p.thought)
    return texts, flags
