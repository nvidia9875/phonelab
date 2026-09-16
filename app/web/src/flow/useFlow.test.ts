import { beforeEach, describe, expect, it } from "vitest";
import { themeById } from "../catalog/themes";
import type { Features } from "../measure/features";
import type { LocalCheck } from "../measure/checks";
import { clearAll, createRecord, recordById, updateRecord, type CondKey, type Measurement, type StudyRecord } from "../store/records";
import { MAX_RETRY, ensureJudged, finishMeasure, remeasure } from "./useFlow";

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
