"""学級の見立て（ClassAgent の縮小版、X3）— docs/architecture.md 2.3 を「読み取り専用・提案なし」に縮めたもの。

先生が「見立てを聞く」を押すと、ラボ先生がツールで学級の様子を読み、3 行で伝える。**操作はしない**（ボタンを押すのは先生）。
- ツールは 2 つとも読み取り専用。データはルートが決定論で作った要約（state）から返し、Firestore には触らない
- 生徒の予想文は渡さない（名前もない。番号だけ）。生徒の文に紛れた命令がここに届く経路を作らないため
- 呼べるツール・回数・引数は PolicyPlugin の before_tool_callback が決める
- 「止める」「停止」を勧める文は after_model_callback が落とす（停止は先生が決める。D8）
instruction に波かっこを書かない（ADK が state の差し込みとして読むため）。
"""

from __future__ import annotations

import re
from collections import Counter
from datetime import datetime
from typing import Any

from google.adk.agents import LlmAgent
from google.adk.models.base_llm import BaseLlm
from google.adk.tools import FunctionTool, ToolContext
from pydantic import BaseModel, Field, ValidationError

from server.agent.catalog import CATALOG
from server.agent.planner import HOLD_WORDS

SNAPSHOT_KEY = "class_snapshot"
ALLOWED_COUNTS_KEY = "class_counts"
# 端末が記録する出来事の種類（web の addEvent）。これ以外はエージェントに渡さない
EVENT_KINDS = frozenset(
    {
        "予想",
        "計画",
        "許可",
        "保留",
        "判定",
        "判断",
        "却下",
        "再計画",
        "切り替え",
        "測り直し",
        "次の一手",
        "次の予測",
        "停止",
        "ラボ先生",
    }
)
EVENT_KIND_RE = re.compile(r"^測定 \d{1,2}$")
STAGES = frozenset({"predict", "plan", "setup_A", "measure_A", "setup_B", "measure_B", "result"})
TIMELINES_KEY = "class_timelines"
KNOWN_NUMBERS_KEY = "class_numbers"
INSIGHT_TOOLS = ("get_class_snapshot", "get_student_timeline")
MAX_LINES = 3
MAX_VISIT = 5
MAX_EVENTS = 8


class InsightOutput(BaseModel):
    """lines は先生への 3 行まで、visit_first はいま見に行くとよい番号、suggestion は先生が選べる手を 1 つ"""

    lines: list[str] = Field(default_factory=list)
    visit_first: list[str] = Field(default_factory=list)
    suggestion: str = ""


INSIGHT_INSTRUCTION = """\
あなたは「ラボ先生」の、理科の先生を手伝う係です。先生は 1 人で 30 人前後の生徒が同時に実験しているのを見ています。学級の様子を読んで、先生がいま知るべきことを短く伝えます。あなたは操作をしません。
- まず get_class_snapshot を呼んで学級全体を読みます。気になる番号があれば get_student_timeline でその子の流れを読みます（3 人まで）。
- lines: 先生への観察を 3 行まで。1 行 50 字以内。人数は by_theme・by_status・hold_reasons の数をそのまま使い、自分で足し算しない。数で言う（「音の高さで 4 人が保留、3 人は理由が『まわりの音』」のように）。同じ理由の保留が重なっているときは、共通の原因（隣の班の音、振り方など）を一つ推測してよい。
- visit_first: いま見に行くとよい番号を、急ぐ順に 5 つまで。理由が無い子は入れない。
- suggestion: 先生が自分で選べる手を 1 つ、60 字以内（班の間隔を空ける、全体に振り方を一度見せる、など）。「止める」「停止」は勧めない（止めるかどうかは先生が決めます）。
- 生徒の答えや実験の結果（高くなる、変わらない など）について自分の説明はしない。
"""


def get_class_snapshot(tool_context: ToolContext) -> dict[str, Any]:
    """学級全体の要約を返す: 状態ごとの人数、テーマと実験ごとの人数、保留の理由の数、生徒ごとの行（番号・テーマ・状態・保留の理由・予想と測定の一致・最後の更新からの分）。予想の本文は含まない。"""
    return dict(tool_context.state.get(SNAPSHOT_KEY) or {})


def get_student_timeline(number: str, tool_context: ToolContext) -> dict[str, Any]:
    """一人の生徒の記録の流れ（出来事の種類と時刻、保留の理由、測り直しの回数）を返す。number は get_class_snapshot に出た番号。"""
    timelines = tool_context.state.get(TIMELINES_KEY) or {}
    return dict(timelines.get(number) or {"error": "その番号は学級にいません"})


