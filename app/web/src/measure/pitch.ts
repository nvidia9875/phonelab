/**
 * 音の高さ（基本周波数）を「二本の時計」で測る（中 1 音の性質）。
 * 仕様: docs/verifier.md 1.4 / 2.3。時間領域データはこのモジュールの外に出さない。
 *
 *  - 自己相関の最初のピーク → f0
 *  - 第 2 倍音（f0 の 1.8〜2.2 倍で最も強いところ）÷ 2
 */
import type { LocalCheck } from "./checks";
import { sha256Hex } from "./pendulum";
import { firstAutocorrPeak, mean, median } from "./stats";
import { explainsSpectrum, steadyBins, windowedSpectrum } from "./spectrum";

export const FFT_SIZE = 4096;
const FRAME_MS = 100;
const QUIET_MS = 500;
const VOICED_ABOVE_NOISE_DB = 10;
const MIN_HZ = 80;
const MAX_HZ = 2000;
const AUTOCORR_THRESHOLD = 0.5;
/** 2 倍の周期の繰り返しが、これだけはっきりしていたら 1 オクターブ下を基本とする */
const OCTAVE_MARGIN = 0.1;
const HARMONIC_STEPS = 160;
/** 第 2 倍音の強さが基本のこれ未満なら、倍音は無いとみなす（約 −25 dB） */
const MIN_HARMONIC_RATIO = 0.003;
const CLIP_LEVEL = 0.99;
const MIN_VOICED_FRAMES = 5;
const MIN_SNR_DB = 10;
const MAX_CLIPPING = 0.01;

export interface PitchFrame {
  t: number;
  data: Float32Array;
}

export interface PitchBuffer {
  sampleRate: number;
  frames: PitchFrame[];
}

export type PitchFeatures = {
  profile: "pitch";
  n_frames: number;
  duration_s: number;
  sample_rate: number;
  f0_hz: number;
  f0_from_h2_hz: number;
  rms_db: number;
  noise_db: number;
  snr_db: number;
  clipping_ratio: number;
  voiced_frames: number;
  /** 高さが出たフレームのうち、全体の中央値から STEADY_PITCH_REL 以内だったものの割合 */
  f0_steady_share: number;
  /** 基本の高さの音の大きさの幅 ÷ 第 2 倍音の大きさの幅（はじいた瞬間を除く）。0 に近いと、音と関係なく鳴り続けて
   * いる別の音。決められないときは NaN */
  f0_follow: number;
  /** 基本の高さの音の大きさの幅（dB）。決められないときは NaN */
  f0_follow_db: number;
  /** いちばん大きい 4 フレームで、第 2〜8 倍音のいちばん強いものが基本よりどれだけ大きいか（dB の中央値）。
   * 決められないときは NaN */
  harmonic_over_f0_db: number;
  /** 1 オクターブ下に直す前の、自己相関の最初のピークそのままの高さの中央値（10/9 の版が答える値） */
  raw_f0_hz: number;
};

const r1 = (v: number): number => +v.toFixed(1);

function levelDb(data: Float32Array): number {
  let s = 0;
  for (let i = 0; i < data.length; i++) s += data[i] * data[i];
  return 20 * Math.log10(Math.sqrt(s / data.length) + 1e-12);
}

/** 自己相関の最初のピークから基本周波数。見つからなければ NaN。
 * 基本の音が弱く第 2 倍音が強いと、最初のピークは半分の周期（1 オクターブ上）に出る。2 倍の周期のほうが
 * はっきり繰り返していれば、そちらを基本とする（10/12 合成ベンチマークで、1 オクターブ上を答えて検査も通っていた） */
export function f0Autocorr(data: Float32Array, sampleRate: number): number {
  return autocorrPitch(data, sampleRate).f0;
}

