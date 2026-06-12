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
