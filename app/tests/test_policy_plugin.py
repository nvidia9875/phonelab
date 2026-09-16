"""PolicyPlugin.before_model_callback — docs/architecture.md 2.1、docs/policy.md の上限表。"""

from __future__ import annotations

import asyncio
import json

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


def test_planner_output_is_parsed_and_off_catalog_picks_are_replaced(fake_llm):
    """after_model: Planner の構造化出力がカタログ外なら、候補の先頭に差し替えて印を付ける"""
    fake_llm.reply = json.dumps(
        {
            "claim_variable": "strength",
            "claim_direction": "faster",
            "experiment_id": "drop_phone",
            "why_this": "はじく強さだけを変えて確かめます",
            "question_back": None,
        },
        ensure_ascii=False,
    )
    runner = build_runner(fake_llm)

    reply = asyncio.run(
        run_planner(
            runner,
            text="強くはじくと高くなる",
            planner_calls=0,
            candidates=("sound_pluck_strength", "sound_string_length"),
        )
    )

    assert reply.plan is not None
    assert reply.plan.experiment_id == "sound_pluck_strength"
    assert reply.off_catalog is True


def test_planner_reason_with_a_result_in_it_is_neutralised(fake_llm):
    fake_llm.reply = json.dumps(
        {
            "claim_variable": "strength",
            "claim_direction": "faster",
            "experiment_id": "sound_pluck_strength",
            "why_this": "強くはじいても音は高くならないことを確かめます",
            "question_back": None,
        },
        ensure_ascii=False,
    )
    runner = build_runner(fake_llm)

    reply = asyncio.run(
        run_planner(
            runner,
            text="強くはじくと高くなる",
            planner_calls=0,
            candidates=("sound_pluck_strength",),
        )
    )

    assert reply.plan is not None
    assert "高くならない" not in reply.plan.why_this
    assert reply.why_replaced is True
