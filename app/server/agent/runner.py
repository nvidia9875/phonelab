"""Planner とラボ先生を 1 リクエスト = 1 セッションで回す — docs/architecture.md 2.1, 2.2。

永続状態（counters など）は Firestore に置く設計なので、セッションは使い捨てにして毎回消す。
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass

from google.adk.models.base_llm import BaseLlm
from google.adk.runners import Runner
from google.adk.sessions import BaseSessionService, InMemorySessionService
from google.genai import types

from server.agent.planner import build_planner
from server.agent.policy_plugin import (
    ANSWER_LEAK_KEY,
    ANSWER_LOCKED_KEY,
    LEAK_PHRASES_KEY,
    PLANNER_CALLS_KEY,
    SKIP_REASON_KEY,
    PolicyPlugin,
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
CHAT_TURNS_KEY = "chat_turns"
CHAT_TURNS_PER_RECORD = 10
CHAT_LIMIT_TEXT = (
    "この記録でラボ先生と話せる回数の上限に達しました。"
    "気になったことは、教室の先生に聞いてみてください。"
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PlannerReply:
    text: str
    skipped: bool
    planner_calls: int


@dataclass(frozen=True)
class TutorReply:
    text: str
    skipped: bool
    leaked: bool


@dataclass(frozen=True)
class _RunOutcome:
    text: str
    flags: frozenset[str]
    state: dict[str, object]


def build_runner(
    model: str | BaseLlm,
    generate_content_config: types.GenerateContentConfig | None = None,
) -> Runner:
    return Runner(
        app_name=APP_NAME,
        agent=build_planner(model, generate_content_config),
        session_service=InMemorySessionService(),
        plugins=[PolicyPlugin()],
    )


def build_tutor_runner(model: str | BaseLlm) -> Runner:
    return Runner(
        app_name=APP_NAME,
        agent=build_tutor(model),
        session_service=InMemorySessionService(),
        plugins=[
            PolicyPlugin(
                calls_key=CHAT_TURNS_KEY,
                call_limit=CHAT_TURNS_PER_RECORD,
                limit_text=CHAT_LIMIT_TEXT,
                temperature=TUTOR_TEMPERATURE,
                max_output_tokens=TUTOR_MAX_OUTPUT_TOKENS,
                thinking_level=TUTOR_THINKING_LEVEL,
            )
        ],
    )


async def run_planner(runner: Runner, *, text: str, planner_calls: int) -> PlannerReply:
    outcome = await _run_once(runner, SPIKE_USER_ID, text, {PLANNER_CALLS_KEY: planner_calls})
    return PlannerReply(
        text=outcome.text,
        skipped=SKIP_REASON_KEY in outcome.flags,
        planner_calls=int(outcome.state.get(PLANNER_CALLS_KEY, planner_calls)),
    )


async def run_tutor(
    runner: Runner,
    *,
    prompt: str,
    turns_used: int,
    leak_phrases: tuple[str, ...] | list[str],
    locked: bool,
) -> TutorReply:
    state = {
        CHAT_TURNS_KEY: turns_used,
        ANSWER_LOCKED_KEY: locked,
        LEAK_PHRASES_KEY: list(leak_phrases),
    }
    outcome = await _run_once(runner, CHAT_USER_ID, prompt, state)
    return TutorReply(
        text=outcome.text,
        skipped=SKIP_REASON_KEY in outcome.flags,
        leaked=ANSWER_LEAK_KEY in outcome.flags,
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
