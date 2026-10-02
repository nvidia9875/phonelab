/**
 * 記録の要約をサーバへ送る（POST /api/records）。生データ（波形・音声）は端末の中に残り、
 * 教員画面が見るのは予想・状態・検査の結果・出来事の要約だけ（D2、docs/personas.md §3）。
 * 学級に入っている端末だけが送る。送れなくても端末の記録は失われない。
 */
import { postRecordSummary, type RecordSummary } from "./classroom";
import { clocksOf } from "../measure/features";
import { getState, isMine, subscribeStore, tracesOf, MAX_TRACES, type Measurement, type StudyRecord } from "../store/records";

const MAX_EVENTS = 12;
const MAX_MEASUREMENTS = 12;

/** 測定 1 回ぶんの要約: 二つの測り方の値、落ちた検査、生データのハッシュ。波形そのものは送らない */
export function summarizeMeasurement(m: Measurement): NonNullable<RecordSummary["measurements"]>[number] {
  const [c1, c2] = clocksOf(m.features);
  return {
    condition: m.condition,
    values: [c1.value, c2.value].map((v) => (Number.isFinite(v) ? v : null)),
    failed: m.checks.filter((c) => !c.ok).map((c) => c.code),
    pass: m.pass,
    raw_hash: /^[0-9a-f]{64}$/.test(m.rawHash) ? m.rawHash : null,
    at: m.at,
  };
}
const RETRY_MS = 5_000;
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
    result: rec.result ? { observed: rec.result.observed, consistent: rec.result.consistent, statement: rec.result.statement.slice(0, 200), a: rec.result.a, b: rec.result.b, tolerance: rec.result.tolerance } : null,
    plan_source: rec.plan?.source ?? null,
    trace_id: rec.plan?.traceId ?? null,
    traces: tracesOf(rec).slice(-MAX_TRACES),
    measurements: rec.measurements.slice(-MAX_MEASUREMENTS).map(summarizeMeasurement),
    hash: rec.signature?.full ?? null,
    rejection_title: rec.rejection?.title.slice(0, 120) ?? null,
    chat_turns: rec.chat?.turnsUsed ?? 0,
    events: rec.events.slice(-MAX_EVENTS).map((e) => ({ t: e.t, k: e.k.slice(0, 20), body: e.body.slice(0, 300) })),
    updated_at: rec.updatedAt,
  };
}

/** 変わった記録だけを、少し待ってからまとめて送る。戻り値で止められる */
export function startRecordSync(send: typeof postRecordSummary = postRecordSummary): () => void {
  const sent = new Map<string, string>();
  let stopped = false;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const tick = () => {
    const { student, classState, records } = getState();
    if (!student?.secret || !classState) return; // 合言葉が無い端末は送らない（サーバも受け付けない）
    for (const rec of records) {
      // 送るのは、いまの番号の記録だけ（前に同じ端末を使った人の記録を、新しい番号で送らない）
      if (!isMine(rec, student) || sent.get(rec.id) === rec.updatedAt || timers.has(rec.id)) continue;
      timers.set(
        rec.id,
        setTimeout(() => {
          timers.delete(rec.id);
          const now = getState();
          const latest = now.records.find((r) => r.id === rec.id);
          // 待っている間に番号が変わったら送らない
          if (!latest || !now.student?.secret || !isMine(latest, now.student)) return;
          sent.set(latest.id, latest.updatedAt);
          send(now.student.classCode, now.student.number, now.student.secret, summarizeRecord(latest)).catch(() => {
            // 送れなかったら、記録が変わるのを待たずに少しあとで送り直す（10/2 採点 3-2）
            sent.delete(latest.id);
            if (!stopped) setTimeout(tick, RETRY_MS);
          });
        }, DEBOUNCE_MS),
      );
    }
  };
  const unsubscribe = subscribeStore(tick);
  tick();
  return () => {
    stopped = true;
    unsubscribe();
    timers.forEach((t) => clearTimeout(t));
  };
}
