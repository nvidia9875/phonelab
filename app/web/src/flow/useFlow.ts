/**
 * 一本の記録を進める操作。画面はこれだけを呼ぶ。
 * サーバ実装後は、choosePlan / checkPolicy / judge / sign の呼び先を API に差し替える。
 */
import type { ChatReply } from "../agent/chat";
import { checkPolicy, choosePlan, judge, readClaim } from "../agent/stub";
import { QUANTITY, formatQuantity, type Unit } from "../catalog/quantity";
import { SENSOR_LABEL, repeatsOf, themeById, variantById, variantsOf, type Theme } from "../catalog/themes";
import type { LocalCheck } from "../measure/checks";
import { clocksSummary, measuredValue, type Features } from "../measure/features";
import { activeRecordForTheme, addEvent, createRecord, recordsForTheme, updateRecord, type ChatLog, type CondKey, type Direction, type StudyRecord } from "../store/records";

export const MAX_RETRY = 3;
const EMPTY_TRIES: Record<CondKey, number> = { A: 0, B: 0 };

function doneVariantIds(themeId: string): string[] {
  return recordsForTheme(themeId)
    .filter((r) => r.status === "signed" || r.status === "judged")
    .map((r) => r.variantId)
    .filter((v): v is string => !!v);
}

/** 予想の向きを、測る量に合わせた言葉にする（音は「高くなる」） */
function directionWord(unit: Unit, direction: Direction): string {
  const q = QUANTITY[unit];
  return { faster: q.choiceFaster, same: "変わらない", slower: q.choiceSlower, unknown: "" }[direction];
}

export function openTheme(theme: Theme): StudyRecord {
  return activeRecordForTheme(theme.id) ?? createRecord(theme.id);
}

/** 予想を出す → Policy → Planner。戻り値で次の画面を決める */
export function submitPrediction(rec: StudyRecord, theme: Theme, text: string): "plan" | "rejected" | "predict" {
  const done = doneVariantIds(theme.id);
  const policy = checkPolicy(text, theme, done);
  if (policy.kind === "hint") {
    updateRecord(rec.id, (r) => ({ ...r, prediction: { ...r.prediction, text, questionBack: policy.message, hints: r.prediction.hints + 1 } }));
    return "predict";
  }
  if (policy.kind === "reject") {
    updateRecord(rec.id, (r) =>
      addEvent({ ...r, prediction: { ...r.prediction, text, claim: null, questionBack: null }, rejection: policy.rejection, variantId: policy.rejection.alternativeVariantId, stage: "plan" }, "却下", `Policy が要望を却下：${policy.rejection.reasons[0]}`),
    );
    return "rejected";
  }
  const plan = choosePlan(text, theme, done);
  // 問い返しは 1 回だけ。2 回目の送信は理由が無くても受け付ける（行き止まりにしない）
  if (plan.questionBack && !rec.prediction.questionBack) {
    updateRecord(rec.id, (r) => ({ ...r, prediction: { ...r.prediction, text, questionBack: plan.questionBack } }));
    return "predict";
  }
  const claim = readClaim(text, theme);
  updateRecord(rec.id, (r) => {
    let n: StudyRecord = { ...r, prediction: { ...r.prediction, text, claim, questionBack: null }, rejection: null, variantId: plan.variant.id, stage: "plan" };
    n = addEvent(n, "予想", `${text}（証拠を見る前に記入）`, "orange");
    n = addEvent(n, "計画", `${plan.variant.title}。ラボ先生の提案`);
    return n;
  });
  return "plan";
}

export function planWhy(rec: StudyRecord, theme: Theme): string {
  return choosePlan(rec.prediction.text, theme, doneVariantIds(theme.id).filter((v) => v !== rec.variantId)).why;
}

export function approve(rec: StudyRecord, theme: Theme): void {
  updateRecord(rec.id, (r) => {
    let n: StudyRecord = { ...r, approvedAt: new Date().toISOString(), stage: "setup_A", rejection: null };
    const used = theme.sensors.map((x) => SENSOR_LABEL[x]).join("・");
    const denied = (["microphone", "camera"] as const).filter((x) => !theme.sensors.includes(x)).map((x) => SENSOR_LABEL[x]);
    n = addEvent(n, "許可", `${used}を ${theme.seconds} 秒 × 2 回。${[...denied, "位置"].join("・")}は使わない。本人承認`, "teal");
    return n;
  });
}

export function startMeasure(rec: StudyRecord, cond: CondKey): void {
  updateRecord(rec.id, (r) => ({ ...r, stage: cond === "A" ? "measure_A" : "measure_B" }));
}

export function stopMeasure(rec: StudyRecord, cond: CondKey): void {
  updateRecord(rec.id, (r) => addEvent({ ...r, stage: cond === "A" ? "setup_A" : "setup_B" }, "停止", `測定 ${cond} を本人がやめた`));
}

