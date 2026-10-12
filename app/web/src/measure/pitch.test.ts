import { describe, expect, it } from "vitest";
import { analyzePitch, pitchChecks, type PitchBuffer } from "./pitch";

const SR = 48000;
const N = 4096;

interface ToneOptions {
  f0: number;
  harmonic?: number;
  amp?: number;
  seconds?: number;
  silentS?: number;
  noise?: number;
}

/** 100 ms ごとに 4096 サンプルずつ読んだマイクのフレーム。最初の silentS 秒は雑音だけ */
function tone({ f0, harmonic = 0.5, amp = 0.3, seconds = 5, silentS = 0.5, noise = 0.002 }: ToneOptions): PitchBuffer {
  let seed = 1;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647 - 0.5;
  };
  const frames = [];
  for (let i = 0; i < seconds * 10; i++) {
    const t = i * 100;
    const voiced = t >= silentS * 1000 && amp > 0;
    const data = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      const s = (i * 4800 + k) / SR;
      const sig = voiced ? amp * (Math.sin(2 * Math.PI * f0 * s) + harmonic * Math.sin(2 * Math.PI * 2 * f0 * s)) : 0;
      data[k] = Math.max(-1, Math.min(1, sig + 2 * noise * rand()));
    }
    frames.push({ t, data });
  }
  return { sampleRate: SR, frames };
}

describe("analyzePitch", () => {
  it("finds the same fundamental from autocorrelation and from the second harmonic", () => {
    const f = analyzePitch(tone({ f0: 220 }));

    expect(Math.abs(f.f0_hz - 220)).toBeLessThan(2);
    expect(Math.abs(f.f0_from_h2_hz - 220)).toBeLessThan(2);
    expect(f.voiced_frames).toBeGreaterThanOrEqual(40);
    expect(f.snr_db).toBeGreaterThan(20);
    expect(pitchChecks(f, 0.03).every((c) => c.ok)).toBe(true);
  });

  it("does not jump an octave for a higher note", () => {
    const f = analyzePitch(tone({ f0: 440 }));

    expect(Math.abs(f.f0_hz - 440)).toBeLessThan(4);
    expect(Math.abs(f.f0_from_h2_hz - 440)).toBeLessThan(4);
  });

  it("holds with low_voiced when nothing is played", () => {
    const f = analyzePitch(tone({ f0: 220, amp: 0 }));

    expect(f.voiced_frames).toBe(0);
    expect(pitchChecks(f, 0.03).find((c) => c.code === "low_voiced")?.ok).toBe(false);
  });

  it("holds with clipping when the sound is too loud for the microphone", () => {
    const f = analyzePitch(tone({ f0: 220, amp: 1 }));

    expect(f.clipping_ratio).toBeGreaterThan(0.01);
    expect(pitchChecks(f, 0.03).find((c) => c.code === "clipping")?.ok).toBe(false);
  });
});

describe("1 オクターブ上の取り違え（10/12 合成ベンチマーク）", () => {
  it("holds (never passes an octave up) when the second harmonic is much stronger than the fundamental", () => {
    // 基本の音が弱く、第 2 倍音が強い（倍音の強さ 0.15・1・0.5・0.3）。自己相関の最初のピークは半分の周期に出る
    const amps = [0.15, 1, 0.5, 0.3];
    const frames = [];
    for (let i = 0; i < 50; i++) {
      const data = new Float32Array(N);
      for (let k = 0; k < N; k++) {
        const s = (i * 4800 + k) / SR;
        // はじいた音（はじくたびに exp(-3t) で弱まる）。基本も第 2 倍音と一緒に弱まる
        let v = 0;
        for (const p of [0.6, 1.7, 2.8, 3.9]) if (s >= p) v += Math.exp(-(s - p) * 3) * amps.reduce((x, a, h) => x + a * Math.sin(2 * Math.PI * 220 * (h + 1) * (s - p)), 0);
        data[k] = 0.2 * v + 0.001 * Math.sin(9999 * k);
      }
      frames.push({ t: i * 100, data });
    }
    const f = analyzePitch({ sampleRate: SR, frames });

    // 基本が第 2 倍音より弱い音は、1 オクターブ下の別の音と見分けられないので決めない（10/12 デプロイ前レビュー 9 回目）。
    // 本番の版は 440 Hz と答えて通していた
    expect(pitchChecks(f, 0.03).every((c) => c.ok)).toBe(false);
    expect(f.harmonic_over_f0_db).toBeGreaterThan(3);
  });

  it("does not halve a clean tone", () => {
    const f = analyzePitch(tone({ f0: 330 }));

    expect(Math.abs(f.f0_hz - 330) / 330).toBeLessThan(0.03);
  });
});

