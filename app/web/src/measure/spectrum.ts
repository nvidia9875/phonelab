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
/** これより低い山は見ない（電源の 50/60 Hz のうなりは弱ければ無視） */
const MIN_PEAK_HZ = 40;
/** 整数倍とみなす幅（相対）と、最小の幅（周波数の分解能 11.7 Hz を補間した精度） */
const HARMONIC_TOL_REL = 0.015;
const HARMONIC_TOL_HZ = 4;
/** 電源のうなり（50/60 Hz とその倍）の近くの弱い山は数えない */
const MAINS = [50, 60];
const MAINS_TOL_HZ = 2;
// うなりらしい弱い山（−30 dB より下）だけ除く。広くすると 100・120・150 Hz の本物の弱い基本まで見逃した
const MAINS_MAX_REL = 10 ** (-30 / 20);

export interface Peak {
  freq: number;
  mag: number;
}

/** 調べる山の高さの下限（約 −38 dB。弱い基本や混ざった音も拾い、教室ほどの雑音の 1 帯域 −45 dB 前後は拾わない） */
const SUB_PEAK_REL = 10 ** (-38 / 20);

export function spectralPeaks(windowed: Float64Array, sampleRate: number, maxHz: number, rel = PEAK_REL): Peak[] {
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
    peaks.push({ freq, mag: mag[k] });
  }
  return peaks.map((p) => ({ ...p, rel: p.mag / top })) as Peak[];
}

function nearMains(freq: number): boolean {
  return MAINS.some((m) => {
    const k = Math.round(freq / m);
    return k >= 1 && k <= 6 && Math.abs(freq - k * m) <= MAINS_TOL_HZ;
  });
}

// 弱い本当の基本が残りうる位置（推定の何倍か）。自己相関がいちばん強い倍音の 2 周期・3 周期を取ると 2/3・3/4 にも残る
const SUB_POSITIONS = [1 / 2, 1 / 3, 2 / 3, 1 / 4, 3 / 4, 1 / 5, 1 / 6, 1 / 7, 1 / 8];
/** 弱い山の位置の許容（倍音が少しずれた音でも拾えるように、強い山より広く） */
const SUB_TOL_REL = 0.03;

/** f0 の整数倍で、入っている成分の山が説明できるか。
 * (a) 強い山（−24 dB 以上）はすべて f0 の整数倍の近くになければならない。和音・隣の音・倍音を基本と取り違えて
 *     本当の基本が強く残っている場合は、ここで落ちる
 * (b) 弱い山（−38 dB 以上）は、f0 の 1/2〜1/8 の位置にあるときだけ取り違えとみなす（弱い本当の基本）。
 *     弱い山をすべて倍音にそろえよ、とすると、教室のざわめき・声・電源のうなり（−25 dB 程度）で輪ゴムの音まで
 *     保留になった（10/12）。背景の音は、たいてい f0 の 1/k とは無関係な位置にある
 * 電源のうなり（50/60 Hz の倍）の近くの弱い山（−30 dB より下）は数えない */
export function explainsSpectrum(windowed: Float64Array, sampleRate: number, f0: number): boolean {
  if (!Number.isFinite(f0) || f0 <= 0) return false;
  const maxHz = Math.min(sampleRate / 2 - 1, Math.max(8.5 * f0, 2500));
  const peaks = spectralPeaks(windowed, sampleRate, maxHz, SUB_PEAK_REL) as (Peak & { rel: number })[];
  // 基本の高さそのものに音が無ければ、和音（4:3 の 2 音は 1/3 の高さの 3・4 倍音に見える）か倍音だけの信号。結論を出さない
  if (!peaks.some((p) => Math.abs(p.freq - f0) <= Math.max(HARMONIC_TOL_REL * f0, HARMONIC_TOL_HZ))) return false;
  for (const p of peaks) {
    if (p.rel < MAINS_MAX_REL && nearMains(p.freq)) continue;
    const tol = Math.max(HARMONIC_TOL_REL * p.freq, HARMONIC_TOL_HZ);
    if (p.rel >= PEAK_REL) {
      const k = Math.round(p.freq / f0);
      if (k < 1 || Math.abs(p.freq - k * f0) > tol) return false;
    } else if (SUB_POSITIONS.some((r) => Math.abs(p.freq - f0 * r) <= Math.max(SUB_TOL_REL * p.freq, HARMONIC_TOL_HZ))) {
      return false;
    }
  }
  return true;
}
