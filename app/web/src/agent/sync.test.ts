import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearAll, createRecord, recordById, setClassState, setStudent, updateRecord } from "../store/records";
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

describe("startRecordSync", () => {
  beforeEach(() => {
    clearAll();
    setStudent(null);
    setClassState(null);
    vi.useFakeTimers();
  });

  it("sends a changed record once, only for a device that joined a class", async () => {
    const send = vi.fn(async () => {});
    setStudent({ classCode: "DEMO-2026", number: "S-04" });
    setClassState({ classCode: "DEMO-2026", school: "jhs", allowedSensors: ["microphone"], teacherEnabled: [], halted: false, updatedAt: "", seenAt: "" });
    const stop = startRecordSync(send);

    const rec = createRecord("sound");
    updateRecord(rec.id, (r) => ({ ...r, prediction: { ...r.prediction, text: "高くなる" } }));
    await vi.advanceTimersByTimeAsync(1000);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]).toMatchObject(["DEMO-2026", "S-04", { record_id: rec.id, prediction: "高くなる" }]);
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
