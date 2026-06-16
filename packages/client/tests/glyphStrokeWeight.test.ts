import { describe, it, expect } from "vitest";
import { glyphStrokeWeight } from "../src/theme.js";

// Pure function — no Pixi, no DOM, safe to unit-test.
describe("glyphStrokeWeight", () => {
  it("returns 1.5 for very small chip/rail sizes (≤9)", () => {
    expect(glyphStrokeWeight(8)).toBe(1.5);
    expect(glyphStrokeWeight(9)).toBe(1.5);
  });

  it("returns 1.8 for bench/shop token sizes (10–13)", () => {
    expect(glyphStrokeWeight(10)).toBe(1.8);
    expect(glyphStrokeWeight(13)).toBe(1.8);
  });

  it("returns 2 for standard board token sizes (14–20)", () => {
    expect(glyphStrokeWeight(14)).toBe(2);
    expect(glyphStrokeWeight(20)).toBe(2);
  });

  it("returns proportional weight for large sizes (>20)", () => {
    expect(glyphStrokeWeight(21)).toBeCloseTo(Math.max(2, 21 * 0.1));
    expect(glyphStrokeWeight(32)).toBeCloseTo(3.2);
  });

  it("large-token band is byte-identical to the old formula for size 16 (board token)", () => {
    // Old: size<=20 → 2. New: size<=20 → 2. Must be exactly 2, unchanged.
    expect(glyphStrokeWeight(16)).toBe(2);
  });
});
