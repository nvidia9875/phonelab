/**
 * サーバ（Planner / Policy / Judge）ができるまでの端末内スタブ。
 * 同じシグネチャのまま API 呼び出しに差し替える。答えは持たない。
 * - choosePlan: 予想の文から変数と向きを読み、テーマ内の未実施の変数を選ぶ（Planner 相当）
 * - checkPolicy: 危険な要望・注入・答えの要求を決定論で止める（Policy 3.2 / 3.4 / 3.7 相当）
 * - judge: 測定値の差と許容誤差だけで判定文を作る（verifier.md 3 章と同じ規則）
 */
import { QUANTITY, formatQuantity, type Unit } from "../catalog/quantity";
import { variantsOf, type Theme, type Variable, type Variant } from "../catalog/themes";
import type { Claim, Direction, Judgement, Rejection } from "../store/records";

/** 変数の言葉。テーマに無い変数は読まない（音の「高くなる」を振り子の高さと読まないため） */
const VARIABLE_WORDS: [RegExp, Variable][] = [
  [/強く|弱く|強さ|はじく力|思いきり/, "strength"],
  [/重|おもり|おもさ|質量|軽/, "mass"],
  [/長|糸|短|押さえ/, "length"],
  [/振れ|大きく|小さく|角度|幅/, "amplitude"],
  [/水/, "water"],
  [/高さ|高いところ|高い所|高い位置|持ち上げ|低いところ|低い位置/, "height"],
];

const SAME = /変わらな|同じ|関係な|一定/;
/** 向きの言葉は測る量ごとに違う（周期は「短くなる」が速い、音は「高くなる」） */
const DIRECTION_WORDS: Record<Unit, [RegExp, Direction][]> = {
  s: [[SAME, "same"], [/速|早|短くな|はやい/, "faster"], [/遅|ゆっくり|長くな|おそい/, "slower"]],
  "m/s": [[SAME, "same"], [/速|早|はやい|勢い/, "faster"], [/遅|ゆっくり|おそい/, "slower"]],
  Hz: [[SAME, "same"], [/高くな|高い音|高音/, "faster"], [/低くな|低い音|低音/, "slower"]],
};

function unitOfTheme(theme: Theme): Unit {
  return variantsOf(theme)[0].unit;
}

export function readClaim(text: string, theme: Theme): Claim {
  const allowed = new Set(variantsOf(theme).map((v) => v.variable));
  const variable = VARIABLE_WORDS.find(([re, v]) => allowed.has(v) && re.test(text))?.[1] ?? "unknown";
  const direction = DIRECTION_WORDS[unitOfTheme(theme)].find(([re]) => re.test(text))?.[1] ?? "unknown";
  return { variable, direction };
}

export type PolicyResult =
  | { kind: "allow" }
  | { kind: "hint"; message: string }
  | { kind: "reject"; rejection: Rejection };

const FORBIDDEN: [RegExp, string][] = [
  [/落と|投げ|ぶつけ/, "端末の落下・投擲"],
  [/[2-9２-９] ?m|屋上|階段|ベランダ|窓から/, "1 m を超える高さ"],
  [/水に|プール|風呂/, "水の近く"],
  [/道路|車道|交差点/, "交通のある場所"],
];
const INJECTION = /飛ばして|無視して|と表示|答えは|チェックを飛ば|スキップ/;
const HINT_REQ = /答え(だけ)?教えて|正解(は|を)|答えを教え/;

export function checkPolicy(text: string, theme: Theme, done: string[]): PolicyResult {
  if (HINT_REQ.test(text)) {
    return { kind: "hint", message: "答えは測って見つけよう。まず、あなたはどうなると思う？ 理由も一緒に書いてみて" };
  }
  const forbidden = FORBIDDEN.find(([re]) => re.test(text));
  const injected = INJECTION.test(text);
  if (forbidden || injected) {
    const quotedMatch = text.match(/[^。\n]*(飛ばして|無視して|と表示|答えは|落と)[^。\n]*。?/);
    const alt = pickVariant(theme, { variable: "unknown", direction: "unknown" }, done);
    const reasons = [
      forbidden ? `禁止動作：${forbidden[1]}` : "禁止動作に当たる要望はありませんが、指示文が含まれていました",
      injected ? `メモの中の「${(quotedMatch?.[0] ?? "").trim()}」は、証拠の前に答えを出す／検査を飛ばす指示なので無視` : "カタログにない実験は候補にしません",
      "この文はメモの本文であって、あなたの操作ではない",
    ];
    return {
      kind: "reject",
      rejection: {
        title: forbidden ? `${forbidden[1]}を伴う実験は、候補に出しません` : "メモの指示は実験になりません",
        reasons,
        quoted: quotedMatch?.[0] ?? "",
        alternativeVariantId: alt.id,
      },
    };
  }
  return { kind: "allow" };
}

