"""ラボ先生（チャット）の統制 — 答えの漏えいと会話の回数上限。docs/policy.md 3.5・3.6。"""

from __future__ import annotations

import asyncio

from server.agent.policy_plugin import LEAK_FALLBACK_TEXT
from server.agent.runner import CHAT_TURNS_PER_RECORD, build_tutor_runner, run_tutor

PROMPT = "【生徒の最新のメッセージ】どうして変わらなかったの？"


def test_replaces_a_reply_that_leaks_the_answer_while_the_explanation_is_locked(fake_llm):
    fake_llm.reply = "強くはじいても、音の高さは変わらないんだよ。"
    runner = build_tutor_runner(fake_llm)

    reply = asyncio.run(
        run_tutor(
            runner, prompt=PROMPT, turns_used=0, leak_phrases=["高さは変わらない"], locked=True
        )
    )

    assert reply.leaked is True
    assert reply.text == LEAK_FALLBACK_TEXT


def test_keeps_the_explanation_once_unlocked(fake_llm):
    fake_llm.reply = "強くはじいても、音の高さは変わらないんだよ。"
    runner = build_tutor_runner(fake_llm)

    reply = asyncio.run(
        run_tutor(
            runner, prompt=PROMPT, turns_used=0, leak_phrases=["高さは変わらない"], locked=False
        )
    )

    assert reply.leaked is False
    assert reply.text == fake_llm.reply


def test_skips_the_model_when_the_chat_turn_limit_is_reached(fake_llm):
    runner = build_tutor_runner(fake_llm)

    reply = asyncio.run(
        run_tutor(
            runner, prompt=PROMPT, turns_used=CHAT_TURNS_PER_RECORD, leak_phrases=[], locked=True
        )
    )

    assert fake_llm.requests == []
    assert reply.skipped is True
    assert reply.text
