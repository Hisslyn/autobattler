import { describe, it, expect } from "vitest";
import { gameData, itemKind, itemTier } from "@autobattler/data";
import { createMatch } from "../src/match.js";
import { applyCommand } from "../src/commands.js";
import type { Command } from "../src/commands.js";
import { mulberry32 } from "@autobattler/sim/src/prng.js";
import type { UnitInstance } from "@autobattler/sim/src/types.js";

/** Build a planning-phase match with one bench unit holding the given items. */
function setup(items: string[], heldByUnit: string[] = []) {
  const state = createMatch(11, gameData);
  state.phase = "PLANNING";
  const player = state.players[0]!;
  const def = gameData.units[0]!;
  const unit: UnitInstance = {
    uid: state.nextUid++,
    defId: def.id,
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
    ability: def.ability,
    attackCooldown: 0,
    statusEffects: [],
    items: [...heldByUnit],
  };
  player.bench.push(unit);
  player.items = [...items];
  return { state, player, unit };
}

const FIRST_COMPLETED = gameData.items.find((i) => itemKind(i) === "completed" && i.recipe)!.id;

describe("SELL returns equipped items to inventory", () => {
  it("removes the unit and pushes its items back into the inventory", () => {
    const { state, player, unit } = setup([], [FIRST_COMPLETED, "iron_sword"]);
    const prng = mulberry32(1);
    const res = applyCommand(state, 0, { type: "SELL", unitUid: unit.uid }, prng, gameData);
    expect(res.ok).toBe(true);
    expect(player.bench.find((u) => u.uid === unit.uid)).toBeUndefined();
    expect(player.items).toContain(FIRST_COMPLETED);
    expect(player.items).toContain("iron_sword");
  });
});

describe("USE_CONSUMABLE — success paths", () => {
  it("item_remover moves the equipped item back to inventory and consumes the remover", () => {
    const { state, player, unit } = setup(["item_remover"], [FIRST_COMPLETED]);
    const prng = mulberry32(1);
    const cmd: Command = {
      type: "USE_CONSUMABLE",
      consumableId: "item_remover",
      targetUnitId: unit.uid,
      targetItemId: FIRST_COMPLETED,
    };
    expect(applyCommand(state, 0, cmd, prng, gameData).ok).toBe(true);
    expect(unit.items).not.toContain(FIRST_COMPLETED);
    expect(player.items).toContain(FIRST_COMPLETED);
    expect(player.items).not.toContain("item_remover");
  });

  it("reforger replaces the item with a same-tier different completed item and consumes the reforger", () => {
    const { state, player, unit } = setup(["reforger"], [FIRST_COMPLETED]);
    const prng = mulberry32(1);
    const cmd: Command = {
      type: "USE_CONSUMABLE",
      consumableId: "reforger",
      targetUnitId: unit.uid,
      targetItemId: FIRST_COMPLETED,
    };
    expect(applyCommand(state, 0, cmd, prng, gameData).ok).toBe(true);
    const result = unit.items[0]!;
    expect(result).not.toBe(FIRST_COMPLETED);
    expect(itemTier(result, gameData.items, gameData.economy)).toBe(
      itemTier(FIRST_COMPLETED, gameData.items, gameData.economy)
    );
    expect(player.items).not.toContain("reforger");
  });

  it("radiant_upgrade replaces a tier-2 item with radiant_<id> (stats base*1.75 rounded) and consumes the enhancer", () => {
    const { state, player, unit } = setup(["radiant_enhancer"], [FIRST_COMPLETED]);
    const prng = mulberry32(1);
    const base = gameData.items.find((i) => i.id === FIRST_COMPLETED)!;
    const cmd: Command = {
      type: "USE_CONSUMABLE",
      consumableId: "radiant_enhancer",
      targetUnitId: unit.uid,
      targetItemId: FIRST_COMPLETED,
    };
    expect(applyCommand(state, 0, cmd, prng, gameData).ok).toBe(true);
    expect(unit.items[0]).toBe("radiant_" + FIRST_COMPLETED);
    const radiant = gameData.items.find((i) => i.id === "radiant_" + FIRST_COMPLETED)!;
    for (const [stat, value] of Object.entries(base.stats)) {
      expect(radiant.stats[stat]).toBe(
        Math.round((value! * gameData.economy.radiantStatMultiplier) / 1000)
      );
    }
    expect(player.items).not.toContain("radiant_enhancer");
  });
});

