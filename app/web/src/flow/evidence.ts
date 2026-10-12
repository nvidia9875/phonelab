/**
 * 結果の画面に添える「証拠」（10/12 教育研究の見直し）。
 * - 音の大きさ: 強くはじくと変わるのは大きさで、高さではない（音の大きさと高さの混同。学習指導要領解説も、
 *   音の大小は振幅・高低は振動数と結びつけるよう求めている）。測定で計算している rms_db を条件ごとに平均する
 * - 通った検査: 予想と食い違った結果を「測り方が悪かった」で捨てないように、どの検査を通った測定かを示す
 *   （予想に反するデータを信じられるかが、考えが変わるかを左右する。Chinn & Brewer 1993）
 */
import type { CondKey, StudyRecord } from "../store/records";

export interface Evidence {
  /** 条件ごとの音の大きさ（dB、マイクの相対値）。音の実験でなければ null */
  loudness: Record<CondKey, number> | null;
  /** 判定に使った測定が通った検査の言葉（重ならないように） */
  passedChecks: string[];
}

const CHECK_NAMES: Record<string, string> = {
  low_snr: "まわりの雑音",
  clipping: "音割れ",
  low_voiced: "音の長さ",
  two_clocks_disagree: "二つの計算の一致",
  out_of_range: "値の範囲",
  saturation: "振りの強さ（飽和）",
  gap: "読み取りの途切れ",
  low_rate: "読み取りの速さ",
  no_release: "動き出し",
};

export function evidenceOf(rec: StudyRecord): Evidence {
  // テストモードのサンプルも含める（画面にはサンプルだと出ている）
  const passed = rec.measurements.filter((m) => m.pass);
  const byCond = (c: CondKey) => passed.filter((m) => m.condition === c);
  const pitch = (c: CondKey) => byCond(c).flatMap((m) => (m.features.profile === "pitch" ? [m.features.rms_db] : []));
  const a = pitch("A");
  const b = pitch("B");
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const loudness = a.length && b.length ? { A: mean(a), B: mean(b) } : null;
  const names = new Set<string>();
  for (const m of passed) for (const c of m.checks) if (c.ok && CHECK_NAMES[c.code]) names.add(CHECK_NAMES[c.code]);
  return { loudness, passedChecks: [...names] };
}
