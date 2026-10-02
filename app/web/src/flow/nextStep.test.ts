import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { themeById } from "../catalog/themes";
import { clearAll, createRecord, recordById, updateRecord, type StudyRecord } from "../store/records";
import { askNext, isNextStale } from "./nextStep";
import { closeAndNext, chooseNext, nextVariantFor, trailText } from "./useFlow";

const sound = themeById("sound")!;

function judged(extra: Partial<StudyRecord> = {}): StudyRecord {
  const rec = createRecord(sound.id);
  updateRecord(rec.id, (r) => ({
    ...r,
    variantId: "sound_pluck_strength",
    stage: "result",
    status: "judged",
    prediction: { text: "強くはじくと高くなる", claim: { variable: "strength", direction: "faster" }, questionBack: null, hints: 0 },
    result: { a: 220, b: 221, delta: 1, tolerance: 6.6, observed: "same", consistent: false, statement: "変わらなかった", detail: "" },
    ...extra,
  }));
  return recordById(rec.id)!;
}

function serverAnswers(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () => ({ ok: status < 400, status, json: async () => body }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const NEXT = {
  action: "next",
  experiment_id: "sound_string_length",
  question: "震える長さを短くしたら、音の高さはどうなると思う？",
  why: "強さでは変わらなかったので、別の変数を試します",
  source: "agent",
  policy_fixed: false,
  trail: ["読んだ: 今回の予想と結果の向き", "選んだ: sound_string_length", "モデルの後の検査: 通過"],
  next_calls: 1,
  trace_id: "b".repeat(32),
};

describe("askNext（結果のあとの次の一手）", () => {
  beforeEach(() => clearAll());
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the lab teacher's next step and the trail in the record", async () => {
    const fetchMock = serverAnswers(NEXT);
    const rec = judged();

    const s = await askNext(rec, sound);

    expect(s?.variantId).toBe("sound_string_length");
    const after = recordById(rec.id)!;
    expect(after.nextSuggestion?.question).toBe(NEXT.question);
    expect(after.nextCalls).toBe(1);
    expect(after.events.map((e) => e.k)).toEqual(["次の一手", "判断"]);
    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(sent.observed).toBe("same");
    expect(sent.consistent).toBe(false);
  });

  it("asks only once per record", async () => {
    const fetchMock = serverAnswers(NEXT);
    const rec = judged();
    await askNext(rec, sound);

    await askNext(recordById(rec.id)!, sound);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the catalog order when the server is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const rec = judged();

    const s = await askNext(rec, sound);

    expect(s?.source).toBe("stub");
    expect(s?.variantId).toBe("sound_string_length");
  });

  it("the next experiment and its plan come from the suggestion", async () => {
    serverAnswers(NEXT);
    const rec = judged();
    await askNext(rec, sound);
    const withSuggestion = recordById(rec.id)!;
    expect(nextVariantFor(withSuggestion, sound)?.id).toBe("sound_string_length");

    chooseNext(withSuggestion, sound, "faster");
    const next = await closeAndNext(recordById(rec.id)!, sound);

    expect(next?.variantId).toBe("sound_string_length");
    expect(next?.plan?.source).toBe("agent");
    expect(next?.plan?.why).toBe(NEXT.why);
    expect(next?.plan?.trail).toEqual(NEXT.trail);
  });
});

describe("聞き直し（10/2 採点 2-1）", () => {
  beforeEach(() => clearAll());
  afterEach(() => vi.unstubAllGlobals());

  it("asks again after the student writes why, and not before", async () => {
    const fetchMock = serverAnswers({ ...NEXT, action: "reflect", experiment_id: null, question: "" });
    const rec = judged();
    await askNext(rec, sound);
    expect(isNextStale(recordById(rec.id)!)).toBe(false);

    updateRecord(rec.id, (r) => ({ ...r, explain: "強くしても震える速さは同じだったから" }));
    const written = recordById(rec.id)!;
    expect(isNextStale(written)).toBe(true);

    fetchMock.mockImplementation(async () => ({ ok: true, status: 200, json: async () => NEXT }));
    const s = await askNext(written, sound);

    expect(s?.action).toBe("next");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const sent = JSON.parse((fetchMock.mock.calls[1] as unknown as [string, { body: string }])[1].body);
    expect(sent.explained).toBe(true);
    expect(recordById(rec.id)!.events.filter((e) => e.k === "次の一手").at(-1)?.body).toContain("聞き直した");
  });

  it("asks again when re-measuring changes the result", async () => {
    serverAnswers(NEXT);
    const rec = judged();
    await askNext(rec, sound);

    updateRecord(rec.id, (r) => ({ ...r, result: { ...r.result!, b: 260, observed: "faster", consistent: true } }));

    expect(isNextStale(recordById(rec.id)!)).toBe(true);
  });
});

describe("trailText", () => {
  it("joins the steps and caps the length for the record summary", () => {
    expect(trailText(["読んだ: A", "選んだ: B"])).toBe("読んだ: A → 選んだ: B");
    expect(trailText([])).toBeNull();
    expect(trailText(["あ".repeat(400)])?.length).toBe(300);
  });
});