/** f0Autocorr の中身。raw は 1 オクターブ下に直す前の、自己相関の最初のピークそのままの高さ（10/9 の版の読み方） */
function autocorrPitch(data: Float32Array, sampleRate: number): { f0: number; raw: number } {
  const m = mean(data);
  const x = Array.from(data, (v) => v - m);
  const { tau, r } = firstAutocorrPeak(x, 1 / sampleRate, 1 / MAX_HZ, 1 / MIN_HZ, AUTOCORR_THRESHOLD);
  if (!(Number.isFinite(tau) && tau > 0)) return { f0: NaN, raw: NaN };
  const lag = Math.round(2 * tau * sampleRate);
  if (lag >= x.length / 2 || autocorrAt(x, lag) <= r + OCTAVE_MARGIN) return { f0: 1 / tau, raw: 1 / tau };
  // 1 オクターブ下が基本。ただし測れる下限より低ければ、どちらか決められないので値を出さない（保留にする）。
  // 下限の手前で片方の条件だけ補正されると、比べた向きが逆になった（10/12 Codex のデプロイ前レビュー）
  const lower = 1 / (2 * tau);
  return { f0: lower >= MIN_HZ ? lower : NaN, raw: 1 / tau };
}

function autocorrAt(x: readonly number[], k: number): number {
  let e0 = 0;
  let s = 0;
  for (let i = 0; i < x.length; i++) e0 += x[i] * x[i];
  for (let i = 0; i + k < x.length; i++) s += x[i] * x[i + k];
  return e0 > 0 ? s / e0 : 0;
}

/** 二つ目の測り方: f0 の 1.8〜2.2 倍で最も強い周波数（Goertzel 法で走査）の半分。
 * 倍音がほとんど無い音（ペットボトルの音のような純音に近い音）では、倍音の位置の雑音を拾って一致しなくなるので、
 * f0 の 0.9〜1.1 倍の周波数の山（周波数の側から見た基本）を使う。自己相関とは別の計算（10/12 Codex のデプロイ前レビュー） */
