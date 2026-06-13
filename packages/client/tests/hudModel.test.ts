import { describe, it, expect } from "vitest";
import { gameData } from "@autobattler/data";
import type { UnitInstance } from "@autobattler/sim/src/types.js";
import { traitStripModel, xpProgress } from "../src/hudModel.js";
import { traitColor } from "../src/theme.js";

const unit = (defId: string): UnitInstance => ({ defId } as UnitInstance);

const unitsWithTrait = (traitId: string): string[] =>
  gameData.units.filter((u) => u.traits.includes(traitId)).map((u) => u.id);

describe("traitStripModel", () => {
  it("returns an empty model for an empty board", () => {
    expect(traitStripModel([null, null], gameData.units, gameData.traits)).toEqual([]);
  });

  it("splits active and inactive traits and computes next breakpoints", () => {
    // knight breakpoints are 2/4/6 — two distinct knights activates the first.
    const knights = unitsWithTrait("knight").slice(0, 2);
    expect(knights.length).toBe(2);
    const board = [unit(knights[0]!), unit(knights[1]!)];

    const model = traitStripModel(board, gameData.units, gameData.traits);
    const knight = model.find((c) => c.traitId === "knight")!;
    expect(knight.count).toBe(2);
    expect(knight.activeBreakpoint).toBe(2);
    expect(knight.nextBreakpoint).toBe(4);
    expect(knight.color).toBe(traitColor("knight"));

    // A single unit of some trait stays inactive: count 1, next breakpoint 2.
    const single = traitStripModel([unit(unitsWithTrait("knight")[0]!)], gameData.units, gameData.traits);
    const inactive = single.find((c) => c.activeBreakpoint === null);
    expect(inactive).toBeDefined();
    expect(inactive!.count).toBe(1);
    expect(inactive!.nextBreakpoint).toBe(2);

    // active-first ordering
    const mixed = traitStripModel(
      [unit(knights[0]!), unit(knights[1]!), unit(unitsWithTrait("sorcerer")[0]!)],
      gameData.units,
      gameData.traits
    );
    const firstInactive = mixed.findIndex((c) => c.activeBreakpoint === null);
    const lastActive = mixed.reduce((acc, c, i) => (c.activeBreakpoint !== null ? i : acc), -1);
    if (firstInactive !== -1) expect(lastActive).toBeLessThan(firstInactive);
  });

  it("counts unique defIds (duplicate copies count once)", () => {
    const knights = unitsWithTrait("knight").slice(0, 2);
    const board = [unit(knights[0]!), unit(knights[0]!), unit(knights[1]!)];
    const knight = traitStripModel(board, gameData.units, gameData.traits).find((c) => c.traitId === "knight")!;
    expect(knight.count).toBe(2);
  });
});

describe("xpProgress", () => {
  const t = [0, 2, 6, 12, 20, 32, 50, 76, 110];

  it("computes the fraction within the current level", () => {
    expect(xpProgress(0, 1, t)).toMatchObject({ inLevel: 0, needed: 2, frac: 0, maxed: false });
    expect(xpProgress(1, 1, t)).toMatchObject({ inLevel: 1, needed: 2, frac: 0.5 });
    expect(xpProgress(4, 2, t)).toMatchObject({ inLevel: 2, needed: 4, frac: 0.5 });
  });

  it("reports a full, maxed bar at the top level", () => {
    expect(xpProgress(110, 9, t)).toMatchObject({ frac: 1, maxed: true, needed: 0 });
  });

  it("clamps the fraction to 1", () => {
    expect(xpProgress(5, 1, t).frac).toBe(1);
  });
});
