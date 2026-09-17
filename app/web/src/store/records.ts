/**
 * 記録と生徒の情報の保存（いまは localStorage、あとで Firestore をサーバ経由に）。
 * 形は docs/record-schema.md に合わせる。名前は持たない。
 */
import { useSyncExternalStore } from "react";
import type { LocalCheck } from "../measure/checks";
import type { Features } from "../measure/features";
import type { School, Sensor, Variable } from "../catalog/themes";

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
  features: Features;
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
export interface ChatMessage {
  role: "student" | "teacher";
  text: string;
  at: string;
}
/** ラボ先生とのふり返り。thinking は先生の説明を開くための「自分の考え」 */
export interface ChatLog {
  thinking: string;
  messages: ChatMessage[];
  revealed: boolean;
  turnsUsed: number;
  limitReached: boolean;
}
export interface RecordEvent {
  t: string;
  k: string;
  tone?: "orange" | "teal";
  body: string;
}
/** 実験を誰が選んだか。agent = ラボ先生（Gemini）、policy = 決定論の Policy、catalog = カタログの順（上限・読めない出力）、stub = 端末内（オフライン） */
export interface PlanInfo {
  source: "agent" | "policy" | "catalog" | "stub";
  why: string;
  traceId: string | null;
}
/** 保留のあとのラボ先生の提案（保留ごとに 1 回。measurementIndex でどの保留の分かを持つ） */
export interface HoldAdvice {
  measurementIndex: number;
  action: "retry" | "switch";
  experimentId: string | null;
  advice: string;
  source: "agent" | "policy" | "catalog" | "stub";
  traceId: string | null;
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
  /** 古い記録には無い */
  plan?: PlanInfo | null;
  holdAdvice?: HoldAdvice | null;
  /** ラボ先生に再計画を聞いた回数（サーバの上限 3 回 / 記録） */
  replanCalls?: number;
  /** ラボ先生（Planner）に聞いた回数。サーバの上限（5 回 / 実験）と同じ数を送る */
  plannerCalls?: number;
  approvedAt: string | null;
  measurements: Measurement[];
  retries: Record<CondKey, number>;
  /** 条件ごとに、検査を通った回数（何回か測って平均する実験で使う。測り直すと 0 に戻る） */
  tries?: Record<CondKey, number>;
  holdCodes: string[];
  result: Judgement | null;
  explain: string;
  nextPrediction: { variantId: string | null; direction: Direction } | null;
  events: RecordEvent[];
  signature: { signer: string; hash: string; server: boolean } | null;
  /** 古い記録には無い（undefined は null として扱う） */
  chat?: ChatLog | null;
  createdAt: string;
  updatedAt: string;
}

export interface Student {
  classCode: string;
  number: string;
  /** 番号の合言葉。最初の入場でサーバが一度だけ渡す。記録の送信と説明の解禁に要る */
  secret?: string;
}

/** サーバの学級（/api/class）。先生の許可・有効化・停止。入場したときと、測定中のポーリングで更新する */
export interface ClassState {
  classCode: string;
  school: School;
  allowedSensors: Sensor[];
  teacherEnabled: string[];
  halted: boolean;
  updatedAt: string;
  /** この端末が最後に受け取った時刻 */
  seenAt: string;
}

const KEY_RECORDS = "phonelab.records.v1";
const KEY_STUDENT = "phonelab.student.v1";
const KEY_HALTED = "phonelab.halted.v1";
const KEY_SETTINGS = "phonelab.settings.v1";
const KEY_CLASS = "phonelab.class.v1";

export interface Settings {
  /** テストモード: 全テーマを選べ、センサーが無くてもサンプルで進める（記録に demo が残る） */
  testMode: boolean;
  /** 入口の学校種。学級コードに持たせるまでは端末ごとの設定 */
  school: School;
}
const DEFAULT_SETTINGS: Settings = { testMode: false, school: "jhs" };

type State = { records: StudyRecord[]; student: Student | null; halted: boolean; settings: Settings; classState: ClassState | null };

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

let state: State = { records: read(KEY_RECORDS, []), student: read(KEY_STUDENT, null), halted: read(KEY_HALTED, false), settings: { ...DEFAULT_SETTINGS, ...read(KEY_SETTINGS, {}) }, classState: read(KEY_CLASS, null) };
const listeners = new Set<() => void>();
function emit(next: State): void {
  const prev = state;
  state = next;
  // 変わったものだけ書く（学級のポーリングのたびに全記録を書き直さない）
  if (next.records !== prev.records) write(KEY_RECORDS, next.records);
  if (next.student !== prev.student) write(KEY_STUDENT, next.student);
  if (next.halted !== prev.halted) write(KEY_HALTED, next.halted);
  if (next.settings !== prev.settings) write(KEY_SETTINGS, next.settings);
  if (next.classState !== prev.classState) write(KEY_CLASS, next.classState);
  listeners.forEach((l) => l());
}
function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function useStore(): State {
  return useSyncExternalStore(subscribe, () => state);
}
/** 画面の外（記録の同期など）から状態の変化を聞く */
export function subscribeStore(listener: () => void): () => void {
  return subscribe(listener);
}
export function getState(): State {
  return state;
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
export function setClassState(classState: ClassState | null): void {
  emit({ ...state, classState });
}
/** 学級コード付きの API 呼び出しに使う。入場していなければ null */
export function currentClassCode(): string | null {
  return state.student?.classCode ?? null;
}
export function currentNumber(): string | null {
  return state.student?.number ?? null;
}
export function currentSecret(): string | null {
  return state.student?.secret ?? null;
}

/* ---------- 記録 ---------- */
export const nowIso = (): string => new Date().toISOString();
export const hhmm = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** 6 文字の記録 id。端末内で衝突しないことを確かめる（4 桁の乱数だと同じ id の記録を一緒に更新していた） */
function newId(): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    let id = "";
    for (let i = 0; i < 6; i++) id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
    if (!state.records.some((r) => r.id === id)) return id;
  }
  return `${Date.now().toString(36).toUpperCase()}`;
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
    tries: { A: 0, B: 0 },
    holdCodes: [],
    result: null,
    explain: "",
    nextPrediction: null,
    events: [],
    signature: null,
    chat: null,
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
  emit({ records: [], student: state.student, halted: false, settings: state.settings, classState: state.classState });
}