export function f0FromSecondHarmonic(data: Float32Array, sampleRate: number, f0: number, background?: Float64Array, steady?: Uint8Array): number {
  if (!Number.isFinite(f0)) return NaN;
  const n = data.length;
  const windowed = new Float64Array(n);
  for (let i = 0; i < n; i++) windowed[i] = data[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  const hi = Math.min(2.2 * f0, sampleRate / 2 - 1);
  if (hi <= 1.8 * f0) return NaN;
  // 入っている成分の山が f0 の整数倍で説明できなければ、倍音の取り違えか和音。値を出さない（10/12 デプロイ前レビュー 4 回目）
  if (!explainsSpectrum(windowed, sampleRate, f0, background, steady)) return NaN;
  const harmonic = goertzelPeak(windowed, sampleRate, 1.8 * f0, hi);
  const fundamental = goertzelPeak(windowed, sampleRate, 0.9 * f0, 1.1 * f0);
  if (harmonic.power < MIN_HARMONIC_RATIO * fundamental.power) return fundamental.freq;
  return harmonic.freq / 2;
}

function hann(data: Float32Array): Float64Array {
  const n = data.length;
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = data[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  return w;
}

/** 静かな区間のフレームの振幅スペクトルの、帯域ごとの中央値。一瞬だけ入った音（静かな区間に一度はじいた等）は
 * 背景にしない（平均だと残って、本物の音まで背景とみなして保留が増えた。10/12 デプロイ前レビュー 6 回目）。
 * フレームが無ければ undefined（背景を数えない） */
function backgroundSpectrum(quiet: Float32Array[]): Float64Array | undefined {
  if (!quiet.length) return undefined;
  const spectra = quiet.map((d) => windowedSpectrum(hann(d)));
  const out = new Float64Array(spectra[0].length);
  for (let k = 0; k < out.length; k++) out[k] = median(spectra.map((m) => m[k]));
  return out;
}

function goertzelPeak(windowed: Float64Array, sampleRate: number, lo: number, hi: number): { freq: number; power: number } {
  const n = windowed.length;
  const power = new Float64Array(HARMONIC_STEPS + 1);
  for (let step = 0; step <= HARMONIC_STEPS; step++) {
    const w = (2 * Math.PI * (lo + ((hi - lo) * step) / HARMONIC_STEPS)) / sampleRate;
    const coeff = 2 * Math.cos(w);
    let s1 = 0, s2 = 0;
    for (let i = 0; i < n; i++) {
      const s = windowed[i] + coeff * s1 - s2;
      s2 = s1;
      s1 = s;
    }
    power[step] = s1 * s1 + s2 * s2 - coeff * s1 * s2;
  }
  let best = 0;
  for (let step = 1; step <= HARMONIC_STEPS; step++) if (power[step] > power[best]) best = step;
  let offset = 0;
  if (best > 0 && best < HARMONIC_STEPS) {
    const a = power[best - 1], b = power[best], c = power[best + 1];
    const denom = a - 2 * b + c;
    offset = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
  }
  return { freq: lo + (best + offset) * ((hi - lo) / HARMONIC_STEPS), power: power[best] };
}

export function analyzePitch(b: PitchBuffer): PitchFeatures {
  const frames = b.frames;
  const t0 = frames.length ? frames[0].t : 0;
  const levels = frames.map((f) => levelDb(f.data));
  // マイクを開いた直後の、値が全部 0 のフレーム（iOS で出ることがある）は、雑音の大きさにも背景にも使わない。
  // 使うと雑音が −240 dB、背景が 0 になり、雑音の検査が意味を失い、うなりのある部屋で全部保留になった（10/12 独立レビュー）
  const live = frames.map((f) => f.data.some((v) => v !== 0));
  const isQuiet = (i: number) => frames[i].t - t0 < QUIET_MS && live[i];
  const quiet = levels.filter((_, i) => isQuiet(i));
  const liveLevels = levels.filter((_, i) => live[i]);
  const noise = quiet.length ? median(quiet) : liveLevels.length ? Math.min(...liveLevels) : -120;
  const voiced = frames.map((_, i) => i).filter((i) => frames[i].t - t0 >= QUIET_MS && levels[i] >= noise + VOICED_ABOVE_NOISE_DB);
  // 音を出す前（最初の 0.5 秒）の周波数の形を背景として覚える（電源のうなり・続いている声）
  const background = backgroundSpectrum(frames.filter((_, i) => isQuiet(i)).map((f) => f.data));
  // 測定のあいだずっと大きさが変わらない帯域（うなり）。はじいた音の弱い基本は、音と一緒に大きさが変わる
  const spectra = voiced.map((i) => windowedSpectrum(hann(frames[i].data)));
  const steady = steadyBins(background, spectra);

  const f0s: number[] = [];
  const fromH2: number[] = [];
  const near: { f0: number; spectrum: Float64Array }[] = [];
  const raws: number[] = [];
  let clipped = 0;
  let total = 0;
  voiced.forEach((i, n) => {
    const data = frames[i].data;
    const { f0, raw } = autocorrPitch(data, b.sampleRate);
    if (Number.isFinite(raw)) raws.push(raw);
    if (Number.isFinite(f0)) {
      f0s.push(f0);
      near.push({ f0, spectrum: spectra[n] });
      const h = f0FromSecondHarmonic(data, b.sampleRate, f0, background, steady);
      if (Number.isFinite(h)) fromH2.push(h);
    }
    for (let k = 0; k < data.length; k++) if (Math.abs(data[k]) >= CLIP_LEVEL) clipped++;
    total += data.length;
  });
  const rms = voiced.length ? median(voiced.map((i) => levels[i])) : noise;
  const last = frames.length ? frames[frames.length - 1].t : t0;

  return {
    profile: "pitch",
    n_frames: frames.length,
    duration_s: +((last - t0 + FRAME_MS) / 1000).toFixed(2),
    sample_rate: b.sampleRate,
    f0_hz: r1(median(f0s)),
    // 二つ目の値が出たフレームが半分に届かなければ、音全体として決められない（保留）。
    // 少数のフレームだけで一致を見ると、倍音の取り違えや和音がたまたま通っていた（10/12 デプロイ前レビュー 4 回目）
    f0_from_h2_hz: fromH2.length * 2 >= f0s.length ? r1(median(fromH2)) : NaN,
    rms_db: r1(rms),
    noise_db: r1(noise),
    snr_db: r1(rms - noise),
    clipping_ratio: total ? +(clipped / total).toFixed(4) : 0,
    voiced_frames: f0s.length,
    f0_steady_share: steadyShare(f0s),
    ...followFeatures(fundamentalFollow(near, b.sampleRate, median(f0s))),
    harmonic_over_f0_db: harmonicOverF0(near, b.sampleRate, median(f0s)),
    raw_f0_hz: r1(median(raws)),
  };
}

/** フレームごとの高さが、全体の中央値から 6% 以内にそろっている割合。途中から別の続く音（1 オクターブ下など）が
 * 鳴り始めると、音が弱まったフレームだけその音の高さになる。中央値だけを見ると、その切り替わりが隠れて別の音の
 * 高さで通っていた（10/12 デプロイ前レビュー 7 回目） */
const STEADY_PITCH_REL = 0.06;
/** これより少ない割合しかそろっていなければ保留（ふつうの音は 0.97 以上、途中から別の音が入ると 0.6 前後） */
const MIN_STEADY_SHARE = 0.85;
function steadyShare(f0s: number[]): number {
  if (!f0s.length) return 0;
  const m = median(f0s);
  return +(f0s.filter((f) => Math.abs(f - m) <= STEADY_PITCH_REL * m).length / f0s.length).toFixed(3);
}

/** 基本の高さの音は本当に同じ音の基本か。本物の基本ははじくたびに鳴り直して、音と一緒に大きさが変わる。途中から
 * 鳴り始めた別の続く音（1 オクターブ下）は、はじいても大きさが変わらない。その音の高さで測ると、300 Hz の音を
 * 150 Hz と測って結論が逆になった（10/12 デプロイ前レビュー 7・8 回目）。
 * 第 2 倍音の大きさの幅（はじいた瞬間のフレームを除く）に対する、基本の大きさの幅の比を返す。0 に近いほど、
 * 基本の高さの音は音と関係なく鳴り続けている。第 2 倍音が基本より 30 dB 以上弱い（倍音の無い音）か、第 2 倍音の
 * 大きさが 4 dB も変わらない（弱まらない音）ときは決められないので NaN（この検査では止めない）。
 * 傾き（回帰）は、ゆっくり弱まる音で前のはじきと次のはじきが打ち消し合って大きくぶれたので使わない */
const FOLLOW_RANGE_DB = 4;
const FOLLOW_MIN_DB = 2;
const FOLLOW_MIN_RATIO = 0.15;
const FOLLOW_H2_MIN_DB = -30;
const ONSET_RISE_DB = 3;
function fundamentalFollow(frames: { f0: number; spectrum: Float64Array }[], sampleRate: number, f0: number): { ratio: number; db: number } {
  const none = { ratio: NaN, db: NaN };
  const bin = sampleRate / FFT_SIZE;
  const at = (m: Float64Array, hz: number) => {
    const k = Math.round(hz / bin);
    return 20 * Math.log10(Math.max(m[k - 1] ?? 0, m[k] ?? 0, m[k + 1] ?? 0) + 1e-12);
  };
  const top = frames.map((v) => 20 * Math.log10(v.spectrum.reduce((a, x, k) => (k > 0 && x > a ? x : a), 0) + 1e-12));
  const near = frames.filter((v, j) => Math.abs(v.f0 - f0) <= STEADY_PITCH_REL * f0 && !(j > 0 && top[j] >= top[j - 1] + ONSET_RISE_DB));
  if (near.length < MIN_VOICED_FRAMES) return none;
  const x = near.map((v) => at(v.spectrum, 2 * f0));
  const y = near.map((v) => at(v.spectrum, f0));
  if (median(x) < median(y) + FOLLOW_H2_MIN_DB) return none;
  const rx = Math.max(...x) - Math.min(...x);
  if (rx < FOLLOW_RANGE_DB) return none;
  const ry = Math.max(...y) - Math.min(...y);
  return { ratio: +(ry / rx).toFixed(2), db: +ry.toFixed(1) };
}

function followFeatures(r: { ratio: number; db: number }): { f0_follow: number; f0_follow_db: number } {
  return { f0_follow: r.ratio, f0_follow_db: r.db };
}

/** 基本が倍音（第 2〜8）より弱い音は、高さを決めない（保留）。1 オクターブ下（や 1/3 の高さ）の別の続く音が鳴って
 * いると、それを基本と読んで結論が逆になった（10/12 デプロイ前レビュー 7〜9 回目。ゆらぎ・弱まり方を変えるたびに
 * 時間の検査をすり抜けた）。本番の版は、下の音が上の音より 4.8 dB（1/2 の高さ）・3 dB（1/3）以上弱ければ上の音を
 * 読む（自己相関の 0.5）。それより手前の 2 dB で止めれば、本番が正しく読める音を、この版が下の音と読んで通すことはない。
 * いちばん音が大きいフレームで比べる（弱まったあとのフレームでは、続く音のほうが大きくなる） */
const MAX_HARMONIC_OVER_F0_DB = 2;
const MAX_HARMONIC_CHECKED = 8;
/** 比べるフレームの数（はじいた直後の、いちばん大きいフレーム。4 回はじけばほぼ 1 回に 1 つ） */
const LOUDEST_FRAMES = 4;
function harmonicOverF0(frames: { f0: number; spectrum: Float64Array }[], sampleRate: number, f0: number): number {
  const bin = sampleRate / FFT_SIZE;
  const at = (m: Float64Array, hz: number) => {
    const k = Math.round(hz / bin);
    return 20 * Math.log10(Math.max(m[k - 1] ?? 0, m[k] ?? 0, m[k + 1] ?? 0) + 1e-12);
  };
  // フレームごとの高さで選ばない（いちばん大きいフレームは本当の音の高さを読み、中央値から外れていることがある）
  if (frames.length < MIN_VOICED_FRAMES) return NaN;
  const loud = [...frames].sort((a, b) => topDb(b.spectrum) - topDb(a.spectrum)).slice(0, LOUDEST_FRAMES);
  const over = (m: Float64Array) => {
    let best = -Infinity;
    for (let h = 2; h <= MAX_HARMONIC_CHECKED && (h + 1) * f0 < sampleRate / 2; h++) best = Math.max(best, at(m, h * f0));
    return best - at(m, f0);
  };
  return +median(loud.map((v) => over(v.spectrum))).toFixed(1);
}

function topDb(m: Float64Array): number {
  let top = 0;
  for (let k = 1; k < m.length; k++) top = Math.max(top, m[k]);
  return 20 * Math.log10(top + 1e-12);
}

/** 基本の大きさがほとんど変わらない（2 dB 未満、かつ第 2 倍音の幅の 15% 未満）なら、音と関係ない続く音 */
function followsNote(f: PitchFeatures): boolean {
  if (!Number.isFinite(f.f0_follow)) return true;
  return f.f0_follow >= FOLLOW_MIN_RATIO || f.f0_follow_db >= FOLLOW_MIN_DB;
}

export function pitchChecks(f: PitchFeatures, toleranceRel: number): LocalCheck[] {
  const d = Math.abs(f.f0_hz - f.f0_from_h2_hz) / f.f0_hz;
  const voicedOk = f.voiced_frames >= MIN_VOICED_FRAMES;
  const snrOk = f.snr_db >= MIN_SNR_DB;
  const clipOk = f.clipping_ratio <= MAX_CLIPPING;
  // 10/9 の版（直す前の読み方）が答える高さと違えば、通さない。この版だけが別の音（1 オクターブ下の続く音など）を
  // 読んで結論が逆になるのを、しきい値の調整ではなく、読み方の食い違いとして止める（10/12 デプロイ前レビュー 10 回目。
  // ゆらぎ・一時的な大きさの山・弱まり方を変えるたびに、しきい値の検査をすり抜けた）
  const sameAsPlainRead = Number.isFinite(f.raw_f0_hz) && Math.abs(f.raw_f0_hz - f.f0_hz) <= toleranceRel * f.f0_hz;
  const fundamentalOk = !(f.harmonic_over_f0_db > MAX_HARMONIC_OVER_F0_DB) && sameAsPlainRead;
  const agree = Number.isFinite(d) && d <= toleranceRel && fundamentalOk;
  const inRange = f.f0_hz >= MIN_HZ && f.f0_hz <= MAX_HZ;
  const followOk = followsNote(f);
  const steadyOk = f.f0_steady_share >= MIN_STEADY_SHARE && followOk;
  return [
    { code: "low_voiced", ok: voicedOk, text: voicedOk ? `音のあるところ ${f.voiced_frames} か所` : "音が短すぎて高さを決められません" },
    { code: "low_snr", ok: snrOk, text: snrOk ? `雑音より ${Math.round(f.snr_db)} dB 大きい` : "音が小さく、雑音と区別できません" },
    { code: "clipping", ok: clipOk, text: clipOk ? "音割れなし" : "音が大きすぎて割れています" },
    {
      code: "two_clocks_disagree",
      ok: agree,
      text: !fundamentalOk ? "基本の音が倍音より弱いか、1 オクターブ違う高さとも読めるので、高さを決められません（低いほかの音が入っているかも）" : Number.isFinite(d) ? `二つの計算で求めた高さが${agree ? "一致" : "一致しない"}（差 ${(d * 100).toFixed(1)}%、許容 ${Math.round(toleranceRel * 100)}%）` : "高さを決められません",
    },
    { code: "unstable", ok: steadyOk, text: steadyOk ? "途中で高さが変わらない" : "途中で高さが変わった（ほかの音が入ったかも）" },
    { code: "out_of_range", ok: inRange, text: inRange ? `${Math.round(f.f0_hz)} Hz` : "音の高さとして考えにくい値です" },
  ];
}

/* ---------- ブラウザでの収集 ---------- */

/** iOS は音声の再生・解析をタップの中で始める必要があるので、許可を待つ前に作る */
export function createAudioContext(): AudioContext | null {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Ctx ? new Ctx() : null;
}

export type MicPermission = { kind: "granted"; stream: MediaStream } | { kind: "denied" | "unsupported" };

export async function requestMic(): Promise<MicPermission> {
  if (!navigator.mediaDevices?.getUserMedia) return { kind: "unsupported" };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false,
    });
    return { kind: "granted", stream };
  } catch (e: unknown) {
    const name = e instanceof DOMException ? e.name : "";
    return { kind: name === "NotFoundError" || name === "NotReadableError" ? "unsupported" : "denied" };
  }
}