export function pickVariant(theme: Theme, claim: Claim, done: string[]): Variant {
  const all = variantsOf(theme);
  const remaining = all.filter((v) => !done.includes(v.id));
  const pool = remaining.length ? remaining : all;
  return pool.find((v) => v.variable === claim.variable) ?? pool[0];
}

export interface PlanChoice {
  variant: Variant;
  why: string;
  questionBack: string | null;
}

export function choosePlan(text: string, theme: Theme, done: string[]): PlanChoice {
  const claim = readClaim(text, theme);
  const variant = pickVariant(theme, claim, done);
  // 理由は「なぜ」の説明（から・ので・ため・同じで・見たことがある）。「思う」「はず」は気持ちの言葉なので数えない（サーバの Planner と同じ線引き）
  const tooShort = text.trim().length < 6 || !/から|ので|ため|同じ|見たこと|聞いたこと|なぜなら/.test(text);
  const questionBack = tooShort ? "どうしてそう思う？ 理由を一言足してから、実験を選びます" : null;
  const why =
    claim.variable !== "unknown" && claim.variable === variant.variable
      ? `${variant.changes.split("（")[0]}だけを変えれば、あなたの予想をそのまま試せます`
      : `まず${variant.changes.split("（")[0]}だけを変えて、予想の土台を確かめます`;
  return { variant, why, questionBack };
}

/**
 * 判定（テンプレート。LLM は関与しない）。unc は二本の時計の差とくり返しのばらつき（条件 A と B の和）。
 * ばらつきが許容誤差より大きく、差がそのばらつきの中にあるときは「変わらなかった」と言わずに保留する
 * （差が無いのか、測り方が粗くて見分けられないのかを区別できないため。10/2 採点 1-3）
 */
export function judge(a: number, b: number, unc: number, claim: Claim | null, variant: Variant): Judgement {
  const q = QUANTITY[variant.unit];
  const delta = b - a;
  const tolerance = variant.toleranceKind === "rel" ? variant.tolerance * Math.abs(a) : variant.tolerance;
  const u = Math.max(tolerance, unc);
  const what = variant.changes.split("（")[0];
  const fmt = (v: number) => formatQuantity(v, variant.unit);
  if (unc > tolerance && Math.abs(delta) <= unc) {
    return {
      a, b, delta, tolerance: u, observed: "unknown", consistent: null, undecided: true,
      statement: `${what}を変えたときの${q.name}の差は、測定のばらつきに埋もれて決められなかった（保留）`,
      detail: `差 ${fmt(Math.abs(delta))} は、測定のばらつき ${fmt(unc)} の内側です。ばらつきが許容誤差 ${fmt(tolerance)} より大きいので、「変わらない」とも言いません。条件をそろえて測り直してください`,
    };
  }
  const observed: Direction = Math.abs(delta) <= u ? "same" : (q.largerIsFaster ? delta > 0 : delta < 0) ? "faster" : "slower";
  const statement = observed === "same" ? `${what}を変えても、${q.name}は変わらなかった` : `${what}を変えたら、${q.name}は${observed === "faster" ? q.faster : q.slower}`;
  // 予想が別の変数の話なら（「強くすると高くなる」に長さの実験）、向きが合っていても「成り立った」とは言わない（9/18 Codex F5）
  const consistent = claim && claim.direction !== "unknown" && claim.variable === variant.variable ? claim.direction === observed : null;
  const claimWord = claim ? ({ faster: q.choiceFaster, slower: q.choiceSlower, same: "変わらない", unknown: "" } as const)[claim.direction] : "";
  const inside = Math.abs(delta) <= u ? "内側" : "外側";
  const detail =
    consistent === null
      ? claim && claim.variable !== "unknown" && claim.variable !== variant.variable
        ? `差 ${fmt(Math.abs(delta))} は許容誤差 ${fmt(u)} の${inside}です。予想は「${what}」とは別のものを変える話だったので、この測定では判定していません`
        : `差 ${fmt(Math.abs(delta))} は許容誤差 ${fmt(u)} の${inside}です。予想の向きが読み取れなかったので、判定はしていません`
      : consistent
        ? `あなたの予想「${claimWord}」は、この測定では成り立った。差 ${fmt(Math.abs(delta))} は許容誤差 ${fmt(u)} の${inside}です`
        : `あなたの予想「${claimWord}」は、この測定では成り立たなかった。差 ${fmt(Math.abs(delta))} は許容誤差 ${fmt(u)} の${inside}です`;
  return { a, b, delta, tolerance: u, observed, consistent, statement, detail };
}
