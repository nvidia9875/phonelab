/**
 * 振り子の最下点の速さを「二本の時計」で測る（中 3 力学的エネルギーの保存）。
 * 仕様: docs/verifier.md 1.2b / 2.2b。生データはこのモジュールの外に出さない。
 *
 *  - ジャイロ: 振り軸の角速度の最大 × 糸の長さ
 *  - 加速度: 最下点で |a| = g + v²/L → v = √((|a|max − g)·L)
 */
import { samplingChecks, type LocalCheck } from "./checks";
import type { RawBuffer } from "./pendulum";
import { r3, samplingStats, saturationRuns, variance, type SamplingStats } from "./stats";

const G = 9.81;
const RELEASE_DPS = 30;
const SWINGS = 3;
const MIN_SPEED_MS = 0.2;
const MAX_SPEED_MS = 4.0;
const SATURATION_MS2 = 39;
const SATURATION_DPS = 1500;
const AXES = ["alpha", "beta", "gamma"] as const;

export type SpeedFeatures = SamplingStats & {
  profile: "pendulum_speed";
  length_m: number;
  release_at_s: number | null;
  omega_peak_dps: number;
  accel_norm_peak_ms2: number;
  v_gyro_ms: number;
  v_accel_ms: number;
  gyro_axis: (typeof AXES)[number];
  saturation_runs: number;
  device_interval_ms: number | null;
};

function peak(a: readonly number[], digits: number): number {
  return a.length ? +Math.max(...a).toFixed(digits) : 0;
}

export function analyzeSpeed(b: RawBuffer, lengthM: number): SpeedFeatures {
  const sampling = samplingStats(b.t);
  const n = b.t.length;
  let s0 = 0;
  while (s0 < n && b.t[s0] - b.t[0] < 1000) s0++; // 承認タップの揺れを捨てる

  const axes = [b.gx, b.gy, b.gz].map((a) => a.slice(s0));
  const vars = axes.map(variance);
  const gi = Math.max(0, vars.indexOf(Math.max(...vars)));
  const omega = axes[gi].map(Math.abs);
  const norm: number[] = [];
  for (let i = s0; i < n; i++) norm.push(Math.hypot(b.ax[i], b.ay[i], b.az[i]));

  const base = {
    ...sampling,
    profile: "pendulum_speed" as const,
    length_m: lengthM,
    gyro_axis: AXES[gi],
    saturation_runs: saturationRuns(norm),
    device_interval_ms: b.interval,
  };

  const release = omega.findIndex((w) => w > RELEASE_DPS);
  if (release < 0) {
    return { ...base, release_at_s: null, omega_peak_dps: peak(omega, 1), accel_norm_peak_ms2: peak(norm, 2), v_gyro_ms: NaN, v_accel_ms: NaN };
  }

  // 放してから 3 周期のあいだの最大を最下点の値とみなす（減衰は小さい）
  const tRelease = b.t[s0 + release];
  const windowMs = SWINGS * 2 * Math.PI * Math.sqrt(lengthM / G) * 1000;
  let end = release;
  while (end < omega.length && b.t[s0 + end] - tRelease <= windowMs) end++;
  const omegaPeak = Math.max(...omega.slice(release, end));
  const accelPeak = Math.max(...norm.slice(release, end));

  return {
    ...base,
    release_at_s: r3((tRelease - b.t[0]) / 1000),
    omega_peak_dps: +omegaPeak.toFixed(1),
    accel_norm_peak_ms2: +accelPeak.toFixed(2),
    v_gyro_ms: r3(((omegaPeak * Math.PI) / 180) * lengthM),
    v_accel_ms: r3(Math.sqrt(Math.max(0, accelPeak - G) * lengthM)),
  };
}

export function speedChecks(f: SpeedFeatures, toleranceMs: number): LocalCheck[] {
  const released = f.release_at_s !== null;
  const d = Math.abs(f.v_gyro_ms - f.v_accel_ms);
  const v = (f.v_gyro_ms + f.v_accel_ms) / 2;
  const agree = released && Number.isFinite(d) && d <= toleranceMs;
  const inRange = released && v >= MIN_SPEED_MS && v <= MAX_SPEED_MS;
  const saturated = f.saturation_runs > 0 || f.accel_norm_peak_ms2 >= SATURATION_MS2 || f.omega_peak_dps >= SATURATION_DPS;
  return [
    ...samplingChecks(f),
    { code: "saturation", ok: !saturated, text: saturated ? "飽和。振りが強すぎる" : "飽和なし" },
    { code: "no_release", ok: released, text: released ? `${(f.release_at_s ?? 0).toFixed(1)} 秒で動き出した` : "振り子が動き出していません" },
    {
      code: "two_clocks_disagree",
      ok: agree,
      text: released && Number.isFinite(d) ? `二つのセンサーの速さが${agree ? "一致" : "一致しない"}（差 ${d.toFixed(2)} m/s、許容 ${toleranceMs.toFixed(2)} m/s）` : "速さを決められません",
    },
    { code: "out_of_range", ok: inRange, text: inRange ? `いちばん下で ${v.toFixed(2)} m/s` : "振り子の速さとして考えにくい値です" },
  ];
}
