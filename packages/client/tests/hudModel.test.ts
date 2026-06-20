import { describe, it, expect } from "vitest";
import { gameData } from "@autobattler/data";
import type { UnitInstance } from "@autobattler/sim/src/types.js";
import { traitStripModel, xpProgress, buyXpGeom } from "../src/hudModel.js";
import { traitColor } from "../src/theme.js";
import { resolveLayout } from "../src/layout.js";

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
    // knight breakpoints are 2/4/6 → the first tier is satisfied (activeTier 1).
    expect(knight.activeTier).toBe(1);
    expect(knight.tierCount).toBe(3);

    // A single knight stays inactive: count 1, next breakpoint 2, activeTier 0
    // (no breakpoint reached), tierCount 3 (knight breakpoints 2/4/6).
    const single = traitStripModel([unit(unitsWithTrait("knight")[0]!)], gameData.units, gameData.traits);
    const inactiveKnight = single.find((c) => c.traitId === "knight")!;
    expect(inactiveKnight.activeBreakpoint).toBeNull();
    expect(inactiveKnight.count).toBe(1);
    expect(inactiveKnight.nextBreakpoint).toBe(2);
    expect(inactiveKnight.activeTier).toBe(0);
    expect(inactiveKnight.tierCount).toBe(3);

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

  it("reports activeTier / tierCount and the maxed denominator", () => {
    // summoner breakpoints are 2/4 — 4 distinct summoners maxes it (top tier).
    const summoners = unitsWithTrait("summoner").slice(0, 4);
    expect(summoners.length).toBe(4);
    const c = traitStripModel(summoners.map(unit), gameData.units, gameData.traits)
      .find((x) => x.traitId === "summoner")!;
    expect(c.count).toBe(4);
    expect(c.tierCount).toBe(2);
    expect(c.activeTier).toBe(2);          // both breakpoints reached → top tier
    expect(c.activeBreakpoint).toBe(4);
    expect(c.nextBreakpoint).toBeNull();    // maxed → no next breakpoint
    // activeTier equals tierCount ⇒ maxed (the count/denominator reads e.g. 4/4).
    expect(c.activeTier).toBe(c.tierCount);
  });

  it("sorts by activation tier reached, not raw count (a maxed trait outranks a higher-count lower-tier one)", () => {
    // summoner 2/4 maxed at 4 (activeTier 2) vs knight 2/4/6 at 5 (activeTier 2,
    // still not maxed). With equal tiers the higher count (knight) sorts first;
    // but drop summoner to its TOP tier while knight sits on its FIRST tier and
    // the maxed-tier trait must come first even though its count is lower.
    const summoners = unitsWithTrait("summoner").slice(0, 4); // count 4 → activeTier 2
    const knights = unitsWithTrait("knight").slice(0, 5);      // count 5 → activeTier 2
    expect(summoners.length).toBe(4);
    expect(knights.length).toBe(5);

    // Tier-2 summoner (maxed) vs tier-1 knight (count 3): tier wins over count.
    const knights3 = unitsWithTrait("knight").slice(0, 3); // count 3 → activeTier 1
    const board = [...summoners.map(unit), ...knights3.map(unit)];
    const model = traitStripModel(board, gameData.units, gameData.traits);
    const si = model.findIndex((c) => c.traitId === "summoner");
    const ki = model.findIndex((c) => c.traitId === "knight");
    const sm = model[si]!;
    const km = model[ki]!;
    expect(sm.activeTier).toBe(2);
    expect(km.activeTier).toBe(1);
    expect(si).toBeLessThan(ki); // higher activeTier sorts first regardless of count

    // Sanity: with equal activeTier (both 2) the higher count sorts first.
    const board2 = [...summoners.map(unit), ...knights.map(unit)];
    const model2 = traitStripModel(board2, gameData.units, gameData.traits);
    const si2 = model2.findIndex((c) => c.traitId === "summoner"); // tier2, count4
    const ki2 = model2.findIndex((c) => c.traitId === "knight");   // tier2, count5
    expect(model2[si2]!.activeTier).toBe(model2[ki2]!.activeTier);
    expect(ki2).toBeLessThan(si2); // tie on tier → higher count first
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

  it("matches the real economy.json thresholds at known boundaries", () => {
    const real = gameData.economy.levelXpThresholds;
    expect(real).toEqual([0, 2, 6, 12, 20, 32, 50, 76, 110]);
    // Just into level 3 (threshold 6): 8 xp → 2 of the 6 needed for level 4.
    expect(xpProgress(8, 3, real)).toMatchObject({ level: 3, inLevel: 2, needed: 6, frac: 1 / 3 });
    // Exactly at a level boundary → 0 progress into the new level.
    expect(xpProgress(20, 5, real)).toMatchObject({ level: 5, inLevel: 0, frac: 0 });
  });
});

describe("buyXpGeom", () => {
  // Exercise across the portrait + landscape econ-cluster regions. Portrait
  // passes the full hud band; landscape passes the right sub-column.
  const regions = [
    resolveLayout({ viewportW: 390, viewportH: 844 }).regions.hud,   // portrait tall
    resolveLayout({ viewportW: 390, viewportH: 606 }).regions.hud,   // portrait short floor
    (() => { const h = resolveLayout({ viewportW: 844, viewportH: 390 }).regions.hud; return { x: h.x + h.w - 96, y: h.y, w: 96, h: h.h }; })(), // landscape sub-column
    (() => { const h = resolveLayout({ viewportW: 640, viewportH: 360 }).regions.hud; return { x: h.x + h.w - 96, y: h.y, w: 96, h: h.h }; })(),
  ];

  for (const reg of regions) {
    it(`circle + arc + badge stay coherent (region h=${reg.h})`, () => {
      const g = buyXpGeom(reg);
      // Positive sizes.
      expect(g.r).toBeGreaterThan(0);
      expect(g.rimW).toBeGreaterThan(0);
      expect(g.badgeR).toBeGreaterThan(0);
      expect(g.arcW).toBeGreaterThan(0);
      expect(g.fontSize).toBeGreaterThanOrEqual(6);
      // Anchored to the left of the region, vertically centered.
      expect(g.cx).toBeGreaterThanOrEqual(reg.x + g.r);
      expect(g.cy).toBeCloseTo(reg.y + reg.h / 2, 5);
      // Arc sits outside the disc; spans a quarter circle (90°) on the right.
      expect(g.arcR).toBeGreaterThanOrEqual(g.r);
      expect(g.arcEnd - g.arcStart).toBeCloseTo(Math.PI / 2, 5);
      // Badge overlaps the bottom-right (both coords beyond the center).
      expect(g.badgeCx).toBeGreaterThan(g.cx);
      expect(g.badgeCy).toBeGreaterThan(g.cy);
      // The floating xp text sits above the button (outside it).
      expect(g.fracY).toBeLessThan(g.cy - g.r);
    });
  }
});
