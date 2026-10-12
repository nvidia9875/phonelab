import { beforeEach, describe, expect, it, vi } from "vitest";
import { activeRecordForTheme, clearAll, myRecordById, createRecord, recordById, setClassState, setStudent, updateRecord, withTrace, type StudyRecord } from "../store/records";
import { startRecordSync, summarizeRecord } from "./sync";

describe("summarizeRecord", () => {
  beforeEach(() => clearAll());

  it("keeps the prediction, state, checks and events but never raw measurements", () => {
    const rec = createRecord("sound");
    updateRecord(rec.id, (r) => ({ ...r, status: "held", stage: "measure_A", holdCodes: ["low_snr"], prediction: { ...r.prediction, text: "強くはじくと高くなる", claim: { variable: "strength", direction: "faster" } } }));
    const s = summarizeRecord(recordById(rec.id)!);

    expect(s.status).toBe("held");
    expect(s.hold_codes).toEqual(["low_snr"]);
    expect(s.claim).toEqual({ variable: "strength", direction: "faster" });
    expect(JSON.stringify(s)).not.toContain("features");
    expect(JSON.stringify(s)).not.toContain("rawHash");
  });
});

describe("summarizeRecord: traces and measurements", () => {
  beforeEach(() => clearAll());

  it("names the stage of every agent trace, including the lab teacher's chat", () => {
    const rec = createRecord("sound");
    updateRecord(rec.id, (r) => withTrace(withTrace(withTrace(r, "a".repeat(32), "計画"), "b".repeat(32), "再計画"), "c".repeat(32), "会話"));

    const s = summarizeRecord(recordById(rec.id)!);

    expect(s.traces).toEqual([
      { stage: "計画", id: "a".repeat(32) },
      { stage: "再計画", id: "b".repeat(32) },
      { stage: "会話", id: "c".repeat(32) },
    ]);
  });

  it("reads old records whose traces had no stage", () => {
    const rec = createRecord("sound");
    updateRecord(rec.id, (r) => ({ ...r, traceIds: ["a".repeat(32)] }) as StudyRecord);

    expect(summarizeRecord(recordById(rec.id)!).traces).toEqual([{ stage: "計画", id: "a".repeat(32) }]);
  });

  it("sends each measurement's two values and failed checks, not the waveform", () => {
    const rec = createRecord("sound");
    const features = { profile: "pitch", n_frames: 50, duration_s: 5, sample_rate: 48000, f0_hz: 220, f0_from_h2_hz: 220.5, rms_db: -2, noise_db: -60, snr_db: 58, clipping_ratio: 0.2, voiced_frames: 45, f0_steady_share: 1 } as const;
    updateRecord(rec.id, (r) => ({
      ...r,
      measurements: [{ condition: "A", features, checks: [{ code: "clipping", ok: false, text: "音割れ" }], rawHash: "f".repeat(64), pass: false, at: "2026-10-02T10:00:00Z" }],
    }));

    const [m] = summarizeRecord(recordById(rec.id)!).measurements!;

    expect(m).toEqual({ condition: "A", values: [220, 220.5], failed: ["clipping"], pass: false, raw_hash: "f".repeat(64), at: "2026-10-02T10:00:00Z" });
    expect(JSON.stringify(m)).not.toContain("clipping_ratio");
  });
});

describe("startRecordSync", () => {
  beforeEach(() => {
    clearAll();
    setStudent(null);
    setClassState(null);
    vi.useFakeTimers();
  });

  it("sends a changed record once, only for a device that joined a class", async () => {
    const send = vi.fn(async () => {});
    setStudent({ classCode: "DEMO-2026", number: "S-04", secret: "ABC234" });
    setClassState({ classCode: "DEMO-2026", school: "jhs", allowedSensors: ["microphone"], teacherEnabled: [], halted: false, updatedAt: "", seenAt: "" });
    const stop = startRecordSync(send);

    const rec = createRecord("sound");
    updateRecord(rec.id, (r) => ({ ...r, prediction: { ...r.prediction, text: "高くなる" } }));
    await vi.advanceTimersByTimeAsync(1000);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]).toMatchObject(["DEMO-2026", "S-04", "ABC234", { record_id: rec.id, prediction: "高くなる" }]);
    stop();
  });

  it("sends nothing when the device is not in a class", async () => {
    const send = vi.fn(async () => {});
    const stop = startRecordSync(send);
    createRecord("sound");
    await vi.advanceTimersByTimeAsync(1000);

    expect(send).not.toHaveBeenCalled();
    stop();
  });
});

