import { describe, expect, it } from "vitest";
import { classifyMotionSample } from "./pendulum";

describe("classifyMotionSample", () => {
  it("says no when the browser fires a motion event with every value null (the device has no sensors)", () => {
    const sample = { accelerationIncludingGravity: { x: null, y: null, z: null }, rotationRate: { alpha: null, beta: null, gamma: null } };

    expect(classifyMotionSample(sample)).toBe("no");
  });

  it("says no when the event carries no acceleration or rotation objects", () => {
    expect(classifyMotionSample({ accelerationIncludingGravity: null, rotationRate: null })).toBe("no");
  });

  it("says yes when acceleration values arrive", () => {
    const sample = { accelerationIncludingGravity: { x: 0.1, y: 9.8, z: 0.2 }, rotationRate: null };

    expect(classifyMotionSample(sample)).toBe("yes");
  });

  it("says yes when only rotation values arrive", () => {
    const sample = { accelerationIncludingGravity: null, rotationRate: { alpha: 1.5, beta: 0, gamma: -0.4 } };

    expect(classifyMotionSample(sample)).toBe("yes");
  });
});
