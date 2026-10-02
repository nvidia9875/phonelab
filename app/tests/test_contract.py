"""言語をまたぐ契約 — Web（TypeScript）とサーバ（Python）で同じ id・コードを使っているか。

実験カタログは web/src/catalog/themes.ts と server/agent/catalog.py、検査コードは
web/src/measure/checks.ts の CheckCode と server/agent/planner.py の HoldCode。片方だけ足すとここで落ちる。
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import get_args

from server.agent.catalog import CATALOG
from server.agent.planner import HOLD_WORDS, HoldCode

WEB = Path(__file__).resolve().parents[1] / "web" / "src"


def test_hold_codes_match_the_web_check_codes():
    source = (WEB / "measure" / "checks.ts").read_text()
    union = re.search(r"export type CheckCode =(.*?);", source, re.DOTALL)
    assert union
    web_codes = set(re.findall(r'"(\w+)"', union.group(1)))

    assert web_codes == set(get_args(HoldCode))
    assert set(HOLD_WORDS) == set(get_args(HoldCode))


def test_catalog_ids_match_the_web_themes():
    source = (WEB / "catalog" / "themes.ts").read_text()
    web_ids = set(re.findall(r'\bid: "(\w+)"', source))
    for theme in CATALOG.values():
        assert theme.id in web_ids
        web_variants = {i for i in web_ids if i.startswith(f"{theme.id}_")}
        assert {v.id for v in theme.variants} == web_variants, theme.id
