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

  it("BUY rejects when bench is full and purchase does not complete a merge", () => {
    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    const player = state.players[0]!;
    player.gold = 100;
    player.level = 1;
    // Clear the default starting unit, then fill bench to max with 9 distinct
    // units so no merge is possible.
    player.bench = [];
    for (let i = 0; i < 9; i++) {
      player.bench.push(makeUnit(9000 + i, gameData.units[i]!.id));
    }
    const defId = gameData.units[10]!.id;
    player.shop[0] = { defId, tier: gameData.units[10]!.tier };
    const result = applyCommand(state, 0, { type: "BUY", shopSlotIndex: 0 }, prng, gameData);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("BENCH_FULL");
    expect(player.bench.length).toBe(9);
  });

  it("BUY with full bench succeeds when it immediately completes a merge", () => {
    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    const player = state.players[0]!;
    player.gold = 100;
    player.level = 1;
    const defId = gameData.units[0]!.id;
    // Clear the default starting unit, then build a full bench:
    // 2 copies of defId + 7 distinct fillers.
    player.bench = [];
    player.bench.push(makeUnit(9000, defId));
    player.bench.push(makeUnit(9001, defId));
    for (let i = 0; i < 7; i++) {
      player.bench.push(makeUnit(9100 + i, gameData.units[i + 1]!.id));
    }
    expect(player.bench.length).toBe(9);
    player.shop[0] = { defId, tier: 1 };
    const result = applyCommand(state, 0, { type: "BUY", shopSlotIndex: 0 }, prng, gameData);
    expect(result.ok).toBe(true);
    // Net bench growth <= 0: 3 copies merged into one 2-star
    expect(player.bench.length).toBeLessThanOrEqual(9);
    const twoStar = player.bench.find((u) => u.defId === defId && u.star === 2);
    expect(twoStar).toBeDefined();
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

  it("rejects every command outside PLANNING with PHASE_INVALID", () => {
    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    const player = state.players[0]!;
    player.gold = 100;
    player.bench = [makeUnit(5001, gameData.units[0]!.id)];
    player.items = ["iron_sword"];
    const slot = player.shop.findIndex((s) => s !== null);
    const commands = [
      { type: "BUY", shopSlotIndex: slot },
      { type: "SELL", unitUid: 5001 },
      { type: "REROLL" },
      { type: "BUY_XP" },
      { type: "MOVE", unitUid: 5001, toBench: false, toIndex: 0 },
      { type: "EQUIP", unitUid: 5001, itemId: "iron_sword" },
    ] as const;
    for (const phase of ["COMBAT", "RESOLUTION"] as const) {
      state.phase = phase;
      for (const cmd of commands) {
        const result = applyCommand(state, 0, cmd, prng, gameData);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toBe("PHASE_INVALID");
      }
    }
    // Sanity: same commands are accepted again in PLANNING
    state.phase = "PLANNING";
    expect(applyCommand(state, 0, { type: "BUY_XP" }, prng, gameData).ok).toBe(true);
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
