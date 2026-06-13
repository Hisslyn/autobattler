import { describe, it, expect } from "vitest";
import { computeGain } from "../src/audio/manager.js";

describe("audio bus gain math", () => {
  it("multiplies master by channel volume", () => {
    expect(computeGain(1, 1, false)).toBe(1);
    expect(computeGain(0.5, 0.5, false)).toBe(0.25);
    expect(computeGain(0.8, 0.5, false)).toBeCloseTo(0.4);
  });

  it("mute forces gain to 0 regardless of volumes", () => {
    expect(computeGain(1, 1, true)).toBe(0);
    expect(computeGain(0.7, 0.9, true)).toBe(0);
  });

  it("clamps out-of-range volumes into [0,1]", () => {
    expect(computeGain(5, 1, false)).toBe(1);
    expect(computeGain(-2, 0.5, false)).toBe(0);
    expect(computeGain(1, 3, false)).toBe(1);
  });
});