describe("記録は番号ごと（10/2 採点: 番号を変えると前の人の記録が新しい番号で送られ得た）", () => {
  const cls = { classCode: "DEMO-2026", school: "jhs" as const, allowedSensors: ["microphone" as const], teacherEnabled: [], halted: false, updatedAt: "", seenAt: "" };
  beforeEach(() => {
    clearAll();
    setStudent(null);
    setClassState(null);
    vi.useFakeTimers();
  });

  it("does not send the previous student's record under the new number", async () => {
    const send = vi.fn(async () => {});
    setClassState(cls);
    setStudent({ classCode: "DEMO-2026", number: "S-04", secret: "ABC234" });
    const old = createRecord("sound");
    setStudent({ classCode: "DEMO-2026", number: "S-05", secret: "XYZ789" });
    const stop = startRecordSync(send);

    updateRecord(old.id, (r) => ({ ...r, explain: "書き足し" }));
    const mine = createRecord("sound");
    await vi.advanceTimersByTimeAsync(1000);

    expect(send.mock.calls.map((c) => (c as unknown as [string, string, string, { record_id: string }])[3].record_id)).toEqual([mine.id]);
    expect((send.mock.calls[0] as unknown as unknown[]).slice(0, 3)).toEqual(["DEMO-2026", "S-05", "XYZ789"]);
    stop();
  });

  it("drops a pending send when the number changes before it goes out", async () => {
    const send = vi.fn(async () => {});
    setClassState(cls);
    setStudent({ classCode: "DEMO-2026", number: "S-04", secret: "ABC234" });
    const stop = startRecordSync(send);
    createRecord("sound");

    setStudent({ classCode: "DEMO-2026", number: "S-05", secret: "XYZ789" });
    await vi.advanceTimersByTimeAsync(1000);

    expect(send).not.toHaveBeenCalled();
    stop();
  });

  it("a record URL only opens the current student's record", () => {
    setStudent({ classCode: "DEMO-2026", number: "S-04", secret: "ABC234" });
    const old = createRecord("sound");
    expect(myRecordById(old.id)?.id).toBe(old.id);

    setStudent({ classCode: "DEMO-2026", number: "S-05", secret: "XYZ789" });

    expect(myRecordById(old.id)).toBeUndefined();
  });

  it("the theme only continues the current student's record", () => {
    setStudent({ classCode: "DEMO-2026", number: "S-04", secret: "ABC234" });
    createRecord("sound");
    setStudent({ classCode: "DEMO-2026", number: "S-05", secret: "XYZ789" });

    expect(activeRecordForTheme("sound")).toBeUndefined();
  });
});

describe("送れなかった記録は送り直す（10/2 採点 3-2）", () => {
  beforeEach(() => {
    clearAll();
    setStudent(null);
    setClassState(null);
    vi.useFakeTimers();
  });

  it("retries a failed send without waiting for the record to change", async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    setClassState({ classCode: "DEMO-2026", school: "jhs", allowedSensors: ["microphone"], teacherEnabled: [], halted: false, updatedAt: "", seenAt: "" });
    setStudent({ classCode: "DEMO-2026", number: "S-04", secret: "ABC234" });
    const stop = startRecordSync(send);
    createRecord("sound");

    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(6000);

    expect(send).toHaveBeenCalledTimes(2);
    stop();
  });
});
