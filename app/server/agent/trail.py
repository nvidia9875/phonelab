"""判断の跡（X4）— エージェントが何を読み、何を選び、統制層が何を直したかを短い行で返す。

生徒の記録と教員画面に残す。本文（予想文・応答文）は入れない。行は Cloud Trace のスパンと同じ順に並べる。
"""

from __future__ import annotations

from server.agent.runner import FIX_OFF_CATALOG, FIX_RESULT_WORDS, FIX_UNREADABLE

FIX_WORDS = {
    FIX_UNREADABLE: "形が読めない",
    FIX_OFF_CATALOG: "候補にない実験",
    FIX_RESULT_WORDS: "結果の言葉が混じった",
}
MAX_LINES = 5


def read_line(what: str) -> str:
    return f"読んだ: {what}"


def policy_before_line(kind: str) -> str:
    return {
        "allow": "モデルの前の検査: 通過",
        "hint": "モデルの前の検査: 答えを求める文 → ヒントで返す（モデルは呼ばない）",
        "reject": "モデルの前の検査: 禁止動作・メモの中の命令 → 却下（モデルは呼ばない）",
        "class_policy": "モデルの前の検査: 学級の許可がない → 止める（モデルは呼ばない）",
        "limit": "回数の上限 → モデルを呼ばずにカタログの順",
    }[kind]


def chose_line(what: str) -> str:
    return f"選んだ: {what}"


def check_lines(fix_reasons: tuple[str, ...], retried: bool, self_corrected: bool) -> list[str]:
    """モデルの後の検査と自己修正。落ちなかったら「通過」の 1 行"""
    if not fix_reasons:
        return ["モデルの後の検査: 通過"]
    found = "・".join(FIX_WORDS[r] for r in fix_reasons)
    if not retried:
        return [f"モデルの後の検査: {found} → 回数の上限なので統制層が差し替えた"]
    lines = [f"モデルの後の検査: {found} → 理由を返して作り直させた"]
    lines.append(
        "作り直し: 検査を通過" if self_corrected else "作り直し: まだ通らない → 統制層が差し替えた"
    )
    return lines


def trail(*lines: str | list[str]) -> list[str]:
    flat: list[str] = []
    for line in lines:
        flat.extend(line if isinstance(line, list) else [line])
    return flat[:MAX_LINES]
