"""StudentAgent（Planner）— docs/architecture.md 2.2。

スパイク B5 用の最小版。ADK が Cloud Run で動き、Trace にスパンが出ることを確かめる。
出力スキーマ PlanOutput と候補リストの差し込みは C3 で入れる。
"""

from __future__ import annotations

import os

from google.adk.agents import LlmAgent
from google.adk.models.base_llm import BaseLlm
from google.genai import types

MODEL_ENV = "PHONELAB_MODEL"
DEFAULT_MODEL = "gemini-3.8-flash"  # 9/15 に Vertex AI（global）で呼べた最新の Flash

PLANNER_INSTRUCTION = """\
あなたは中学・高校の理科の実験助手です。答えを知りません。
生徒の予想を読み、その予想を確かめられる実験の進め方を一つだけ、2 文以内で提案してください。
結論・数値・どちらになるかは書かないでください。
予想に理由が書かれていなければ、実験を提案せず「なぜそう思うか」を一つだけ問い返してください。
"""


def planner_model() -> str:
    return os.environ.get(MODEL_ENV, DEFAULT_MODEL)


def build_planner(
    model: str | BaseLlm,
    generate_content_config: types.GenerateContentConfig | None = None,
) -> LlmAgent:
    return LlmAgent(
        name="planner",
        model=model,
        instruction=PLANNER_INSTRUCTION,
        generate_content_config=generate_content_config,
    )
