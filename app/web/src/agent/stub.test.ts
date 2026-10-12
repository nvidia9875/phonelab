import { describe, expect, it } from "vitest";
import { themeById, variantById } from "../catalog/themes";
import { choosePlan, judge, readClaim } from "./stub";

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

describe("judge — ばらつきに埋もれた差は保留（10/2 採点 1-3）", () => {
  const sound = themeById("sound")!;
  const strength = variantById(sound, "sound_pluck_strength")!; // 許容誤差は相対 3%
  const claim = { variable: "strength" as const, direction: "faster" as const };

  it("says 'unchanged' only when the measurement is precise enough", () => {
    const j = judge(220, 221, 1, claim, strength);
    expect(j.observed).toBe("same");
    expect(j.undecided).toBeUndefined();
    expect(j.consistent).toBe(false);
  });

  it("holds instead of 'unchanged' when the noise is larger than the tolerance", () => {
    const j = judge(220, 230, 20, claim, strength);
    expect(j.undecided).toBe(true);
    expect(j.observed).toBe("unknown");
    expect(j.consistent).toBeNull();
    expect(j.statement).toContain("保留");
    expect(j.statement).not.toContain("変わらなかった");
  });

  it("still reports a difference that is bigger than the noise", () => {
    const j = judge(220, 280, 20, claim, strength);
    expect(j.observed).toBe("faster");
    expect(j.consistent).toBe(true);
  });
});

describe("choosePlan — 理由は「なぜ」の説明だけ（10/2 採点 3-3: 理由の無い予想の問い返しが 5/13）", () => {
  const sound = themeById("sound")!;
  it.each(["強くはじくと低くなると思う", "たぶん高くなるはず", "長さを短くしても変わらない"])("asks why for %s", (text) => {
    expect(choosePlan(text, sound, []).questionBack).not.toBeNull();
  });
  it.each(["強くはじくとゴムが速く震えるから、高くなる", "ギターと同じで、短いと高くなる"])("does not ask when there is a reason: %s", (text) => {
    expect(choosePlan(text, sound, []).questionBack).toBeNull();
  });
});

describe("張りの予想（10/12 デプロイ前レビュー）", () => {
  it("reads 張りを強く as tension, not as plucking strength", () => {
    const sound = themeById("sound")!;

    expect(readClaim("輪ゴムの張りを強くすると音が高くなると思う。速く震えそうだから", sound).variable).toBe("tension");
    expect(readClaim("張りはそのまま、強くはじくと高くなると思う", sound).variable).toBe("strength");
    expect(readClaim("張りを同じにして、強くはじくと高くなると思う", sound)).toEqual({ variable: "strength", direction: "faster" });
    expect(readClaim("強くはじいても高さは同じだと思う", sound).direction).toBe("same");
    expect(readClaim("張りが強くなると高い音になると思う", sound).variable).toBe("tension");
  });
});
