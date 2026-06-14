import { describe, it, expect } from "vitest";
import { gameData } from "@autobattler/data";
import type { UnitInstance } from "@autobattler/sim/src/types.js";
import { sellValue } from "../src/sellValue.js";

const inst = (defId: string, star: 1 | 2 | 3): UnitInstance =>
  ({ defId, star } as UnitInstance);

describe("sellValue", () => {
  it("returns 0 for an unknown unit", () => {
    expect(sellValue(inst("__nope__", 1), gameData)).toBe(0);
  });

  it("mirrors the rules SELL formula: tier × copies-per-star × multiplier", () => {
    const def = gameData.units.find((u) => u.tier === 1)!;
    const mult = gameData.gameplay.sellValueMultiplier;
    const cps = gameData.gameplay.copiesPerStar;
    expect(sellValue(inst(def.id, 1), gameData)).toBe(def.tier * cps["1"]! * mult);
    expect(sellValue(inst(def.id, 2), gameData)).toBe(def.tier * cps["2"]! * mult);
    expect(sellValue(inst(def.id, 3), gameData)).toBe(def.tier * cps["3"]! * mult);
  });
});
