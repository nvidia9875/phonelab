import { describe, expect, it } from "vitest";
import type { RecordSummary, StudentRow } from "../agent/classroom";
import { attentionOf, checkTextOf, distributionOf, stateOf } from "./dashboard";

function rec(over: Partial<RecordSummary> = {}): RecordSummary {
  return { record_id: "1", theme_id: "sound", variant_id: "sound_pluck_strength", status: "open", stage: "measure_A", prediction: "強くはじくと高くなる", claim: { variable: "strength", direction: "faster" }, hold_codes: [], retries: { A: 0, B: 0 }, result: null, plan_source: "agent", trace_id: null, rejection_title: null, chat_turns: 0, events: [], updated_at: "", ...over };
}
const row = (number: string, current: RecordSummary | null): StudentRow => ({ number, last_seen_at: new Date().toISOString(), current });

describe("stateOf / checkTextOf", () => {
  it("marks held and rejected students in navy so the teacher goes to them", () => {
    expect(stateOf(rec({ status: "held", hold_codes: ["low_snr"] }))).toEqual({ text: "保留", tone: "navy" });
    expect(stateOf(rec({ stage: "plan", rejection_title: "端末の落下" }))).toEqual({ text: "却下 → 代替", tone: "navy" });
    expect(stateOf(rec({ stage: "measure_B" }))).toEqual({ text: "測定 B", tone: "teal" });
    expect(checkTextOf(rec({ hold_codes: ["low_snr", "clipping"] }))).toEqual({ text: "雑音と区別できない・音割れ", strong: true });
  });
});

describe("distributionOf", () => {
  it("counts the direction of each prediction for the theme most students are on, in that quantity's words", () => {
    const students = [row("S-01", rec()), row("S-02", rec({ claim: { variable: "strength", direction: "same" } })), row("S-03", rec({ theme_id: "energy", variant_id: "energy_height" })), row("S-04", rec({ claim: null }))];

    const d = distributionOf(students)!;

    expect(d.themeTitle).toBe("音の高さ");
    expect(d.total).toBe(3);
    expect(d.bars.map((b) => [b.label, b.count])).toEqual([["高くなる", 1], ["変わらない", 1], ["低くなる", 0], ["まだ読めない", 1]]);
  });

  it("is null before anyone predicted", () => {
    expect(distributionOf([row("S-01", null)])).toBeNull();
  });
});

describe("attentionOf", () => {
  it("lists held students first, then rejected ones", () => {
    const students = [row("S-09", rec({ stage: "plan", rejection_title: "落下" })), row("S-02", rec({ status: "held" })), row("S-05", rec())];

    expect(attentionOf(students).map((s) => s.number)).toEqual(["S-02", "S-09"]);
  });
});
