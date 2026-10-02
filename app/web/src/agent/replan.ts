/**
 * 保留のあとの再計画（POST /api/replan）。検査の理由を読んだラボ先生（AI）が、
 * 同じ実験でやり方を一つ直して測り直すか、同じテーマの別の実験へ切り替えるかを提案する。
 * つながらないときは端末内の定型（Hold.tsx）に縮退する。
 */
import { currentClassCode, currentNumber, currentSecret } from "../store/records";
import type { CondKey } from "../store/records";

export interface ReplanReply {
  action: "retry" | "switch";
  experiment_id: string | null;
  advice: string;
  source: "agent" | "policy" | "catalog";
  policy_fixed: boolean;
  self_corrected?: boolean;
  trail?: string[];
  replan_calls: number;
  trace_id: string;
}

export interface ReplanInput {
  themeId: string;
  variantId: string;
  condition: CondKey;
  holdCodes: string[];
  retries: number;
  prediction: string;
  doneVariantIds: string[];
  replanCalls: number;
  recordId: string;
}

const TIMEOUT_MS = 13_000;

export class ReplanError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export async function requestReplan(input: ReplanInput): Promise<ReplanReply> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch("/api/replan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        theme_id: input.themeId,
        variant_id: input.variantId,
        condition: input.condition,
        hold_codes: input.holdCodes.slice(0, 10),
        retries: Math.min(input.retries, 10),
        prediction: input.prediction.slice(0, 500),
        done_variant_ids: input.doneVariantIds.slice(-10),
        replan_calls: input.replanCalls,
        class_code: currentClassCode(),
        number: currentNumber(),
        secret: currentSecret(),
        record_id: input.recordId,
      }),
    });
  } catch {
    throw new ReplanError("ラボ先生につながりませんでした");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new ReplanError(`ラボ先生が答えられませんでした（${res.status}）`, res.status);
  const data = (await res.json()) as ReplanReply;
  if (typeof data.advice !== "string" || (data.action !== "retry" && data.action !== "switch")) throw new ReplanError("返事を読み取れませんでした");
  return data;
}
