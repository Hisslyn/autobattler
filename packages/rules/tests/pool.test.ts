import { describe, it, expect } from "vitest";
import { gameData } from "@autobattler/data";
import { buildInitialPool, returnToPool, drawFromPool } from "../src/pool.js";
import { createMatch, advancePhase, isMatchOver } from "../src/match.js";
import { applyCommand, tryAutoMerge } from "../src/commands.js";
import { applyAiCommands } from "../src/ai.js";
import { mulberry32 } from "@autobattler/sim/src/prng.js";

function totalInPool(pool: Map<string, number>): number {
  let t = 0;
  for (const v of pool.values()) t += v;
  return t;
}

// Shop slots ARE drawn from the pool at roll time.
// Conservation invariant: pool + shop slots + bench/board copies = constant.
function totalInMatch(state: ReturnType<typeof createMatch>): number {
  let t = totalInPool(state.pool);
  for (const p of state.players) {
    for (const u of [...p.bench, ...p.board.filter((u) => u != null)]) {
      t += u.star === 1 ? 1 : u.star === 2 ? 3 : 9;
    }
    for (const slot of p.shop) {
      if (slot) t += 1;
    }
  }
  return t;
}

function initialTotal(): number {
  let total = 0;
  for (const unit of gameData.units) {
    total += gameData.economy.poolCounts[String(unit.tier)] ?? 0;
  }
  return total;
}

