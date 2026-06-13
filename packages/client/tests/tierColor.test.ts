import { describe, it, expect } from "vitest";
import { C, tierColor } from "../src/theme.js";

describe("tier color mapping", () => {
  it("maps tiers 1-5 to the stage-1 palette", () => {
    expect(tierColor(1)).toBe(C.tier1);
    expect(tierColor(2)).toBe(C.tier2);
    expect(tierColor(3)).toBe(C.tier3);
    expect(tierColor(4)).toBe(C.tier4);
    expect(tierColor(5)).toBe(C.tier5);
  });

  it("locks the stage-1 tier hex values", () => {
    expect(C.tier1).toBe(0x8b93a6);
    expect(C.tier2).toBe(0x5dcaa5);
    expect(C.tier3).toBe(0x378add);
    expect(C.tier4).toBe(0x9b87f5);
    expect(C.tier5).toBe(0xf0a830);
  });

  it("clamps out-of-range tiers to tier 1", () => {
    expect(tierColor(0)).toBe(C.tier1);
    expect(tierColor(6)).toBe(C.tier1);
  });
});
