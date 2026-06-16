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
// A second, distinct completed item (for multi-item equip cases).
const SECOND_COMPLETED = gameData.items.find(
  (i) => itemKind(i) === "completed" && i.recipe && i.id !== FIRST_COMPLETED
)!.id;
const THIRD_COMPLETED = gameData.items.find(
  (i) => itemKind(i) === "completed" && i.recipe && i.id !== FIRST_COMPLETED && i.id !== SECOND_COMPLETED
)!.id;

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

describe("USE_CONSUMABLE — item_remover (all equipped items)", () => {
  it("moves a single equipped item back to inventory and consumes the remover", () => {
    const { state, player, unit } = setup(["item_remover"], [FIRST_COMPLETED]);
    const prng = mulberry32(1);
    const cmd: Command = {
      type: "USE_CONSUMABLE",
      consumableId: "item_remover",
      targetUnitId: unit.uid,
    };
    expect(applyCommand(state, 0, cmd, prng, gameData).ok).toBe(true);
    expect(unit.items).not.toContain(FIRST_COMPLETED);
    expect(unit.items.length).toBe(0);
    expect(player.items).toContain(FIRST_COMPLETED);
    expect(player.items).not.toContain("item_remover");
  });

  it("moves ALL equipped items (2-3) back to inventory and consumes the remover once", () => {
    const { state, player, unit } = setup(
      ["item_remover"],
      [FIRST_COMPLETED, SECOND_COMPLETED, THIRD_COMPLETED]
    );
    const prng = mulberry32(1);
    const cmd: Command = {
      type: "USE_CONSUMABLE",
      consumableId: "item_remover",
      targetUnitId: unit.uid,
    };
    expect(applyCommand(state, 0, cmd, prng, gameData).ok).toBe(true);
    expect(unit.items).toEqual([]);
    expect(player.items).toContain(FIRST_COMPLETED);
    expect(player.items).toContain(SECOND_COMPLETED);
    expect(player.items).toContain(THIRD_COMPLETED);
    expect(player.items.filter((i) => i === "item_remover")).toHaveLength(0);
  });

  it("zero equipped items is a no-op success: not consumed, no state change", () => {
    const { state, player, unit } = setup(["item_remover"], []);
    const prng = mulberry32(1);
    const cmd: Command = {
      type: "USE_CONSUMABLE",
      consumableId: "item_remover",
      targetUnitId: unit.uid,
    };
    const res = applyCommand(state, 0, cmd, prng, gameData);
    expect(res).toEqual({ ok: true });
    expect(unit.items).toEqual([]);
    expect(player.items).toContain("item_remover");
    expect(player.items).toHaveLength(1);
  });
});

describe("USE_CONSUMABLE — reforge (all equipped items, independently)", () => {
  it("reforges a single equipped item to a different same-tier item and consumes the reforger", () => {
    const { state, player, unit } = setup(["reforger"], [FIRST_COMPLETED]);
    const prng = mulberry32(1);
    const cmd: Command = {
      type: "USE_CONSUMABLE",
      consumableId: "reforger",
      targetUnitId: unit.uid,
    };
    expect(applyCommand(state, 0, cmd, prng, gameData).ok).toBe(true);
    const result = unit.items[0]!;
    expect(result).not.toBe(FIRST_COMPLETED);
    expect(itemTier(result, gameData.items, gameData.economy)).toBe(
      itemTier(FIRST_COMPLETED, gameData.items, gameData.economy)
    );
    expect(player.items).not.toContain("reforger");
  });

  it("reforges EACH equipped item independently to a different same-tier item, consumes the reforger once", () => {
    const { state, player, unit } = setup(
      ["reforger"],
      [FIRST_COMPLETED, SECOND_COMPLETED, THIRD_COMPLETED]
    );
    const prng = mulberry32(7);
    const cmd: Command = {
      type: "USE_CONSUMABLE",
      consumableId: "reforger",
      targetUnitId: unit.uid,
    };
    const originals = [...unit.items];
    expect(applyCommand(state, 0, cmd, prng, gameData).ok).toBe(true);
    expect(unit.items).toHaveLength(3);
    for (let i = 0; i < originals.length; i++) {
      expect(unit.items[i]).not.toBe(originals[i]);
      expect(itemTier(unit.items[i]!, gameData.items, gameData.economy)).toBe(
        itemTier(originals[i]!, gameData.items, gameData.economy)
      );
    }
    expect(player.items.filter((i) => i === "reforger")).toHaveLength(0);
  });

  it("zero equipped items is a no-op success: not consumed, no state change", () => {
    const { state, player, unit } = setup(["reforger"], []);
    const prng = mulberry32(1);
    const cmd: Command = {
      type: "USE_CONSUMABLE",
      consumableId: "reforger",
      targetUnitId: unit.uid,
    };
    const res = applyCommand(state, 0, cmd, prng, gameData);
    expect(res).toEqual({ ok: true });
    expect(unit.items).toEqual([]);
    expect(player.items).toContain("reforger");
    expect(player.items).toHaveLength(1);
  });

  it("determinism: same seed + identical multi-item reforge yields identical results across two runs", () => {
    const run = () => {
      const { state, unit } = setup(
        ["reforger"],
        [FIRST_COMPLETED, SECOND_COMPLETED, THIRD_COMPLETED]
      );
      const prng = mulberry32(42);
      applyCommand(
        state,
        0,
        { type: "USE_CONSUMABLE", consumableId: "reforger", targetUnitId: unit.uid },
        prng,
        gameData
      );
      return [...unit.items];
    };
    expect(run()).toEqual(run());
  });
});