describe("下限の近くで比べた向きが逆にならない（10/12 デプロイ前レビュー）", () => {
  function weakFundamental(f0: number) {
    const amps = [0.15, 1, 0.5, 0.3];
    const frames = [];
    for (let i = 0; i < 50; i++) {
      const data = new Float32Array(N);
      for (let k = 0; k < N; k++) {
        const s = (i * 4800 + k) / SR;
        data[k] = i < 5 ? 0.001 * Math.sin(9999 * k) : 0.2 * amps.reduce((v, a, h) => v + a * Math.sin(2 * Math.PI * f0 * (h + 1) * s), 0);
      }
      frames.push({ t: i * 100, data });
    }
    return analyzePitch({ sampleRate: SR, frames });
  }

  it("never reports 80 Hz → 85 Hz as going down", () => {
    const a = weakFundamental(80);
    const b = weakFundamental(85);
    const aOk = pitchChecks(a, 0.03).every((c) => c.ok);
    const bOk = pitchChecks(b, 0.03).every((c) => c.ok);
    // 両方とも検査を通ったなら、向きは「高くなった」でなければならない（決められない側は保留でよい）
    if (aOk && bOk) expect(b.f0_hz).toBeGreaterThan(a.f0_hz);
  });
});

describe("倍音の無い音（ペットボトルのような純音に近い音）", () => {
  it("passes the two-clock check when the fundamental is right", () => {
    const f = analyzePitch(tone({ f0: 180, harmonic: 0 }));

    expect(Math.abs(f.f0_hz - 180) / 180).toBeLessThan(0.03);
    expect(pitchChecks(f, 0.03).find((c) => c.code === "two_clocks_disagree")?.ok).toBe(true);
  });
});

describe("純音の分かれ道が 1 オクターブ上の取り違えを追認しない（10/12 デプロイ前レビュー 2 回目）", () => {
  function signal(f0: number, amps: number[]) {
    const frames = [];
    for (let i = 0; i < 50; i++) {
      const data = new Float32Array(N);
      for (let k = 0; k < N; k++) {
        const s = (i * 4800 + k) / SR;
        data[k] = i < 5 ? 0.001 * Math.sin(9999 * k) : 0.2 * amps.reduce((v, a, h) => v + a * Math.sin(2 * Math.PI * f0 * (h + 1) * s), 0);
      }
      frames.push({ t: i * 100, data });
    }
    return analyzePitch({ sampleRate: SR, frames });
  }

  it("never reports 220 Hz → 330 Hz as going down", () => {
    const a = signal(220, [0.15, 1, 0.2]);
    const b = signal(330, [0.15, 1, 0.2]);
    const aOk = pitchChecks(a, 0.03).every((c) => c.ok);
    const bOk = pitchChecks(b, 0.03).every((c) => c.ok);
    if (aOk && bOk) expect(b.f0_hz).toBeGreaterThan(a.f0_hz);
    // 通ったものは正しい高さ（3% 以内）でなければならない
    if (aOk) expect(Math.abs(a.f0_hz - 220) / 220).toBeLessThan(0.03);
    if (bOk) expect(Math.abs(b.f0_hz - 330) / 330).toBeLessThan(0.03);
  });
});

