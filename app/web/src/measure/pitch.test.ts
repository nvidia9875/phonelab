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
