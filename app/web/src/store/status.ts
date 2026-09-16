/** トップのテーマカードに出す状態を、記録・端末能力・学級許可から導く（docs/ux-flow.md 3 章・9 章） */
import { SENSOR_LABEL, themesFor, type Sensor, type Theme, type Tier } from "../catalog/themes";
import type { StudyRecord } from "./records";

export interface DeviceCaps {
  /** DeviceMotionEvent の型があるか（値が届くとは限らない） */
  motion: boolean;
  media: boolean;
  /** 値の入った devicemotion が実際に届いたか。iOS は許可のタップまで unknown */
  motionEvents: "unknown" | "yes" | "no";
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
    motionEvents: "unknown",
  };
}

const TIER_RANK: Record<Tier, number> = { T0: 0, T1: 1, T2: 2 };

/** 端末の段階。値が届かないと分かったら T0。まだ分からない端末（iOS）は測るときに確かめる */
export function deviceTier(caps: DeviceCaps): Tier {
  return !caps.motion || caps.motionEvents === "no" ? "T0" : "T1";
}

/** この端末で測れる、同じ学校種のカメラ・マイクだけのテーマ */
function alternativeFor(theme: Theme): string {
  const alt = themesFor(theme.school).find((t) => t.minTier === "T0" && t.enabledBy === "default");
  return alt ? `「${alt.title}」はこの端末で測れます` : "";
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

function availability(theme: Theme, caps: DeviceCaps, policy: ClassPolicy): string | null {
  if (theme.enabledBy === "teacher" && !policy.teacherEnabled.includes(theme.id)) return theme.home ? "先生が有効化すると、家で自分のスマホからできます" : "先生が有効化する実験です";
  if (theme.enabledBy === "later") return "準備中";
  const denied = theme.sensors.find((s) => !policy.allowedSensors.includes(s) && s !== "speaker");
  if (denied) return `${SENSOR_LABEL[denied]}は学級で不可`;
  if (TIER_RANK[theme.minTier] > TIER_RANK[deviceTier(caps)]) return `この端末には加速度センサーがありません。${alternativeFor(theme)}`;
  const needsMedia = theme.sensors.includes("microphone") || theme.sensors.includes("camera");
  if (needsMedia && !caps.media) return "この端末ではマイク・カメラが使えません";
  return null;
}

export function themeStatus(theme: Theme, records: StudyRecord[], caps: DeviceCaps, policy: ClassPolicy, testMode = false): ThemeStatus {
  const reason = testMode ? null : availability(theme, caps, policy);
  if (reason) return { kind: "unavailable", reason };

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
