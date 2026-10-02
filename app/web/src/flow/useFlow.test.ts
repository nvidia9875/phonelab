import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { themeById, variantById } from "../catalog/themes";
import type { Features } from "../measure/features";
import type { LocalCheck } from "../measure/checks";
import { clearAll, createRecord, recordById, updateRecord, type CondKey, type Measurement, type StudyRecord } from "../store/records";
import { BUSY_MESSAGE, MAX_RETRY, ensureJudged, finishMeasure, remeasure, submitPrediction, switchExperiment } from "./useFlow";
import { getState, setClassState } from "../store/records";
import type { PlanReply } from "../agent/plan";

const sound = themeById("sound")!;
const energy = themeById("energy")!;

const PASS: LocalCheck[] = [{ code: "two_clocks_disagree", ok: true, text: "二つのセンサーが一致" }];

function pitch(f0: number): Features {
  return {
    profile: "pitch",
    n_frames: 50,
    duration_s: 5,
    sample_rate: 48000,
    f0_hz: f0,
    f0_from_h2_hz: f0 + 0.5,
    rms_db: -12,
    noise_db: -60,
    snr_db: 48,
    clipping_ratio: 0,
    voiced_frames: 45,
  };
}

function speed(v: number): Features {
  return {
    profile: "pendulum_speed",
    n_samples: 600,
    duration_s: 10,
    rate_hz: 60,
    interval_median_ms: 16.7,
    max_gap_ms: 17,
    gaps: [],
    gap_total_ms: 0,
    length_m: 0.8,
    release_at_s: 0.5,
    omega_peak_dps: 100,
    accel_norm_peak_ms2: 12.3,
    v_gyro_ms: v,
    v_accel_ms: v,
    gyro_axis: "beta",
    saturation_runs: 0,
    device_interval_ms: 16.7,
  };
}

function measurement(condition: CondKey, features: Features): Measurement {
  return { condition, features, checks: PASS, rawHash: "sha256:x", pass: true, at: "" };
}

function record(themeId: string, variantId: string, extra: Partial<StudyRecord> = {}): StudyRecord {
  const rec = createRecord(themeId);
  updateRecord(rec.id, (r) => ({ ...r, variantId, ...extra }));
  return recordById(rec.id)!;
}

/** 条件 A と B を測り終えて、判定まで済んだ音の記録 */
function judgedSoundRecord(extra: Partial<StudyRecord> = {}): StudyRecord {
  return record(sound.id, "sound_pluck_strength", {
    stage: "result",
    status: "judged",
    prediction: { text: "強くはじくと高くなると思う", claim: { variable: "strength", direction: "faster" }, questionBack: null, hints: 0 },
    measurements: [measurement("A", pitch(220)), measurement("B", pitch(221))],
    result: { a: 220, b: 221, delta: 1, tolerance: 6.6, observed: "same", consistent: false, statement: "変わらなかった", detail: "" },
    ...extra,
  });
}

describe("remeasure", () => {
  beforeEach(() => clearAll());

  it("sends the student back to that condition's setup, drops the judgement, and counts the retry", () => {
    const rec = judgedSoundRecord();

    expect(remeasure(rec, "A")).toBe(true);

    const after = recordById(rec.id)!;
    expect(after.stage).toBe("setup_A");
    expect(after.status).toBe("open");
    expect(after.result).toBeNull();
    expect(after.retries.A).toBe(1);
    expect(after.events.at(-1)?.k).toBe("測り直し");
    expect(after.measurements).toHaveLength(2); // 前の測定は消さずに残す
  });

  it("refuses another try once the condition has been measured the most times allowed", () => {
    const rec = judgedSoundRecord({ retries: { A: MAX_RETRY, B: 0 } });

    expect(remeasure(rec, "A")).toBe(false);

    const after = recordById(rec.id)!;
    expect(after.stage).toBe("result");
    expect(after.result).not.toBeNull();
  });

  it("judges with the newest passing measurement after a re-measure", () => {
    const rec = judgedSoundRecord();
    remeasure(rec, "A");
    updateRecord(rec.id, (r) => ({ ...r, measurements: [...r.measurements, measurement("A", pitch(260))] }));

    const judged = ensureJudged(recordById(rec.id)!, sound)!;

    // 判定は二本の時計（基本周波数と倍音）の平均を採用値にする
    expect(judged.result?.a).toBe(260.25);
  });
});

