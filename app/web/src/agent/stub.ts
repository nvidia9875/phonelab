/**
 * サーバ（Planner / Policy / Judge）ができるまでの端末内スタブ。
 * 同じシグネチャのまま API 呼び出しに差し替える。答えは持たない。
 * - choosePlan: 予想の文から変数と向きを読み、テーマ内の未実施の変数を選ぶ（Planner 相当）
 * - checkPolicy: 危険な要望・注入・答えの要求を決定論で止める（Policy 3.2 / 3.4 / 3.7 相当）
 * - judge: 測定値の差と許容誤差だけで判定文を作る（verifier.md 3 章と同じ規則）
 */
import { variantsOf, type Theme, type Variable, type Variant } from "../catalog/themes";
import type { Claim, Direction, Judgement, Rejection } from "../store/records";

const VARIABLE_WORDS: [RegExp, Variable][] = [
  [/重|おも|質量|軽/, "mass"],
  [/長|糸|短/, "length"],
  [/振れ|大きく|小さく|角度|幅/, "amplitude"],
  [/水/, "water"],
  [/高さ|高い所/, "height"],
];
const DIRECTION_WORDS: [RegExp, Direction][] = [
  [/変わらな|同じ|関係な|一定/, "same"],
  [/速|早|短くな|はやい/, "faster"],
  [/遅|ゆっくり|長くな|おそい/, "slower"],
];

export function readClaim(text: string): Claim {
  const variable = VARIABLE_WORDS.find(([re]) => re.test(text))?.[1] ?? "unknown";
  const direction = DIRECTION_WORDS.find(([re]) => re.test(text))?.[1] ?? "unknown";
  return { variable, direction };
}

export type PolicyResult =
  | { kind: "allow" }
  | { kind: "hint"; message: string }
  | { kind: "reject"; rejection: Rejection };

const FORBIDDEN: [RegExp, string][] = [
  [/落と|投げ|ぶつけ/, "端末の落下・投擲"],
  [/2 ?m|３ ?m|3 ?m|高い所|屋上|階段/, "1 m を超える高さ"],
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
  const claim = readClaim(text);
  const variant = pickVariant(theme, claim, done);
  const tooShort = text.trim().length < 6 || !/から|ので|ため|思う|はず|と|だ/.test(text);
  const questionBack = tooShort ? "どうしてそう思う？ 理由を一言足してから、実験を選びます" : null;
  const why =
    claim.variable !== "unknown" && claim.variable === variant.variable
      ? `${variant.changes.split("（")[0]}だけを変えれば、あなたの予想をそのまま試せます`
      : `まず${variant.changes.split("（")[0]}だけを変えて、予想の土台を確かめます`;
  return { variant, why, questionBack };
}

export function judge(a: number, b: number, tolerance: number, unc: number, claim: Claim | null, variant: Variant, unit: "s" | "Hz"): Judgement {
  const delta = b - a;
  const u = Math.max(tolerance, unc);
  let observed: Direction;
  if (Math.abs(delta) <= u) observed = "same";
  else if (unit === "s") observed = delta < 0 ? "faster" : "slower";
  else observed = delta > 0 ? "faster" : "slower"; // Hz は高い＝faster 扱い（音では「高くなる」）
  const what = variant.changes.split("（")[0];
  const quantity = unit === "s" ? "周期" : "音の高さ";
  const dirWord = unit === "s" ? { faster: "短くなった", slower: "長くなった" } : { faster: "高くなった", slower: "低くなった" };
  const statement = observed === "same" ? `${what}を変えても、${quantity}は変わらなかった` : `${what}を変えたら、${quantity}は${dirWord[observed as "faster" | "slower"]}`;
  const consistent = claim && claim.direction !== "unknown" ? claim.direction === observed : null;
  const fmt = (v: number) => (unit === "s" ? `${v.toFixed(2)} s` : `${Math.round(v)} Hz`);
  const claimWord = claim ? ({ faster: "速くなる", slower: "遅くなる", same: "変わらない", unknown: "" } as const)[claim.direction] : "";
  const inside = Math.abs(delta) <= u ? "内側" : "外側";
  const detail =
    consistent === null
      ? `差 ${fmt(Math.abs(delta))} は許容誤差 ${fmt(u)} の${inside}です。予想の向きが読み取れなかったので、判定はしていません`
      : consistent
        ? `あなたの予想「${claimWord}」は、この測定では成り立った。差 ${fmt(Math.abs(delta))} は許容誤差 ${fmt(u)} の${inside}です`
        : `あなたの予想「${claimWord}」は、この測定では成り立たなかった。差 ${fmt(Math.abs(delta))} は許容誤差 ${fmt(u)} の${inside}です`;
  return { a, b, delta, tolerance: u, observed, consistent, statement, detail };
}
