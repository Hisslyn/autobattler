import { describe, it, expect } from "vitest";
import { gameData } from "@autobattler/data";
import { traitDetailModel, breakpointEffect } from "../src/traitDetailModel.js";

describe("traitDetailModel", () => {
  it("returns null for an unknown trait", () => {
    expect(traitDetailModel("__nope__", 0, gameData)).toBeNull();
  });

  it("lists breakpoints in order with reached + single active flag", () => {
    // knight breakpoints 2/4/6; a count of 4 reaches the first two, active = 4.
    const m = traitDetailModel("knight", 4, gameData)!;
    expect(m.name).toBe(gameData.traits.find((t) => t.id === "knight")!.name);
    expect(m.count).toBe(4);
    expect(m.rows.map((r) => r.count)).toEqual([2, 4, 6]);
    expect(m.rows.map((r) => r.reached)).toEqual([true, true, false]);
    expect(m.rows.filter((r) => r.active).map((r) => r.count)).toEqual([4]);
  });

  it("marks no breakpoint active below the first", () => {
    const m = traitDetailModel("knight", 1, gameData)!;
    expect(m.rows.every((r) => !r.active)).toBe(true);
    expect(m.rows.every((r) => !r.reached)).toBe(true);
  });

  it("renders a stat effect line", () => {
    expect(breakpointEffect({ stat: "ad", value: 25 })).toBe("+25 AD");
    expect(breakpointEffect({ stat: "abilityDamage", value: 150 })).toBe("+150 Ability Power");
    expect(breakpointEffect({ stat: "mr", value: 600 })).toBe("+600 Magic Resist");
    // attack-speed deltas are fixed-point (scale 1000) → +0.28, not +280
    expect(breakpointEffect({ stat: "as", value: 280 })).toBe("+0.28 Attack Speed");
  });
});
