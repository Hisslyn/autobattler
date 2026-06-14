import { describe, it, expect } from "vitest";
import { gameData } from "@autobattler/data";
import type { LootRarity } from "@autobattler/data";
import { createMatch, advancePhase } from "../src/match.js";
import { generateLoot, applyLootOrb } from "../src/loot.js";
import { buildMobBoard, pveStageForRound, isPveRound } from "../src/rounds.js";
import { mulberry32 } from "@autobattler/sim/src/prng.js";
import type { MatchState } from "../src/state.js";
import type { UnitInstance } from "@autobattler/sim/src/types.js";

function makeUnit(uid: number, defId: string): UnitInstance {
  const def = gameData.units.find((d) => d.id === defId)!;
  return {
    uid, defId, tier: def.tier, star: 1, team: 0, pos: { q: 0, r: 0 },
    hp: def.hp, maxHp: def.hp, ad: def.ad, as: def.as, armor: def.armor,
    mr: def.mr, range: def.range, mana: def.manaStart, maxMana: def.mana,
    abilityDamage: def.abilityDamage, attackCooldown: 0, statusEffects: [], items: [],
  };
}

function fieldBoards(state: MatchState): void {
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i]!;
    p.level = 3;
    p.board[0] = makeUnit(8000 + i * 5, "warrior");
    p.board[7] = makeUnit(8001 + i * 5, "archer");
  }
}

describe("loot generation", () => {
  it("is deterministic: same seed + round → identical orbs and contents", () => {
    for (const round of [1, 2, 4]) {
      const a = generateLoot(round, mulberry32(0xabc), gameData);
      const b = generateLoot(round, mulberry32(0xabc), gameData);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(a.length).toBeGreaterThan(0);
    }
  });

  it("orb count and rarities match the round's drop config", () => {
    for (const round of [1, 2, 4]) {
      const config = gameData.loot.roundDrops[String(round)]!;
      const expectedCount = config.reduce((s, d) => s + d.count, 0);
      const orbs = generateLoot(round, mulberry32(round), gameData);
      expect(orbs.length).toBe(expectedCount);
      const expectedRarities = new Set<LootRarity>(config.map((d) => d.rarity));
      for (const orb of orbs) expect(expectedRarities.has(orb.rarity)).toBe(true);
    }
  });

  it("every resolved reward references a real item id or positive gold", () => {
    const ids = new Set(gameData.items.map((i) => i.id));
    const prng = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      for (const round of [1, 2, 4]) {
        for (const orb of generateLoot(round, prng, gameData)) {
          if (orb.reward.kind === "gold") expect(orb.reward.amount).toBeGreaterThan(0);
          else expect(ids.has(orb.reward.id)).toBe(true);
        }
      }
    }
  });

  it("rarity weighting is sane: the highest-weight entry dominates over many samples", () => {
    const table = gameData.loot.tables.common;
    const heaviest = table.reduce((a, b) => (b.weight > a.weight ? b : a));
    const counts = new Map<string, number>();
    const prng = mulberry32(99);
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const orb = generateLoot(1, prng, gameData)[0]!; // round 1 → 2 common orbs, take first
      const key = orb.reward.kind === "gold" ? `gold:${orb.reward.amount}` : orb.reward.id;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const heaviestKey = heaviest.kind === "gold" ? `gold:${heaviest.amount}` : heaviest.id;
    const heaviestCount = counts.get(heaviestKey) ?? 0;
    // The weight-40 entry must clearly out-appear any single weight-3 entry.
    const components = table.filter((e) => e.kind === "component");
    for (const c of components) {
      const cKey = (c as { id: string }).id;
      expect(heaviestCount).toBeGreaterThan(counts.get(cKey) ?? 0);
    }
  });

  it("applyLootOrb folds gold into gold and item ids into the inventory", () => {
    const state = createMatch(1, gameData);
    const player = state.players[0]!;
    player.gold = 0;
    applyLootOrb(player, { rarity: "common", reward: { kind: "gold", amount: 4 } });
    applyLootOrb(player, { rarity: "rare", reward: { kind: "item", id: "iron_sword__sorcerer_rod" } });
    applyLootOrb(player, { rarity: "common", reward: { kind: "component", id: "tear_flask" } });
    expect(player.gold).toBe(4);
    expect(player.items).toEqual(["iron_sword__sorcerer_rod", "tear_flask"]);
  });
});

describe("PvE round", () => {
  it("mobs are not unit-pool defs and carry no traits", () => {
    const unitIds = new Set(gameData.units.map((u) => u.id));
    for (const mob of gameData.mobs.mobs) {
      expect(unitIds.has(mob.id)).toBe(false);
      expect(mob.traits).toEqual([]);
    }
  });

  it("every PvE round has a stage whose placements reference real mobs", () => {
    const mobIds = new Set(gameData.mobs.mobs.map((m) => m.id));
    for (const round of gameData.gameplay.pveRounds) {
      const stage = pveStageForRound(round, gameData);
      expect(stage, `round ${round} has a stage`).not.toBeNull();
      expect(stage!.units.length).toBeGreaterThan(0);
      for (const u of stage!.units) expect(mobIds.has(u.mobId)).toBe(true);
    }
  });

  it("builds the mob board on the enemy side without touching the unit pool", () => {
    const state = createMatch(1, gameData);
    const poolBefore = [...state.pool.values()].reduce((s, v) => s + v, 0);
    const stage = pveStageForRound(1, gameData)!;
    const board = buildMobBoard(state, stage, gameData);
    expect(board.units.length).toBe(stage.units.length);
    for (const u of board.units) expect(u.team).toBe(1);
    const poolAfter = [...state.pool.values()].reduce((s, v) => s + v, 0);
    expect(poolAfter).toBe(poolBefore);
  });

  it("runs mob combat for every alive player, awards base gold + loot, and deals no HP damage", () => {
    const state = createMatch(11, gameData);
    fieldBoards(state);
    expect(isPveRound(state.round, gameData)).toBe(true);
    const hpBefore = state.players.map((p) => p.hp);

    advancePhase(state, gameData); // PLANNING → RESOLUTION (runs PvE)

    expect(state.lastPairings).toEqual([]); // PvE carries no PvP pairings
    for (let i = 0; i < state.players.length; i++) {
      const p = state.players[i]!;
      expect(p.hp).toBe(hpBefore[i]); // no HP damage from PvE
      const result = state.lastCombatResults.get(p.id);
      expect(result, `player ${p.id} has a combat result`).toBeDefined();
      expect(result!.events.length).toBeGreaterThan(0);
      expect(p.gold).toBeGreaterThanOrEqual(gameData.economy.pveBaseGold);
    }
  });

  it("is fully deterministic: same seed reproduces gold, inventory, and combat", () => {
    const run = (): MatchState => {
      const s = createMatch(2024, gameData);
      fieldBoards(s);
      advancePhase(s, gameData);
      return s;
    };
    const a = run();
    const b = run();
    for (let i = 0; i < a.players.length; i++) {
      expect(b.players[i]!.gold).toBe(a.players[i]!.gold);
      expect(b.players[i]!.items).toEqual(a.players[i]!.items);
      expect(JSON.stringify(b.lastCombatResults.get(i)))
        .toBe(JSON.stringify(a.lastCombatResults.get(i)));
    }
  });
});
