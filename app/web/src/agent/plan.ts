/**
 * ラボ先生の Planner（POST /api/plan）。予想を送ると、サーバが決定論の Policy → Gemini（構造化出力）→
 * PolicyPlugin の突き合わせ、の順で実験を一つ選んで返す。答えは端末にもサーバの Planner にも渡らない。
 * つながらない・遅いときは呼び出し側が端末内の stub に縮退する。
 */
import type { School } from "../catalog/themes";

export type PlanKind = "plan" | "question" | "hint" | "rejected";
export type PlanSource = "agent" | "policy" | "catalog";

export interface PlanRequest {
  theme_id: string;
  school: School;
  text: string;
  done_variant_ids: string[];
  previous_question_back: string | null;
  planner_calls: number;
  /** 学級コード。停止中ならサーバが 409 で断る */
  class_code: string | null;
  number: string | null;
}

export interface PlanReply {
  kind: PlanKind;
  variant_id: string | null;
  claim: { variable: string; direction: string } | null;
  why: string;
  question_back: string | null;
  rejection: { title: string; reasons: string[]; quoted: string; alternative_variant_id: string } | null;
  planner_calls: number;
  skipped: boolean;
  policy_fixed: boolean;
  /** 1 回目が検査に落ちて作り直させたときの理由（古いサーバには無い） */
  fix_reasons?: string[];
  self_corrected?: boolean;
  /** 判断の跡: 何を読み、何を選び、統制層が何を直したか。本文は入らない */
  trail?: string[];
  source: PlanSource;
  trace_id: string;
}

/** サーバ側の PLAN_TIMEOUT_S（12 秒）に少し足した値。これを超えたら端末内で選ぶ */
export const PLAN_TIMEOUT_MS = 13_000;
const MAX_TEXT = 500;
const MAX_DONE_IDS = 10;

export class PlanError extends Error {}

function isPlanReply(value: unknown): value is PlanReply {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.kind === "string" && typeof v.planner_calls === "number" && typeof v.source === "string" && typeof v.trace_id === "string";
}

export async function requestPlan(req: PlanRequest, timeoutMs = PLAN_TIMEOUT_MS): Promise<PlanReply> {
  const body: PlanRequest = {
    ...req,
    text: req.text.slice(0, MAX_TEXT),
    done_variant_ids: req.done_variant_ids.slice(-MAX_DONE_IDS),
    previous_question_back: req.previous_question_back?.slice(0, 200) ?? null,
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch("/api/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
  } catch {
    throw new PlanError("ラボ先生につながりませんでした");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new PlanError(`ラボ先生が答えられませんでした（${res.status}）`);
  const data: unknown = await res.json();
  if (!isPlanReply(data)) throw new PlanError("ラボ先生の返事を読み取れませんでした");
  return data;
}
