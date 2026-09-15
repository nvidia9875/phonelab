/**
 * センサーの無い端末（審査員の PC など）とテストモード用のサンプル特徴量。
 * 本物と同じ解析関数に合成した信号を通す。記録には demo フラグが残る。
 */
import type { Theme, Variant } from "../catalog/themes";
import type { Features } from "./features";
import { analyzePeriod, type RawBuffer } from "./pendulum";
import { analyzePitch, FFT_SIZE, type PitchBuffer } from "./pitch";
import { analyzeSpeed } from "./speed";

const G = 9.81;
const RATE_HZ = 60;
const SAMPLE_RATE = 48000;

function motionBuffer(seconds: number, sample: (s: number) => { az: number; gy: number }): RawBuffer {
  const dt = 1000 / RATE_HZ;
  const buf: RawBuffer = { t: [], ax: [], ay: [], az: [], gx: [], gy: [], gz: [], interval: dt };
  for (let i = 0; i < seconds * RATE_HZ; i++) {
    const s = i / RATE_HZ;
    const v = sample(s);
    buf.t.push(i * dt);
    buf.ax.push(0.02 * Math.sin(7 * s));
    buf.ay.push(0.02 * Math.cos(5 * s));
    buf.az.push(v.az);
    buf.gx.push(0.3 * Math.sin(3 * s));
    buf.gy.push(v.gy);
    buf.gz.push(0.2 * Math.cos(4 * s));
  }
  return buf;
}

function swing(lengthM: number, heightM: number, seconds: number): RawBuffer {
  const theta0 = Math.acos(1 - heightM / lengthM);
  const wn = Math.sqrt(G / lengthM);
  const release = 1.5;
  return motionBuffer(seconds, (s) => {
    const moving = s >= release;
    const th = moving ? theta0 * Math.cos(wn * (s - release)) : theta0;
    const dth = moving ? -theta0 * wn * Math.sin(wn * (s - release)) : 0;
    return { az: G * Math.cos(th) + lengthM * dth * dth, gy: (dth * 180) / Math.PI };
  });
}

function periodSwing(periodS: number, seconds: number): RawBuffer {
  return motionBuffer(seconds, (s) => {
    const th = 0.3 * Math.sin((2 * Math.PI * s) / periodS);
    return { az: 9.8 * Math.cos(th) + 0.5 * Math.cos((4 * Math.PI * s) / periodS), gy: 17.2 * ((2 * Math.PI) / periodS) * Math.cos((2 * Math.PI * s) / periodS) };
  });
}

function tone(f0: number, seconds: number): PitchBuffer {
  const frames = [];
  for (let i = 0; i < seconds * 10; i++) {
    const t = i * 100;
    const data = new Float32Array(FFT_SIZE);
    const voiced = t >= 500;
    for (let k = 0; k < FFT_SIZE; k++) {
      const s = (i * 4800 + k) / SAMPLE_RATE;
      const noise = 0.002 * Math.sin(12345.678 * (i * FFT_SIZE + k));
      data[k] = (voiced ? 0.3 * (Math.sin(2 * Math.PI * f0 * s) + 0.5 * Math.sin(4 * Math.PI * f0 * s)) : 0) + noise;
    }
    frames.push({ t, data });
  }
  return { sampleRate: SAMPLE_RATE, frames };
}

/** 条件 A（idx 0）と B（idx 1）のサンプル。変える変数ごとに、ありそうな差をつける */
export function demoFeatures(theme: Theme, variant: Variant, idx: 0 | 1): Features {
  switch (theme.measureProfile) {
    case "pendulum_speed": {
      const lengthM = variant.lengthM ?? 0.8;
      const heightM = variant.variable === "height" ? (idx === 0 ? 0.1 : 0.2) : 0.15 + idx * 0.003;
      return analyzeSpeed(swing(lengthM, heightM, theme.seconds), lengthM);
    }
    case "pitch": {
      const base = variant.variable === "water" ? 180 : 220;
      const f0 = variant.variable === "length" ? base * (idx === 0 ? 1 : 2) : variant.variable === "water" ? (idx === 0 ? 180 : 250) : base * (1 + idx * 0.005);
      return analyzePitch(tone(f0, theme.seconds));
    }
    default: {
      const periodS = variant.variable === "length" && idx === 1 ? 2.01 : variant.variable === "amplitude" && idx === 1 ? 1.44 : idx === 1 ? 1.43 : 1.42;
      return analyzePeriod(periodSwing(periodS, 20));
    }
  }
}
