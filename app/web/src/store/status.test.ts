import { describe, expect, it } from "vitest";
import { themeById, themesFor } from "../catalog/themes";
import { DEFAULT_CLASS_POLICY, themeStatus, type DeviceCaps } from "./status";

const energy = themeById("energy")!;
const sound = themeById("sound")!;

const caps = (motionEvents: DeviceCaps["motionEvents"]): DeviceCaps => ({ motion: true, media: true, motionEvents });

describe("themesFor", () => {
  it("lists only junior high themes at the junior high entrance", () => {
    const ids = themesFor("jhs").map((t) => t.id);

    expect(ids).toContain("energy");
    expect(ids).toContain("sound");
    expect(ids).not.toContain("pendulum");
    expect(themesFor("jhs").every((t) => t.school === "jhs")).toBe(true);
  });
});

describe("themeStatus and device tiers", () => {
  it("greys out a motion theme when no motion events arrive, and points to the sound theme", () => {
    const s = themeStatus(energy, [], caps("no"), DEFAULT_CLASS_POLICY);

    expect(s.kind).toBe("unavailable");
    expect(s.kind === "unavailable" ? s.reason : "").toContain("音の高さ");
  });

  it("keeps a motion theme open while motion support is unknown (iOS asks at the tap)", () => {
    expect(themeStatus(energy, [], caps("unknown"), DEFAULT_CLASS_POLICY).kind).toBe("new");
  });

  it("keeps the sound theme open on a camera-and-microphone-only device", () => {
    expect(themeStatus(sound, [], caps("no"), DEFAULT_CLASS_POLICY).kind).toBe("new");
  });
});
