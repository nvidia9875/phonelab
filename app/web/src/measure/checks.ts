/** 端末側の速報検査の型と共通の検査。最終判断はサーバの Verifier（docs/verifier.md 2 章）で同じ閾値を使う */
import type { SamplingStats } from "./stats";

export type CheckCode =
  | "low_rate"
  | "gap"
  | "saturation"
  | "no_signal"
  | "two_clocks_disagree"
  | "unstable"
  | "weak_autocorr"
  | "out_of_range"
  | "no_release"
  | "low_snr"
  | "clipping"
  | "low_voiced";

export interface LocalCheck {
  code: CheckCode;
  ok: boolean;
  text: string;
}

const MIN_RATE_HZ = 30;
const MAX_GAP_MS = 250;
const MAX_GAP_TOTAL_MS = 500;

/** 加速度・ジャイロに共通の検査（サンプリングの速さと欠測） */
export function samplingChecks(s: SamplingStats): LocalCheck[] {
  const rateOk = s.rate_hz >= MIN_RATE_HZ;
  const gapOk = s.max_gap_ms < MAX_GAP_MS && s.gap_total_ms < MAX_GAP_TOTAL_MS;
  return [
    { code: "low_rate", ok: rateOk, text: rateOk ? `サンプリング ${Math.round(s.rate_hz)} Hz` : `サンプリングが遅い（${s.rate_hz} Hz）` },
    { code: "gap", ok: gapOk, text: gapOk ? "途切れなし" : `${(s.max_gap_ms / 1000).toFixed(1)} 秒の欠測` },
  ];
}
