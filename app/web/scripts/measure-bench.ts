/**
 * 測定コードの合成ベンチマーク（10/12）。答えの分かっている信号を作り、端末と同じ解析・検査の関数に通す。
 *   cd app/web && npx vite-node scripts/measure-bench.ts > ../../docs/eval/measure-bench.json
 *
 * 実機の代わりではない（マイクの特性・部屋の反響・センサーの癖は入らない）。測れるのは「解析と検査の論理が、
 * 答えの分かっている信号で正しく働くか」。とくに次の 2 つを数える:
 *   - 誤って通す: 検査を全部通ったのに、値が答えから許容（音 3%・速さ 0.15 m/s）より外れた
 *   - 余計に止める: きれいな信号なのに、検査で保留にした
 */
import { PITCH_TOLERANCE_REL, SPEED_TOLERANCE_MS } from "../src/catalog/themes";
import { analyzePitch, FFT_SIZE, pitchChecks, type PitchBuffer } from "../src/measure/pitch";
import type { RawBuffer } from "../src/measure/pendulum";
import { analyzeSpeed, speedChecks } from "../src/measure/speed";

const SAMPLE_RATE = 48000;
const FRAME_STEP = 4800; // 0.1 秒ごと
const G = 9.81;
const TRIALS = 40;

/** 決まった乱数（毎回同じ結果になるように） */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
function gauss(r: () => number): number {
  return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
}

/* ---------- 音の高さ ---------- */

interface PitchCase {
  name: string;
  clean: boolean;
  /** 1 秒あたりのはじく回数・雑音の大きさ・音割れ・隣の音 */
  noise: number;
  gain: number;
  neighbor?: number; // 隣の班の輪ゴムの高さの比（例 1.33）
  weakFundamental?: boolean;
  pure?: boolean; // 倍音の無い音（ペットボトルに近い）
  amps?: number[]; // 倍音の強さを直接決める
  range?: [number, number]; // 基本周波数の範囲（既定 150〜600 Hz）
}

const PITCH_CASES: PitchCase[] = [
  { name: "きれいな音（雑音 小）", clean: true, noise: 0.003, gain: 0.3 },
  { name: "教室ほどの雑音", clean: true, noise: 0.02, gain: 0.3 },
  { name: "雑音が大きい（音が小さい）", clean: false, noise: 0.08, gain: 0.1 },
  { name: "音割れ（大きすぎる）", clean: false, noise: 0.003, gain: 2.5 },
  { name: "隣の班の音が同じくらい混ざる", clean: false, noise: 0.01, gain: 0.3, neighbor: 1.33 },
  { name: "基本の音が弱く倍音が強い", clean: false, noise: 0.003, gain: 0.3, weakFundamental: true },
  { name: "倍音の無い音（ペットボトルに近い）", clean: true, noise: 0.003, gain: 0.3, pure: true },
  { name: "低い音（80〜100 Hz）・基本の音が弱い", clean: false, noise: 0.003, gain: 0.3, weakFundamental: true, range: [80, 100] },
  { name: "基本の音が弱く、第 3 倍音も弱い", clean: false, noise: 0.003, gain: 0.3, amps: [0.15, 1, 0.2] },
  { name: "基本の音がとても弱い（−26 dB）", clean: false, noise: 0.003, gain: 0.3, amps: [0.05, 1, 0.1] },
];

function pluckedTone(f0: number, c: PitchCase, r: () => number, seconds = 5): PitchBuffer {
  const frames = [];
  const plucks = [0.8, 1.9, 3.0, 4.1].map((t) => t + 0.1 * r());
  const amps = c.amps ?? (c.pure ? [1] : c.weakFundamental ? [0.15, 1, 0.5, 0.3] : [1, 0.5, 0.25, 0.12]);
  for (let i = 0; i < (seconds * SAMPLE_RATE) / FRAME_STEP; i++) {
    const t = (i * FRAME_STEP * 1000) / SAMPLE_RATE;
    const data = new Float32Array(FFT_SIZE);
    for (let k = 0; k < FFT_SIZE; k++) {
      const s = (i * FRAME_STEP + k) / SAMPLE_RATE;
      let v = 0;
      for (const p of plucks) {
        if (s < p) continue;
        const env = Math.exp(-(s - p) * 3);
        for (let h = 0; h < amps.length; h++) v += amps[h] * env * Math.sin(2 * Math.PI * f0 * (h + 1) * (s - p));
        if (c.neighbor) v += 0.9 * env * Math.sin(2 * Math.PI * f0 * c.neighbor * (s - p + 0.13));
      }
      let x = c.gain * v + c.noise * gauss(r);
      if (x > 1) x = 1;
      if (x < -1) x = -1;
      data[k] = x;
    }
    frames.push({ t, data });
  }
  return { sampleRate: SAMPLE_RATE, frames };
}