describe("調和性の検査（10/12 デプロイ前レビュー 4 回目）", () => {
  function signal(f0: number, amps: number[], extra?: (s: number) => number) {
    const frames = [];
    for (let i = 0; i < 50; i++) {
      const data = new Float32Array(N);
      for (let k = 0; k < N; k++) {
        const s = (i * 4800 + k) / SR;
        data[k] = i < 5 ? 0.001 * Math.sin(9999 * k) : 0.2 * amps.reduce((v, a, h) => v + a * Math.sin(2 * Math.PI * f0 * (h + 1) * s), 0) + (extra ? extra(s) : 0);
      }
      frames.push({ t: i * 100, data });
    }
    return analyzePitch({ sampleRate: SR, frames });
  }
  const passes = (f: ReturnType<typeof analyzePitch>) => pitchChecks(f, 0.03).every((c) => c.ok);

  it("does not pass a tone read at its 10th harmonic", () => {
    expect(passes(signal(150, [0.5, 0, 0, 0, 0, 0, 0, 0, 0, 1]))).toBe(false);
  });

  it("does not pass two notes at 4:3 as one low note", () => {
    const chord = signal(240, [1, 0.5, 0.25], (s) => 0.18 * (Math.sin(2 * Math.PI * 320 * s) + 0.5 * Math.sin(2 * Math.PI * 640 * s)));
    expect(passes(chord)).toBe(false);
  });

  it("still passes a rubber band with a quiet mains hum or a quiet voice in the room", () => {
    const hum = signal(220, [1, 0.5, 0.25, 0.12], (s) => 0.004 * Math.sin(2 * Math.PI * 60 * s));
    expect(passes(hum)).toBe(true);
    expect(Math.abs(hum.f0_hz - 220) / 220).toBeLessThan(0.03);
  });
});

