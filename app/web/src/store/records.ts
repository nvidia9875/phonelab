/**
 * 記録と生徒の情報の保存（いまは localStorage、あとで Firestore をサーバ経由に）。
 * 形は docs/record-schema.md に合わせる。名前は持たない。
 */
import { useSyncExternalStore } from "react";
import type { LocalCheck, PendulumFeatures } from "../measure/pendulum";
import type { Variable } from "../catalog/themes";

export type Direction = "faster" | "same" | "slower" | "unknown";
export type RecordStatus = "open" | "held" | "judged" | "signed" | "stopped";
export type Stage = "predict" | "plan" | "setup_A" | "measure_A" | "setup_B" | "measure_B" | "result";
export type CondKey = "A" | "B";

export interface Claim {
  variable: Variable | "unknown";
  direction: Direction;
}
export interface Measurement {
  condition: CondKey;
  features: PendulumFeatures;
  checks: LocalCheck[];
  rawHash: string;
  pass: boolean;
  at: string;
  demo?: boolean;
}
export interface Judgement {
  a: number;
  b: number;
  delta: number;
  tolerance: number;
  observed: Direction;
  consistent: boolean | null;
  statement: string;
  detail: string;
}
export interface RecordEvent {
  t: string;
  k: string;
  tone?: "orange" | "teal";
  body: string;
}
export interface Rejection {
  title: string;
  reasons: string[];
  quoted: string;
  alternativeVariantId: string;
}
export interface StudyRecord {
  id: string;
  themeId: string;
  variantId: string | null;
  status: RecordStatus;
  stage: Stage;
  prediction: { text: string; claim: Claim | null; questionBack: string | null; hints: number };
  rejection: Rejection | null;
  approvedAt: string | null;
  measurements: Measurement[];
  retries: Record<CondKey, number>;
  holdCodes: string[];
  result: Judgement | null;
  explain: string;
  nextPrediction: { variantId: string | null; direction: Direction } | null;
  events: RecordEvent[];
  signature: { signer: string; hash: string; server: boolean } | null;
  createdAt: string;
  updatedAt: string;
}

export interface Student {
  classCode: string;
  number: string;
}

const KEY_RECORDS = "phonelab.records.v1";
const KEY_STUDENT = "phonelab.student.v1";
const KEY_HALTED = "phonelab.halted.v1";
const KEY_SETTINGS = "phonelab.settings.v1";

export interface Settings {
  /** テストモード: 全テーマを選べ、センサーが無くてもサンプルで進める（記録に demo が残る） */
  testMode: boolean;
}
const DEFAULT_SETTINGS: Settings = { testMode: false };

type State = { records: StudyRecord[]; student: Student | null; halted: boolean; settings: Settings };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode など。メモリ上の状態は保つ */
  }
}

let state: State = { records: read(KEY_RECORDS, []), student: read(KEY_STUDENT, null), halted: read(KEY_HALTED, false), settings: { ...DEFAULT_SETTINGS, ...read(KEY_SETTINGS, {}) } };
const listeners = new Set<() => void>();
function emit(next: State): void {
  state = next;
  write(KEY_RECORDS, state.records);
  write(KEY_STUDENT, state.student);
  write(KEY_HALTED, state.halted);
  write(KEY_SETTINGS, state.settings);
  listeners.forEach((l) => l());
}
function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function useStore(): State {
  return useSyncExternalStore(subscribe, () => state);
}

/* ---------- 生徒 ---------- */
export function setStudent(student: Student | null): void {
  emit({ ...state, student });
}
export function setHalted(halted: boolean): void {
  emit({ ...state, halted });
}
export function setSettings(patch: Partial<Settings>): void {
  emit({ ...state, settings: { ...state.settings, ...patch } });
}

/* ---------- 記録 ---------- */
export const nowIso = (): string => new Date().toISOString();
export const hhmm = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
function newId(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function createRecord(themeId: string): StudyRecord {
  const at = nowIso();
  const rec: StudyRecord = {
    id: newId(),
    themeId,
    variantId: null,
    status: "open",
    stage: "predict",
    prediction: { text: "", claim: null, questionBack: null, hints: 0 },
    rejection: null,
    approvedAt: null,
    measurements: [],
    retries: { A: 0, B: 0 },
    holdCodes: [],
    result: null,
    explain: "",
    nextPrediction: null,
    events: [],
    signature: null,
    createdAt: at,
    updatedAt: at,
  };
  emit({ ...state, records: [rec, ...state.records] });
  return rec;
}

export function updateRecord(id: string, patch: (r: StudyRecord) => StudyRecord): StudyRecord | null {
  let out: StudyRecord | null = null;
  const records = state.records.map((r) => {
    if (r.id !== id) return r;
    out = { ...patch(r), updatedAt: nowIso() };
    return out;
  });
  emit({ ...state, records });
  return out;
}

export function addEvent(r: StudyRecord, k: string, body: string, tone?: "orange" | "teal"): StudyRecord {
  return { ...r, events: [...r.events, { t: hhmm(nowIso()), k, body, tone }] };
}

export function recordById(id: string): StudyRecord | undefined {
  return state.records.find((r) => r.id === id);
}
export function recordsForTheme(themeId: string, records = state.records): StudyRecord[] {
  return records.filter((r) => r.themeId === themeId);
}
/** テーマの「続き」になる記録（open / held / judged で最新のもの） */
export function activeRecordForTheme(themeId: string, records = state.records): StudyRecord | undefined {
  return records.find((r) => r.themeId === themeId && (r.status === "open" || r.status === "held" || r.status === "judged"));
}
export function clearAll(): void {
  emit({ records: [], student: state.student, halted: false, settings: state.settings });
}
