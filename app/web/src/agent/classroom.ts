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

/**
 * 先生のセッションの印。PIN で入ったときに教員画面の元データと一緒に届き、以後の呼び出しに付ける。
 * PIN の総当たりで学級がロックされても、入っている先生の画面は止まらない（10/2 採点 2-6）
 */
const teacherTokens = new Map<string, string>();
function teacherAuth(classCode: string, pin: string): { pin: string; token?: string } {
  const token = teacherTokens.get(classCode.trim().toUpperCase());
  return token ? { pin, token } : { pin };
}

export interface JoinInfo extends ClassInfo {
  number: string;
  /** 最初の入場でだけ返る合言葉。2 台目（家のスマホ）は同じ番号にこれを添える */
  secret: string | null;
}

export async function joinClass(classCode: string, number: string, secret?: string | null): Promise<JoinInfo> {
  const body: Record<string, string> = { number: number.trim().toUpperCase() };
  if (secret) body.secret = secret.trim().toUpperCase();
  const info = await call(`/api/class/${enc(classCode)}/join`, { method: "POST", body: JSON.stringify(body) });
  const j = info as JoinInfo;
  return { ...j, number: typeof j.number === "string" ? j.number : body.number, secret: typeof j.secret === "string" ? j.secret : null };
}

/** 先生が番号の合言葉を消す（端末を替えた子のため） */
export async function resetStudent(classCode: string, pin: string, number: string): Promise<void> {
  const res = await fetch(`/api/class/${enc(classCode)}/students/${encodeURIComponent(number)}/reset`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(teacherAuth(classCode, pin)) });
  if (!res.ok) throw new ClassError(`リセットに失敗しました（${res.status}）`, res.status);
}

export function fetchClass(classCode: string): Promise<ClassInfo> {
  return call(`/api/class/${enc(classCode)}`);
}

export function setClassHalt(classCode: string, pin: string, halted: boolean): Promise<ClassInfo> {
  return call(`/api/class/${enc(classCode)}/halt`, { method: "POST", body: JSON.stringify({ ...teacherAuth(classCode, pin), halted }) });
}

export function setClassPolicyOnServer(classCode: string, pin: string, allowedSensors: Sensor[], teacherEnabled: string[]): Promise<ClassInfo> {
  return call(`/api/class/${enc(classCode)}/policy`, { method: "PUT", body: JSON.stringify({ ...teacherAuth(classCode, pin), allowed_sensors: allowedSensors, teacher_enabled: teacherEnabled }) });
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
  /** a・b は採用値、tolerance は判定に使った許容誤差（単位はテーマの量） */
  result: { observed: "faster" | "slower" | "same" | "unknown"; consistent: boolean | null; statement: string; a?: number; b?: number; tolerance?: number } | null;
  plan_source: string | null;
  trace_id: string | null;
  /** 段の名前のない古い形（10/2 まで）。読むだけ */
  trace_ids?: string[];
  /** この記録でエージェントを呼んだトレースと段（計画・再計画・次の一手・会話）。先生・開発者が判断の経路を追える */
  traces?: { stage: string; id: string }[];
  /** 測定ごとの要約（二つの測り方の値・落ちた検査・生データのハッシュ）。保留に至った経路をたどれる */
  measurements?: { condition: "A" | "B"; values: (number | null)[]; failed: string[]; pass: boolean; raw_hash: string | null; at: string }[];
  /** 端末で計算した SHA-256（全桁） */
  hash?: string | null;
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
  /** PIN で入ったときにサーバが渡すセッションの印（8 時間） */
  session_token?: string | null;
  class_code: string;
  halted: boolean;
  allowed_sensors: string[];
  teacher_enabled: string[];
  students: StudentRow[];
  fetched_at: string;
}

export async function postRecordSummary(classCode: string, number: string, secret: string, record: RecordSummary): Promise<void> {
  const res = await fetch("/api/records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ class_code: classCode, number, secret, record }) });
  if (!res.ok) throw new ClassError(`記録の送信に失敗しました（${res.status}）`, res.status);
}

export async function fetchDashboard(classCode: string, pin: string): Promise<DashboardInfo> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`/api/class/${enc(classCode)}/dashboard`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(teacherAuth(classCode, pin)), signal: controller.signal, cache: "no-store" });
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
  const data = (await res.json()) as DashboardInfo;
  if (data.session_token) teacherTokens.set(classCode.trim().toUpperCase(), data.session_token);
  return data;
}

/** 学級の見立て（POST /api/class/{code}/insight）。ラボ先生が読み取り専用のツールで学級を読み、先生に 3 行で伝える */
export interface InsightInfo {
  lines: string[];
  visit_first: string[];
  suggestion: string;
  source: "agent" | "rules";
  policy_fixed: boolean;
  trail: string[];
  model_calls: number;
  tool_calls: number;
  tools_denied: number;
  cached: boolean;
  generated_at: string;
  trace_id: string;
}

const INSIGHT_TIMEOUT_MS = 25_000;

export async function fetchInsight(classCode: string, pin: string): Promise<InsightInfo> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INSIGHT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`/api/class/${enc(classCode)}/insight`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(teacherAuth(classCode, pin)), signal: controller.signal, cache: "no-store" });
  } catch {
    throw new ClassError("ラボ先生につながりませんでした", 0);
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
    throw new ClassError(detail || `見立てを取れませんでした（${res.status}）`, res.status);
  }
  const data = (await res.json()) as InsightInfo;
  if (!Array.isArray(data.lines) || !Array.isArray(data.visit_first)) throw new ClassError("見立てを読み取れませんでした", 0);
  return data;
}

/** 開発者・審査向け: 記録の trace_id から Cloud Trace の画面へ（学級の先生は GCP にログインしていないので開けない） */
export const TRACE_PROJECT = "phonelab-2026";
export function traceUrl(traceId: string): string {
  return `https://console.cloud.google.com/traces/list?project=${TRACE_PROJECT}&tid=${encodeURIComponent(traceId)}`;
}
