/**
 * 結果のあとの次の一手（POST /api/next）。今回の予想と測った結果の向きを読んだラボ先生（AI）が、
 * 次に確かめる実験と、次の予想を書かせる問いかけを返す（答えは言わない）。ふり返りが先なら reflect。
 * つながらないときは呼び出し側がカタログの順に縮退する。
 */
import type { School } from "../catalog/themes";
import type { Direction } from "../store/records";
import { currentClassCode, currentNumber, currentSecret } from "../store/records";

export interface NextReply {
  action: "next" | "reflect";
  experiment_id: string | null;
  question: string;
  why: string;
  source: "agent" | "catalog";
  policy_fixed: boolean;
  self_corrected?: boolean;
  trail?: string[];
  next_calls: number;
  trace_id: string;
}

export interface NextInput {
  themeId: string;
  variantId: string;
  school: School;
  prediction: string;
  claimDirection: Direction;
  observed: Direction;
  consistent: boolean | null;
  explained: boolean;
  doneVariantIds: string[];
  nextCalls: number;
  recordId: string;
}

const TIMEOUT_MS = 13_000;

export class NextError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export async function requestNext(input: NextInput): Promise<NextReply> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch("/api/next", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        theme_id: input.themeId,
        variant_id: input.variantId,
        school: input.school,
        prediction: input.prediction.slice(0, 500),
        claim_direction: input.claimDirection,
        observed: input.observed,
        consistent: input.consistent,
        explained: input.explained,
        done_variant_ids: input.doneVariantIds.slice(-10),
        next_calls: Math.min(input.nextCalls, 3),
        class_code: currentClassCode(),
        number: currentNumber(),
        secret: currentSecret(),
        record_id: input.recordId,
      }),
    });
  } catch {
    throw new NextError("ラボ先生につながりませんでした");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new NextError(`ラボ先生が答えられませんでした（${res.status}）`, res.status);
  const data = (await res.json()) as NextReply;
  if ((data.action !== "next" && data.action !== "reflect") || typeof data.question !== "string") throw new NextError("返事を読み取れませんでした");
  return data;
}
