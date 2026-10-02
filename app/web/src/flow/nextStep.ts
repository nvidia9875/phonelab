/**
 * 結果のあとの次の一手（X1）。予想 → 計画 → 測定 → 判定 → **次の予想**、のループの最後をラボ先生が閉じる。
 * 記録ごとに 1 回聞き、記録に残す（教員画面にも「次の一手」と「判断」の行が届く）。
 * つながらないときはカタログの順（まだやっていない実験）で、出どころを stub と残す。
 */
import { requestNext } from "../agent/next";
import { QUANTITY } from "../catalog/quantity";
import { variantsOf, type Theme } from "../catalog/themes";
import { addEvent, recordById, updateRecord, type NextSuggestion, type StudyRecord } from "../store/records";
import { doneVariantIds, trailText } from "./useFlow";

const MIN_EXPLAIN_CHARS = 8;

function fallback(rec: StudyRecord, theme: Theme): NextSuggestion {
  const done = new Set([...doneVariantIds(theme.id), rec.variantId]);
  const nv = variantsOf(theme).find((v) => !done.has(v.id));
  if (!nv) return { action: "reflect", variantId: null, question: "", why: "このテーマの実験はひととおり終わりました", source: "stub", traceId: null, trail: [] };
  const q = QUANTITY[nv.unit];
  return {
    action: "next",
    variantId: nv.id,
    question: `では、${nv.changes.split("（")[0]}を変えたら${q.name}はどうなる？`,
    why: "いまはラボ先生につながらないので、カタログの順に次の実験を出しています",
    source: "stub",
    traceId: null,
    trail: [],
  };
}

export async function askNext(rec: StudyRecord, theme: Theme): Promise<NextSuggestion | null> {
  if (!rec.result || !rec.variantId) return null;
  if (rec.nextSuggestion) return rec.nextSuggestion;
  let suggestion: NextSuggestion;
  let calls = rec.nextCalls ?? 0;
  try {
    const reply = await requestNext({
      themeId: theme.id,
      variantId: rec.variantId,
      school: theme.school,
      prediction: rec.prediction.text,
      claimDirection: rec.prediction.claim?.direction ?? "unknown",
      observed: rec.result.observed,
      consistent: rec.result.consistent,
      explained: rec.explain.trim().length >= MIN_EXPLAIN_CHARS,
      doneVariantIds: doneVariantIds(theme.id),
      nextCalls: calls,
    });
    calls = reply.next_calls;
    suggestion = {
      action: reply.action,
      variantId: reply.experiment_id,
      question: reply.question,
      why: reply.why,
      source: reply.source,
      traceId: /^0+$/.test(reply.trace_id) ? null : reply.trace_id,
      trail: reply.trail ?? [],
    };
  } catch {
    suggestion = fallback(rec, theme);
  }
  // 待っている間に別の画面で次の一手が入っていたら、そちらを使う
  const latest = recordById(rec.id);
  if (latest?.nextSuggestion) return latest.nextSuggestion;
  updateRecord(rec.id, (r) => {
    const label = suggestion.source === "agent" ? "ラボ先生（Gemini）が結果を読んで選んだ" : "カタログの順";
    const body = suggestion.action === "reflect" ? `先にふり返り: ${suggestion.why}（${label}）` : `${suggestion.question}（${label}）`;
    const n = addEvent({ ...r, nextSuggestion: suggestion, nextCalls: calls }, "次の一手", body.slice(0, 300), "orange");
    const trail = trailText(suggestion.trail);
    return trail ? addEvent(n, "判断", trail) : n;
  });
  return suggestion;
}
