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
  it("reads the fundamental even when the second harmonic is much stronger", () => {
    // 基本の音が弱く、第 2 倍音が強い（倍音の強さ 0.15・1・0.5・0.3）。自己相関の最初のピークは半分の周期に出る
    const amps = [0.15, 1, 0.5, 0.3];
    const frames = [];
    for (let i = 0; i < 50; i++) {
      const data = new Float32Array(N);
      for (let k = 0; k < N; k++) {
        const s = (i * 4800 + k) / SR;
        data[k] = i < 5 ? 0.001 * Math.sin(9999 * k) : 0.2 * amps.reduce((v, a, h) => v + a * Math.sin(2 * Math.PI * 220 * (h + 1) * s), 0);
      }
      frames.push({ t: i * 100, data });
    }
    const f = analyzePitch({ sampleRate: SR, frames });

    expect(Math.abs(f.f0_hz - 220) / 220).toBeLessThan(0.03);
    expect(pitchChecks(f, 0.03).every((c) => c.ok)).toBe(true);
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
