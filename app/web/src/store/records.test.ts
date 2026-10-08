import { describe, expect, it } from "vitest";
import { createRecord, getState, setStudent, wipeDevice } from "./records";

describe("wipeDevice（共用の端末を次の人に渡す）", () => {
  it("removes the records, the number and the passphrase", () => {
    setStudent({ classCode: "DEMO-2026", number: "S-04", secret: "ABC234" });
    createRecord("sound");

    wipeDevice();

    expect(getState().records).toEqual([]);
    expect(getState().student).toBeNull();
    expect(getState().classState).toBeNull();
  });
});
