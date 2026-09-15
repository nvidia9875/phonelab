"""Planner を 1 リクエスト = 1 セッションで回す — docs/architecture.md 2.1, 2.2。

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
from server.agent.policy_plugin import PLANNER_CALLS_KEY, SKIP_REASON_KEY, PolicyPlugin

APP_NAME = "phonelab"
SPIKE_USER_ID = "spike"

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PlannerReply:
    text: str
    skipped: bool
    planner_calls: int


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


async def run_planner(runner: Runner, *, text: str, planner_calls: int) -> PlannerReply:
    sessions = runner.session_service
    session = await sessions.create_session(
        app_name=APP_NAME,
        user_id=SPIKE_USER_ID,
        state={PLANNER_CALLS_KEY: planner_calls},
        session_id=uuid.uuid4().hex,
    )
    try:
        texts, skipped = await _collect_final_text(runner, session.id, text)
        final = await sessions.get_session(
            app_name=APP_NAME, user_id=SPIKE_USER_ID, session_id=session.id
        )
    finally:
        await _discard_session(sessions, session.id)

    return PlannerReply(
        text="".join(texts).strip(),
        skipped=skipped,
        planner_calls=int(final.state.get(PLANNER_CALLS_KEY, planner_calls)),
    )


async def _discard_session(sessions: BaseSessionService, session_id: str) -> None:
    """後始末の失敗が、呼び出し側に届くべき本当のエラー（モデル呼び出しの失敗など）を上書きしないようにする。"""
    try:
        await sessions.delete_session(
            app_name=APP_NAME, user_id=SPIKE_USER_ID, session_id=session_id
        )
    except Exception:
        logger.exception("セッションの削除に失敗 (session_id=%s)", session_id)


async def _collect_final_text(runner: Runner, session_id: str, text: str) -> tuple[list[str], bool]:
    message = types.Content(role="user", parts=[types.Part(text=text)])
    texts: list[str] = []
    skipped = False
    async for event in runner.run_async(
        user_id=SPIKE_USER_ID, session_id=session_id, new_message=message
    ):
        if event.custom_metadata and SKIP_REASON_KEY in event.custom_metadata:
            skipped = True
        if event.is_final_response() and event.content and event.content.parts:
            texts.extend(p.text for p in event.content.parts if p.text and not p.thought)
    return texts, skipped
