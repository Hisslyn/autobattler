import { describe, it, expect, beforeEach } from "vitest";
import { gameData } from "@autobattler/data";
import { buildInitialPool, returnToPool, drawFromPool } from "../src/pool.js";
import { createMatch } from "../src/match.js";
import { applyCommand } from "../src/commands.js";
import { mulberry32 } from "@autobattler/sim/src/prng.js";

function totalInPool(pool: Map<string, number>): number {
  let t = 0;
  for (const v of pool.values()) t += v;
  return t;
}

// Shop slots are NOT deducted from pool — they're just roll previews.
// Conservation invariant: pool + bench + board copies = constant.
function totalInMatch(state: ReturnType<typeof createMatch>): number {
  let t = totalInPool(state.pool);
  for (const p of state.players) {
    for (const u of [...p.bench, ...p.board.filter((u) => u != null)]) {
      t += u.star === 1 ? 1 : u.star === 2 ? 3 : 9;
    }
  }
  return t;
}

describe("pool conservation", () => {
  it("initial total matches data counts", () => {
    const pool = buildInitialPool(gameData);
    let total = 0;
    for (const unit of gameData.units) {
      total += gameData.economy.poolCounts[String(unit.tier)] ?? 0;
    }
    expect(totalInPool(pool)).toBe(total);
  });

  it("draw+return is conservative", () => {
    const pool = buildInitialPool(gameData);
    const before = totalInPool(pool);
    const defId = gameData.units[0]!.id;
    drawFromPool(pool, defId);
    expect(totalInPool(pool)).toBe(before - 1);
    returnToPool(pool, defId);
    expect(totalInPool(pool)).toBe(before);
  });

  it("buy/sell preserves total unit count across pool + player inventories", () => {
    const state = createMatch(1, gameData);
    const before = totalInMatch(state);

    // Try to buy from slot 0 for player 0
    const prng = mulberry32(42);
    const slot = state.players[0]!.shop[0];
    if (slot) {
      state.players[0]!.gold = 100;
      applyCommand(state, 0, { type: "BUY", shopSlotIndex: 0 }, prng, gameData);
    }

    expect(totalInMatch(state)).toBe(before);
  });

  it("sell returns copies to pool based on star level", () => {
    const pool = buildInitialPool(gameData);
    const before = totalInPool(pool);
    // draw 3 and return 3 (simulating a 2-star merge returning 3 copies)
    const defId = gameData.units[0]!.id;
    drawFromPool(pool, defId);
    drawFromPool(pool, defId);
    drawFromPool(pool, defId);
    expect(totalInPool(pool)).toBe(before - 3);
    // Selling a 2-star returns 3 copies
    for (let i = 0; i < 3; i++) returnToPool(pool, defId);
    expect(totalInPool(pool)).toBe(before);
  });
});

describe("merge cascade", () => {
  it("3x 1-star -> 2-star on bench", () => {
    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    const defId = gameData.units[0]!.id;
    const player = state.players[0]!;
    player.gold = 1000;

    // Force shop to have 3 copies of same unit by manipulating shop
    player.shop = [
      { defId, tier: 1 },
      { defId, tier: 1 },
      { defId, tier: 1 },
      null,
      null,
    ];
    // Ensure pool has 3 copies
    state.pool.set(defId, 3);

    applyCommand(state, 0, { type: "BUY", shopSlotIndex: 0 }, prng, gameData);
    applyCommand(state, 0, { type: "BUY", shopSlotIndex: 1 }, prng, gameData);
    applyCommand(state, 0, { type: "BUY", shopSlotIndex: 2 }, prng, gameData);

    const twoStars = player.bench.filter((u) => u.defId === defId && u.star === 2);
    const oneStars = player.bench.filter((u) => u.defId === defId && u.star === 1);
    expect(twoStars.length).toBe(1);
    expect(oneStars.length).toBe(0);
  });

  it("3x 2-star -> 3-star (cascade from bench+board mix)", () => {
    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    const defId = gameData.units[0]!.id;
    const player = state.players[0]!;
    player.gold = 1000;
    player.level = 3;

    // Manually place two 2-stars on bench and board
    const makeUnit = (uid: number, star: 1 | 2 | 3) => {
      const def = gameData.units.find((d) => d.id === defId)!;
      return {
        uid,
        defId,
        tier: def.tier,
        star,
        team: 0 as const,
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
    };

    player.bench = [makeUnit(1, 2), makeUnit(2, 2)];
    player.board[0] = makeUnit(3, 2);

    // Force shop to have 3x 1-stars to trigger a 2-star merge -> cascade to 3-star
    player.shop = [
      { defId, tier: 1 },
      { defId, tier: 1 },
      { defId, tier: 1 },
      null,
      null,
    ];
    state.pool.set(defId, 3);

    applyCommand(state, 0, { type: "BUY", shopSlotIndex: 0 }, prng, gameData);
    applyCommand(state, 0, { type: "BUY", shopSlotIndex: 1 }, prng, gameData);
    applyCommand(state, 0, { type: "BUY", shopSlotIndex: 2 }, prng, gameData);

    const allUnits = [...player.bench, ...player.board.filter((u) => u != null)];
    const threeStars = allUnits.filter((u) => u.defId === defId && u.star === 3);
    expect(threeStars.length).toBe(1);
  });
});
