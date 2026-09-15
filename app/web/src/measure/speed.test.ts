import { describe, expect, it } from "vitest";
import type { RawBuffer } from "./pendulum";
import { analyzeSpeed, speedChecks } from "./speed";

const G = 9.81;

interface SwingOptions {
  lengthM: number;
  heightM: number;
  releaseS?: number;
  seconds?: number;
  rateHz?: number;
  gyroScale?: number;
}

/** 糸の先で振れる端末が受ける信号（放すまでは静止、放したあとは単振り子） */
function swing({ lengthM, heightM, releaseS = 1.5, seconds = 10, rateHz = 60, gyroScale = 1 }: SwingOptions): RawBuffer {
  const theta0 = Math.acos(1 - heightM / lengthM);
  const wn = Math.sqrt(G / lengthM);
  const buf: RawBuffer = { t: [], ax: [], ay: [], az: [], gx: [], gy: [], gz: [], interval: 1000 / rateHz };
  for (let i = 0; i < seconds * rateHz; i++) {
    const s = i / rateHz;
    const moving = s >= releaseS;
    const th = moving ? theta0 * Math.cos(wn * (s - releaseS)) : theta0;
    const dth = moving ? -theta0 * wn * Math.sin(wn * (s - releaseS)) : 0;
    buf.t.push(i * (1000 / rateHz));
    buf.ax.push(0.02 * Math.sin(7 * s));
    buf.ay.push(0.02 * Math.cos(5 * s));
    buf.az.push(G * Math.cos(th) + lengthM * dth * dth);
    buf.gx.push(0.3 * Math.sin(3 * s));
    buf.gy.push(gyroScale * ((dth * 180) / Math.PI));
    buf.gz.push(0.2 * Math.cos(4 * s));
  }
  return buf;
}

/** 単振り子の近似での最下点の速さ θ0·ωn·L */
function expectedSpeed(lengthM: number, heightM: number): number {
  return Math.acos(1 - heightM / lengthM) * Math.sqrt(G / lengthM) * lengthM;
}

describe("analyzeSpeed", () => {
  it("estimates the bottom speed from both the gyro and the accelerometer", () => {
    const f = analyzeSpeed(swing({ lengthM: 0.8, heightM: 0.1 }), 0.8);

    const v = expectedSpeed(0.8, 0.1);
    expect(Math.abs(f.v_gyro_ms - v)).toBeLessThan(0.03);
    expect(Math.abs(f.v_accel_ms - v)).toBeLessThan(0.05);
    expect(f.release_at_s).not.toBeNull();
    expect(Math.abs((f.release_at_s ?? 0) - 1.5)).toBeLessThan(0.2);
    expect(speedChecks(f, 0.15).every((c) => c.ok)).toBe(true);
  });

  it("gives a faster bottom speed when released from higher", () => {
    const low = analyzeSpeed(swing({ lengthM: 0.8, heightM: 0.1 }), 0.8);
    const high = analyzeSpeed(swing({ lengthM: 0.8, heightM: 0.2 }), 0.8);

    expect(high.v_gyro_ms - low.v_gyro_ms).toBeGreaterThan(0.4);
    expect(high.v_accel_ms - low.v_accel_ms).toBeGreaterThan(0.4);
  });

  it("keeps the first bottom pass when released right at the go signal after a countdown", () => {
    const lengthM = 0.8;
    const heightM = 0.1;
    const releaseS = 0.4;
    const damping = 0.3;
    const theta0 = Math.acos(1 - heightM / lengthM);
    const wn = Math.sqrt(G / lengthM);
    const buf: RawBuffer = { t: [], ax: [], ay: [], az: [], gx: [], gy: [], gz: [], interval: 1000 / 60 };
    for (let i = 0; i < 10 * 60; i++) {
      const s = i / 60;
      const u = Math.max(0, s - releaseS);
      const amp = theta0 * Math.exp(-damping * u);
      const th = amp * Math.cos(wn * u);
      const dth = s < releaseS ? 0 : amp * (-damping * Math.cos(wn * u) - wn * Math.sin(wn * u));
      buf.t.push(i * (1000 / 60));
      buf.ax.push(0.02 * Math.sin(7 * s));
      buf.ay.push(0.02 * Math.cos(5 * s));
      buf.az.push(G * Math.cos(th) + lengthM * dth * dth);
      buf.gx.push(0.3 * Math.sin(3 * s));
      buf.gy.push((dth * 180) / Math.PI);
      buf.gz.push(0.2 * Math.cos(4 * s));
    }
    const quarterPeriod = Math.PI / (2 * wn);
    const firstPass = expectedSpeed(lengthM, heightM) * Math.exp(-damping * quarterPeriod);

    const f = analyzeSpeed(buf, lengthM, 200);

    expect(Math.abs(f.v_gyro_ms - firstPass) / firstPass).toBeLessThan(0.04);
  });

  it("holds with no_release when the pendulum never starts moving", () => {
    const f = analyzeSpeed(swing({ lengthM: 0.8, heightM: 0.1, releaseS: 20 }), 0.8);

    expect(f.release_at_s).toBeNull();
    expect(speedChecks(f, 0.15).find((c) => c.code === "no_release")?.ok).toBe(false);
  });

  it("holds with two_clocks_disagree when the gyro and accelerometer speeds differ", () => {
    const f = analyzeSpeed(swing({ lengthM: 0.8, heightM: 0.1, gyroScale: 1.3 }), 0.8);

    expect(speedChecks(f, 0.15).find((c) => c.code === "two_clocks_disagree")?.ok).toBe(false);
  });
});