describe("USE_CONSUMABLE — radiant_enhancer (single targeted tier-2 item)", () => {
  it("replaces a tier-2 item with radiant_<id> (stats base*1.75 rounded) and consumes the enhancer", () => {
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

  it("upgrades the targeted tier-2 item while leaving the unit's other items untouched", () => {
    const { state, unit } = setup(["radiant_enhancer"], [FIRST_COMPLETED, SECOND_COMPLETED]);
    const prng = mulberry32(1);
    const cmd: Command = {
      type: "USE_CONSUMABLE",
      consumableId: "radiant_enhancer",
      targetUnitId: unit.uid,
      targetItemId: FIRST_COMPLETED,
    };
    expect(applyCommand(state, 0, cmd, prng, gameData).ok).toBe(true);
    expect(unit.items).toContain("radiant_" + FIRST_COMPLETED);
    expect(unit.items).toContain(SECOND_COMPLETED);
  });
});

describe("USE_CONSUMABLE — typed errors", () => {
  it("CONSUMABLE_NOT_FOUND when the consumable isn't in inventory", () => {
    const { state, unit } = setup([], [FIRST_COMPLETED]);
    const prng = mulberry32(1);
    const res = applyCommand(
      state,
      0,
      { type: "USE_CONSUMABLE", consumableId: "item_remover", targetUnitId: unit.uid },
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
      { type: "USE_CONSUMABLE", consumableId: "iron_sword", targetUnitId: unit.uid },
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
      { type: "USE_CONSUMABLE", consumableId: "item_remover", targetUnitId: 999999 },
      prng,
      gameData
    );
    expect(res).toEqual({ ok: false, error: "UNIT_NOT_FOUND" });
  });

  it("NO_TIER_2_ITEMS_EQUIPPED when radiant_upgrade targets a unit with zero items", () => {
    const { state, unit } = setup(["radiant_enhancer"], []);
    const prng = mulberry32(1);
    const res = applyCommand(
      state,
      0,
      {
        type: "USE_CONSUMABLE",
        consumableId: "radiant_enhancer",
        targetUnitId: unit.uid,
        targetItemId: FIRST_COMPLETED,
      },
      prng,
      gameData
    );
    expect(res).toEqual({ ok: false, error: "NO_TIER_2_ITEMS_EQUIPPED" });
  });

  it("NO_TIER_2_ITEMS_EQUIPPED when radiant_upgrade targets a unit holding only components", () => {
    const { state, unit } = setup(["radiant_enhancer"], ["iron_sword"]);
    const prng = mulberry32(1);
    const res = applyCommand(
      state,
      0,
      {
        type: "USE_CONSUMABLE",
        consumableId: "radiant_enhancer",
        targetUnitId: unit.uid,
        targetItemId: "iron_sword",
      },
      prng,
      gameData
    );
    expect(res).toEqual({ ok: false, error: "NO_TIER_2_ITEMS_EQUIPPED" });
  });

  it("NOT_TIER_2_ITEM when the unit HAS a tier-2 item but targetItemId names a component", () => {
    const { state, unit } = setup(["radiant_enhancer"], [FIRST_COMPLETED, "iron_sword"]);
    const prng = mulberry32(1);
    const res = applyCommand(
      state,
      0,
      {
        type: "USE_CONSUMABLE",
        consumableId: "radiant_enhancer",
        targetUnitId: unit.uid,
        targetItemId: "iron_sword",
      },
      prng,
      gameData
    );
    expect(res).toEqual({ ok: false, error: "NOT_TIER_2_ITEM" });
  });

  it("NOT_TIER_2_ITEM when radiant_upgrade targets an already-radiant item (unit also holds the tier-2 base elsewhere)", () => {
    const radiantId = "radiant_" + FIRST_COMPLETED;
    const { state, unit } = setup(["radiant_enhancer"], [SECOND_COMPLETED, radiantId]);
    const prng = mulberry32(1);
    const res = applyCommand(
      state,
      0,
      {
        type: "USE_CONSUMABLE",
        consumableId: "radiant_enhancer",
        targetUnitId: unit.uid,
        targetItemId: radiantId,
      },
      prng,
      gameData
    );
    expect(res).toEqual({ ok: false, error: "NOT_TIER_2_ITEM" });
  });

  it("ITEM_NOT_EQUIPPED when radiant_upgrade's targetItemId isn't on the unit (unit has a different tier-2 item)", () => {
    const { state, unit } = setup(["radiant_enhancer"], [SECOND_COMPLETED]);
    const prng = mulberry32(1);
    const res = applyCommand(
      state,
      0,
      {
        type: "USE_CONSUMABLE",
        consumableId: "radiant_enhancer",
        targetUnitId: unit.uid,
        targetItemId: FIRST_COMPLETED,
      },
      prng,
      gameData
    );
    expect(res).toEqual({ ok: false, error: "ITEM_NOT_EQUIPPED" });
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
      { type: "USE_CONSUMABLE", consumableId: "reforger", targetUnitId: unit.uid },
      prng,
      stub
    );
    expect(res).toEqual({ ok: false, error: "NO_ALTERNATIVE_ITEM" });
  });
});

describe("USE_CONSUMABLE — reforge determinism (single item, regression)", () => {
  it("same seed + same reforge call picks the identical resulting item id", () => {
    const run = () => {
      const { state, unit } = setup(["reforger"], [FIRST_COMPLETED]);
      const prng = mulberry32(42);
      applyCommand(
        state,
        0,
        { type: "USE_CONSUMABLE", consumableId: "reforger", targetUnitId: unit.uid },
        prng,
        gameData
      );
      return unit.items[0]!;
    };
    expect(run()).toBe(run());
  });
});
