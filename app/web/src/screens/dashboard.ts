import type { CheckCode } from "../measure/checks";
/**
 * 先生の 1 画面の計算（docs/personas.md §3、ux-flow §11）: 予想の向きの分布、いま見に行く子、状態の言葉。
 * 入力はサーバの記録の要約だけ。名前は無い。
 */
import { QUANTITY } from "../catalog/quantity";
import { themeById, variantById } from "../catalog/themes";
import type { RecordSummary, StudentRow } from "../agent/classroom";

export type Tone = "teal" | "navy" | "outline";

export interface StateLabel {
  text: string;
  tone: Tone;
}

/** 生徒の「いま」。保留と却下は紺（先生が見に行く）、測定中は青緑 */
export function stateOf(r: RecordSummary | null): StateLabel {
  if (!r) return { text: "未着手", tone: "outline" };
  if (r.status === "held") return { text: "保留", tone: "navy" };
  if (r.rejection_title && r.stage === "plan") return { text: "却下 → 代替", tone: "navy" };
  if (r.status === "signed") return { text: "記録済み", tone: "outline" };
  if (r.status === "judged" || r.stage === "result") return { text: "判定まで済み", tone: "outline" };
  switch (r.stage) {
    case "predict": return { text: r.prediction ? "予想の続き" : "予想中", tone: "outline" };
    case "plan": return { text: "承認待ち", tone: "outline" };
    case "setup_A": case "measure_A": return { text: "測定 A", tone: "teal" };
    case "setup_B": case "measure_B": return { text: "測定 B", tone: "teal" };
    default: return { text: "進行中", tone: "outline" };
  }
}

/** 検査コードの言葉。CheckCode を全部持たないと型検査で落ちる（足し忘れで英字のコードが先生に出た。10/2 採点） */
const CHECK_WORDS: Record<CheckCode, string> = {
  low_snr: "雑音と区別できない",
  low_voiced: "音が短い",
  clipping: "音割れ",
  out_of_range: "値が範囲外",
  saturation: "飽和",
  gap: "欠測",
  low_rate: "サンプリングが遅い",
  no_release: "動き出していない",
  two_clocks_disagree: "二系統が不一致",
  unstable: "周期が不安定",
  weak_autocorr: "周期が読めない",
  no_signal: "信号なし",
  too_uncertain: "ばらつきで決められない",
};

/** 検査の列。保留の理由か、通ったなら「二系統一致」 */
export function checkTextOf(r: RecordSummary | null): { text: string; strong: boolean } {
  if (!r) return { text: "—", strong: false };
  if (r.hold_codes.length) return { text: r.hold_codes.map((c) => (CHECK_WORDS as Record<string, string>)[c] ?? "保留").join("・"), strong: true };
  if (r.rejection_title) return { text: "代替実験を提示", strong: false };
  if (r.result) return { text: "二系統一致", strong: false };
  if (r.stage === "predict" || r.stage === "plan") return { text: "センサー未使用", strong: false };
  return { text: "測定中", strong: false };
}

/** 記録のトレースを段の名前つきで。古い形（trace_ids・trace_id）は段が分からないので「エージェント」 */
export function tracesOfRow(r: RecordSummary): { stage: string; id: string }[] {
  if (r.traces?.length) return r.traces;
  const ids = r.trace_ids?.length ? r.trace_ids : r.trace_id ? [r.trace_id] : [];
  return ids.map((id) => ({ stage: "エージェント", id }));
}

/** 測定ごとの 1 行: 「A 1.210 / 1.190 通過」「B — / 2.400 飽和」 */
export function measurementLinesOf(r: RecordSummary): { key: string; label: string; text: string; pass: boolean }[] {
  return (r.measurements ?? []).map((m, i) => {
    const values = m.values.map((v) => (v === null ? "—" : v.toPrecision(4))).join(" / ");
    const verdict = m.pass ? "通過" : m.failed.map((c) => (CHECK_WORDS as Record<string, string>)[c] ?? c).join("・") || "保留";
    return { key: `${m.at}-${i}`, label: `測定 ${m.condition}`, text: `${values}　${verdict}`, pass: m.pass };
  });
}

