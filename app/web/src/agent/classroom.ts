/**
 * 学級（/api/class/*）。学級コードで入場し、先生の許可・有効化・停止をサーバから受け取る。
 * 停止は測定中 2 秒ごとの GET で届く（docs/policy.md 5 章、architecture.md 4.3）。PWA は Firestore に触らない。
 */
import type { School, Sensor } from "../catalog/themes";

export interface ClassInfo {
  class_code: string;
  school: School;
  allowed_sensors: Sensor[];
  teacher_enabled: string[];
  halted: boolean;
  max_seconds: number;
  hints_per_experiment: number;
  updated_at: string;
}

export class ClassError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 8_000;

function isClassInfo(v: unknown): v is ClassInfo {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  return typeof c.class_code === "string" && typeof c.halted === "boolean" && Array.isArray(c.allowed_sensors) && Array.isArray(c.teacher_enabled) && (c.school === "jhs" || c.school === "hs");
}

async function call(path: string, init: RequestInit = {}): Promise<ClassInfo> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) }, signal: controller.signal, cache: "no-store" });
  } catch {
    throw new ClassError("学級につながりませんでした。通信を確かめてください", 0);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let detail = "";
    try {
      detail = String(((await res.json()) as { detail?: unknown }).detail ?? "");
    } catch {
      /* 本文が JSON でない */
    }
    throw new ClassError(detail || `学級の操作に失敗しました（${res.status}）`, res.status);
  }
  const data: unknown = await res.json();
  if (!isClassInfo(data)) throw new ClassError("学級の返事を読み取れませんでした", res.status);
  return data;
}

const enc = (code: string) => encodeURIComponent(code.trim().toUpperCase());

export function joinClass(classCode: string, number: string): Promise<ClassInfo> {
  return call(`/api/class/${enc(classCode)}/join`, { method: "POST", body: JSON.stringify({ number: number.trim().toUpperCase() }) });
}

export function fetchClass(classCode: string): Promise<ClassInfo> {
  return call(`/api/class/${enc(classCode)}`);
}

export function setClassHalt(classCode: string, pin: string, halted: boolean): Promise<ClassInfo> {
  return call(`/api/class/${enc(classCode)}/halt`, { method: "POST", body: JSON.stringify({ pin, halted }) });
}

export function setClassPolicyOnServer(classCode: string, pin: string, allowedSensors: Sensor[], teacherEnabled: string[]): Promise<ClassInfo> {
  return call(`/api/class/${enc(classCode)}/policy`, { method: "PUT", body: JSON.stringify({ pin, allowed_sensors: allowedSensors, teacher_enabled: teacherEnabled }) });
}

/* ---------- 記録の要約と、先生の 1 画面 ---------- */

export interface RecordSummary {
  record_id: string;
  theme_id: string;
  variant_id: string | null;
  status: "open" | "held" | "judged" | "signed" | "stopped";
  stage: string;
  prediction: string;
  claim: { variable: string; direction: "faster" | "slower" | "same" | "unknown" } | null;
  hold_codes: string[];
  retries: { A?: number; B?: number };
  result: { observed: "faster" | "slower" | "same" | "unknown"; consistent: boolean | null; statement: string } | null;
  plan_source: string | null;
  trace_id: string | null;
  rejection_title: string | null;
  chat_turns: number;
  events: { t: string; k: string; body: string }[];
  updated_at: string;
}

export interface StudentRow {
  number: string;
  last_seen_at: string;
  current: RecordSummary | null;
}

export interface DashboardInfo {
  class_code: string;
  halted: boolean;
  teacher_enabled: string[];
  students: StudentRow[];
  fetched_at: string;
}

export async function postRecordSummary(classCode: string, number: string, record: RecordSummary): Promise<void> {
  const res = await fetch("/api/records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ class_code: classCode, number, record }) });
  if (!res.ok) throw new ClassError(`記録の送信に失敗しました（${res.status}）`, res.status);
}

export async function fetchDashboard(classCode: string, pin: string): Promise<DashboardInfo> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`/api/class/${enc(classCode)}/dashboard`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }), signal: controller.signal, cache: "no-store" });
  } catch {
    throw new ClassError("学級につながりませんでした", 0);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let detail = "";
    try {
      detail = String(((await res.json()) as { detail?: unknown }).detail ?? "");
    } catch {
      /* JSON でない */
    }
    throw new ClassError(detail || `学級の情報を取れませんでした（${res.status}）`, res.status);
  }
  return (await res.json()) as DashboardInfo;
}
