import { useCallback, useRef, useState } from "react";
import { analyze, collect, localChecks, rawHash, requestMotionPermission, type LocalCheck, type PendulumFeatures, type Permit } from "./pendulum";

export type MeasurementState =
  | { phase: "idle" }
  | { phase: "denied"; reason: "denied" | "unsupported"; message?: string }
  | { phase: "measuring"; elapsed: number; samples: number; seconds: number }
  | { phase: "done"; features: PendulumFeatures; checks: LocalCheck[]; rawHash: string; seconds: number; stopped: boolean };

/** 承認 → 許可 → 収集 → 端末内計算 → 速報検査。生データはこのフックの外に出さない */
export function useMeasurement() {
  const [state, setState] = useState<MeasurementState>({ phase: "idle" });
  const stopRef = useRef<(() => void) | null>(null);
  const stoppedRef = useRef(false);

  const start = useCallback(async (permit: Permit) => {
    const p = await requestMotionPermission();
    if (p !== "granted") {
      setState({ phase: "denied", reason: p });
      return;
    }
    stoppedRef.current = false;
    setState({ phase: "measuring", elapsed: 0, samples: 0, seconds: permit.seconds });
    const { done, stop } = collect(permit, (elapsed, samples) => setState({ phase: "measuring", elapsed, samples, seconds: permit.seconds }));
    stopRef.current = stop;
    const raw = await done;
    stopRef.current = null;
    if (raw.t.length < 50) {
      setState({ phase: "denied", reason: "unsupported" });
      return;
    }
    const features = analyze(raw);
    const hash = await rawHash(raw);
    setState({ phase: "done", features, checks: localChecks(features), rawHash: hash, seconds: permit.seconds, stopped: stoppedRef.current });
  }, []);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    stopRef.current?.();
  }, []);

  const reset = useCallback(() => setState({ phase: "idle" }), []);
  const markUnsupported = useCallback((message: string) => setState({ phase: "denied", reason: "unsupported", message }), []);

  return { state, start, stop, reset, markUnsupported };
}
