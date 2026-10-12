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
/** 1/k の位置の山が、はじく前とこれ以内の大きさなら背景だけとみなす */
const UNCHANGED_DB = 1.5;
/** はじく前と大きさが同じでも背景だけと言えるのは、次のどちらかのとき。
 * (1) その背景がいちばん強い山より 41 dB 以上弱い。守りたい弱い基本（−34 dB まで）より 7 dB 以上弱い背景なら、
 *     基本がどんな位相で重なっても大きさが 1.5 dB より大きく変わる（|1 − 2.24| = 1.24 → +1.9 dB）
 * (2) 測定のあいだずっと大きさが変わらない（steady。音そのものは 10 dB 以上大きさが変わったのに）。はじいた音の
 *     基本は音と一緒に弱まるので、重なっていれば大きさが変わる。うなりは変わらない */
const UNCHANGED_BG_MAX_REL = 10 ** (-41 / 20);

/** はじく前から同じ大きさで鳴っている背景の山か（電源のうなり・続いている換気扇） */
function isUnchangedBackground(p: Peak, steady?: Uint8Array): boolean {
  if (!(p.bg > 0) || Math.abs(20 * Math.log10(p.mag / p.bg)) > UNCHANGED_DB) return false;
  if (steady && (steady[p.bin - 1] || steady[p.bin] || steady[p.bin + 1])) return true;
  return p.bg <= (p.mag / p.rel) * UNCHANGED_BG_MAX_REL;
}

// 弱い本当の基本が残りうる位置（推定の何倍か）と、そのときの本当の基本（推定の 1/m）。自己相関がいちばん強い倍音の
// 2 周期・3 周期を取ると 2/3・3/4 にも残る
const SUB_POSITIONS: readonly { r: number; m: number }[] = [
  { r: 1 / 2, m: 2 }, { r: 1 / 3, m: 3 }, { r: 2 / 3, m: 3 }, { r: 1 / 4, m: 4 }, { r: 3 / 4, m: 4 },
];
/** 本当の基本がこれより低くなる位置は調べない。80 Hz の少し下（70 Hz など）の音を 2 倍で読むのは防ぎ、
 * 50 Hz の電源のうなりや、140 Hz の音の 3/4（本当の基本なら 35 Hz）のような、音の高さとしてありえない位置で保留しない */
const SUB_MIN_TRUE_HZ = 60;
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
  /** 山の帯域の番号 */
  bin: number;
}

/** 窓をかけたフレームの振幅スペクトル（背景の平均を作るのにも使う） */
export function windowedSpectrum(windowed: Float64Array): Float64Array {
  return magnitudeSpectrum(windowed);
}

export function spectralPeaks(windowed: Float64Array, sampleRate: number, maxHz: number, rel = PEAK_REL, background?: Float64Array): Peak[] {
  return peaksOf(magnitudeSpectrum(windowed), sampleRate / windowed.length, maxHz, rel, background);
}

function peaksOf(mag: Float64Array, bin: number, maxHz: number, rel: number, background?: Float64Array, of: Float64Array = mag): Peak[] {
  const top = topOf(mag);
  const floor = top * rel;
  const peaks: Peak[] = [];
  const kmax = Math.min(of.length - 2, Math.floor(maxHz / bin));
  for (let k = Math.max(1, Math.floor(MIN_PEAK_HZ / bin)); k <= kmax; k++) {
    if (of[k] < floor || of[k] < of[k - 1] || of[k] < of[k + 1]) continue;
    // 対数の放物線で山の位置を補間
    const a = Math.log(of[k - 1] + 1e-12), b = Math.log(of[k] + 1e-12), c = Math.log(of[k + 1] + 1e-12);
    const d = a - 2 * b + c;
    const off = d !== 0 ? (0.5 * (a - c)) / d : 0;
    const freq = (k + off) * bin;
    if (freq < MIN_PEAK_HZ) continue;
    const bg = background ? Math.max(background[k - 1] ?? 0, background[k] ?? 0, background[k + 1] ?? 0) : 0;
    peaks.push({ freq, mag: mag[k], rel: mag[k] / top, bg, bin: k });
  }
  return peaks;
}

/** f0 の整数倍で、入っている成分の山が説明できるか。
 * (a) 強い山（−24 dB 以上）はすべて f0 の整数倍の近く（和音・隣の音・倍音の取り違えで強く残った基本はここで落ちる）
 * (b) 弱い山（−38 dB 以上）は、f0 の 1/2・1/3・2/3・1/4・3/4、または 1/k（k はいくつでも）の位置に無い（弱い本当の基本）
 * (c) f0 の高さそのものに山がある（4:3 の和音は 1/3 の高さの 3・4 倍音に見えるが、その高さには音が無い）
 * 音を出す前からあった山（背景）は数えない。背景を周波数で決め打ちして除くと、100 Hz の本物の弱い基本まで消えた（10/12 レビュー 5 回目） */
