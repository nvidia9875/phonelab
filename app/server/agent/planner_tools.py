"""Planner のツール（X6）— 候補の実験と学級の決まりを、Planner が自分で読みに行く。

データはルートが決定論で絞った結果（やり終えた実験・学級の許可を除いた候補）を state に置いたもの。
ツールはそれを返すだけで、カタログの外や答え（現実）には届かない。呼べる回数は PolicyPlugin が決める。
PHONELAB_PLANNER_TOOLS=1 のときだけ使う（プロンプトに候補を並べる方式より 1 往復多い。docs/eval.md で比べる）。
"""

from __future__ import annotations

import os
from typing import Any

from google.adk.tools import FunctionTool, ToolContext

from server.agent.catalog import CatalogTheme, CatalogVariant

PLANNER_TOOLS_ENV = "PHONELAB_PLANNER_TOOLS"
PLAN_CATALOG_KEY = "plan_catalog"
CLASS_RULES_KEY = "class_rules"
PLANNER_TOOLS = ("list_experiments", "get_class_rules")
PLANNER_TOOL_LIMIT = 3

TOOLS_NOTE = """\
- 【選べる実験】はこの文には書いていません。まず list_experiments を呼んで候補を読みます。experiment_id は必ずその中から選びます。
- 学級で使えるセンサーや、家でやる実験の有効化が気になるときは get_class_rules を呼びます。
"""


def planner_tools_enabled() -> bool:
    return os.environ.get(PLANNER_TOOLS_ENV) == "1"


def list_experiments(tool_context: ToolContext) -> dict[str, Any]:
    """このテーマで、いま選べる実験の一覧を返す（やり終えた実験と、学級で許可されていないものは除いてある）。各実験: id・題名・変えるもの・一定にするもの・変数名。"""
    return {"experiments": list(tool_context.state.get(PLAN_CATALOG_KEY) or [])}


def get_class_rules(tool_context: ToolContext) -> dict[str, Any]:
    """学級の決まりを返す: 使ってよいセンサー、先生が有効化した家の実験、1 回の測定の秒数の上限。学級に入っていない端末なら既定。"""
    return dict(tool_context.state.get(CLASS_RULES_KEY) or {"note": "学級に入っていない端末です"})


def planner_tools() -> list[FunctionTool]:
    return [FunctionTool(list_experiments), FunctionTool(get_class_rules)]


def catalog_for_tools(
    theme: CatalogTheme, candidates: tuple[CatalogVariant, ...]
) -> list[dict[str, str]]:
    return [
        {
            "id": v.id,
            "title": v.title,
            "changes": v.changes,
            "holds": v.holds,
            "variable": v.variable,
            "sensors": "・".join(theme.sensors),
        }
        for v in candidates
    ]
