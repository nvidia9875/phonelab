"""判断の跡（X4）— エージェントが何を読み、何を選び、統制層が何を直したかを短い行で返す。

生徒の記録と教員画面に残す。本文（予想文・応答文）は入れない。行は Cloud Trace のスパンと同じ順に並べる。
"""

from __future__ import annotations

from server.agent.catalog import CATALOG, short_changes
from server.agent.runner import FIX_CONDITION, FIX_OFF_CATALOG, FIX_RESULT_WORDS, FIX_UNREADABLE

FIX_WORDS = {
    FIX_UNREADABLE: "形が読めない",
    FIX_OFF_CATALOG: "候補にない実験",
    FIX_RESULT_WORDS: "結果の言葉が混じった",
    FIX_CONDITION: "実験の条件を変えさせる助言",
}
MAX_LINES = 5


def read_line(what: str) -> str:
    return f"読んだ: {what}"


def policy_before_line(kind: str) -> str:
    return {
        "allow": "AI に渡す前のチェック: 問題なし",
        "hint": "AI に渡す前のチェック: 答えを聞く文 → ヒントで返した（AI は呼ばない）",
        "reject": "AI に渡す前のチェック: 危ない実験・メモの中の命令 → 止めた（AI は呼ばない）",
        "class_policy": "AI に渡す前のチェック: 学級で許されていない → 止めた（AI は呼ばない）",
        "limit": "聞ける回数の上限 → AI を呼ばずにリストの順",
        "armor_unavailable": "AI に渡す前のチェック（Model Armor）: いまは検査できない → 生徒の文は AI に渡さず決まりごとで",
    }[kind]


def chose_line(what: str) -> str:
    return f"選んだ: {what}"


def experiment_words(experiment_id: str | None) -> str:
    """id ではなく題名で（生徒が読む）。カタログに無い id はそのまま"""
    for theme in CATALOG.values():
        for v in theme.variants:
            if v.id == experiment_id:
                return f"「{v.title}」"
    return str(experiment_id)


def variable_words(theme_id: str, variable: str) -> str:
    """予想の変数を、カタログの「変えるもの」の言葉で"""
    for v in CATALOG[theme_id].variants:
        if v.variable == variable:
            return short_changes(v)
    return "読み取れなかった"


def check_lines(fix_reasons: tuple[str, ...], retried: bool, self_corrected: bool) -> list[str]:
    """モデルの後の検査と自己修正。落ちなかったら「通過」の 1 行"""
    if not fix_reasons:
        return ["AI の答えのチェック: 問題なし"]
    found = "・".join(FIX_WORDS[r] for r in fix_reasons)
    if not retried:
        return [f"AI の答えのチェック: {found} → 回数の上限なので安全な文に差し替えた"]
    lines = [f"AI の答えのチェック: {found} → 理由を伝えて作り直してもらった"]
    lines.append(
        "作り直し: チェックを通った"
        if self_corrected
        else "作り直し: まだだめ → 安全な文に差し替えた"
    )
    return lines


def trail(*lines: str | list[str]) -> list[str]:
    flat: list[str] = []
    for line in lines:
        flat.extend(line if isinstance(line, list) else [line])
    return flat[:MAX_LINES]
