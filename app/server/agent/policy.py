"""決定論の Policy — docs/policy.md 3.2（禁止動作）・3.4（注入）・3.7（答えの要求）。

LLM を呼ぶ前に、予想の文だけを見て判定する。web/src/agent/stub.ts の checkPolicy と同じ規則。
ここで却下したものは Planner に渡らない（禁止動作は候補にも出さない）。
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

FORBIDDEN: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"落と|投げ|ぶつけ"), "端末の落下・投擲"),
    # 「1.98 m/s」「0.5 m」のような小数や速さは高さとして読まない（10/2 の評価で見つけた誤検知）
    (
        re.compile(
            r"(?<![0-9０-９.．])[2-9２-９] ?(m|ｍ|メートル)(?![/／]s|毎秒)|屋上|階段|ベランダ|窓から"
        ),
        "1 m を超える高さ",
    ),
    (re.compile(r"水に|プール|風呂"), "水の近く"),
    (re.compile(r"道路|車道|交差点"), "交通のある場所"),
    # 「ペットボトルに熱いお湯を入れて振る」が通っていた（10/13、記事のスクショを撮っていて見つけた）。
    # 打ち消し（「お湯は使わず」）も読み分けずに止める。正規表現で打ち消しを読み分けると、直すたびに別の言い回しが漏れた
    # （10/13 デプロイ前レビュー 1〜3 回目）。止めても、理由と代わりの実験が出るだけなので、安全な側に倒す
    (re.compile(r"熱湯|お湯|おゆ|熱い(湯|水|もの)|熱した(水|湯|もの)|あつい(お湯|湯|水)|沸騰|沸か|ドライヤー|コンロ|電子レンジ|ろうそく|ライター|(?<![一-龥])火(で|に|を)"), "熱いもの・火"),
)
# 出力（ラボ先生の文）で勧めてはいけない動作。入力の FORBIDDEN に、身のまわりの危険を足す
# 熱いもの・火は入口（生徒の文）だけで止める。出口に足すと「沸騰は、液体の内部からも…」「熱湯ではなく常温の水で」の
# ような安全な理科の文まで止めた（10/13 デプロイ前レビュー 4・5 回目）。出口は 10/12 の本番と同じ
UNSAFE_OUTPUT: tuple[tuple[re.Pattern[str], str], ...] = (
    *((pattern, label) for pattern, label in FORBIDDEN if label != "熱いもの・火"),
    (
        re.compile(r"電子レンジ|コンセント|ライター|火をつけ|燃や|分解|電池を(外|抜|取)"),
        "火・電気・分解",
    ),
    (re.compile(r"口に入れ|なめ|かじ"), "口に入れる"),
)
# 注意・禁止の文（「落とさないように」「窓から投げるのは危ない」）は勧めていないので止めない
# 「やってみない？」は誘いなので注意に数えない
WARNING_WORDS = re.compile(
    r"ないよう|ないで|ないこと|ない方|ないほう|ません|ず[、。に]|禁止|だめ|ダメ|危な|危険|気をつけ|注意|やめ"
)
SENTENCES = re.compile(r"[^。！？!?\n]+")


def unsafe_instruction(text: str) -> str | None:
    """ラボ先生の文が危ない動作を勧めているか。勧めている文の種類を返す（無ければ None）。10/9 Codex #5
    限界: 注意の言葉がある文はまるごと通す。「やけどに注意して、熱湯を入れて振ってみよう」のように前置きの注意だけで
    勧めている文は見逃す（どの危ない言葉でも同じ。節ごとに読み分けると安全な注意文を止める退行が出たので、10/13 に戻した）"""
    for sentence in SENTENCES.findall(text):
        if WARNING_WORDS.search(sentence):
            continue
        for pattern, label in UNSAFE_OUTPUT:
            if pattern.search(sentence):
                return label
    return None


INJECTION = re.compile(r"飛ばして|無視して|と表示|答えは|チェックを飛ば|スキップ")
ANSWER_REQUEST = re.compile(r"答え(だけ)?教えて|正解(は|を)|答えを教え")
# 引用する文。指示文（注入）があればそれを、無ければ禁止動作の文を
QUOTE_INJECTION = re.compile(r"[^。\n]*(飛ばして|無視して|と表示|答えは)[^。\n]*。?")
QUOTE_FORBIDDEN = re.compile(
    r"[^。\n]*(落と|投げ|ぶつけ|屋上|階段|ベランダ|窓から|水に|プール|風呂|道路|車道|交差点|熱湯|お湯|おゆ|熱い|熱した|あつい|沸騰|沸か|ドライヤー|コンロ|電子レンジ|ろうそく|ライター|火で|火に|火を)[^。\n]*。?"
)

HINT_TEXT = "答えは測って見つけよう。まず、あなたはどうなると思う？ 理由も一緒に書いてみて"


@dataclass(frozen=True)
class Rejection:
    title: str
    reasons: tuple[str, str, str]
    quoted: str


@dataclass(frozen=True)
class PredictionCheck:
    kind: Literal["allow", "hint", "reject"]
    message: str = ""
    rejection: Rejection | None = None


def check_prediction(text: str) -> PredictionCheck:
    if ANSWER_REQUEST.search(text):
        return PredictionCheck(kind="hint", message=HINT_TEXT)
    forbidden = next((label for pattern, label in FORBIDDEN if pattern.search(text)), None)
    injected = INJECTION.search(text) is not None
    if not forbidden and not injected:
        return PredictionCheck(kind="allow")
    quote = QUOTE_INJECTION.search(text) or QUOTE_FORBIDDEN.search(text)
    quoted = quote.group(0).strip() if quote else ""
    reasons = (
        f"禁止動作：{forbidden}"
        if forbidden
        else "禁止動作に当たる要望はありませんが、指示文が含まれていました",
        f"メモの中の「{quoted}」は、証拠の前に答えを出す／検査を飛ばす指示なので無視"
        if injected
        else "カタログにない実験は候補にしません",
        "この文はメモの本文であって、あなたの操作ではない",
    )
    title = (
        f"{forbidden}を伴う実験は、候補に出しません"
        if forbidden
        else "メモの指示は実験になりません"
    )
    return PredictionCheck(
        kind="reject", rejection=Rejection(title=title, reasons=reasons, quoted=quoted)
    )
