/** 測定プロファイルごとの特徴量を、判定・画面・記録で同じように扱うための窓口 */
import { formatQuantity, type Unit } from "../catalog/quantity";
import type { MeasureProfile, Variant } from "../catalog/themes";
import type { LocalCheck } from "./checks";
import { periodChecks, type PendulumFeatures } from "./pendulum";
import { pitchChecks, type PitchFeatures } from "./pitch";
import { speedChecks, type SpeedFeatures } from "./speed";

export type Features = PendulumFeatures | SpeedFeatures | PitchFeatures;

export interface Clock {
  label: string;
  value: number;
}

const CLOCK_LABELS: Record<MeasureProfile, [string, string]> = {
  pendulum_period: ["加速度", "ジャイロ（独立した2本目）"],
  pendulum_speed: ["ジャイロ", "加速度（独立した2本目）"],
  pitch: ["音の高さ（振動数）", "もう一つの測り方（倍音か、周波数の山）"],
  freefall_time: ["着地のコマ", "着地音（独立した2本目）"],
  later: ["1本目", "2本目"],
};

export function clockLabels(profile: MeasureProfile): [string, string] {
  return CLOCK_LABELS[profile];
}

/** 画面 2 に並べる二本の時計 */
export function clocksOf(f: Features): [Clock, Clock] {
  const [la, lb] = CLOCK_LABELS[f.profile];
  switch (f.profile) {
    case "pendulum_period":
      return [{ label: la, value: f.T_accel_s }, { label: lb, value: f.T_gyro_s }];
    case "pendulum_speed":
      return [{ label: la, value: f.v_gyro_ms }, { label: lb, value: f.v_accel_ms }];
    case "pitch":
      return [{ label: la, value: f.f0_hz }, { label: lb, value: f.f0_from_h2_hz }];
  }
}

export function unitOf(f: Features): Unit {
  switch (f.profile) {
    case "pendulum_period": return "s";
    case "pendulum_speed": return "m/s";
    case "pitch": return "Hz";
  }
}

/** 判定に使う採用値と不確かさ（docs/verifier.md 2 章。二本の時計の平均と差） */
export function measuredValue(f: Features): { value: number; unc: number } {
  const [a, b] = clocksOf(f);
  return { value: (a.value + b.value) / 2, unc: Math.abs(a.value - b.value) };
}

export function checksFor(f: Features, variant: Variant): LocalCheck[] {
  switch (f.profile) {
    case "pendulum_period": return periodChecks(f, variant.tolerance);
    case "pendulum_speed": return speedChecks(f, variant.tolerance);
    case "pitch": return pitchChecks(f, variant.tolerance);
  }
}

/** 記録のイベントに残す一行 */
export function clocksSummary(f: Features): string {
  const unit = unitOf(f);
  const [a, b] = clocksOf(f);
  return `${formatQuantity(a.value, unit)} と ${formatQuantity(b.value, unit)}`;
}