describe("USE_CONSUMABLE — typed errors", () => {
  it("CONSUMABLE_NOT_FOUND when the consumable isn't in inventory", () => {
    const { state, unit } = setup([], [FIRST_COMPLETED]);
    const prng = mulberry32(1);
    const res = applyCommand(
      state,
      0,
      { type: "USE_CONSUMABLE", consumableId: "item_remover", targetUnitId: unit.uid, targetItemId: FIRST_COMPLETED },
      prng,
      gameData
    );
    expect(res).toEqual({ ok: false, error: "CONSUMABLE_NOT_FOUND" });
  });

  it("CONSUMABLE_NOT_FOUND when the id refers to a non-consumable item", () => {
    const { state, unit } = setup(["iron_sword"], [FIRST_COMPLETED]);
    const prng = mulberry32(1);
    const res = applyCommand(
      state,
      0,
      { type: "USE_CONSUMABLE", consumableId: "iron_sword", targetUnitId: unit.uid, targetItemId: FIRST_COMPLETED },
      prng,
      gameData
    );
    expect(res).toEqual({ ok: false, error: "CONSUMABLE_NOT_FOUND" });
  });

  it("UNIT_NOT_FOUND when the target unit doesn't exist", () => {
    const { state } = setup(["item_remover"]);
    const prng = mulberry32(1);
    const res = applyCommand(
      state,
      0,
      { type: "USE_CONSUMABLE", consumableId: "item_remover", targetUnitId: 999999, targetItemId: FIRST_COMPLETED },
      prng,
      gameData
    );
    expect(res).toEqual({ ok: false, error: "UNIT_NOT_FOUND" });
  });

  it("ITEM_NOT_EQUIPPED when the target item isn't on the unit", () => {
    const { state, unit } = setup(["item_remover"], []);
    const prng = mulberry32(1);
    const res = applyCommand(
      state,
      0,
      { type: "USE_CONSUMABLE", consumableId: "item_remover", targetUnitId: unit.uid, targetItemId: FIRST_COMPLETED },
      prng,
      gameData
    );
    expect(res).toEqual({ ok: false, error: "ITEM_NOT_EQUIPPED" });
  });

  it("NOT_TIER_2_ITEM when radiant_upgrade targets a component", () => {
    const { state, unit } = setup(["radiant_enhancer"], ["iron_sword"]);
    const prng = mulberry32(1);
    const res = applyCommand(
      state,
      0,
      { type: "USE_CONSUMABLE", consumableId: "radiant_enhancer", targetUnitId: unit.uid, targetItemId: "iron_sword" },
      prng,
      gameData
    );
    expect(res).toEqual({ ok: false, error: "NOT_TIER_2_ITEM" });
  });

  it("NOT_TIER_2_ITEM when radiant_upgrade targets an already-radiant item", () => {
    const radiantId = "radiant_" + FIRST_COMPLETED;
    const { state, unit } = setup(["radiant_enhancer"], [radiantId]);
    const prng = mulberry32(1);
    const res = applyCommand(
      state,
      0,
      { type: "USE_CONSUMABLE", consumableId: "radiant_enhancer", targetUnitId: unit.uid, targetItemId: radiantId },
      prng,
      gameData
    );
    expect(res).toEqual({ ok: false, error: "NOT_TIER_2_ITEM" });
  });

  it("NO_ALTERNATIVE_ITEM when no other item shares the target's tier", () => {
    // Stub a data set with a single completed item so reforge has no alternative.
    const loneId = FIRST_COMPLETED;
    const stub = {
      ...gameData,
      items: gameData.items.filter(
        (i) =>
          i.id === loneId ||
          i.id === "reforger" ||
          itemKind(i) === "component" ||
          itemKind(i) === "consumable"
      ),
    };
    // Remove components so only the lone tier-2 item remains at its tier.
    stub.items = stub.items.filter((i) => itemKind(i) !== "component");
    const { state, unit } = setup(["reforger"], [loneId]);
    const prng = mulberry32(1);
    const res = applyCommand(
      state,
      0,
      { type: "USE_CONSUMABLE", consumableId: "reforger", targetUnitId: unit.uid, targetItemId: loneId },
      prng,
      stub
    );
    expect(res).toEqual({ ok: false, error: "NO_ALTERNATIVE_ITEM" });
  });
});

describe("USE_CONSUMABLE — reforge determinism", () => {
  it("same seed + same reforge call picks the identical resulting item id", () => {
    const run = () => {
      const { state, unit } = setup(["reforger"], [FIRST_COMPLETED]);
      const prng = mulberry32(42);
      applyCommand(
        state,
        0,
        { type: "USE_CONSUMABLE", consumableId: "reforger", targetUnitId: unit.uid, targetItemId: FIRST_COMPLETED },
        prng,
        gameData
      );
      return unit.items[0]!;
    };
    expect(run()).toBe(run());
  });
});
