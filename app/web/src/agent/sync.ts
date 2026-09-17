/**
 * 記録の要約をサーバへ送る（POST /api/records）。生データ（波形・音声）は端末の中に残り、
 * 教員画面が見るのは予想・状態・検査の結果・出来事の要約だけ（D2、docs/personas.md §3）。
 * 学級に入っている端末だけが送る。送れなくても端末の記録は失われない。
 */
import { postRecordSummary, type RecordSummary } from "./classroom";
import { getState, subscribeStore, type StudyRecord } from "../store/records";

const MAX_EVENTS = 8;
const DEBOUNCE_MS = 800;

export function summarizeRecord(rec: StudyRecord): RecordSummary {
  return {
    record_id: rec.id,
    theme_id: rec.themeId,
    variant_id: rec.variantId,
    status: rec.status,
    stage: rec.stage,
    prediction: rec.prediction.text.slice(0, 500),
    claim: rec.prediction.claim ? { variable: rec.prediction.claim.variable, direction: rec.prediction.claim.direction } : null,
    hold_codes: rec.holdCodes.slice(0, 10),
    retries: rec.retries,
    result: rec.result ? { observed: rec.result.observed, consistent: rec.result.consistent, statement: rec.result.statement.slice(0, 200) } : null,
    plan_source: rec.plan?.source ?? null,
    trace_id: rec.plan?.traceId ?? null,
    rejection_title: rec.rejection?.title.slice(0, 120) ?? null,
    chat_turns: rec.chat?.turnsUsed ?? 0,
    events: rec.events.slice(-MAX_EVENTS).map((e) => ({ t: e.t, k: e.k.slice(0, 20), body: e.body.slice(0, 300) })),
    updated_at: rec.updatedAt,
  };
}

/** 変わった記録だけを、少し待ってからまとめて送る。戻り値で止められる */
export function startRecordSync(send: typeof postRecordSummary = postRecordSummary): () => void {
  const sent = new Map<string, string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const tick = () => {
    const { student, classState, records } = getState();
    if (!student || !classState) return;
    for (const rec of records) {
      if (sent.get(rec.id) === rec.updatedAt || timers.has(rec.id)) continue;
      timers.set(
        rec.id,
        setTimeout(() => {
          timers.delete(rec.id);
          const latest = getState().records.find((r) => r.id === rec.id);
          if (!latest) return;
          sent.set(latest.id, latest.updatedAt);
          send(student.classCode, student.number, summarizeRecord(latest)).catch(() => sent.delete(latest.id));
        }, DEBOUNCE_MS),
      );
    }
  };
  const unsubscribe = subscribeStore(tick);
  tick();
  return () => {
    unsubscribe();
    timers.forEach((t) => clearTimeout(t));
  };
}
