/**
 * 調和性の検査（10/12 Codex のデプロイ前レビュー 4 回目）。
 *
 * 推定した基本の高さ f0 で、音に入っている成分の山がすべて説明できるか（どの山も f0 の整数倍の近くにあるか）を見る。
 * 説明できない山があれば、f0 を倍音と取り違えている（本当の基本が下に残っている）か、別の音が混ざっている（和音・
 * 隣の班の音）。どちらも、ひとつの音の高さとして結論を出してはいけないので、値を出さない（保留にする）。
 * 1/2・1/3… と調べる位置を足していく直し方は、第 10 倍音や和音ですり抜けた。この検査は何倍音でも、和音でも同じに効く。
 */

/** 長さが 2 の累乗の実数列の振幅スペクトル（0 〜 n/2） */
export function magnitudeSpectrum(x: Float64Array): Float64Array {
  const n = x.length;
  const re = Float64Array.from(x);
  const im = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar;
        im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar;
        im[i + k] += ai;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
  const mag = new Float64Array(n / 2 + 1);
  for (let k = 0; k <= n / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
  return mag;
}

/** 山の高さの既定の下限（約 −24 dB） */
const PEAK_REL = 10 ** (-24 / 20);
/** これより低い山は見ない */
const MIN_PEAK_HZ = 40;
/** 整数倍とみなす幅（相対）と、最小の幅（周波数の分解能 11.7 Hz を補間した精度） */
const HARMONIC_TOL_REL = 0.015;
const HARMONIC_TOL_HZ = 4;
/** 調べる山の高さの下限（約 −38 dB。弱い基本や混ざった音も拾い、教室ほどの雑音の 1 帯域 −45 dB 前後は拾わない） */
const SUB_PEAK_REL = 10 ** (-38 / 20);
/** 音を出す前（最初の 0.5 秒）からその高さで鳴っていた山は、背景の音（電源のうなり・続いている声）として数えない。
 * 背景より 6 dB 以上大きくなった山だけを、測っている音の一部とみなす */
const BACKGROUND_MARGIN = 10 ** (6 / 20);
// 弱い本当の基本が残りうる位置（推定の何倍か）。自己相関がいちばん強い倍音の 2 周期・3 周期を取ると 2/3・3/4 にも残る
const SUB_POSITIONS = [1 / 2, 1 / 3, 2 / 3, 1 / 4, 3 / 4];
/** 弱い山の位置の許容（倍音が少しずれた音でも拾えるように、強い山より広く） */
const SUB_TOL_REL = 0.03;
/** 1/k（k は大きくてよい）の位置の許容。k が大きいと位置が密になるので狭く */
const INT_SUB_TOL_REL = 0.006;
const INT_SUB_TOL_HZ = 1;

export interface Peak {
  freq: number;
  mag: number;
  rel: number;
  /** 背景（音を出す前）の同じ高さの大きさ */
  bg: number;
}

/** 窓をかけたフレームの振幅スペクトル（背景の平均を作るのにも使う） */
export function windowedSpectrum(windowed: Float64Array): Float64Array {
  return magnitudeSpectrum(windowed);
}

export function spectralPeaks(windowed: Float64Array, sampleRate: number, maxHz: number, rel = PEAK_REL, background?: Float64Array): Peak[] {
  const mag = magnitudeSpectrum(windowed);
  const bin = sampleRate / windowed.length;
  let top = 0;
  for (let k = 1; k < mag.length; k++) top = Math.max(top, mag[k]);
  const floor = top * rel;
  const peaks: Peak[] = [];
  const kmax = Math.min(mag.length - 2, Math.floor(maxHz / bin));
  for (let k = Math.max(1, Math.floor(MIN_PEAK_HZ / bin)); k <= kmax; k++) {
    if (mag[k] < floor || mag[k] < mag[k - 1] || mag[k] < mag[k + 1]) continue;
    // 対数の放物線で山の位置を補間
    const a = Math.log(mag[k - 1] + 1e-12), b = Math.log(mag[k] + 1e-12), c = Math.log(mag[k + 1] + 1e-12);
    const d = a - 2 * b + c;
    const off = d !== 0 ? (0.5 * (a - c)) / d : 0;
    const freq = (k + off) * bin;
    if (freq < MIN_PEAK_HZ) continue;
    const bg = background ? Math.max(background[k - 1] ?? 0, background[k] ?? 0, background[k + 1] ?? 0) : 0;
    peaks.push({ freq, mag: mag[k], rel: mag[k] / top, bg });
  }
  return peaks;
}

/** f0 の整数倍で、入っている成分の山が説明できるか。
 * (a) 強い山（−24 dB 以上）はすべて f0 の整数倍の近く（和音・隣の音・倍音の取り違えで強く残った基本はここで落ちる）
 * (b) 弱い山（−38 dB 以上）は、f0 の 1/2・1/3・2/3・1/4・3/4、または 1/k（k はいくつでも）の位置に無い（弱い本当の基本）
 * (c) f0 の高さそのものに山がある（4:3 の和音は 1/3 の高さの 3・4 倍音に見えるが、その高さには音が無い）
 * 音を出す前からあった山（背景）は数えない。背景を周波数で決め打ちして除くと、100 Hz の本物の弱い基本まで消えた（10/12 レビュー 5 回目） */
export function explainsSpectrum(windowed: Float64Array, sampleRate: number, f0: number, background?: Float64Array): boolean {
  if (!Number.isFinite(f0) || f0 <= 0) return false;
  const maxHz = Math.min(sampleRate / 2 - 1, Math.max(8.5 * f0, 2500));
  const peaks = spectralPeaks(windowed, sampleRate, maxHz, SUB_PEAK_REL, background).filter((p) => p.mag > p.bg * BACKGROUND_MARGIN);
  if (!peaks.some((p) => Math.abs(p.freq - f0) <= Math.max(HARMONIC_TOL_REL * f0, HARMONIC_TOL_HZ))) return false;
  for (const p of peaks) {
    if (p.rel >= PEAK_REL) {
      const k = Math.round(p.freq / f0);
      if (k < 1 || Math.abs(p.freq - k * f0) > Math.max(HARMONIC_TOL_REL * p.freq, HARMONIC_TOL_HZ)) return false;
      continue;
    }
    if (p.freq >= f0 * 0.97) continue; // 基本より上の弱い山は、倍音のずれや背景として許す
    if (SUB_POSITIONS.some((r) => Math.abs(p.freq - f0 * r) <= Math.max(SUB_TOL_REL * p.freq, HARMONIC_TOL_HZ))) return false;
    const k = Math.round(f0 / p.freq);
    if (k >= 2 && Math.abs(p.freq - f0 / k) <= Math.max(INT_SUB_TOL_REL * p.freq, INT_SUB_TOL_HZ)) return false;
  }
  return true;
}
