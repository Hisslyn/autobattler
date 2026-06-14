import { describe, it, expect } from "vitest";
import { gameData } from "@autobattler/data";
import type { UnitInstance } from "@autobattler/sim/src/types.js";
import { inspectModel, abilityDescription } from "../src/inspectModel.js";

describe("inspectModel", () => {
  it("returns null for an unknown unit", () => {
    expect(inspectModel("__nope__", null, gameData)).toBeNull();
  });

  it("assembles identity, traits, cost and the full stat block from data", () => {
    const def = gameData.units[0]!;
    const m = inspectModel(def.id, null, gameData)!;
    expect(m.name).toBe(def.name);
    expect(m.tier).toBe(def.tier);
    expect(m.cost).toBe(def.tier);
    expect(m.star).toBe(1);
    expect(m.origin?.id).toBe(def.origin);
    expect(m.classes.map((c) => c.id)).toEqual(def.classes);
    // every stat row present and findable
    const labels = m.stats.map((s) => s.label);
    for (const l of ["HP", "AD", "AS", "Armor", "MR", "Range", "Mana", "Ability"]) {
      expect(labels).toContain(l);
    }
    // shop preview shows base hp + start/max mana
    expect(m.stats.find((s) => s.label === "HP")!.value).toBe(`${def.hp}`);
    expect(m.stats.find((s) => s.label === "Mana")!.value).toBe(`${def.manaStart}/${def.mana}`);
    // attack speed is fixed-point → shown to 2 decimals, never the raw value
    expect(m.stats.find((s) => s.label === "AS")!.value).toBe((def.as / 1000).toFixed(2));
  });

  it("uses the live instance's current hp/mana/star when owned", () => {
    const def = gameData.units[0]!;
    const inst = {
      defId: def.id,
      star: 2,
      hp: 7,
      maxHp: def.hp,
      mana: 3,
      maxMana: def.mana,
      ad: def.ad,
      armor: def.armor,
      mr: def.mr,
    } as UnitInstance;
    const m = inspectModel(def.id, inst, gameData)!;
    expect(m.star).toBe(2);
    expect(m.stats.find((s) => s.label === "HP")!.value).toBe(`7/${def.hp}`);
    expect(m.stats.find((s) => s.label === "Mana")!.value).toBe(`3/${def.mana}`);
  });

  it("describes every ability effect kind", () => {
    expect(abilityDescription("x", { kind: "magic_damage" }, 100)).toMatch(/100 magic/);
    expect(abilityDescription("x", { kind: "burn", burn: 20, duration: 40 }, 80)).toMatch(/burns for 20/);
    expect(abilityDescription("x", { kind: "shield", amount: 200, duration: 60 }, 0)).toMatch(/200 shield/);
    expect(abilityDescription("x", { kind: "buff", stat: "ad", value: 30, duration: 80 }, 0)).toMatch(/ad by \+30/);
    // an attack-speed buff renders its delta as fixed-point, not the raw value
    expect(abilityDescription("x", { kind: "buff", stat: "as", value: 280, duration: 80 }, 0)).toMatch(/as by \+0\.28/);
    expect(abilityDescription("x", { kind: "stealth", duration: 20 }, 0)).toMatch(/Untargetable/);
  });
});