function benchPitch() {
  return PITCH_CASES.map((c, ci) => {
    const r = rng(1000 + ci);
    let passed = 0;
    let falsePass = 0;
    const errors: number[] = [];
    for (let n = 0; n < TRIALS; n++) {
      const [lo, hi] = c.range ?? [150, 600]; // 既定は輪ゴムの音のあたり
      const f0 = lo + (hi - lo) * r();
      const f = analyzePitch(pluckedTone(f0, c, r));
      const ok = pitchChecks(f, PITCH_TOLERANCE_REL).every((x) => x.ok);
      const err = Math.abs(f.f0_hz - f0) / f0;
      if (ok) {
        passed++;
        errors.push(err);
        if (!(err <= PITCH_TOLERANCE_REL)) falsePass++;
      }
    }
    return summary(c.name, c.clean, passed, falsePass, errors, (e) => `${(e * 100).toFixed(2)}%`);
  });
}

/* ---------- 振り子の速さ ---------- */

interface SpeedCase {
  name: string;
  clean: boolean;
  rateHz: number;
  accelNoise: number; // m/s²
  gyroNoise: number; // °/s
}

const SPEED_CASES: SpeedCase[] = [
  { name: "60 Hz・センサーの雑音 小", clean: true, rateHz: 60, accelNoise: 0.05, gyroNoise: 1 },
  { name: "60 Hz・センサーの雑音 中", clean: true, rateHz: 60, accelNoise: 0.2, gyroNoise: 3 },
  { name: "30 Hz（遅い端末）", clean: true, rateHz: 30, accelNoise: 0.1, gyroNoise: 2 },
  { name: "センサーの雑音 大", clean: false, rateHz: 60, accelNoise: 0.8, gyroNoise: 12 },
];

function swing(lengthM: number, heightM: number, c: SpeedCase, r: () => number, seconds = 10): { buf: RawBuffer; vTrue: number } {
  const theta0 = Math.acos(1 - heightM / lengthM);
  const wn = Math.sqrt(G / lengthM);
  const release = 1.5 + 0.3 * r();
  const dt = 1000 / c.rateHz;
  const buf: RawBuffer = { t: [], ax: [], ay: [], az: [], gx: [], gy: [], gz: [], interval: dt };
  let maxDth = 0; // 作った信号のいちばん速いところ（減衰も入れた信号と同じ式。10/12 デプロイ前レビュー: 減衰の無い値を正解にしていた）
  for (let i = 0; i < seconds * c.rateHz; i++) {
    const s = i / c.rateHz;
    const moving = s >= release;
    const th = moving ? theta0 * Math.cos(wn * (s - release)) * Math.exp(-0.03 * (s - release)) : theta0;
    const dth = moving ? -theta0 * wn * Math.sin(wn * (s - release)) * Math.exp(-0.03 * (s - release)) : 0;
    maxDth = Math.max(maxDth, Math.abs(dth));
    buf.t.push(i * dt + (r() - 0.5) * 2); // 間隔の揺れ ±1 ms
    buf.ax.push(c.accelNoise * gauss(r));
    buf.ay.push(c.accelNoise * gauss(r));
    buf.az.push(G * Math.cos(th) + lengthM * dth * dth + c.accelNoise * gauss(r));
    buf.gx.push(c.gyroNoise * gauss(r));
    buf.gy.push((dth * 180) / Math.PI + c.gyroNoise * gauss(r));
    buf.gz.push(c.gyroNoise * gauss(r));
  }
  return { buf, vTrue: lengthM * maxDth };
}

function benchSpeed() {
  return SPEED_CASES.map((c, ci) => {
    const r = rng(2000 + ci);
    let passed = 0;
    let falsePass = 0;
    const errors: number[] = [];
    for (let n = 0; n < TRIALS; n++) {
      const lengthM = r() < 0.5 ? 0.8 : 0.4;
      const heightM = 0.1 + 0.1 * r();
      const { buf, vTrue } = swing(lengthM, heightM, c, r);
      const f = analyzeSpeed(buf, lengthM, 0);
      const ok = speedChecks(f, SPEED_TOLERANCE_MS).every((x) => x.ok);
      const v = (f.v_gyro_ms + f.v_accel_ms) / 2;
      const err = Math.abs(v - vTrue);
      if (ok) {
        passed++;
        errors.push(err);
        if (!(err <= SPEED_TOLERANCE_MS)) falsePass++;
      }
    }
    return summary(c.name, c.clean, passed, falsePass, errors, (e) => `${e.toFixed(3)} m/s`);
  });
}

function summary(name: string, clean: boolean, passed: number, falsePass: number, errors: number[], fmt: (e: number) => string) {
  const sorted = [...errors].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : NaN;
  const worst = sorted.length ? sorted[sorted.length - 1] : NaN;
  return {
    case: name,
    clean,
    trials: TRIALS,
    passed,
    held: TRIALS - passed,
    held_rate: `${Math.round(((TRIALS - passed) / TRIALS) * 100)}%`,
    false_pass: falsePass,
    median_error: Number.isFinite(median) ? fmt(median) : "—",
    worst_error: Number.isFinite(worst) ? fmt(worst) : "—",
  };
}

console.log(
  JSON.stringify(
    {
      note: "合成の信号。実機のマイク・部屋の反響・センサーの癖は入らない。答えの分かっている信号で、解析と検査の論理を確かめる",
      tolerance: { pitch_rel: PITCH_TOLERANCE_REL, speed_ms: SPEED_TOLERANCE_MS },
      pitch: benchPitch(),
      speed: benchSpeed(),
    },
    null,
    2,
  ),
);