describe("背景を覚えて、弱い本当の基本は見逃さない（10/12 デプロイ前レビュー 5 回目）", () => {
  function withQuiet(f0: number, amps: number[], background?: (s: number) => number) {
    const frames = [];
    for (let i = 0; i < 50; i++) {
      const data = new Float32Array(N);
      for (let k = 0; k < N; k++) {
        const s = (i * 4800 + k) / SR;
        const bg = background ? background(s) : 0.001 * Math.sin(9999 * k);
        data[k] = (i < 5 ? 0 : 0.2 * amps.reduce((v, a, h) => v + a * Math.sin(2 * Math.PI * f0 * (h + 1) * s), 0)) + bg;
      }
      frames.push({ t: i * 100, data });
    }
    return analyzePitch({ sampleRate: SR, frames });
  }
  const passes = (f: ReturnType<typeof analyzePitch>) => pitchChecks(f, 0.03).every((c) => c.ok);

  it("does not pass a weak fundamental read at its 10th harmonic", () => {
    const amps = Array(10).fill(0);
    amps[0] = 0.04;
    amps[9] = 1;
    expect(passes(withQuiet(150, amps))).toBe(false);
  });

  it("does not drop a real weak fundamental near 100 Hz as if it were mains hum", () => {
    expect(passes(withQuiet(100, [0.02, 1]))).toBe(false);
  });

  const hum = (s: number) => 0.011 * (Math.sin(2 * Math.PI * 50 * s) + 0.5 * Math.sin(2 * Math.PI * 100 * s) + 0.3 * Math.sin(2 * Math.PI * 150 * s));

  it("ignores a strong mains hum that was already there before the sound", () => {
    const f = withQuiet(130, [1, 0.5, 0.25, 0.12], hum);
    expect(passes(f)).toBe(true);
    expect(Math.abs(f.f0_hz - 130) / 130).toBeLessThan(0.03);
  });

  /** 0.6 秒から 1.1 秒ごとに 4 回はじく（はじくたびに exp(-3t) で弱まる）。最初の 0.5 秒は背景だけ */
  function plucked(f0: number, amps: number[], background: (s: number) => number) {
    const frames = [];
    for (let i = 0; i < 50; i++) {
      const data = new Float32Array(N);
      for (let k = 0; k < N; k++) {
        const s = (i * 4800 + k) / SR;
        let v = 0;
        for (const p of [0.6, 1.7, 2.8, 3.9]) {
          if (s < p) continue;
          const env = Math.exp(-(s - p) * 3);
          v += env * amps.reduce((x, a, h) => x + a * Math.sin(2 * Math.PI * f0 * (h + 1) * (s - p) + 1 + h), 0);
        }
        data[k] = 0.2 * v + background(s) + 0.001 * Math.sin(9999 * k);
      }
      frames.push({ t: i * 100, data });
    }
    return analyzePitch({ sampleRate: SR, frames });
  }

  it("passes a plucked note when a steady hum sits at 1/2 of it (unchanged through the measurement)", () => {
    // 100 Hz の音の 1/2（50 Hz）にうなり。はじいた音は弱まっていくのに、50 Hz の山は大きさが変わらない → 背景だけ
    expect(passes(plucked(100, [1, 0.5, 0.25, 0.12], hum))).toBe(true);
  });

  it("holds a steady (non-decaying) note when a hum sits at 1/2 of it (cannot tell them apart)", () => {
    // 200 Hz の音の 1/2（100 Hz）にうなりの第 2 倍音。音の大きさが変わらないと、うなりと弱い基本を時間でも見分けられない
    expect(passes(withQuiet(200, [1, 0.5, 0.25, 0.12], hum))).toBe(false);
  });

  it("does not hold for positions whose true fundamental would be below 60 Hz", () => {
    // 100 Hz の音の 1/2 は 50 Hz（電源のうなり）。50 Hz の音は測る対象ではない
    expect(passes(withQuiet(100, [1, 0.5, 0.25, 0.12], hum))).toBe(true);
  });

  it("holds a plucked note whose weak fundamental overlaps a steady background at the same pitch", () => {
    // 本当は 100 Hz（基本 −34 dB）。どの位相で重なっても、はじいた音と一緒に大きさが変わる
    for (const ph of [0, 1, 2, 2.1, 2.2, 3]) {
      const bg = (s: number) => 0.004 * Math.sin(2 * Math.PI * 100 * (s - 0.6) + ph);
      expect(passes(plucked(100, [0.02, 1, 0.5, 0.25], bg))).toBe(false);
    }
  });

  it("holds when a weak fundamental overlaps a background sound and makes it louder (6th review)", () => {
    // 本当は 100 Hz（基本 −34 dB）。同じ 100 Hz に背景の音。重なって山が大きくなるので、1/2 の位置の山として保留
    const bg = (s: number) => 0.004 * Math.cos(2 * Math.PI * 100 * s);
    expect(passes(withQuiet(100, [0.02, 1, 0.5, 0.25], bg))).toBe(false);
  });

  it("does not let a weak fundamental hide behind a background sound at the same pitch", () => {
    const bg = (s: number) => 0.004 * Math.cos(2 * Math.PI * 100 * s);
    expect(passes(withQuiet(100, [0.02, 1], bg))).toBe(false);
  });

  it("ignores all-zero frames at the start (the mic just opened) for noise and background", () => {
    const frames = [];
    for (let i = 0; i < 50; i++) {
      const data = new Float32Array(N);
      for (let k = 0; k < N; k++) {
        const s = (i * 4800 + k) / SR;
        let v = 0;
        for (const p of [0.6, 1.7, 2.8, 3.9]) if (s >= p) v += Math.exp(-(s - p) * 3) * [1, 0.5, 0.25, 0.12].reduce((x, a, h) => x + a * Math.sin(2 * Math.PI * 300 * (h + 1) * (s - p) + h), 0);
        data[k] = i < 3 ? 0 : 0.2 * v + 0.006 * Math.sin(2 * Math.PI * 60 * s) + 0.003 * Math.sin(2 * Math.PI * 120 * s + 1) + 0.001 * Math.sin(9999 * k);
      }
      frames.push({ t: i * 100, data });
    }
    const f = analyzePitch({ sampleRate: SR, frames });
    expect(f.snr_db).toBeLessThan(80);
    expect(passes(f)).toBe(true);
  });

  it("holds when the sound an octave below wobbles slightly in loudness (9th review)", () => {
    const frames = [];
    for (let i = 0; i < 50; i++) {
      const data = new Float32Array(N);
      for (let k = 0; k < N; k++) {
        const s = (i * 4800 + k) / SR;
        let v = 0;
        for (const p of [0.6, 1.7, 2.8, 3.9]) if (s >= p) v += Math.exp(-(s - p) * 1.5) * [1, 0.5, 0.25, 0.12].reduce((x, a, h) => x + a * Math.sin(2 * Math.PI * 300 * (h + 1) * (s - p) + h), 0);
        const wob = s >= 0.65 ? 0.065 * (1 + 0.15 * Math.sin(2 * Math.PI * 0.3 * (s - 0.65) + 3)) * Math.sin(2 * Math.PI * 150 * s) : 0;
        data[k] = 0.2 * v + wob + 0.001 * Math.sin(9999 * k);
      }
      frames.push({ t: i * 100, data });
    }
    expect(passes(analyzePitch({ sampleRate: SR, frames }))).toBe(false);
  });

  it("holds when a slowly decaying note has a sustained sound an octave below from 0.65 s (8th review)", () => {
    const frames = [];
    for (let i = 0; i < 50; i++) {
      const data = new Float32Array(N);
      for (let k = 0; k < N; k++) {
        const s = (i * 4800 + k) / SR;
        let v = 0;
        for (const p of [0.6, 1.7, 2.8, 3.9]) if (s >= p) v += Math.exp(-(s - p) * 1.5) * [1, 0.5, 0.25, 0.12].reduce((x, a, h) => x + a * Math.sin(2 * Math.PI * 300 * (h + 1) * (s - p) + h), 0);
        data[k] = 0.2 * v + (s >= 0.65 ? 0.065 * Math.sin(2 * Math.PI * 150 * s) : 0) + 0.001 * Math.sin(9999 * k);
      }
      frames.push({ t: i * 100, data });
    }
    expect(passes(analyzePitch({ sampleRate: SR, frames }))).toBe(false);
  });

  it("holds when a sustained sound an octave below starts partway (7th review: 300 Hz read as 150 Hz)", () => {
    const frames = [];
    for (let i = 0; i < 50; i++) {
      const data = new Float32Array(N);
      for (let k = 0; k < N; k++) {
        const s = (i * 4800 + k) / SR;
        let v = 0;
        for (const p of [0.6, 1.7, 2.8, 3.9]) if (s >= p) v += Math.exp(-(s - p) * 3) * [1, 0.5, 0.25, 0.12].reduce((x, a, h) => x + a * Math.sin(2 * Math.PI * 300 * (h + 1) * (s - p) + h), 0);
        data[k] = 0.2 * v + (s >= 0.8 ? 0.02 * Math.sin(2 * Math.PI * 150 * s) : 0) + 0.001 * Math.sin(9999 * k);
      }
      frames.push({ t: i * 100, data });
    }
    const f = analyzePitch({ sampleRate: SR, frames });
    expect(f.f0_steady_share).toBeLessThan(0.85);
    expect(pitchChecks(f, 0.03).find((c) => c.code === "unstable")?.ok).toBe(false);
  });

  it("does not treat a single sound in the quiet part as background", () => {
    const frames = [];
    for (let i = 0; i < 50; i++) {
      const data = new Float32Array(N);
      for (let k = 0; k < N; k++) {
        const s = (i * 4800 + k) / SR;
        const note = 0.05 * [1, 0.5, 0.25, 0.12].reduce((v, a, h) => v + a * Math.sin(2 * Math.PI * 220 * (h + 1) * s), 0);
        data[k] = (i >= 5 ? note : i === 0 ? 3 * note : 0) + 0.001 * Math.sin(9999 * k);
      }
      frames.push({ t: i * 100, data });
    }
    expect(passes(analyzePitch({ sampleRate: SR, frames }))).toBe(true);
  });
});
