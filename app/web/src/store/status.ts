/** トップのテーマカードに出す状態を、記録・端末能力・学級許可から導く（docs/ux-flow.md 3 章） */
import { SENSOR_LABEL, type Sensor, type Theme } from "../catalog/themes";
import type { StudyRecord } from "./records";

export interface DeviceCaps {
  motion: boolean;
  media: boolean;
}
export interface ClassPolicy {
  allowedSensors: Sensor[];
  teacherEnabled: string[];
  halted: boolean;
}

export const DEFAULT_CLASS_POLICY: ClassPolicy = {
  allowedSensors: ["accelerometer", "gyroscope", "microphone"],
  teacherEnabled: [],
  halted: false,
};

export function detectCaps(): DeviceCaps {
  return {
    motion: typeof window !== "undefined" && "DeviceMotionEvent" in window,
    media: typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
  };
}

export type ThemeStatus =
  | { kind: "new" }
  | { kind: "open"; label: string; recordId: string }
  | { kind: "held"; recordId: string }
  | { kind: "judged"; recordId: string }
  | { kind: "done"; count: number; total: number; labels: string[] }
  | { kind: "unavailable"; reason: string };

const STAGE_LABEL: Record<StudyRecord["stage"], string> = {
  predict: "予想の続き",
  plan: "承認待ち",
  setup_A: "測定 A の準備",
  measure_A: "測定 A",
  setup_B: "測定 B の準備",
  measure_B: "測定 B",
  result: "結果",
};

export function themeStatus(theme: Theme, records: StudyRecord[], caps: DeviceCaps, policy: ClassPolicy, testMode = false): ThemeStatus {
  if (!testMode) {
  if (theme.enabledBy === "teacher" && !policy.teacherEnabled.includes(theme.id)) return { kind: "unavailable", reason: "先生が有効化する実験です" };
  if (theme.enabledBy === "later") return { kind: "unavailable", reason: "準備中" };
  const denied = theme.sensors.find((s) => !policy.allowedSensors.includes(s) && s !== "speaker");
  if (denied) return { kind: "unavailable", reason: `${SENSOR_LABEL[denied]}は学級で不可` };
  const needsMotion = theme.sensors.includes("accelerometer") || theme.sensors.includes("gyroscope");
  if (needsMotion && !caps.motion) return { kind: "unavailable", reason: "この端末には加速度センサーがありません" };
  const needsMedia = theme.sensors.includes("microphone") || theme.sensors.includes("camera");
  if (needsMedia && !caps.media) return { kind: "unavailable", reason: "この端末ではマイク・カメラが使えません" };
  }

  const mine = records.filter((r) => r.themeId === theme.id);
  const active = mine.find((r) => r.status === "open" || r.status === "held" || r.status === "judged");
  if (active?.status === "held") return { kind: "held", recordId: active.id };
  if (active?.status === "judged") return { kind: "judged", recordId: active.id };
  if (active) return { kind: "open", label: STAGE_LABEL[active.stage], recordId: active.id };
  const signed = mine.filter((r) => r.status === "signed");
  if (signed.length) {
    const labels = signed.map((r) => theme.variants.find((v) => v.id === r.variantId)?.changes.split("（")[0] ?? "").filter(Boolean);
    const total = Math.max(theme.variants.length, 1);
    return { kind: "done", count: Math.min(signed.length, total), total, labels };
  }
  return { kind: "new" };
}
