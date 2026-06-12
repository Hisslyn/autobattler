import { describe, it, expect } from "vitest";
import { gameData } from "@autobattler/data";
import { createMatch } from "../src/match.js";
import { applyCommand } from "../src/commands.js";
import { mulberry32 } from "@autobattler/sim/src/prng.js";
import type { UnitInstance } from "@autobattler/sim/src/types.js";

function makeUnit(uid: number, defId: string): UnitInstance {
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
    items: [],
  };
}

describe("command validation", () => {
  it("BUY rejects insufficient gold", () => {
    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    const player = state.players[0]!;
    player.gold = 0;
    const slot = player.shop.findIndex((s) => s !== null);
    if (slot < 0) return; // no shop slot available, skip
    const result = applyCommand(state, 0, { type: "BUY", shopSlotIndex: slot }, prng, gameData);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("INSUFFICIENT_GOLD");
  });

  it("BUY rejects empty slot", () => {
    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    state.players[0]!.gold = 100;
    state.players[0]!.shop[4] = null;
    const result = applyCommand(state, 0, { type: "BUY", shopSlotIndex: 4 }, prng, gameData);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("EMPTY_SLOT");
  });

  it("BUY rejects when bench is full and board is at level cap", () => {
    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    const player = state.players[0]!;
    player.gold = 100;
    player.level = 1;
    const defId = gameData.units[0]!.id;
    // Fill bench to max
    for (let i = 0; i < 9; i++) {
      player.bench.push(makeUnit(9000 + i, defId));
    }
    // Fill board to level cap (1 unit at level 1)
    player.board[0] = makeUnit(9009, defId);
    player.shop[0] = { defId, tier: 1 };
    state.pool.set(defId, 10);
    const result = applyCommand(state, 0, { type: "BUY", shopSlotIndex: 0 }, prng, gameData);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("BENCH_FULL");
  });

  it("MOVE rejects board cap at player level", () => {
    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    const player = state.players[0]!;
    player.level = 1;
    const defId = gameData.units[0]!.id;
    const u1 = makeUnit(8001, defId);
    const u2 = makeUnit(8002, defId);
    // Board already at cap (1 unit for level 1)
    player.board[0] = u1;
    player.bench = [u2];
    const result = applyCommand(
      state, 0,
      { type: "MOVE", unitUid: u2.uid, toBench: false, toIndex: 1 },
      prng, gameData
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("BOARD_FULL");
  });

  it("SELL returns gold and unit goes away", () => {
    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    const player = state.players[0]!;
    const defId = gameData.units[0]!.id;
    const unit = makeUnit(7001, defId);
    player.bench = [unit];
    const goldBefore = player.gold;
    const result = applyCommand(state, 0, { type: "SELL", unitUid: 7001 }, prng, gameData);
    expect(result.ok).toBe(true);
    expect(player.bench.length).toBe(0);
    expect(player.gold).toBeGreaterThan(goldBefore);
  });

  it("SELL rejects non-existent unit", () => {
    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    const result = applyCommand(state, 0, { type: "SELL", unitUid: 999999 }, prng, gameData);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("UNIT_NOT_FOUND");
  });

  it("REROLL rejects insufficient gold", () => {
    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    state.players[0]!.gold = 0;
    const result = applyCommand(state, 0, { type: "REROLL" }, prng, gameData);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("INSUFFICIENT_GOLD");
  });

  it("BUY_XP rejects insufficient gold", () => {
    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    state.players[0]!.gold = 0;
    const result = applyCommand(state, 0, { type: "BUY_XP" }, prng, gameData);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("INSUFFICIENT_GOLD");
  });

  it("EQUIP rejects missing item", () => {
    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    const player = state.players[0]!;
    const defId = gameData.units[0]!.id;
    player.bench = [makeUnit(6001, defId)];
    player.items = []; // no items
    const result = applyCommand(
      state, 0,
      { type: "EQUIP", unitUid: 6001, itemId: "iron_sword" },
      prng, gameData
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("ITEM_NOT_FOUND");
  });
});
