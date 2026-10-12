import { describe, expect, it } from "vitest";
import { themeById, variantById } from "../catalog/themes";
import { demoFeatures } from "../measure/demo";
import { checksFor } from "../measure/features";
import type { Measurement, StudyRecord } from "../store/records";
import { evidenceOf } from "./evidence";

const sound = themeById("sound")!;
const strength = variantById(sound, "sound_pluck_strength")!;

function measured(idx: 0 | 1): Measurement {
  const features = demoFeatures(sound, strength, idx);
  return { condition: idx === 0 ? "A" : "B", features, checks: checksFor(features, strength), rawHash: "x", pass: true, at: "", demo: true };
}

describe("evidenceOf（結果に添える証拠）", () => {
  it("shows that plucking harder changes loudness, and which checks the measurement passed", () => {
    const rec = { measurements: [measured(0), measured(1)] } as unknown as StudyRecord;

    const e = evidenceOf(rec);

    expect(e.loudness).not.toBeNull();
    expect(e.loudness!.B - e.loudness!.A).toBeGreaterThan(4); // 振幅 2 倍 ≈ +6 dB
    expect(e.passedChecks).toContain("二つの計算の一致");
  });

  it("has no loudness for experiments that are not about sound", () => {
    const energy = themeById("energy")!;
    const v = variantById(energy, "energy_height")!;
    const features = demoFeatures(energy, v, 0);
    const rec = { measurements: [{ condition: "A", features, checks: checksFor(features, v), rawHash: "x", pass: true, at: "" }] } as unknown as StudyRecord;

    expect(evidenceOf(rec).loudness).toBeNull();
  });
});