export function explainsSpectrum(windowed: Float64Array, sampleRate: number, f0: number, background?: Float64Array, steady?: Uint8Array): boolean {
  if (!Number.isFinite(f0) || f0 <= 0) return false;
  const maxHz = Math.min(sampleRate / 2 - 1, Math.max(8.5 * f0, 2500));
  const mag = magnitudeSpectrum(windowed);
  const bin = sampleRate / windowed.length;
  const all = peaksOf(mag, bin, maxHz, SUB_PEAK_REL, background);
  // 推定の 1/k などの位置にある山は、背景（音を出す前からあった音）でも数える。同じ高さの背景と本物の弱い基本は
  // 大きさだけでは見分けられないので、決められないときは結論を出さない（10/12 デプロイ前レビュー 6 回目）。
  // 背景の山が音を出したあとに消えた（逆の位相の弱い基本で打ち消された）ときも同じ。背景の山の位置も調べる
  const bgPeaks = background ? peaksOf(mag, bin, f0 * 0.97, SUB_PEAK_REL, background, background) : [];
  for (const p of [...all, ...bgPeaks]) {
    if (p.freq >= f0 * 0.97) continue;
    // はじく前と大きさが変わっていない背景の山は数えない（下の isUnchangedBackground）
    if (isUnchangedBackground(p, steady)) continue;
    if (SUB_POSITIONS.some(({ r, m }) => f0 / m >= SUB_MIN_TRUE_HZ && Math.abs(p.freq - f0 * r) <= Math.max(SUB_TOL_REL * p.freq, HARMONIC_TOL_HZ))) return false;
    const k = Math.round(f0 / p.freq);
    if (k >= 2 && f0 / k >= SUB_MIN_TRUE_HZ && Math.abs(p.freq - f0 / k) <= Math.max(INT_SUB_TOL_REL * p.freq, INT_SUB_TOL_HZ)) return false;
  }
  // それ以外の位置の背景の山は数えない（音を出す前から鳴っていた声・うなり）
  const peaks = all.filter((p) => p.mag > p.bg * BACKGROUND_MARGIN);
  if (!peaks.some((p) => Math.abs(p.freq - f0) <= Math.max(HARMONIC_TOL_REL * f0, HARMONIC_TOL_HZ))) return false;
  for (const p of peaks) {
    if (p.rel < PEAK_REL) continue; // 弱い山は 1/k の位置だけを見る（上）
    const k = Math.round(p.freq / f0);
    if (k < 1 || Math.abs(p.freq - k * f0) > Math.max(HARMONIC_TOL_REL * p.freq, HARMONIC_TOL_HZ)) return false;
  }
  return true;
}

/** 測定のあいだ大きさが変わらなかった帯域（はじく前の背景から ±1 dB）。はじいた瞬間の「パチッ」は全部の帯域を
 * 一瞬だけ持ち上げるので、前のフレームより 3 dB 以上大きくなったフレーム（はじいた瞬間）だけは見ない。それ以外は
 * 全フレームで変わらないこと（8 割などにすると、はじいた直後だけ大きい弱い基本が隠れた）。
 * 音そのものの大きさが 10 dB 以上変わったときだけ作る（変わらない音では、同じ高さの背景と弱い基本を時間でも
 * 見分けられない）。作れなければ undefined */
const STEADY_DB = 1;
const ONSET_DB = 3;
const NOTE_VARIATION_DB = 10;
export function steadyBins(background: Float64Array | undefined, spectra: Float64Array[]): Uint8Array | undefined {
  if (!background || spectra.length < 2) return undefined;
  const tops = spectra.map(topOf);
  const lo = Math.min(...tops), hi = Math.max(...tops);
  if (!(lo > 0) || 20 * Math.log10(hi / lo) < NOTE_VARIATION_DB) return undefined;
  const settled = spectra.filter((_, j) => j === 0 || tops[j] < tops[j - 1] * 10 ** (ONSET_DB / 20));
  const out = new Uint8Array(background.length);
  for (let k = 1; k < out.length; k++) {
    if (!(background[k] > 0)) continue;
    out[k] = settled.every((m) => Math.abs(20 * Math.log10((m[k] + 1e-12) / background[k])) <= STEADY_DB) ? 1 : 0;
  }
  return out;
}

function topOf(mag: Float64Array): number {
  let top = 0;
  for (let k = 1; k < mag.length; k++) top = Math.max(top, mag[k]);
  return top;
}
