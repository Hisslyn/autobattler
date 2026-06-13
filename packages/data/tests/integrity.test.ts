import { describe, it, expect } from "vitest";
import { gameData } from "../src/loader.js";

const VALID_STATS = new Set(["hp", "ad", "as", "armor", "mr", "range", "mana", "abilityDamage"]);

describe("data integrity", () => {
  it("every trait referenced in units.json resolves to a trait def", () => {
    const traitIds = new Set(gameData.traits.map((t) => t.id));
    for (const unit of gameData.units) {
      for (const traitId of unit.traits) {
        expect(traitIds.has(traitId), `unit ${unit.id} references unknown trait ${traitId}`).toBe(true);
      }
    }
  });

  it("every itemId referenced anywhere in units.json resolves to an item def", () => {
    const itemIds = new Set(gameData.items.map((i) => i.id));
    // Units carry no item references today; scan generically so future
    // `items`/`itemId` fields are covered automatically.
    const scan = (node: unknown, path: string): void => {
      if (Array.isArray(node)) {
        node.forEach((v, i) => scan(v, `${path}[${i}]`));
      } else if (node && typeof node === "object") {
        for (const [k, v] of Object.entries(node)) {
          if ((k === "items" || k === "itemId") && typeof v === "string") {
            expect(itemIds.has(v), `${path}.${k} references unknown item ${v}`).toBe(true);
          } else if (k === "items" && Array.isArray(v)) {
            for (const id of v) {
              expect(itemIds.has(String(id)), `${path}.items references unknown item ${id}`).toBe(true);
            }
          } else {
            scan(v, `${path}.${k}`);
          }
        }
      }
    };
    scan(gameData.units, "units");
  });

  it("trait breakpoint effects and item stats reference valid stat names", () => {
    for (const trait of gameData.traits) {
      expect(trait.breakpoints.length).toBeGreaterThan(0);
      for (const bp of trait.breakpoints) {
        expect(VALID_STATS.has(bp.effect.stat), `trait ${trait.id} buffs unknown stat ${bp.effect.stat}`).toBe(true);
        expect(bp.count).toBeGreaterThan(0);
      }
    }
    for (const item of gameData.items) {
      for (const stat of Object.keys(item.stats)) {
        expect(VALID_STATS.has(stat), `item ${item.id} buffs unknown stat ${stat}`).toBe(true);
      }
    }
  });

  it("every ability references valid constants (numeric, manaStart <= mana)", () => {
    for (const unit of gameData.units) {
      expect(Number.isFinite(unit.abilityDamage), `unit ${unit.id} abilityDamage`).toBe(true);
      expect(unit.abilityDamage).toBeGreaterThan(0);
      expect(unit.mana).toBeGreaterThan(0);
      expect(unit.manaStart).toBeGreaterThanOrEqual(0);
      expect(unit.manaStart, `unit ${unit.id} manaStart must not exceed mana`).toBeLessThanOrEqual(unit.mana);
    }
  });

  it("every tier present in units has pool and shop-odds entries", () => {
    const tiers = new Set(gameData.units.map((u) => u.tier));
    for (const tier of tiers) {
      expect(gameData.economy.poolCounts[String(tier)], `poolCounts missing tier ${tier}`).toBeGreaterThan(0);
      for (const row of gameData.economy.shopOdds) {
        expect(row.length, "shopOdds row too short for unit tiers").toBeGreaterThanOrEqual(tier);
      }
    }
  });

  it("tiers with zero units are tolerated only when their shop odds are 0 at every level", () => {
    const tiersWithUnits = new Set(gameData.units.map((u) => u.tier));
    const configuredTiers = Object.keys(gameData.economy.poolCounts).map(Number);
    for (const tier of configuredTiers) {
      if (tiersWithUnits.has(tier)) continue;
      // Future-content tier (e.g. 4-5): pool/odds config may stay, but it
      // must be unrollable, otherwise shops would produce empty slots.
      for (let level = 0; level < gameData.economy.shopOdds.length; level++) {
        expect(
          gameData.economy.shopOdds[level]![tier - 1] ?? 0,
          `tier ${tier} has no units but nonzero shop odds at level ${level + 1}`
        ).toBe(0);
      }
    }
  });

  it("shop odds rows are well-formed (sum to 100)", () => {
    for (const row of gameData.economy.shopOdds) {
      expect(row.reduce((s, v) => s + v, 0)).toBe(100);
    }
  });
});

