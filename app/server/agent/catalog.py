"""Planner に渡す実験カタログ — web/src/catalog/themes.ts と同じ id・題名。答え（現実）は書かない。

ここに無い実験は Planner が返しても候補にしない（PolicyPlugin が差し替える）。
tests/test_catalog.py が answers.py の id と一致することを確かめる。
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CatalogVariant:
    id: str
    variable: str
    title: str
    changes: str
    holds: str


@dataclass(frozen=True)
class CatalogTheme:
    id: str
    school: str
    title: str
    question: str
    unit: str
    variants: tuple[CatalogVariant, ...]


# 予想の向き（faster / slower / same）を、測る量ごとの言葉にする。web の QUANTITY と同じ向き
DIRECTION_WORDS: dict[str, dict[str, str]] = {
    "s": {
        "faster": "周期が短くなる（速く振れる）",
        "slower": "周期が長くなる（ゆっくり）",
        "same": "変わらない",
    },
    "m/s": {"faster": "速くなる", "slower": "遅くなる", "same": "変わらない"},
    "Hz": {"faster": "高くなる", "slower": "低くなる", "same": "変わらない"},
}

CATALOG: dict[str, CatalogTheme] = {
    "energy": CatalogTheme(
        id="energy",
        school="jhs",
        title="振り子とエネルギー",
        question="高さや重さを変えたら、いちばん下を通る速さはどうなりそう？",
        unit="m/s",
        variants=(
            CatalogVariant(
                id="energy_height",
                variable="height",
                title="同じ重さで、放す高さだけ2倍にする",
                changes="放す高さ（10 cm から 20 cm へ）",
                holds="重さ、糸の長さ 80 cm",
            ),
            CatalogVariant(
                id="energy_mass",
                variable="mass",
                title="同じ高さから、重さだけ2倍にして放す",
                changes="重さ（消しゴム1個から2個へ）",
                holds="放す高さ 15 cm、糸の長さ 80 cm",
            ),
        ),
    ),
    "sound": CatalogTheme(
        id="sound",
        school="jhs",
        title="音の高さ",
        question="強さや長さを変えたら、音の高さはどうなりそう？",
        unit="Hz",
        variants=(
            CatalogVariant(
                id="sound_pluck_strength",
                variable="strength",
                title="同じ輪ゴムで、はじく強さだけ変える",
                changes="はじく強さ（弱く から 強く へ）",
                holds="輪ゴムの長さと張り",
            ),
            CatalogVariant(
                id="sound_string_length",
                variable="length",
                title="同じ強さで、震える長さだけ短くする",
                changes="震える部分の長さ（そのまま から 半分 へ）",
                holds="輪ゴム、はじく強さ",
            ),
        ),
    ),
    "bottle": CatalogTheme(
        id="bottle",
        school="jhs",
        title="ペットボトルの音",
        question="水を増やすと、音は高くなる？低くなる？",
        unit="Hz",
        variants=(
            CatalogVariant(
                id="bottle_water",
                variable="water",
                title="同じボトルで、水の量だけ変える",
                changes="水の量（空 → 半分）",
                holds="ボトル、鳴らし方",
            ),
        ),
    ),
    "pendulum": CatalogTheme(
        id="pendulum",
        school="hs",
        title="振り子の周期",
        question="重さや糸の長さを変えたら、周期はどうなりそう？",
        unit="s",
        variants=(
            CatalogVariant(
                id="pendulum_mass",
                variable="mass",
                title="同じ長さの糸で、重さだけ2倍にする",
                changes="重さ（消しゴム1個から2個へ）",
                holds="糸の長さ、振れ幅",
            ),
            CatalogVariant(
                id="pendulum_length",
                variable="length",
                title="同じ重さで、糸の長さだけ2倍にする",
                changes="糸の長さ（50 cm から 100 cm へ）",
                holds="重さ、振れ幅",
            ),
            CatalogVariant(
                id="pendulum_amplitude",
                variable="amplitude",
                title="同じ糸と重さで、振れ幅だけ変える",
                changes="振れ幅（10° から 30° へ）",
                holds="糸の長さ、重さ",
            ),
        ),
    ),
}


def candidates_for(
    theme_id: str, done_ids: tuple[str, ...] | list[str]
) -> tuple[CatalogVariant, ...]:
    """まだやっていない実験を先に。全部済んでいたら全部（行き止まりにしない）"""
    theme = CATALOG[theme_id]
    remaining = tuple(v for v in theme.variants if v.id not in done_ids)
    return remaining or theme.variants


def variant_by_id(theme_id: str, variant_id: str) -> CatalogVariant | None:
    return next((v for v in CATALOG[theme_id].variants if v.id == variant_id), None)


def short_changes(variant: CatalogVariant) -> str:
    """「放す高さ（10 cm から 20 cm へ）」→「放す高さ」"""
    return variant.changes.split("（")[0]