/** 許可した秒数だけ 100 ms ごとにフレームを読み、終わったらマイクを必ず閉じる */
export function collectPitch(ctx: AudioContext, stream: MediaStream, seconds: number, onTick?: (elapsedS: number, frames: number) => void): { done: Promise<PitchBuffer>; stop: () => void } {
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  analyser.smoothingTimeConstant = 0;
  source.connect(analyser);
  const buf: PitchBuffer = { sampleRate: ctx.sampleRate, frames: [] };
  let finish: (b: PitchBuffer) => void = () => {};
  const done = new Promise<PitchBuffer>((res) => (finish = res));
  const t0 = performance.now();
  let stopped = false;
  const read = () => {
    const data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);
    buf.frames.push({ t: performance.now() - t0, data });
    onTick?.(Math.min(seconds, (performance.now() - t0) / 1000), buf.frames.length);
  };
  const ticker = window.setInterval(read, FRAME_MS);
  const stopAll = () => {
    if (stopped) return;
    stopped = true;
    window.clearInterval(ticker);
    window.clearTimeout(timer);
    source.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    void ctx.close();
    finish(buf);
  };
  const timer = window.setTimeout(stopAll, seconds * 1000);
  void ctx.resume();
  return { done, stop: stopAll };
}

export async function pitchRawHash(b: PitchBuffer): Promise<string> {
  const n = b.frames.reduce((s, f) => s + f.data.length, 0);
  const all = new Float32Array(n);
  let offset = 0;
  for (const f of b.frames) {
    all.set(f.data, offset);
    offset += f.data.length;
  }
  return sha256Hex(all.buffer);
}