describe("v1 content completeness", () => {
  const originIds = new Set(gameData.traits.filter((t) => t.kind === "origin").map((t) => t.id));
  const classIds = new Set(gameData.traits.filter((t) => t.kind === "class").map((t) => t.id));

  it("has exactly 50 units with tier counts 13/13/12/8/4", () => {
    expect(gameData.units.length).toBe(50);
    const byTier: Record<number, number> = {};
    for (const u of gameData.units) byTier[u.tier] = (byTier[u.tier] ?? 0) + 1;
    expect(byTier).toEqual({ 1: 13, 2: 13, 3: 12, 4: 8, 5: 4 });
  });

  it("no duplicate ids across units, traits, items", () => {
    for (const coll of [gameData.units, gameData.traits, gameData.items]) {
      const ids = coll.map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("every unit has exactly one origin and 1-2 classes that resolve", () => {
    for (const u of gameData.units) {
      expect(originIds.has(u.origin), `${u.id} origin ${u.origin}`).toBe(true);
      expect(u.classes.length).toBeGreaterThanOrEqual(1);
      expect(u.classes.length).toBeLessThanOrEqual(2);
      for (const c of u.classes) expect(classIds.has(c), `${u.id} class ${c}`).toBe(true);
      // traits is the flattened [origin, ...classes].
      expect(u.traits).toEqual([u.origin, ...u.classes]);
    }
  });

  it("every trait's top breakpoint is reachable by unit count", () => {
    const counts = new Map<string, number>();
    for (const u of gameData.units) for (const t of u.traits) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (const trait of gameData.traits) {
      const top = trait.breakpoints[trait.breakpoints.length - 1]!.count;
      expect(counts.get(trait.id) ?? 0, `trait ${trait.id} top breakpoint ${top}`).toBeGreaterThanOrEqual(top);
      // Breakpoints ascend at the documented 2/4/6 cadence.
      expect(trait.breakpoints.map((b) => b.count)).toEqual([2, 4, 6].slice(0, trait.breakpoints.length));
    }
  });

  it("every ability is valid and casts at full mana", () => {
    const kinds = new Set(["magic_damage", "burn", "shield", "buff", "stealth"]);
    for (const u of gameData.units) {
      expect(kinds.has(u.ability.effect.kind), `${u.id} ability kind`).toBe(true);
      expect(u.ability.manaCost, `${u.id} manaCost == mana`).toBe(u.mana);
    }
  });

  it("items split into 9 components + 36 completed; recipes resolve to component pairs", () => {
    const components = gameData.items.filter((i) => i.component);
    const completed = gameData.items.filter((i) => !i.component);
    expect(components.length).toBe(9);
    expect(completed.length).toBe(36);
    const compIds = new Set(components.map((c) => c.id));
    const seenPairs = new Set<string>();
    for (const item of completed) {
      expect(item.recipe, `${item.id} has a recipe`).toBeDefined();
      const [a, b] = item.recipe!;
      expect(compIds.has(a) && compIds.has(b), `${item.id} recipe components exist`).toBe(true);
      const key = [a, b].sort().join("+");
      expect(seenPairs.has(key), `${item.id} duplicate recipe ${key}`).toBe(false);
      seenPairs.add(key);
    }
    // 36 distinct unordered pairs of 9 components.
    expect(seenPairs.size).toBe(36);
  });

  it("all five tiers have pool counts and a nonzero shop-odds level", () => {
    for (let tier = 1; tier <= 5; tier++) {
      expect(gameData.economy.poolCounts[String(tier)]).toBeGreaterThan(0);
      const anyNonzero = gameData.economy.shopOdds.some((row) => (row[tier - 1] ?? 0) > 0);
      expect(anyNonzero, `tier ${tier} appears in some shop level`).toBe(true);
    }
  });
});
