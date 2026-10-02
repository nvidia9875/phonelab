/**
 * 結果のあとの次の一手（X1）。予想 → 計画 → 測定 → 判定 → **次の予想**、のループの最後をラボ先生が閉じる。
 * 理由を書いた・測り直して判定が変わった、のように読んだもの（basis）が変わったら聞き直す（10/2 採点 2-1）。
 * 記録に残す（教員画面にも「次の一手」と「判断」の行が届く）。
 * つながらないときはカタログの順（まだやっていない実験）で、出どころを stub と残す。
 */
import { NextError, requestNext } from "../agent/next";
import { QUANTITY } from "../catalog/quantity";
import { variantsOf, type Theme } from "../catalog/themes";
import { addEvent, withTrace, recordById, updateRecord, type NextSuggestion, type StudyRecord } from "../store/records";
import { doneVariantIds, markHalted, trailText } from "./useFlow";

const MIN_EXPLAIN_CHARS = 8;

/** 次の一手が何を見て選ばれたか。これが変わったら、前の提案は古い */
export function nextBasis(rec: StudyRecord): string {
  const r = rec.result;
  // 結果画面の「なぜ」でも、ラボ先生との会話で書いた自分の考えでも、書いたことにする（10/2 採点 2-1）
  const wrote = Math.max(rec.explain.trim().length, rec.chat?.thinking.trim().length ?? 0);
  const explained = wrote >= MIN_EXPLAIN_CHARS ? 1 : 0;
  return r ? `${explained}|${r.observed}|${r.consistent}|${r.a.toPrecision(4)}|${r.b.toPrecision(4)}` : `${explained}|-`;
}

export function isNextStale(rec: StudyRecord): boolean {
  return !!rec.result && !rec.result.undecided && rec.nextSuggestion?.basis !== nextBasis(rec);
}

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
  // 保留（差が決められない）では、結論を前提にした次の一手を聞かない。まず測り直す
  if (!rec.result || rec.result.undecided || !rec.variantId) return null;
  const basis = nextBasis(rec);
  if (rec.nextSuggestion?.basis === basis) return rec.nextSuggestion;
  const again = !!rec.nextSuggestion;
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
      explained: basis.startsWith("1"),
      doneVariantIds: doneVariantIds(theme.id),
      nextCalls: calls,
      recordId: rec.id,
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
      basis,
    };
  } catch (e: unknown) {
    // 先生が止めているときは、カタログの順で先へ進めない
    if (e instanceof NextError && e.status === 409) {
      markHalted();
      return null;
    }
    // 回数の上限・混み合い（429）は、カタログの順を見せるが記録には残さない（あとで聞き直せるように）
    if (e instanceof NextError && e.status === 429) return { ...fallback(rec, theme), basis: "busy" };
    suggestion = { ...fallback(rec, theme), basis };
  }
  // 待っている間に、同じものを見た次の一手が入っていたら、そちらを使う
  const latest = recordById(rec.id);
  if (latest?.nextSuggestion?.basis === basis) return latest.nextSuggestion;
  updateRecord(rec.id, (r) => {
    const label = (suggestion.source === "agent" ? "ラボ先生（AI）が結果を読んで選んだ" : "カタログの順") + (again ? "。理由や判定が変わったので聞き直した" : "");
    const body = suggestion.action === "reflect" ? `先にふり返り: ${suggestion.why}（${label}）` : `${suggestion.question}（${label}）`;
    const n = addEvent(withTrace({ ...r, nextSuggestion: suggestion, nextCalls: calls }, suggestion.traceId), "次の一手", body.slice(0, 300), "orange");
    const trail = trailText(suggestion.trail);
    return trail ? addEvent(n, "判断", trail) : n;
  });
  return suggestion;
}
