import { describe, expect, it } from "vitest";
import { themeById, variantById } from "../catalog/themes";
import type { Judgement, StudyRecord } from "../store/records";
import { canReveal, chatRequestFor, chatSituation } from "./chat";

const sound = themeById("sound")!;
const variant = variantById(sound, "sound_pluck_strength")!;

function record(overrides: Partial<StudyRecord> = {}): StudyRecord {
  return {
    id: "1234",
    themeId: "sound",
    variantId: variant.id,
    status: "judged",
    stage: "result",
    prediction: { text: "強くはじくと高くなると思う", claim: { variable: "strength", direction: "faster" }, questionBack: null, hints: 0 },
    rejection: null,
    approvedAt: null,
    measurements: [],
    retries: { A: 0, B: 0 },
    holdCodes: [],
    result: null,
    explain: "",
    nextPrediction: null,
    events: [],
    signature: null,
    chat: null,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function judged(consistent: boolean | null): Judgement {
  return { a: 220, b: 221, delta: 1, tolerance: 6.6, observed: "same", consistent, statement: "はじく強さを変えても、音の高さは変わらなかった", detail: "" };
}

describe("chatSituation", () => {
  it("calls a result that did not match the prediction a mismatch", () => {
    expect(chatSituation(record({ result: judged(false) }))).toBe("mismatch");
  });

  it("calls a result that matched the prediction a match", () => {
    expect(chatSituation(record({ result: judged(true) }))).toBe("match");
  });

  it("calls a held measurement a hold", () => {
    expect(chatSituation(record({ status: "held", result: null }))).toBe("hold");
  });
});

describe("canReveal", () => {
  it("opens the lab teacher's explanation only after the student writes their own thinking", () => {
    expect(canReveal("")).toBe(false);
    expect(canReveal("なんとなく")).toBe(false);
    expect(canReveal("強くはじくと大きくなるだけだと思う")).toBe(true);
  });
});

describe("chatRequestFor", () => {
  it("sends the result, the thinking written on the result screen, and the recent turns", () => {
    const rec = record({
      result: judged(false),
      explain: "大きくなるだけで、ふるえる速さは同じだと思う",
      chat: {
        thinking: "",
        messages: [
          { role: "student", text: "なんで？", at: "" },
          { role: "teacher", text: "どう思う？", at: "" },
        ],
        revealed: false,
        turnsUsed: 1,
        limitReached: false,
      },
    });

    const req = chatRequestFor({ rec, theme: sound, variant, school: "jhs", message: "ふるえ方かな", reveal: false });

    expect(req).toMatchObject({
      variant_id: "sound_pluck_strength",
      situation: "mismatch",
      result_statement: "はじく強さを変えても、音の高さは変わらなかった",
      student_thinking: "大きくなるだけで、ふるえる速さは同じだと思う",
      turns_used: 1,
      message: "ふるえ方かな",
      reveal: false,
    });
    expect(req.messages).toEqual([
      { role: "student", text: "なんで？" },
      { role: "teacher", text: "どう思う？" },
    ]);
  });

  it("sends the failed checks as hold reasons when the measurement was held", () => {
    const rec = record({
      status: "held",
      measurements: [
        {
          condition: "A",
          features: {} as never,
          checks: [
            { code: "low_snr", ok: false, text: "音が小さく、雑音と区別できません" },
            { code: "clipping", ok: true, text: "音割れなし" },
          ],
          rawHash: "",
          pass: false,
          at: "",
        },
      ],
    });

    const req = chatRequestFor({ rec, theme: sound, variant, school: "jhs", message: "どうして？", reveal: false });

    expect(req.situation).toBe("hold");
    expect(req.hold_reasons).toEqual(["音が小さく、雑音と区別できません"]);
  });
});
