"""先生の説明（模範の回答）— docs/experiments.md 2 章の answers.json に当たる。

サーバだけが持つ。生徒が自分の考えを書くまでは LLM にも渡さない（いちばん強い漏えい対策）。
leak_phrases は「なぜそうなるか」の説明の言い回し。測定の結果（「高さは変わらなかった」など）は
生徒の画面に出ているので、ここには入れない。
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ModelAnswer:
    explanation: str
    leak_phrases: tuple[str, ...]


MODEL_ANSWERS: dict[str, ModelAnswer] = {
    "energy_height": ModelAnswer(
        explanation=(
            "高いところから放すほど、おもりが持っている位置エネルギーが大きくなります。"
            "いちばん下に来るまでに、その位置エネルギーが運動エネルギーに変わるので、高くから放すほど、いちばん下を通る速さは大きくなります。"
            "高さを 2 倍にすると、速さはおよそ 1.4 倍（√2 倍）になります。"
        ),
        leak_phrases=("位置エネルギーが運動エネルギーに", "√2 倍", "およそ 1.4 倍", "約 1.4 倍"),
    ),
    "energy_mass": ModelAnswer(
        explanation=(
            "重さを 2 倍にすると位置エネルギーも 2 倍になりますが、同じ速さで動かすのに必要な運動エネルギーも 2 倍になります。"
            "増えた分どうしが打ち消し合うので、同じ高さから放せば、いちばん下を通る速さは重さによらずほぼ同じです（空気の抵抗が小さいとき）。"
        ),
        leak_phrases=("重さによらず", "打ち消し合う", "運動エネルギーも 2 倍"),
    ),
    "sound_pluck_strength": ModelAnswer(
        explanation=(
            "音の高さは、ものが 1 秒間に何回ふるえるか（振動数）で決まります。"
            "強くはじくと、ふるえ方が大きく（振幅が大きく）なって音は大きくなりますが、1 秒間にふるえる回数は輪ゴムの長さ・張り・太さで決まるので、高さはほとんど変わりません。"
        ),
        leak_phrases=(
            "振動数は変わらない",
            "ふるえる回数は変わらない",
            "振幅が大きくなるだけ",
            "ふるえる回数は輪ゴムの長さ",
        ),
    ),
    "sound_string_length": ModelAnswer(
        explanation=(
            "ふるえる部分を短くすると、輪ゴムが 1 秒間にふるえる回数（振動数）が増えます。"
            "振動数が大きいほど高い音に聞こえるので、真ん中を押さえて短くすると音は高くなります。"
        ),
        leak_phrases=("振動数が増え", "ふるえる回数が増え", "振動数が大きいほど高い"),
    ),
    "bottle_water": ModelAnswer(
        explanation=(
            "ボトルの中でふるえているのは、水ではなく中の空気です。"
            "水を入れると空気の部分が小さくなり、空気が 1 秒間にふるえる回数が増えるので、音は高くなります。"
        ),
        leak_phrases=("ふるえているのは、水ではなく", "空気の部分が小さく", "空気の柱が短く"),
    ),
    "pendulum_mass": ModelAnswer(
        explanation=(
            "振り子の周期は糸の長さで決まり、おもりの重さにはよりません。"
            "重いおもりは引っぱられる力も大きいぶん動かしにくさも大きく、二つが打ち消し合うからです。"
        ),
        leak_phrases=("重さにはよりません", "動かしにくさも大きく", "打ち消し合う"),
    ),
    "pendulum_length": ModelAnswer(
        explanation="振り子の周期は糸の長さの平方根に比例します（T = 2π√(L/g)）。糸を 2 倍にすると、周期はおよそ 1.4 倍になります。",
        leak_phrases=("平方根に比例", "2π√", "およそ 1.4 倍"),
    ),
    "pendulum_amplitude": ModelAnswer(
        explanation="振れ幅が小さい範囲では、振り子の周期はほとんど変わりません（振り子の等時性）。30° くらいまでなら、違いは 2% ほどです。",
        leak_phrases=("等時性", "違いは 2%"),
    ),
}