/** 測定が終わった。検査を通れば次の条件へ、通らなければ保留 */
export function finishMeasure(
  rec: StudyRecord,
  cond: CondKey,
  features: Features,
  checks: LocalCheck[],
  rawHash: string,
  demo = false,
  repeats = 1,
): "next" | "again" | "hold" {
  const pass = checks.every((c) => c.ok);
  const idx = cond === "A" ? 0 : 1;
  const tries = (rec.tries?.[cond] ?? 0) + 1;
  const again = pass && tries < repeats; // 同じ条件をもう一回（平均を取る実験）
  updateRecord(rec.id, (r) => {
    const m = { condition: cond, features, checks, rawHash, pass, at: new Date().toISOString(), demo };
    let n: StudyRecord = { ...r, measurements: [...r.measurements, m] };
    if (pass) {
      const label = repeats > 1 ? `測定 ${idx + 1}（${tries} / ${repeats} 回目）` : `測定 ${idx + 1}`;
      n = addEvent(n, label, `${clocksSummary(features)}。二本の時計が一致し、検査を通過${demo ? "（サンプル）" : ""}`, "teal");
      const nextStage = again ? (cond === "A" ? "setup_A" : "setup_B") : cond === "A" ? "setup_B" : "result";
      n = { ...n, status: "open", stage: nextStage, holdCodes: [], tries: { ...(r.tries ?? EMPTY_TRIES), [cond]: tries } };
    } else {
      const codes = checks.filter((c) => !c.ok).map((c) => c.code);
      n = addEvent(n, `測定 ${idx + 1}`, `${checks.find((c) => !c.ok)?.text ?? "検査で止まった"}のため保留`);
      n = { ...n, status: "held", holdCodes: codes, retries: { ...n.retries, [cond]: n.retries[cond] + 1 } };
    }
    return n;
  });
  return pass ? (again ? "again" : "next") : "hold";
}

export function retry(rec: StudyRecord, cond: CondKey): void {
  updateRecord(rec.id, (r) => ({ ...r, status: "open", stage: cond === "A" ? "setup_A" : "setup_B" }));
}

/**
 * 「うまく取れなかった」ときの測り直し。検査を通っていても、結果が出たあとでもできる。
 * 前の測定は消さずに残し（記録に全部並ぶ）、判定は最後に検査を通った測定でやり直す。
 * 予想に合う結果が出るまで測り続けられないように、保留の再測定と同じ上限（1 条件 3 回）を使う。
 */
export function remeasure(rec: StudyRecord, cond: CondKey): boolean {
  if (rec.retries[cond] >= MAX_RETRY) return false;
  updateRecord(rec.id, (r) => {
    const n: StudyRecord = {
      ...r,
      status: "open",
      stage: cond === "A" ? "setup_A" : "setup_B",
      result: null,
      holdCodes: [],
      retries: { ...r.retries, [cond]: r.retries[cond] + 1 },
      tries: { ...(r.tries ?? EMPTY_TRIES), [cond]: 0 },
    };
    return addEvent(n, "測り直し", `測定 ${cond} をもう一度（${r.retries[cond] + 1} / ${MAX_RETRY} 回目）`);
  });
  return true;
}

/** 両条件が通ったら判定（テンプレート。LLM は関与しない） */
export function ensureJudged(rec: StudyRecord, theme: Theme): StudyRecord | null {
  if (rec.result) return rec;
  const variant = variantById(theme, rec.variantId);
  const a = [...rec.measurements].reverse().find((m) => m.condition === "A" && m.pass);
  const b = [...rec.measurements].reverse().find((m) => m.condition === "B" && m.pass);
  if (!variant || !a || !b) return null;
  // 測り直したときに古い回を混ぜないよう、新しいほうから repeats 回だけ取る
  const repeats = repeatsOf(variant);
  const ma = averageOf(rec, "A", repeats);
  const mb = averageOf(rec, "B", repeats);
  const result = judge(ma.value, mb.value, ma.unc + mb.unc, rec.prediction.claim, variant);
  return updateRecord(rec.id, (r) => {
    const within = Math.abs(result.delta) <= result.tolerance ? "内側" : "外側";
    const verdict = result.consistent === null ? "予想の向きが読めず判定なし" : result.consistent ? "予想は成り立った" : "予想は成り立たず";
    let n: StudyRecord = { ...r, result, status: "judged", stage: "result" };
    n = addEvent(n, "判定", `${verdict}。差 ${formatQuantity(Math.abs(result.delta), variant.unit)} は許容 ${formatQuantity(result.tolerance, variant.unit)} の${within}`);
    return n;
  });
}