describe("repeats", () => {
  beforeEach(() => clearAll());

  it("asks for the same condition again until the planned number of tries is done", () => {
    const rec = record(energy.id, "energy_height", { stage: "measure_A" });

    expect(finishMeasure(rec, "A", speed(1.4), PASS, "sha256:x", false, 3)).toBe("again");
    expect(recordById(rec.id)!.stage).toBe("setup_A");
    expect(finishMeasure(recordById(rec.id)!, "A", speed(1.44), PASS, "sha256:x", false, 3)).toBe("again");
    expect(finishMeasure(recordById(rec.id)!, "A", speed(1.42), PASS, "sha256:x", false, 3)).toBe("next");
    expect(recordById(rec.id)!.stage).toBe("setup_B");
  });

  it("goes straight on for a theme that is measured once", () => {
    const rec = record(sound.id, "sound_pluck_strength", { stage: "measure_A" });

    expect(finishMeasure(rec, "A", pitch(220), PASS, "sha256:x", false, 1)).toBe("next");
    expect(recordById(rec.id)!.stage).toBe("setup_B");
  });

  it("judges with the average of the tries", () => {
    const rec = record(energy.id, "energy_height", {
      stage: "result",
      measurements: [
        measurement("A", speed(1.4)),
        measurement("A", speed(1.44)),
        measurement("A", speed(1.42)),
        measurement("B", speed(1.98)),
        measurement("B", speed(2.02)),
        measurement("B", speed(2.0)),
      ],
      prediction: { text: "高いほど速いと思う", claim: { variable: "height", direction: "faster" }, questionBack: null, hints: 0 },
    });

    const judged = ensureJudged(rec, energy)!;

    expect(judged.result?.a).toBeCloseTo(1.42, 2);
    expect(judged.result?.b).toBeCloseTo(2.0, 2);
    expect(judged.result?.observed).toBe("faster");
  });

  it("keeps the older tries of a re-measured condition out of the average", () => {
    const rec = record(energy.id, "energy_height", {
      stage: "result",
      measurements: [
        measurement("A", speed(0.9)), // 測り直す前の 3 回
        measurement("A", speed(0.92)),
        measurement("A", speed(0.94)),
        measurement("A", speed(1.4)), // 測り直したあとの 3 回
        measurement("A", speed(1.44)),
        measurement("A", speed(1.42)),
        measurement("B", speed(2.0)),
        measurement("B", speed(2.0)),
        measurement("B", speed(2.0)),
      ],
      prediction: { text: "高いほど速いと思う", claim: { variable: "height", direction: "faster" }, questionBack: null, hints: 0 },
    });

    const judged = ensureJudged(rec, energy)!;

    expect(judged.result?.a).toBeCloseTo(1.42, 2);
  });
});

describe("submitPrediction", () => {
  beforeEach(() => clearAll());
  afterEach(() => vi.unstubAllGlobals());

  function reply(overrides: Partial<PlanReply> = {}): PlanReply {
    return {
      kind: "plan",
      variant_id: "sound_string_length",
      claim: { variable: "length", direction: "faster" },
      why: "震える長さだけを変えれば、あなたの予想をそのまま試せます",
      question_back: null,
      rejection: null,
      planner_calls: 1,
      skipped: false,
      policy_fixed: false,
      source: "agent",
      trace_id: "a".repeat(32),
      ...overrides,
    };
  }

  function serverAnswers(body: unknown, status = 200) {
    const fetchMock = vi.fn(async () => ({ ok: status < 400, status, json: async () => body }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("uses the experiment the lab teacher chose and remembers who chose it", async () => {
    const fetchMock = serverAnswers(reply());
    const rec = createRecord(sound.id);

    expect(await submitPrediction(rec, sound, "短くすると高くなると思う")).toBe("plan");

    const after = recordById(rec.id)!;
    expect(after.variantId).toBe("sound_string_length");
    expect(after.prediction.claim).toEqual({ variable: "length", direction: "faster" });
    expect(after.plan).toEqual({ source: "agent", why: reply().why, traceId: "a".repeat(32) });
    expect(after.plannerCalls).toBe(1);
    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(sent.theme_id).toBe("sound");
    expect(sent.planner_calls).toBe(0);
    expect(sent.previous_question_back).toBeNull();
    expect(sent.class_code).toBeNull(); // 学級に入っていない端末
  });

  it("falls back to the on-device rules when the lab teacher cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network"); }));
    const rec = createRecord(sound.id);

    expect(await submitPrediction(rec, sound, "強くはじくとゴムが速く震えるから、高くなると思う")).toBe("plan");

    const after = recordById(rec.id)!;
    expect(after.variantId).toBe("sound_pluck_strength");
    expect(after.plan?.source).toBe("stub");
    expect(after.plannerCalls).toBe(0);
  });

  it("shows the lab teacher's question back before choosing", async () => {
    serverAnswers(reply({ kind: "question", variant_id: null, question_back: "どうしてそう思う？" }));
    const rec = createRecord(sound.id);

    expect(await submitPrediction(rec, sound, "高くなる")).toBe("predict");

    const after = recordById(rec.id)!;
    expect(after.prediction.questionBack).toBe("どうしてそう思う？");
    expect(after.variantId).toBeNull();
  });

  it("keeps a rejection from the policy with its alternative experiment", async () => {
    serverAnswers(
      reply({
        kind: "rejected",
        variant_id: "sound_pluck_strength",
        rejection: { title: "端末の落下・投擲を伴う実験は、候補に出しません", reasons: ["a", "b", "c"], quoted: "落として", alternative_variant_id: "sound_pluck_strength" },
        source: "policy",
      }),
    );
    const rec = createRecord(sound.id);

    expect(await submitPrediction(rec, sound, "スマホを落として測りたい")).toBe("rejected");

    const after = recordById(rec.id)!;
    expect(after.rejection?.title).toBe("端末の落下・投擲を伴う実験は、候補に出しません");
    expect(after.variantId).toBe("sound_pluck_strength");
    expect(after.stage).toBe("plan");
  });

  it("ignores an experiment the server names that is not in this theme", async () => {
    serverAnswers(reply({ variant_id: "energy_height" }));
    const rec = createRecord(sound.id);

    expect(await submitPrediction(rec, sound, "強くはじくとゴムが速く震えるから、高くなると思う")).toBe("plan");

    expect(recordById(rec.id)!.variantId).toBe("sound_pluck_strength");
    expect(recordById(rec.id)!.plan?.source).toBe("stub");
  });
});

