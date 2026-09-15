import { describe, expect, it } from "vitest";
import { themeById, variantById } from "../catalog/themes";
import { judge, readClaim } from "./stub";

const energy = themeById("energy")!;
const sound = themeById("sound")!;
const pendulum = themeById("pendulum")!;

describe("readClaim", () => {
  it("reads release height and a faster bottom speed in the energy theme", () => {
    expect(readClaim("高いところから放すほど、いちばん下で速くなると思う", energy)).toEqual({ variable: "height", direction: "faster" });
  });

  it("reads mass and no change in the energy theme", () => {
    expect(readClaim("重くしても速さは変わらないと思う", energy)).toEqual({ variable: "mass", direction: "same" });
  });

  it("reads pluck strength and a higher pitch in the sound theme", () => {
    expect(readClaim("強くはじくと音が高くなると思う。力が強いから", sound)).toEqual({ variable: "strength", direction: "faster" });
  });

  it("reads a shorter string as a pitch change, not as a shorter period", () => {
    expect(readClaim("短くすると低くなると思う", sound)).toEqual({ variable: "length", direction: "slower" });
  });
});

describe("judge", () => {
  it("calls a larger bottom speed faster", () => {
    const variant = variantById(energy, "energy_height")!;

    const j = judge(1.4, 1.98, 0.04, { variable: "height", direction: "faster" }, variant);

    expect(j.observed).toBe("faster");
    expect(j.consistent).toBe(true);
    expect(j.statement).toContain("速さ");
  });

  it("uses a relative tolerance for pitch, so a 1.8% change counts as no change", () => {
    const variant = variantById(sound, "sound_pluck_strength")!;

    const j = judge(220, 224, 0, { variable: "strength", direction: "faster" }, variant);

    expect(j.observed).toBe("same");
    expect(j.consistent).toBe(false);
    expect(j.statement).toContain("音の高さ");
  });

  it("still calls a longer period slower", () => {
    const variant = variantById(pendulum, "pendulum_length")!;

    const j = judge(1.42, 2.01, 0.01, { variable: "length", direction: "slower" }, variant);

    expect(j.observed).toBe("slower");
    expect(j.consistent).toBe(true);
  });
});
