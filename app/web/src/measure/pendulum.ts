/**
 * 加速度・ジャイロの収集と、振り子の周期を「二本の時計」で測る端末内計算（高校 物理 単振動）。
 * 仕様: docs/verifier.md 1.1〜1.3。生データはこのモジュールの外に出さない。
 * 中学の振り子（最下点の速さ）は speed.ts。収集はここを共通で使う。
 *
 *  - 加速度: |a| は周期 T/2 で脈動する → 自己相関のラグ × 2
 *  - ジャイロ: 分散最大の軸が振り軸 → 自己相関のラグそのもの
 */
import { samplingChecks, type LocalCheck } from "./checks";
import { detrend, firstAutocorrPeak, medianIntervalMs, r3, samplingStats, saturationRuns, variance, type SamplingStats } from "./stats";

export type Permit = { sensors: ("accelerometer" | "gyroscope")[]; seconds: number };

export type RawBuffer = {
  t: number[];
  ax: number[]; ay: number[]; az: number[];
  gx: number[]; gy: number[]; gz: number[];
  interval: number | null;
};

export type PendulumFeatures = SamplingStats & {
  profile: "pendulum_period";
  T_accel_s: number;
  T_gyro_s: number;
  T_accel_first_half_s: number;
  T_accel_second_half_s: number;
  T_gyro_first_half_s: number;
  T_gyro_second_half_s: number;
  accel_norm_peak_ms2: number;
  accel_norm_std_ms2: number;
  gyro_axis: "alpha" | "beta" | "gamma";
  gyro_peak_dps: number;
  gyro_std_dps: number;
  saturation_runs: number;
  autocorr_peak: { accel: number; gyro: number };
  device_interval_ms: number | null;
};

const NO_SAMPLE_PROBE_MS = 2000;

/* ---------- 許可と検出 ---------- */

/** iOS 13+ は requestPermission をユーザー操作の中で呼ぶ必要がある。承認ボタンのハンドラから呼ぶ */
export async function requestMotionPermission(): Promise<"granted" | "denied" | "unsupported"> {
  const DME = (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<"granted" | "denied"> } }).DeviceMotionEvent;
  if (!DME) return "unsupported";
  if (typeof DME.requestPermission === "function") {
    try {
      return await DME.requestPermission();
    } catch {
      return "denied";
    }
  }
  return "granted";
}

export type MotionSupport = "yes" | "no" | "unknown";

/** 1 つの devicemotion から、センサーがあるかを読む。センサーの無い端末のブラウザは、値がすべて null のイベントを出す */
export function classifyMotionSample(e: Pick<DeviceMotionEvent, "accelerationIncludingGravity" | "rotationRate">): "yes" | "no" {
  const a = e.accelerationIncludingGravity;
  const r = e.rotationRate;
  return [a?.x, a?.y, a?.z, r?.alpha, r?.beta, r?.gamma].some((v) => v !== null && v !== undefined) ? "yes" : "no";
}

/**
 * 許可を求めずに、ms 以内に届く最初の devicemotion を読む。
 * 値あり → yes、値がすべて null → no（センサーが無い。Chromebook や PC）、何も来ない → unknown（iOS など許可が要る）。
 * Chrome 152 は requestPermission を持つので、その有無では iOS と区別できない。
 */
export function probeMotionEvents(ms = NO_SAMPLE_PROBE_MS): Promise<MotionSupport> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("DeviceMotionEvent" in window)) {
      resolve("no");
      return;
    }
    const onMotion = (e: DeviceMotionEvent) => finish(classifyMotionSample(e));
    const timer = window.setTimeout(() => finish("unknown"), ms);
    function finish(value: MotionSupport) {
      window.clearTimeout(timer);
      window.removeEventListener("devicemotion", onMotion);
      resolve(value);
    }
    window.addEventListener("devicemotion", onMotion);
  });
}

/* ---------- 収集 ---------- */

/** 許可した秒数だけ読み、終わったら必ずリスナーを外す。途中停止は返り値の stop() */
export function collect(permit: Permit, onTick?: (elapsedS: number, samples: number) => void): { done: Promise<RawBuffer>; stop: () => void } {
  const buf: RawBuffer = { t: [], ax: [], ay: [], az: [], gx: [], gy: [], gz: [], interval: null };
  const useAccel = permit.sensors.includes("accelerometer");
  const useGyro = permit.sensors.includes("gyroscope");
  const onMotion = (e: DeviceMotionEvent) => {
    // センサーの無い端末のブラウザが出す、値がすべて null のイベントは数えない（数えると 2 秒の打ち切りが効かない）
    if (classifyMotionSample(e) === "no") return;
    const a = e.accelerationIncludingGravity;
    const r = e.rotationRate;
    buf.t.push(performance.now());
    buf.ax.push(useAccel ? a?.x ?? 0 : 0);
    buf.ay.push(useAccel ? a?.y ?? 0 : 0);
    buf.az.push(useAccel ? a?.z ?? 0 : 0);
    buf.gx.push(useGyro ? r?.alpha ?? 0 : 0);
    buf.gy.push(useGyro ? r?.beta ?? 0 : 0);
    buf.gz.push(useGyro ? r?.gamma ?? 0 : 0);
    buf.interval = e.interval;
  };
  let finish: (b: RawBuffer) => void = () => {};
  const done = new Promise<RawBuffer>((res) => (finish = res));
  const t0 = performance.now();
  let stopped = false;
  window.addEventListener("devicemotion", onMotion);
  const ticker = window.setInterval(() => onTick?.(Math.min(permit.seconds, (performance.now() - t0) / 1000), buf.t.length), 200);
  const stopAll = () => {
    if (stopped) return;
    stopped = true;
    window.clearInterval(ticker);
    window.clearTimeout(timer);
    window.clearTimeout(probe);
    window.removeEventListener("devicemotion", onMotion);
    finish(buf);
  };
  const timer = window.setTimeout(stopAll, permit.seconds * 1000);
  // 2 秒たっても 1 サンプルも来ない端末（PC など）は待たずに終える
  const probe = window.setTimeout(() => {
    if (buf.t.length === 0) stopAll();
  }, NO_SAMPLE_PROBE_MS);
  return { done, stop: stopAll };
}

