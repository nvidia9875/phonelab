"""Gemini の呼び出し口。混み合い（429）と一時的な失敗（500・503）は、短く待って 2 回までやり直す。

10/2: 評価と本番の学級の見立てで Vertex AI の 429 が出て、計画が端末の縮退・見立てが決まりごとに落ちた。
待ち時間は短く（最大 3 秒）。各ルートのタイムアウト（12〜20 秒）の中に収める。
"""

from __future__ import annotations

from google.adk.models.google_llm import Gemini
from google.genai import types

RETRY = types.HttpRetryOptions(
    attempts=3, initial_delay=0.5, max_delay=3, http_status_codes=[429, 500, 503]
)


def gemini(name: str) -> Gemini:
    return Gemini(model=name, retry_options=RETRY)
