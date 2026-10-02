/**
 * ラボ先生とのふり返り（POST /api/chat）。
 * 先生の説明は、生徒が自分の考えを書いたあとだけサーバが Gemini に渡す。端末は「聞かせて」と頼むだけ。
 */
import type { School, Theme, Variant } from "../catalog/themes";
import { currentClassCode, currentNumber, currentSecret, type ChatMessage, type StudyRecord } from "../store/records";

export type ChatSituation = "hold" | "mismatch" | "match" | "unjudged";

/** サーバ（server/main.py）と同じ値 */
export const MIN_THINKING_CHARS = 8;
export const CHAT_TURNS_PER_RECORD = 10;
const MAX_HISTORY = 20;
const MAX_HOLD_REASONS = 6;
const MAX_TEXT = 500;

export interface ChatRequest {
  variant_id: string;
  school: School;
  theme_title: string;
  variant_title: string;
  situation: ChatSituation;
  prediction: string;
  result_statement: string;
  hold_reasons: string[];
  student_thinking: string;
  messages: { role: ChatMessage["role"]; text: string }[];
  message: string;
  turns_used: number;
  reveal: boolean;
  class_code: string | null;
  number: string | null;
  /** 学級に入っている端末だけ。説明の解禁はサーバが記録の状態で決める */
  secret: string | null;
  record_id: string | null;
}

export interface ChatReply {
  reply: string;
  revealed: boolean;
  turns_used: number;
  limit_reached: boolean;
  trace_id: string;
}

export class ChatError extends Error {}

export function chatSituation(rec: StudyRecord): ChatSituation {
  if (!rec.result || rec.result.undecided) return "hold";
  if (rec.result.consistent === null) return "unjudged";
  return rec.result.consistent ? "match" : "mismatch";
}

/** 話しはじめてよいか（自分の考えを書いたか） */
export function canStart(thinking: string): boolean {
  return thinking.trim().length >= MIN_THINKING_CHARS;
}

/** 先生の説明を開いてよいか。自分の考えを書き、かつ判定が出ているとき。保留では測る前に答えを知ってしまうので開かない */
export function canReveal(thinking: string, situation: ChatSituation): boolean {
  return situation !== "hold" && canStart(thinking);
}

/** 保留になった測定の、通らなかった検査の文 */
export function holdReasons(rec: StudyRecord): string[] {
  const last = rec.measurements[rec.measurements.length - 1];
  if (!last) return [];
  return last.checks.filter((c) => !c.ok).map((c) => c.text).slice(0, MAX_HOLD_REASONS);
}

/** チャットで書いた考え。無ければ結果の画面の「なぜそうなったと思う？」 */
export function studentThinking(rec: StudyRecord): string {
  return (rec.chat?.thinking || rec.explain || "").trim();
}

export interface ChatRequestInput {
  rec: StudyRecord;
  theme: Theme;
  variant: Variant;
  school: School;
  message: string;
  reveal: boolean;
}

export function chatRequestFor({ rec, theme, variant, school, message, reveal }: ChatRequestInput): ChatRequest {
  const situation = chatSituation(rec);
  return {
    variant_id: variant.id,
    school,
    theme_title: theme.title,
    variant_title: variant.title,
    situation,
    prediction: rec.prediction.text.slice(0, MAX_TEXT),
    result_statement: rec.result?.statement ?? "",
    hold_reasons: situation === "hold" ? holdReasons(rec) : [],
    student_thinking: studentThinking(rec).slice(0, MAX_TEXT),
    messages: (rec.chat?.messages ?? []).slice(-MAX_HISTORY).map((m) => ({ role: m.role, text: m.text.slice(0, MAX_TEXT) })),
    message: message.slice(0, MAX_TEXT),
    turns_used: rec.chat?.turnsUsed ?? 0,
    reveal,
    class_code: currentClassCode(),
    number: currentNumber(),
    secret: currentSecret(),
    record_id: rec.id,
  };
}

function isChatReply(value: unknown): value is ChatReply {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.reply === "string" && typeof v.revealed === "boolean" && typeof v.turns_used === "number" && typeof v.limit_reached === "boolean";
}

async function errorDetail(res: Response): Promise<string | null> {
  try {
    const body: unknown = await res.json();
    if (typeof body === "object" && body !== null && typeof (body as { detail?: unknown }).detail === "string") return (body as { detail: string }).detail;
  } catch {
    /* 本文が JSON でない（Cloud Run の前段のエラーなど） */
  }
  return null;
}

export async function sendChat(req: ChatRequest): Promise<ChatReply> {
  let res: Response;
  try {
    res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
  } catch {
    throw new ChatError("ラボ先生につながりませんでした。通信を確かめて、もう一度送ってください");
  }
  if (res.status === 429) throw new ChatError("少し時間をおいてから、もう一度話しかけてください");
  if (!res.ok) throw new ChatError((await errorDetail(res)) ?? "ラボ先生につながりませんでした。少し待ってから、もう一度");
  const body: unknown = await res.json();
  if (!isChatReply(body)) throw new ChatError("ラボ先生の返事を読み取れませんでした。もう一度送ってください");
  return body;
}
