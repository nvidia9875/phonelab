import { useCallback, useRef, useState } from "react";
import type { Sensor, Variant } from "../catalog/themes";
import type { LocalCheck } from "./checks";
import { checksFor, type Features } from "./features";
import { analyzePeriod, collect, motionRawHash, requestMotionPermission, type Permit } from "./pendulum";
import { analyzePitch, collectPitch, createAudioContext, pitchRawHash, requestMic } from "./pitch";
import { analyzeSpeed } from "./speed";

export type SensingProfile = "pendulum_period" | "pendulum_speed" | "pitch";

export interface MeasureSpec {
  profile: SensingProfile;
  sensors: Sensor[];
  seconds: number;
  lengthM?: number;
}

export type MeasurementState =
  | { phase: "idle" }
  /** ブラウザの許可の確認に答えるのを待っている（答えが無いと、ここで止まったままになる） */
  | { phase: "requesting"; sensor: "microphone" | "motion"; seconds: number }
  /** 許可のあとの「準備はいい？ 3, 2, 1」。この間はセンサーを読まない */
  | { phase: "countdown"; count: number; seconds: number }
  | { phase: "denied"; reason: "denied" | "unsupported"; message?: string }
  | { phase: "measuring"; elapsed: number; samples: number; seconds: number }
  | { phase: "done"; features: Features; checks: LocalCheck[]; rawHash: string; seconds: number; stopped: boolean };

export interface MeasurementOptions {
  /** 加速度の値が 1 つも届かなかった（Chromebook など）。端末の段階を T0 に下げるために使う */
  onMotionUnavailable?: () => void;
}

const MIN_MOTION_SAMPLES = 50;
const MIN_PITCH_FRAMES = 10;
const DEFAULT_LENGTH_M = 0.8;
const COUNTDOWN_FROM = 3;
const COUNT_MS = 1000;
/** カウントダウンのあとは承認タップの揺れが無いので、合図の直後に放しても最初の最下点を拾えるように短くする */
const SETTLE_AFTER_COUNTDOWN_MS = 200;

const isMotionSensor = (s: Sensor): s is Permit["sensors"][number] => s === "accelerometer" || s === "gyroscope";
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** 承認 → 許可 → 3, 2, 1 → 収集 → 端末内計算 → 速報検査。生データはこのフックの外に出さない */
export function useMeasurement({ onMotionUnavailable }: MeasurementOptions = {}) {
  const [state, setState] = useState<MeasurementState>({ phase: "idle" });
  const stopRef = useRef<(() => void) | null>(null);
  const stoppedRef = useRef(false);
  /** 実行ごとの番号。やめた・戻ったあとに遅れて返ってきた許可や測定結果で、画面を書き換えないため */
  const runRef = useRef(0);

  const start = useCallback(
    async (spec: MeasureSpec, variant: Variant) => {
      const run = ++runRef.current;
      const current = () => runRef.current === run;
      const set = (s: MeasurementState) => {
        if (current()) setState(s);
      };
      stoppedRef.current = false;
      const measuring = () => set({ phase: "measuring", elapsed: 0, samples: 0, seconds: spec.seconds });
      const tick = (elapsed: number, samples: number) => set({ phase: "measuring", elapsed, samples, seconds: spec.seconds });
      const finish = (features: Features, rawHash: string) =>
        set({ phase: "done", features, checks: checksFor(features, variant), rawHash, seconds: spec.seconds, stopped: stoppedRef.current });
      const countdown = async (): Promise<boolean> => {
        for (let count = COUNTDOWN_FROM; count > 0; count--) {
          set({ phase: "countdown", count, seconds: spec.seconds });
          await wait(COUNT_MS);
          if (!current()) return false;
        }
        return true;
      };

      if (spec.profile === "pitch") {
        const ctx = createAudioContext(); // 許可を待つ前に、タップの中で作る（iOS）
        set({ phase: "requesting", sensor: "microphone", seconds: spec.seconds });
        const mic = await requestMic();
        if (!current() || !ctx || mic.kind !== "granted") {
          if (mic.kind === "granted") mic.stream.getTracks().forEach((track) => track.stop());
          void ctx?.close();
          const reason = mic.kind === "granted" ? "unsupported" : mic.kind;
          set({ phase: "denied", reason, message: reason === "denied" ? "マイクの許可がありませんでした" : "この端末ではマイクが使えません" });
          return;
        }
        if (!(await countdown())) {
          mic.stream.getTracks().forEach((track) => track.stop());
          void ctx.close();
          return;
        }
        measuring();
        const { done, stop } = collectPitch(ctx, mic.stream, spec.seconds, tick);
        stopRef.current = stop;
        const buf = await done;
        stopRef.current = null;
        if (!current()) return;
        if (buf.frames.length < MIN_PITCH_FRAMES) {
          set({ phase: "denied", reason: "unsupported", message: "音をほとんど読み取れませんでした" });
          return;
        }
        finish(analyzePitch(buf), await pitchRawHash(buf));
        return;
      }

      set({ phase: "requesting", sensor: "motion", seconds: spec.seconds });
      const permission = await requestMotionPermission(); // iOS はこのタップの中で呼ぶ
      if (!current()) return;
      if (permission !== "granted") {
        set({ phase: "denied", reason: permission });
        return;
      }
      if (!(await countdown())) return;
      measuring();
      const { done, stop } = collect({ sensors: spec.sensors.filter(isMotionSensor), seconds: spec.seconds }, tick);
      stopRef.current = stop;
      const raw = await done;
      stopRef.current = null;
      if (!current()) return;
      if (raw.t.length < MIN_MOTION_SAMPLES) {
        if (raw.t.length === 0) onMotionUnavailable?.();
        set({ phase: "denied", reason: "unsupported", message: "この端末では加速度センサーの値が届きません" });
        return;
      }
      const features =
        spec.profile === "pendulum_speed" ? analyzeSpeed(raw, spec.lengthM ?? DEFAULT_LENGTH_M, SETTLE_AFTER_COUNTDOWN_MS) : analyzePeriod(raw);
      finish(features, await motionRawHash(raw));
    },
    [onMotionUnavailable],
  );

  const stop = useCallback(() => {
    stoppedRef.current = true;
    stopRef.current?.();
  }, []);

  const reset = useCallback(() => {
    runRef.current++;
    stopRef.current?.();
    stopRef.current = null;
    setState({ phase: "idle" });
  }, []);

  const markUnsupported = useCallback((message: string) => {
    runRef.current++;
    setState({ phase: "denied", reason: "unsupported", message });
  }, []);

  return { state, start, stop, reset, markUnsupported };
}
