/**
 * 振り子の周期を「二本の時計」で測る（端末内計算）。
 * 仕様: docs/verifier.md 1 章。生データはこのモジュールの外に出さない。
 *
 *  - 加速度: |a| は周期 T/2 で脈動する → 自己相関のラグ × 2
 *  - ジャイロ: 分散最大の軸が振り軸 → 自己相関のラグそのもの
 */

export type Permit = { sensors: ("accelerometer" | "gyroscope")[]; seconds: number };

export type RawBuffer = {
  t: number[];
  ax: number[]; ay: number[]; az: number[];
  gx: number[]; gy: number[]; gz: number[];
  interval: number | null;
};

export type PendulumFeatures = {
  profile: "pendulum_period";
  n_samples: number;
  duration_s: number;
  rate_hz: number;
  interval_median_ms: number;
  max_gap_ms: number;
  gaps: [number, number][];
  gap_total_ms: number;
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

export type CheckCode =
  | "low_rate" | "gap" | "saturation" | "no_signal" | "two_clocks_disagree" | "unstable" | "weak_autocorr" | "out_of_range";

export type LocalCheck = { code: CheckCode; ok: boolean; text: string };

const TOLERANCE_S = 0.05;

/* ---------- 許可 ---------- */

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

/* ---------- 収集 ---------- */

/** 許可した秒数だけ読み、終わったら必ずリスナーを外す。途中停止は返り値の stop() */
export function collect(permit: Permit, onTick?: (elapsedS: number, samples: number) => void): { done: Promise<RawBuffer>; stop: () => void } {
  const buf: RawBuffer = { t: [], ax: [], ay: [], az: [], gx: [], gy: [], gz: [], interval: null };
  const useAccel = permit.sensors.includes("accelerometer");
  const useGyro = permit.sensors.includes("gyroscope");
  const onMotion = (e: DeviceMotionEvent) => {
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
  window.addEventListener("devicemotion", onMotion);
  const ticker = window.setInterval(() => onTick?.(Math.min(permit.seconds, (performance.now() - t0) / 1000), buf.t.length), 200);
  const stopAll = () => {
    window.clearInterval(ticker);
    window.clearTimeout(timer);
    window.removeEventListener("devicemotion", onMotion);
    finish(buf);
  };
  const timer = window.setTimeout(stopAll, permit.seconds * 1000);
  return { done, stop: stopAll };
}

/* ---------- 数値処理 ---------- */

function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function mean(a: number[]): number {
  return a.reduce((s, v) => s + v, 0) / a.length;
}
function variance(a: number[]): number {
  const m = mean(a);
  return a.reduce((s, v) => s + (v - m) * (v - m), 0) / a.length;
}
function detrend(a: number[]): number[] {
  const n = a.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += a[i]; sxx += i * i; sxy += i * a[i]; }
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const c = (sy - b * sx) / n;
  return a.map((v, i) => v - (b * i + c));
}

/** 正規化自己相関の最初の極大（放物線補間つき）。見つからなければ tau = NaN */
export function firstAutocorrPeak(x: number[], dt: number, minLagS: number, maxLagS: number): { tau: number; r: number } {
  const n = x.length;
  let e0 = 0;
  for (const v of x) e0 += v * v;
  if (e0 === 0 || n < 8) return { tau: NaN, r: 0 };
  const kmin = Math.max(2, Math.round(minLagS / dt));
  const kmax = Math.min(n - 3, Math.round(maxLagS / dt));
  const r = new Float64Array(kmax + 2);
  for (let k = kmin - 1; k <= kmax + 1; k++) {
    let s = 0;
    for (let i = 0; i + k < n; i++) s += x[i] * x[i + k];
    r[k] = s / e0;
  }
  for (let k = kmin; k <= kmax; k++) {
    if (r[k] > 0.3 && r[k] >= r[k - 1] && r[k] > r[k + 1]) {
      const denom = 2 * (r[k - 1] - 2 * r[k] + r[k + 1]);
      const d = denom !== 0 ? (r[k - 1] - r[k + 1]) / denom : 0;
      return { tau: (k + d) * dt, r: r[k] };
    }
  }
  return { tau: NaN, r: 0 };
}

const r3 = (v: number) => +v.toFixed(3);

/** 生データ → 特徴量。docs/record-schema.md 4 章の送信スキーマと同じ形 */
export function analyze(b: RawBuffer): PendulumFeatures {
  const t = b.t;
  const n = t.length;
  const dts: number[] = [];
  for (let i = 1; i < n; i++) dts.push(t[i] - t[i - 1]);
  const dtm = median(dts);
  const dt = dtm / 1000;
  const gaps: [number, number][] = [];
  let gapTotal = 0;
  dts.forEach((d, i) => {
    if (d > 3 * dtm) { gaps.push([+((t[i] - t[0]) / 1000).toFixed(2), Math.round(d)]); gapTotal += d; }
  });
  const dur = (t[n - 1] - t[0]) / 1000;
  let s0 = 0;
  while (s0 < n && t[s0] - t[0] < 1000) s0++; // 承認タップの揺れを捨てる
  const norm: number[] = [];
  for (let i = s0; i < n; i++) norm.push(Math.hypot(b.ax[i], b.ay[i], b.az[i]));
  const gaxes = [b.gx.slice(s0), b.gy.slice(s0), b.gz.slice(s0)];
  const gv = gaxes.map(variance);
  const gi = gv.indexOf(Math.max(...gv));
  const gyro = gaxes[gi];
  const nd = detrend(norm), gd = detrend(gyro);
  const pa = firstAutocorrPeak(nd, dt, 0.1, 2.0), pg = firstAutocorrPeak(gd, dt, 0.2, 4.0);
  const half = Math.floor(nd.length / 2);
  const pa1 = firstAutocorrPeak(nd.slice(0, half), dt, 0.1, 2.0), pa2 = firstAutocorrPeak(nd.slice(half), dt, 0.1, 2.0);
  const pg1 = firstAutocorrPeak(gd.slice(0, half), dt, 0.2, 4.0), pg2 = firstAutocorrPeak(gd.slice(half), dt, 0.2, 4.0);
  let runs = 0, run = 1;
  for (let i = 1; i < norm.length; i++) {
    if (norm[i] === norm[i - 1]) { run++; if (run === 5) runs++; } else run = 1;
  }
  return {
    profile: "pendulum_period",
    n_samples: n,
    duration_s: +dur.toFixed(2),
    rate_hz: +((n - 1) / dur).toFixed(1),
    interval_median_ms: +dtm.toFixed(2),
    max_gap_ms: Math.round(Math.max(...dts)),
    gaps: gaps.slice(0, 10),
    gap_total_ms: Math.round(gapTotal),
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
    saturation_runs: runs,
    autocorr_peak: { accel: r3(pa.r), gyro: r3(pg.r) },
    device_interval_ms: b.interval,
  };
}

/** 端末側の速報検査。最終判断はサーバの Verifier（docs/verifier.md 2 章）で同じ閾値を使う */
export function localChecks(f: PendulumFeatures): LocalCheck[] {
  const d = Math.abs(f.T_accel_s - f.T_gyro_s);
  const u1 = Math.abs(f.T_accel_first_half_s - f.T_accel_second_half_s);
  const u2 = Math.abs(f.T_gyro_first_half_s - f.T_gyro_second_half_s);
  return [
    { code: "low_rate", ok: f.rate_hz >= 30, text: f.rate_hz >= 30 ? `欠測なし（${Math.round(f.rate_hz)} Hz で連続）` : `サンプリングが遅い（${f.rate_hz} Hz）` },
    { code: "gap", ok: f.max_gap_ms < 250 && f.gap_total_ms < 500, text: f.max_gap_ms < 250 ? "途切れなし" : `${(f.max_gap_ms / 1000).toFixed(1)} 秒の欠測` },
    { code: "saturation", ok: f.saturation_runs === 0 && f.accel_norm_peak_ms2 < 39, text: f.saturation_runs === 0 ? "飽和なし" : "飽和。振りが強すぎる" },
    { code: "no_signal", ok: f.accel_norm_std_ms2 >= 0.3 || f.gyro_std_dps >= 5, text: "信号あり" },
    { code: "two_clocks_disagree", ok: Number.isFinite(d) && d <= TOLERANCE_S, text: Number.isFinite(d) ? `二つのセンサーの周期が一致（差 ${d.toFixed(2)} s、許容 ${TOLERANCE_S.toFixed(2)} s）` : "周期がはっきりしません" },
    { code: "unstable", ok: u1 <= TOLERANCE_S && u2 <= TOLERANCE_S, text: "前半と後半で周期が安定" },
    { code: "weak_autocorr", ok: f.autocorr_peak.accel >= 0.3 && f.autocorr_peak.gyro >= 0.3, text: "周期がはっきり出ている" },
  ];
}

/** 生データのコミット（sha256）。サーバは生データを見ないので、端末での再検証に使う */
export async function rawHash(b: RawBuffer): Promise<string> {
  const arr = new Float32Array([...b.ax, ...b.ay, ...b.az, ...b.gx, ...b.gy, ...b.gz]);
  const digest = await crypto.subtle.digest("SHA-256", arr.buffer);
  return "sha256:" + [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
