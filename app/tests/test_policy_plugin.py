"""PolicyPlugin.before_model_callback — docs/architecture.md 2.1、docs/policy.md の上限表。"""

from __future__ import annotations

import asyncio

from google.genai import types

from server.agent.policy_plugin import (
    PLANNER_CALLS_PER_EXPERIMENT,
    PLANNER_MAX_OUTPUT_TOKENS,
    PLANNER_TEMPERATURE,
)
from server.agent.runner import build_runner, run_planner


def test_skips_model_when_planner_call_limit_reached(fake_llm):
    runner = build_runner(fake_llm)

    reply = asyncio.run(
        run_planner(runner, text="重いほど速く揺れる", planner_calls=PLANNER_CALLS_PER_EXPERIMENT)
    )

    assert fake_llm.requests == []
    assert reply.skipped is True
    assert reply.planner_calls == PLANNER_CALLS_PER_EXPERIMENT
    assert reply.text


def test_calls_model_and_counts_when_under_limit(fake_llm):
    runner = build_runner(fake_llm)

    reply = asyncio.run(run_planner(runner, text="重いほど速く揺れる", planner_calls=0))

    assert len(fake_llm.requests) == 1
    assert reply.skipped is False
    assert reply.planner_calls == 1
    assert reply.text == fake_llm.reply


def test_forces_generation_config_even_if_agent_sets_its_own(fake_llm):
    runner = build_runner(
        fake_llm,
        generate_content_config=types.GenerateContentConfig(
            temperature=1.5, max_output_tokens=8192
        ),
    )

    asyncio.run(run_planner(runner, text="長いほどゆっくり揺れる", planner_calls=0))

    config = fake_llm.requests[0].config
    assert config.temperature == PLANNER_TEMPERATURE
    assert config.max_output_tokens == PLANNER_MAX_OUTPUT_TOKENS