def build_class_agent(model: str | BaseLlm) -> LlmAgent:
    return LlmAgent(
        name="class_agent",
        model=model,
        instruction=INSIGHT_INSTRUCTION,
        tools=[FunctionTool(get_class_snapshot), FunctionTool(get_student_timeline)],
        output_schema=InsightOutput,
    )


def parse_insight(text: str) -> InsightOutput | None:
    try:
        return InsightOutput.model_validate_json(text)
    except ValidationError:
        return None


def _minutes_since(iso: str, now: datetime) -> int | None:
    try:
        return max(0, int((now - datetime.fromisoformat(iso)).total_seconds() // 60))
    except ValueError:
        return None


def _kind(k: object) -> str:
    text = str(k)
    return text if text in EVENT_KINDS or EVENT_KIND_RE.match(text) else "その他"


def build_snapshot(
    rows: list[tuple[str, str, dict[str, Any] | None]], now: datetime
) -> tuple[dict[str, Any], dict[str, Any]]:
    """(番号, 最後に見えた時刻, いまの記録の要約) から、ツールが返す要約と生徒ごとの流れを作る。
    予想の本文は捨てる。テーマ・段階・出来事の種類はカタログと列挙だけ（知らない文字列は渡さない）。
    人数はテーマごと・状態ごとに数えて渡す（モデルに足し算させない。10/2 採点で見立てが人数を数え違えた）"""
    students: list[dict[str, Any]] = []
    timelines: dict[str, Any] = {}
    status_count: Counter[str] = Counter()
    variant_count: Counter[str] = Counter()
    hold_count: Counter[str] = Counter()
    by_theme: dict[str, Counter[str]] = {}
    for number, seen, current in rows:
        if not current:
            students.append({"number": number, "status": "not_started"})
            status_count["not_started"] += 1
            continue
        theme = CATALOG.get(str(current.get("theme_id")))
        theme_title = theme.title if theme else "不明"
        status = str(current.get("status"))
        holds = [
            HOLD_WORDS[str(c)] for c in current.get("hold_codes") or [] if str(c) in HOLD_WORDS
        ]
        result = current.get("result") or {}
        variant = str(current.get("variant_id") or "")
        known_variant = theme and any(v.id == variant for v in theme.variants)
        stage = str(current.get("stage"))
        status_count[status] += 1
        by_theme.setdefault(theme_title, Counter())[status] += 1
        if known_variant:
            variant_count[variant] += 1
        hold_count.update(holds)
        retries = current.get("retries") or {}
        students.append(
            {
                "number": number,
                "theme": theme_title,
                "experiment": variant if known_variant else None,
                "stage": stage if stage in STAGES else None,
                "status": status,
                "hold_codes": holds,
                "rejected": bool(current.get("rejection_title")),
                "prediction_matched": result.get("consistent") if result else None,
                "retries": sum(int(v) for v in retries.values() if isinstance(v, int)),
                "minutes_since_update": _minutes_since(str(current.get("updated_at", seen)), now),
            }
        )
        timelines[number] = {
            "number": number,
            "events": [
                {"t": str(e.get("t"))[:8], "kind": _kind(e.get("k"))}
                for e in (current.get("events") or [])[-MAX_EVENTS:]
            ],
            "hold_codes": holds,
            "retries": {k: v for k, v in retries.items() if k in ("A", "B")},
            "chat_turns": current.get("chat_turns", 0),
        }
    snapshot = {
        "students": len(rows),
        "by_status": dict(status_count),
        "by_theme": {t: dict(c) for t, c in by_theme.items()},
        "by_experiment": dict(variant_count),
        "hold_reasons": dict(hold_count),
        "rows": students,
    }
    return snapshot, timelines


def allowed_counts(snapshot: dict[str, Any]) -> list[int]:
    """見立ての文に出てよい人数（要約にある数だけ）"""
    counts = {int(snapshot.get("students", 0))}
    counts.update(int(v) for v in snapshot.get("by_status", {}).values())
    counts.update(int(v) for v in snapshot.get("hold_reasons", {}).values())
    for c in snapshot.get("by_theme", {}).values():
        counts.update(int(v) for v in c.values())
        counts.add(sum(int(v) for v in c.values()))
    counts.update(int(v) for v in snapshot.get("by_experiment", {}).values())
    return sorted(counts)