describe("pool conservation", () => {
  it("initial total matches data counts", () => {
    const pool = buildInitialPool(gameData);
    expect(totalInPool(pool)).toBe(initialTotal());
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

  it("initial shop rolls draw from the pool", () => {
    const state = createMatch(1, gameData);
    const shopCount = state.players.reduce(
      (n, p) => n + p.shop.filter((s) => s !== null).length,
      0
    );
    expect(shopCount).toBeGreaterThan(0);
    expect(totalInPool(state.pool)).toBe(initialTotal() - shopCount);
    expect(totalInMatch(state)).toBe(initialTotal());
  });

  it("buy/sell preserves total unit count across pool + player inventories", () => {
    const state = createMatch(1, gameData);
    const before = totalInMatch(state);

    const prng = mulberry32(42);
    const player = state.players[0]!;
    const slotIdx = player.shop.findIndex((s) => s !== null);
    expect(slotIdx).toBeGreaterThanOrEqual(0);
    player.gold = 100;
    const buyRes = applyCommand(state, 0, { type: "BUY", shopSlotIndex: slotIdx }, prng, gameData);
    expect(buyRes.ok).toBe(true);
    expect(totalInMatch(state)).toBe(before);

    const unit = player.bench[player.bench.length - 1]!;
    const sellRes = applyCommand(state, 0, { type: "SELL", unitUid: unit.uid }, prng, gameData);
    expect(sellRes.ok).toBe(true);
    expect(totalInMatch(state)).toBe(before);
  });

  it("REROLL preserves the total (returns shop, redraws)", () => {
    const state = createMatch(1, gameData);
    const before = totalInMatch(state);
    const prng = mulberry32(7);
    const player = state.players[0]!;
    player.gold = 100;
    for (let i = 0; i < 10; i++) {
      const res = applyCommand(state, 0, { type: "REROLL" }, prng, gameData);
      expect(res.ok).toBe(true);
      expect(totalInMatch(state)).toBe(before);
    }
  });

  it("per-round shop refresh preserves the total", () => {
    const state = createMatch(3, gameData);
    const before = totalInMatch(state);
    // PLANNING → RESOLUTION (combat), then RESOLUTION → PLANNING (shop refresh)
    advancePhase(state, gameData);
    expect(totalInMatch(state)).toBe(before);
    advancePhase(state, gameData);
    expect(totalInMatch(state)).toBe(before);
  });

  it("elimination returns bench, board, and undrafted shop to the pool", () => {
    const state = createMatch(5, gameData);
    // Field a board unit for everyone (drawn from pool to keep the invariant)
    const defId = "shadowblade";
    for (const p of state.players) {
      expect(drawFromPool(state.pool, defId)).toBe(true);
      const def = gameData.units.find((d) => d.id === defId)!;
      p.level = 3;
      p.board[p.id] = {
        uid: state.nextUid++,
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
    const before = totalInMatch(state);
    // Force everyone but player 0 to be near death
    for (const p of state.players) {
      if (p.id !== 0) p.hp = 1;
    }
    let safeguard = 0;
    while (!isMatchOver(state) && safeguard < 200) {
      advancePhase(state, gameData);
      expect(totalInMatch(state)).toBe(before);
      safeguard++;
    }
    const eliminated = state.players.filter((p) => !p.alive);
    expect(eliminated.length).toBeGreaterThan(0);
    for (const p of eliminated) {
      expect(p.bench.length).toBe(0);
      expect(p.board.every((u) => u === null)).toBe(true);
      expect(p.shop.every((s) => s === null)).toBe(true);
    }
  });

  it("invariant holds across a full AI-driven match", () => {
    const seed = 1234;
    const prng = mulberry32(seed);
    const state = createMatch(seed, gameData);
    const before = totalInMatch(state);

    let safeguard = 0;
    while (!isMatchOver(state) && safeguard < 10000) {
      if (state.phase === "PLANNING") {
        for (const player of state.players) {
          if (!player.alive) continue;
          applyAiCommands(state, player.id, prng, gameData);
          expect(totalInMatch(state)).toBe(before);
        }
      }
      advancePhase(state, gameData);
      expect(totalInMatch(state)).toBe(before);
      safeguard++;
    }
    expect(isMatchOver(state)).toBe(true);
  });
});

describe("merge cascade", () => {
  it("3x 1-star -> 2-star on bench", () => {
    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    const defId = gameData.units[0]!.id;
    const player = state.players[0]!;
    player.gold = 1000;

    // Force shop to have 3 copies of same unit (treated as already drawn)
    player.shop = [
      { defId, tier: 1 },
      { defId, tier: 1 },
      { defId, tier: 1 },
      null,
      null,
    ];

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
        items: [] as string[],
      };
    };

    player.bench = [makeUnit(1, 2), makeUnit(2, 2)];
    player.board[0] = makeUnit(3, 2);

    player.shop = [
      { defId, tier: 1 },
      { defId, tier: 1 },
      { defId, tier: 1 },
      null,
      null,
    ];

    applyCommand(state, 0, { type: "BUY", shopSlotIndex: 0 }, prng, gameData);
    applyCommand(state, 0, { type: "BUY", shopSlotIndex: 1 }, prng, gameData);
    applyCommand(state, 0, { type: "BUY", shopSlotIndex: 2 }, prng, gameData);

    const allUnits = [...player.bench, ...player.board.filter((u) => u != null)];
    const threeStars = allUnits.filter((u) => u.defId === defId && u.star === 3);
    expect(threeStars.length).toBe(1);
  });

  it("merge preserves items: 3 sources with 2 items each -> merged has 3, inventory has 3", () => {
    const state = createMatch(1, gameData);
    const defId = gameData.units[0]!.id;
    const player = state.players[0]!;
    player.items = [];

    const makeUnit = (uid: number, items: string[]) => {
      const def = gameData.units.find((d) => d.id === defId)!;
      return {
        uid,
        defId,
        tier: def.tier,
        star: 1 as const,
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
        items,
      };
    };

    // 3 units with 2 items each -> 6 items total
    player.bench = [
      makeUnit(1, ["iron_sword", "chain_vest"]),
      makeUnit(2, ["mana_crystal", "iron_sword"]),
    ];
    player.board[0] = makeUnit(3, ["chain_vest", "mana_crystal"]);

    tryAutoMerge(state, 0, defId, gameData);

    const all = [...player.bench, ...player.board.filter((u) => u != null)];
    const merged = all.find((u) => u.defId === defId && u.star === 2);
    expect(merged).toBeDefined();
    expect(merged!.items.length).toBe(3);
    expect(player.items.length).toBe(3);
    expect([...merged!.items, ...player.items].sort()).toEqual(
      ["chain_vest", "chain_vest", "iron_sword", "iron_sword", "mana_crystal", "mana_crystal"].sort()
    );
  });
});