describe("judge", () => {
  it("does not call a prediction about a different variable 'supported', even if the direction matches", async () => {
    const { judge } = await import("../agent/stub");
    const lengthVariant = variantById(sound, "sound_string_length")!;

    const j = judge(220, 440, 1, { variable: "strength", direction: "faster" }, lengthVariant);

    expect(j.observed).toBe("faster");
    expect(j.consistent).toBeNull();
    expect(j.detail).toContain("別のもの");
  });
});

describe("switchExperiment", () => {
  beforeEach(() => clearAll());

  it("closes the held record as stopped and opens a fresh prediction for another experiment of the theme", () => {
    const rec = record(sound.id, "sound_pluck_strength", { status: "held", stage: "measure_A", retries: { A: 3, B: 0 } });

    const next = switchExperiment(rec, sound)!;

    expect(recordById(rec.id)!.status).toBe("stopped");
    expect(next.id).not.toBe(rec.id);
    expect(next.stage).toBe("predict");
    expect(next.variantId).toBeNull();
    expect(next.prediction.questionBack).toContain("震える部分の長さ");
  });

  it("returns null when every experiment of the theme is used up", () => {
    record(sound.id, "sound_string_length", { status: "signed", stage: "result" });
    const rec = record(sound.id, "sound_pluck_strength", { status: "held", stage: "measure_A" });

    expect(switchExperiment(rec, sound)).toBeNull();
    expect(recordById(rec.id)!.status).toBe("held");
  });
});


describe("停止と上限は、通信の失敗と分ける（10/2 採点 2-7）", () => {
  beforeEach(() => clearAll());
  afterEach(() => vi.unstubAllGlobals());

  function serverSays(status: number) {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status, json: async () => ({ detail: "" }) })));
  }

  it("a halted class stops the device instead of planning locally", async () => {
    setClassState({ classCode: "DEMO-2026", school: "jhs", allowedSensors: ["microphone"], teacherEnabled: [], halted: false, updatedAt: "", seenAt: "" });
    serverSays(409);
    const rec = createRecord(sound.id);

    expect(await submitPrediction(rec, sound, "強くはじくと高くなると思う")).toBe("halted");
    expect(getState().classState?.halted).toBe(true);
    expect(recordById(rec.id)!.variantId).toBeNull();
  });

  it("a rate limit asks to wait instead of planning locally", async () => {
    serverSays(429);
    const rec = createRecord(sound.id);

    expect(await submitPrediction(rec, sound, "強くはじくと高くなると思う")).toBe("predict");
    expect(recordById(rec.id)!.prediction.questionBack).toBe(BUSY_MESSAGE);
    expect(recordById(rec.id)!.variantId).toBeNull();
  });

  it("a network failure still falls back to the device", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const rec = createRecord(sound.id);

    expect(await submitPrediction(rec, sound, "強くはじくとゴムが速く震えるから、音が高くなると思う")).toBe("plan");
    expect(recordById(rec.id)!.plan?.source).toBe("stub");
  });
});


/** 二本の時計（基本周波数と倍音）が大きく食い違う音。ばらつきが許容誤差より大きくなる */
function noisyPitch(f0: number, fromH2: number): Features {
  return { ...(pitch(f0) as Extract<Features, { profile: "pitch" }>), f0_from_h2_hz: fromH2 };
}

describe("ensureJudged — ばらつきに埋もれたら保留として保存する", () => {
  beforeEach(() => clearAll());

  it("stores an undecided result as held with a reason the teacher sees", () => {
    const rec = record(sound.id, "sound_pluck_strength", {
      stage: "measure_B",
      prediction: { text: "強くはじくと高くなる", claim: { variable: "strength", direction: "faster" }, questionBack: null, hints: 0 },
      measurements: [measurement("A", noisyPitch(220, 245)), measurement("B", noisyPitch(232, 205))],
    });

    const judged = ensureJudged(rec, sound)!;

    expect(judged.result?.undecided).toBe(true);
    expect(judged.status).toBe("held");
    expect(judged.holdCodes).toEqual(["too_uncertain"]);
  });
});
