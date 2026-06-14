import { describe, it, expect } from "vitest";
import { gameData, recipeResult } from "@autobattler/data";
import { createMatch } from "../src/match.js";
import { applyCommand } from "../src/commands.js";
import { mulberry32 } from "@autobattler/sim/src/prng.js";
import type { UnitInstance } from "@autobattler/sim/src/types.js";

function makeUnit(uid: number, defId: string, items: string[] = []): UnitInstance {
  const def = gameData.units.find((d) => d.id === defId)!;
  return {
    uid,
    defId,
    tier: def.tier,
    star: 1,
    team: 0,
    pos: { q: 0, r: 0 },
    hp: def.hp,
    maxHp: def.hp,
    ad: def.ad,
    as: def.as,
    armor: def.armor,
    mr: def.mr,
    range: def.range,
    mana: def.manaStart,
    maxMana: def.mana,
    abilityDamage: def.abilityDamage,
    attackCooldown: 0,
    statusEffects: [],
    items: [...items],
  };
}

const prng = mulberry32(1);
const defId = gameData.units[0]!.id;

describe("recipe resolver", () => {
  it("resolves known component pairs to the correct completed item, both orders", () => {
    expect(recipeResult("iron_sword", "chain_vest", gameData.items)).toBe("iron_sword__chain_vest");
    expect(recipeResult("chain_vest", "iron_sword", gameData.items)).toBe("iron_sword__chain_vest");
    expect(recipeResult("mana_crystal", "sorcerer_rod", gameData.items)).toBe("mana_crystal__sorcerer_rod");
  });

  it("returns null for non-recipe pairs (same component, or a completed item)", () => {
    expect(recipeResult("iron_sword", "iron_sword", gameData.items)).toBeNull();
    expect(recipeResult("iron_sword__chain_vest", "iron_sword", gameData.items)).toBeNull();
    expect(recipeResult("iron_sword", "not_an_item", gameData.items)).toBeNull();
  });

  it("every completed item is reachable from its component pair", () => {
    for (const item of gameData.items.filter((i) => i.recipe)) {
      const [a, b] = item.recipe!;
      expect(recipeResult(a, b, gameData.items)).toBe(item.id);
    }
  });
});

describe("COMBINE_ITEMS", () => {
  it("combines two loose components in the inventory into the completed item", () => {
    const state = createMatch(1, gameData);
    const player = state.players[0]!;
    player.items = ["iron_sword", "chain_vest"];
    const res = applyCommand(state, 0, { type: "COMBINE_ITEMS", itemIdA: "iron_sword", itemIdB: "chain_vest" }, prng, gameData);
    expect(res.ok).toBe(true);
    expect(player.items).toEqual(["iron_sword__chain_vest"]);
  });

  it("rejects a non-combinable pair with NO_RECIPE and leaves the inventory unchanged", () => {
    const state = createMatch(1, gameData);
    const player = state.players[0]!;
    player.items = ["iron_sword", "iron_sword"];
    const res = applyCommand(state, 0, { type: "COMBINE_ITEMS", itemIdA: "iron_sword", itemIdB: "iron_sword" }, prng, gameData);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("NO_RECIPE");
    expect(player.items).toEqual(["iron_sword", "iron_sword"]);
  });

  it("rejects when a component is not present (ITEM_NOT_FOUND)", () => {
    const state = createMatch(1, gameData);
    const player = state.players[0]!;
    player.items = ["iron_sword"];
    const res = applyCommand(state, 0, { type: "COMBINE_ITEMS", itemIdA: "iron_sword", itemIdB: "chain_vest" }, prng, gameData);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("ITEM_NOT_FOUND");
  });
});

describe("EQUIP auto-combine + slot cap", () => {
  it("equipping a component onto a unit holding a matching component fuses in place (one slot)", () => {
    const state = createMatch(1, gameData);
    const player = state.players[0]!;
    player.bench = [makeUnit(7001, defId, ["iron_sword"])];
    player.items = ["chain_vest"];
    const res = applyCommand(state, 0, { type: "EQUIP", unitUid: 7001, itemId: "chain_vest" }, prng, gameData);
    expect(res.ok).toBe(true);
    expect(player.bench[0]!.items).toEqual(["iron_sword__chain_vest"]);
    expect(player.items).toEqual([]);
  });

  it("auto-combine works even when the unit is at the 3-item cap", () => {
    const state = createMatch(1, gameData);
    const player = state.players[0]!;
    player.bench = [makeUnit(7002, defId, ["iron_sword", "recurve_bow", "negatron_cloak"])];
    player.items = ["chain_vest"];
    const res = applyCommand(state, 0, { type: "EQUIP", unitUid: 7002, itemId: "chain_vest" }, prng, gameData);
    expect(res.ok).toBe(true);
    expect(player.bench[0]!.items).toContain("iron_sword__chain_vest");
    expect(player.bench[0]!.items.length).toBe(3);
  });

  it("rejects a non-combining equip onto a full unit with ITEM_SLOTS_FULL", () => {
    const state = createMatch(1, gameData);
    const player = state.players[0]!;
    // Three completed items -> no component can auto-combine.
    player.bench = [makeUnit(7003, defId, ["iron_sword__chain_vest", "recurve_bow__negatron_cloak", "giants_belt__tear_flask"])];
    player.items = ["mana_crystal"];
    const res = applyCommand(state, 0, { type: "EQUIP", unitUid: 7003, itemId: "mana_crystal" }, prng, gameData);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("ITEM_SLOTS_FULL");
    expect(player.items).toEqual(["mana_crystal"]);
  });
});

describe("UNEQUIP", () => {
  it("moves an item from a unit back to the inventory", () => {
    const state = createMatch(1, gameData);
    const player = state.players[0]!;
    player.bench = [makeUnit(7004, defId, ["iron_sword", "chain_vest"])];
    player.items = [];
    const res = applyCommand(state, 0, { type: "UNEQUIP", unitUid: 7004, itemId: "iron_sword" }, prng, gameData);
    expect(res.ok).toBe(true);
    expect(player.bench[0]!.items).toEqual(["chain_vest"]);
    expect(player.items).toEqual(["iron_sword"]);
  });

  it("rejects unequipping an item the unit does not hold", () => {
    const state = createMatch(1, gameData);
    const player = state.players[0]!;
    player.bench = [makeUnit(7005, defId, [])];
    const res = applyCommand(state, 0, { type: "UNEQUIP", unitUid: 7005, itemId: "iron_sword" }, prng, gameData);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("ITEM_NOT_FOUND");
  });
});