/** 「いまの予想」の列。短く */
export function claimTextOf(r: RecordSummary | null, max = 22): string {
  if (!r || !r.prediction) return "（まだ書いていない）";
  const t = r.prediction.replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export interface DistributionBar {
  label: string;
  count: number;
}

export interface Distribution {
  themeId: string;
  themeTitle: string;
  total: number;
  bars: DistributionBar[];
}

/** いちばん多くの生徒が取り組んでいる実験（テーマ × 変える変数）について、予想の向きの分布。強さと長さの予想を混ぜない */
export function distributionOf(students: StudentRow[]): Distribution | null {
  const byExperiment = new Map<string, RecordSummary[]>();
  for (const s of students) {
    if (!s.current) continue;
    const key = `${s.current.theme_id}|${s.current.variant_id ?? ""}`;
    byExperiment.set(key, [...(byExperiment.get(key) ?? []), s.current]);
  }
  if (byExperiment.size === 0) return null;
  const [key, recs] = [...byExperiment.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const [themeId, variantId] = key.split("|");
  const theme = themeById(themeId);
  const variant = theme ? variantById(theme, variantId || null) : undefined;
  const unit = variant?.unit ?? theme?.variants[0]?.unit ?? "Hz";
  const q = QUANTITY[unit];
  const count = (d: string) => recs.filter((r) => (r.claim?.direction ?? "unknown") === d).length;
  return {
    themeId,
    themeTitle: variant ? `${theme?.title ?? themeId}・${variant.changes.split("（")[0]}を変える` : (theme?.title ?? themeId),
    total: recs.length,
    bars: [
      { label: q.choiceFaster, count: count("faster") },
      { label: "変わらない", count: count("same") },
      { label: q.choiceSlower, count: count("slower") },
      { label: "まだ読めない", count: count("unknown") },
    ],
  };
}

const ONLINE_MS = 10 * 60 * 1000;

export function isOnline(row: StudentRow, now = Date.now()): boolean {
  const t = Date.parse(row.last_seen_at);
  return Number.isFinite(t) && now - t < ONLINE_MS;
}

/** 先生が見に行く順: 保留 → 却下 → 予想で止まっている子 */
export function attentionOf(students: StudentRow[]): StudentRow[] {
  const rank = (s: StudentRow) => (s.current?.status === "held" ? 0 : s.current?.rejection_title ? 1 : s.current && s.current.stage === "predict" && (s.current.chat_turns > 0 || (s.current.retries.A ?? 0) > 0) ? 2 : 9);
  return students.filter((s) => rank(s) < 9).sort((a, b) => rank(a) - rank(b) || a.number.localeCompare(b.number));
}

/** 研究や学習指導要領で報告されている思い込み（裏づけのあるものだけ。10/12 の教育研究の見直し）。
 * 音: 大きさと高さの混同（学習指導要領解説、Aygün & Hacıoğlu 2022）。振り子: 重いほど速い（Halloun & Hestenes 1985） */
const KNOWN_MISCONCEPTIONS: Record<string, string> = {
  "sound|strength|faster": "音の大きさと高さの混同",
  "energy|mass|faster": "重いほど速いという思い込み",
};

export interface Belief {
  themeId: string;
  text: string;
  count: number;
  misconception: string | null;
}

/** 学級の考えの集まり: 全テーマの「何を変えると、どうなる」と思っているかを人数で（予想の本文は使わない） */
export function beliefsOf(students: StudentRow[]): Belief[] {
  const counts = new Map<string, number>();
  for (const s of students) {
    const c = s.current?.claim;
    if (!s.current || !c || c.variable === "unknown" || c.direction === "unknown") continue;
    const key = `${s.current.theme_id}|${c.variable}|${c.direction}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const out: Belief[] = [];
  for (const [key, count] of counts) {
    const [themeId, variable, direction] = key.split("|");
    const theme = themeById(themeId);
    const variant = theme?.variants.find((v) => v.variable === variable);
    if (!theme || !variant) continue;
    const q = QUANTITY[variant.unit];
    const word = direction === "faster" ? q.choiceFaster : direction === "slower" ? q.choiceSlower : "変わらない";
    out.push({
      themeId,
      text: `${theme.title}: ${variant.changes.split("（")[0]}を変えると「${word}」`,
      count,
      misconception: KNOWN_MISCONCEPTIONS[key] ?? null,
    });
  }
  return out.sort((a, b) => b.count - a.count);
}