/* ---------- 周期 ---------- */

/** 生データ → 周期の特徴量。docs/record-schema.md 4 章の送信スキーマと同じ形 */
export function analyzePeriod(b: RawBuffer): PendulumFeatures {
  const t = b.t;
  const n = t.length;
  const sampling = samplingStats(t);
  const dt = medianIntervalMs(t) / 1000;
  let s0 = 0;
  while (s0 < n && t[s0] - t[0] < 1000) s0++; // 承認タップの揺れを捨てる
  const norm: number[] = [];
  for (let i = s0; i < n; i++) norm.push(Math.hypot(b.ax[i], b.ay[i], b.az[i]));
  const gaxes = [b.gx.slice(s0), b.gy.slice(s0), b.gz.slice(s0)];
  const gv = gaxes.map(variance);
  const gi = Math.max(0, gv.indexOf(Math.max(...gv)));
  const gyro = gaxes[gi];
  const nd = detrend(norm), gd = detrend(gyro);
  const pa = firstAutocorrPeak(nd, dt, 0.1, 2.0), pg = firstAutocorrPeak(gd, dt, 0.2, 4.0);
  const half = Math.floor(nd.length / 2);
  const pa1 = firstAutocorrPeak(nd.slice(0, half), dt, 0.1, 2.0), pa2 = firstAutocorrPeak(nd.slice(half), dt, 0.1, 2.0);
  const pg1 = firstAutocorrPeak(gd.slice(0, half), dt, 0.2, 4.0), pg2 = firstAutocorrPeak(gd.slice(half), dt, 0.2, 4.0);
  return {
    ...sampling,
    profile: "pendulum_period",
    T_accel_s: r3(2 * pa.tau),
    T_gyro_s: r3(pg.tau),
    T_accel_first_half_s: r3(2 * pa1.tau),
    T_accel_second_half_s: r3(2 * pa2.tau),
    T_gyro_first_half_s: r3(pg1.tau),
    T_gyro_second_half_s: r3(pg2.tau),
    accel_norm_peak_ms2: +Math.max(...norm).toFixed(2),
    accel_norm_std_ms2: r3(Math.sqrt(variance(norm))),
    gyro_axis: (["alpha", "beta", "gamma"] as const)[gi],
    gyro_peak_dps: +Math.max(...gyro.map(Math.abs)).toFixed(1),
    gyro_std_dps: +Math.sqrt(gv[gi]).toFixed(2),
    saturation_runs: saturationRuns(norm),
    autocorr_peak: { accel: r3(pa.r), gyro: r3(pg.r) },
    device_interval_ms: b.interval,
  };
}

export function periodChecks(f: PendulumFeatures, toleranceS: number): LocalCheck[] {
  const d = Math.abs(f.T_accel_s - f.T_gyro_s);
  const u1 = Math.abs(f.T_accel_first_half_s - f.T_accel_second_half_s);
  const u2 = Math.abs(f.T_gyro_first_half_s - f.T_gyro_second_half_s);
  const agree = Number.isFinite(d) && d <= toleranceS;
  return [
    ...samplingChecks(f),
    { code: "saturation", ok: f.saturation_runs === 0 && f.accel_norm_peak_ms2 < 39, text: f.saturation_runs === 0 ? "飽和なし" : "飽和。振りが強すぎる" },
    { code: "no_signal", ok: f.accel_norm_std_ms2 >= 0.3 || f.gyro_std_dps >= 5, text: f.accel_norm_std_ms2 >= 0.3 || f.gyro_std_dps >= 5 ? "信号あり" : "振り子が動いていない" },
    { code: "two_clocks_disagree", ok: agree, text: Number.isFinite(d) ? `二つのセンサーの周期が${agree ? "一致" : "一致しない"}（差 ${d.toFixed(2)} s、許容 ${toleranceS.toFixed(2)} s）` : "周期がはっきりしません" },
    { code: "unstable", ok: u1 <= toleranceS && u2 <= toleranceS, text: u1 <= toleranceS && u2 <= toleranceS ? "前半と後半で周期が安定" : "前半と後半で周期が変わった" },
    { code: "weak_autocorr", ok: f.autocorr_peak.accel >= 0.3 && f.autocorr_peak.gyro >= 0.3, text: f.autocorr_peak.accel >= 0.3 && f.autocorr_peak.gyro >= 0.3 ? "周期がはっきり出ている" : "周期がはっきり出ない" },
  ];
}

/** 生データのコミット（sha256）。サーバは生データを見ないので、端末での再検証に使う */
export async function motionRawHash(b: RawBuffer): Promise<string> {
  const arr = new Float32Array([...b.ax, ...b.ay, ...b.az, ...b.gx, ...b.gy, ...b.gz]);
  return sha256Hex(arr.buffer);
}

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return "sha256:" + [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
