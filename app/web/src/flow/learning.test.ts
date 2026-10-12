import { beforeEach, describe, expect, it } from "vitest";
import { themeById } from "../catalog/themes";
import { clearAll, createRecord, recordById, updateRecord } from "../store/records";
import { closeAndNext, setCer, setNextReason } from "./useFlow";

const sound = themeById("sound")!;

function judged() {
  const rec = createRecord(sound.id);
  updateRecord(rec.id, (r) => ({
    ...r,
    variantId: "sound_pluck_strength",
    stage: "result",
    status: "judged",
    result: { a: 220, b: 221, delta: 1, tolerance: 6.6, observed: "same", consistent: false, statement: "変わらなかった", detail: "" },
  }));
  return recordById(rec.id)!;
}

describe("主張・証拠・理由（12/1 までの学びの手直し）", () => {
  beforeEach(() => clearAll());

  it("keeps the three parts and joins them into explain for the next step and the chat", () => {
    const rec = judged();

    setCer(rec, { claim: "高さは変わらなかった", evidence: "弱く 220 Hz → 強く 221 Hz", reasoning: "大きさが変わっただけ" });

    const after = recordById(rec.id)!;
    expect(after.cer?.evidence).toBe("弱く 220 Hz → 強く 221 Hz");
    expect(after.explain).toBe("主張: 高さは変わらなかった／証拠: 弱く 220 Hz → 強く 221 Hz／理由: 大きさが変わっただけ");
  });

  it("uses only the reasoning as explain when claim and evidence are empty", () => {
    const rec = judged();

    setCer(rec, { claim: "", evidence: "", reasoning: "大きさが変わっただけ" });

    expect(recordById(rec.id)!.explain).toBe("大きさが変わっただけ");
  });
});

describe("次の予想の理由と自信", () => {
  beforeEach(() => clearAll());

  it("carries the reason into the next prediction and the confidence into the record", async () => {
    const rec = judged();
    updateRecord(rec.id, (r) => ({ ...r, nextPrediction: { variantId: "sound_string_length", direction: "faster" } }));
    setNextReason(recordById(rec.id)!, "短いと速く震えそうだから", "sure");

    const next = await closeAndNext(recordById(rec.id)!, sound);

    expect(next?.prediction.text).toContain("短いと速く震えそうだから");
    expect(recordById(rec.id)!.events.some((e) => e.body.includes("自信あり"))).toBe(true);
  });
});

describe("食い違ったあとの測り直し", () => {
  beforeEach(() => clearAll());

  it("asks what went wrong and records it for the teacher", async () => {
    const { remeasure, MISMATCH_REMEASURE } = await import("./useFlow");
    const rec = judged();

    remeasure(rec, "B", "強くはじいたつもりが弱かった");

    const ev = recordById(rec.id)!.events.at(-1)!;
    expect(ev.k).toBe(MISMATCH_REMEASURE);
    expect(ev.body).toContain("強くはじいたつもりが弱かった");
  });
});
