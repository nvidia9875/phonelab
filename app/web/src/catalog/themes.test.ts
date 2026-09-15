import { describe, expect, it } from "vitest";
import { THEMES, themesFor } from "./themes";

describe("textbook order", () => {
  it("orders junior high themes by grade and textbook chapter (中1 音の伝わり方 → 音の大きさと高さ → 力 → 中3 運動とエネルギー)", () => {
    expect(themesFor("jhs").map((t) => t.id)).toEqual(["echo", "sound", "bottle", "coin_slip", "energy"]);
  });

  it("orders high school themes by subject, then by chapter (物理基礎 → 物理 → 生物基礎)", () => {
    expect(themesFor("hs").map((t) => t.id)).toEqual(["freefall", "jump", "elevator", "beat", "spin", "pendulum", "pulse"]);
  });

  it("keeps every theme when ordering", () => {
    expect(THEMES).toHaveLength(12);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(12);
  });
});