/** 条件の採用値。検査を通った直近 repeats 回の平均と、二本の時計の差・回どうしのばらつきの大きいほう */
function averageOf(rec: StudyRecord, cond: CondKey, repeats: number): { value: number; unc: number } {
  const values = rec.measurements
    .filter((m) => m.condition === cond && m.pass)
    .slice(-repeats)
    .map((m) => measuredValue(m.features));
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const nums = values.map((v) => v.value);
  const spread = nums.length > 1 ? (Math.max(...nums) - Math.min(...nums)) / 2 : 0;
  return { value: mean(nums), unc: Math.max(mean(values.map((v) => v.unc)), spread) };
}

export function setExplain(rec: StudyRecord, text: string): void {
  if (text === rec.explain) return;
  updateRecord(rec.id, (r) => ({ ...r, explain: text }));
}

export function nextVariantFor(rec: StudyRecord, theme: Theme) {
  const done = new Set([...doneVariantIds(theme.id), rec.variantId]);
  return variantsOf(theme).find((v) => !done.has(v.id)) ?? null;
}

export function chooseNext(rec: StudyRecord, theme: Theme, direction: Direction): void {
  const nv = nextVariantFor(rec, theme);
  updateRecord(rec.id, (r) => ({ ...r, nextPrediction: { variantId: nv?.id ?? null, direction } }));
}

/** 記録を閉じて（端末ハッシュを付けて）、次の実験の記録を作る */
export async function closeAndNext(rec: StudyRecord, theme: Theme): Promise<StudyRecord | null> {
  await sealRecord(rec);
  const nv = nextVariantFor(rec, theme);
  if (!nv || !rec.nextPrediction) return null;
  const direction = rec.nextPrediction.direction;
  const next = createRecord(theme.id);
  updateRecord(next.id, (r) => {
    const text = `${nv.changes.split("（")[0]}を変えたら、${directionWord(nv.unit, direction)}と思う`;
    let n: StudyRecord = { ...r, variantId: nv.id, stage: "plan", prediction: { ...r.prediction, text, claim: { variable: nv.variable, direction }, questionBack: null } };
    n = addEvent(n, "予想", `${text}（前の実験の結果を見て記入）`, "orange");
    n = addEvent(n, "計画", `${nv.title}。ラボ先生の提案`);
    return n;
  });
  return next;
}

export async function sealRecord(rec: StudyRecord): Promise<void> {
  if (rec.status !== "judged") return;
  const payload = JSON.stringify({ id: rec.id, themeId: rec.themeId, variantId: rec.variantId, measurements: rec.measurements.map((m) => ({ c: m.condition, f: m.features, h: m.rawHash })), result: rec.result });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  const hex = [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
  updateRecord(rec.id, (r) => {
    let n: StudyRecord = { ...r, status: "signed", signature: { signer: "端末（サーバ署名は未）", hash: `${hex.slice(0, 4)}…${hex.slice(-4)}`, server: false } };
    if (r.nextPrediction) {
      const theme = themeById(r.themeId);
      const unit = (theme && variantById(theme, r.nextPrediction.variantId ?? r.variantId)?.unit) ?? "s";
      n = addEvent(n, "次の予測", `「${directionWord(unit, r.nextPrediction.direction)}」と記入。次の実験へ`, "orange");
    }
    return n;
  });
}

const EMPTY_CHAT: ChatLog = { thinking: "", messages: [], revealed: false, turnsUsed: 0, limitReached: false };

/** ラボ先生とのふり返り: 自分の考え（先生の説明を開く鍵）を記録に残す */
export function setChatThinking(rec: StudyRecord, thinking: string): void {
  updateRecord(rec.id, (r) => ({ ...r, chat: { ...(r.chat ?? EMPTY_CHAT), thinking } }));
}

/** ラボ先生との 1 往復を記録に残す。説明を初めて聞いたらイベントにも残す */
export function addChatTurn(rec: StudyRecord, studentText: string, reply: ChatReply): void {
  const at = new Date().toISOString();
  updateRecord(rec.id, (r) => {
    const chat = r.chat ?? EMPTY_CHAT;
    const messages = [...chat.messages, { role: "student" as const, text: studentText, at }, { role: "teacher" as const, text: reply.reply, at }];
    let n: StudyRecord = { ...r, chat: { ...chat, messages, revealed: chat.revealed || reply.revealed, turnsUsed: reply.turns_used, limitReached: reply.limit_reached } };
    if (reply.revealed && !chat.revealed) n = addEvent(n, "ラボ先生", "自分の考えを書いたあとで、ラボ先生の説明を聞いた", "orange");
    return n;
  });
}

export function themeOf(rec: StudyRecord): Theme | undefined {
  return themeById(rec.themeId);
}
