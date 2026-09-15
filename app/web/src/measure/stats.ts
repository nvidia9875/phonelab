/** 端末内計算で共通に使う数値処理（副作用なし） */

export function median(a: readonly number[]): number {
  if (a.length === 0) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function mean(a: ArrayLike<number>): number {
  if (a.length === 0) return NaN;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s / a.length;
}

export function variance(a: ArrayLike<number>): number {
  if (a.length === 0) return NaN;
  const m = mean(a);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m);
  return s / a.length;
}

export function detrend(a: readonly number[]): number[] {
  const n = a.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += a[i]; sxx += i * i; sxy += i * a[i]; }
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const c = (sy - b * sx) / n;
  return a.map((v, i) => v - (b * i + c));
}

/** 正規化自己相関の最初の極大（放物線補間つき）。見つからなければ tau = NaN */
export function firstAutocorrPeak(x: ArrayLike<number>, dt: number, minLagS: number, maxLagS: number, threshold = 0.3): { tau: number; r: number } {
  const n = x.length;
  let e0 = 0;
  for (let i = 0; i < n; i++) e0 += x[i] * x[i];
  if (e0 === 0 || n < 8) return { tau: NaN, r: 0 };
  const kmin = Math.max(2, Math.round(minLagS / dt));
  const kmax = Math.min(n - 3, Math.round(maxLagS / dt));
  const at = (k: number): number => {
    let s = 0;
    for (let i = 0; i + k < n; i++) s += x[i] * x[i + k];
    return s / e0;
  };
  let prev = at(kmin - 1);
  let cur = at(kmin);
  for (let k = kmin; k <= kmax; k++) {
    const next = at(k + 1);
    if (cur > threshold && cur >= prev && cur > next) {
      const denom = 2 * (prev - 2 * cur + next);
      const d = denom !== 0 ? (prev - next) / denom : 0;
      return { tau: (k + d) * dt, r: cur };
    }
    prev = cur;
    cur = next;
  }
  return { tau: NaN, r: 0 };
}

export interface SamplingStats {
  n_samples: number;
  duration_s: number;
  rate_hz: number;
  interval_median_ms: number;
  max_gap_ms: number;
  gaps: [number, number][];
  gap_total_ms: number;
}

export function medianIntervalMs(t: readonly number[]): number {
  const dts: number[] = [];
  for (let i = 1; i < t.length; i++) dts.push(t[i] - t[i - 1]);
  return median(dts);
}

/** サンプリングの記録（docs/verifier.md 1.1） */
export function samplingStats(t: readonly number[]): SamplingStats {
  const n = t.length;
  const dts: number[] = [];
  for (let i = 1; i < n; i++) dts.push(t[i] - t[i - 1]);
  const dtm = median(dts);
  const gaps: [number, number][] = [];
  let gapTotal = 0;
  dts.forEach((d, i) => {
    if (d > 3 * dtm) {
      gaps.push([+((t[i] - t[0]) / 1000).toFixed(2), Math.round(d)]);
      gapTotal += d;
    }
  });
  const dur = n > 1 ? (t[n - 1] - t[0]) / 1000 : 0;
  return {
    n_samples: n,
    duration_s: +dur.toFixed(2),
    rate_hz: dur > 0 ? +((n - 1) / dur).toFixed(1) : 0,
    interval_median_ms: +dtm.toFixed(2),
    max_gap_ms: dts.length ? Math.round(Math.max(...dts)) : 0,
    gaps: gaps.slice(0, 10),
    gap_total_ms: Math.round(gapTotal),
  };
}

/** 同じ値が 5 サンプル以上続いた回数（飽和・クリップ） */
export function saturationRuns(a: readonly number[]): number {
  let runs = 0, run = 1;
  for (let i = 1; i < a.length; i++) {
    if (a[i] === a[i - 1]) {
      run++;
      if (run === 5) runs++;
    } else run = 1;
  }
  return runs;
}

export const r3 = (v: number): number => +v.toFixed(3);
