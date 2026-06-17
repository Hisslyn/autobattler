import { describe, it, expect } from "vitest";
import { gameData } from "@autobattler/data";
import type { LootRarity } from "@autobattler/data";
import { createMatch, advancePhase } from "../src/match.js";
import { generateLoot, applyLootOrb } from "../src/loot.js";
import { buildMobBoard, pveStageForRound, isPveRound, stageForRound, previewPveStage } from "../src/rounds.js";
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

// The PvE rounds under the stage formula (rounds 1-24 for reference):
// Stage 1 (rounds 1-3): all PvE
// Stage 2 (rounds 4-10): roundInStage 4=round7, 7=round10 are PvE
// Stage 3 (rounds 11-17): roundInStage 4=round14, 7=round17 are PvE
// Stage 4 (rounds 18-24): roundInStage 4=round21, 7=round24 are PvE
const KNOWN_PVE_ROUNDS = [1, 2, 3, 7, 10, 14, 17, 21, 24];
const KNOWN_PVP_ROUNDS = [4, 5, 6, 8, 9, 11, 12, 13, 15, 16, 18, 19, 20, 22, 23];

describe("stage formula", () => {
  it("stage 1: rounds 1-3 all map to stage 1", () => {
    expect(stageForRound(1)).toEqual({ stage: 1, roundInStage: 1 });
    expect(stageForRound(2)).toEqual({ stage: 1, roundInStage: 2 });
    expect(stageForRound(3)).toEqual({ stage: 1, roundInStage: 3 });
  });

  it("stage 2: rounds 4-10 map correctly", () => {
    expect(stageForRound(4)).toEqual({ stage: 2, roundInStage: 1 });
    expect(stageForRound(5)).toEqual({ stage: 2, roundInStage: 2 });
    expect(stageForRound(6)).toEqual({ stage: 2, roundInStage: 3 });
    expect(stageForRound(7)).toEqual({ stage: 2, roundInStage: 4 });
    expect(stageForRound(8)).toEqual({ stage: 2, roundInStage: 5 });
    expect(stageForRound(9)).toEqual({ stage: 2, roundInStage: 6 });
    expect(stageForRound(10)).toEqual({ stage: 2, roundInStage: 7 });
  });

  it("stage 3: rounds 11-17 map correctly", () => {
    expect(stageForRound(11)).toEqual({ stage: 3, roundInStage: 1 });
    expect(stageForRound(12)).toEqual({ stage: 3, roundInStage: 2 });
    expect(stageForRound(13)).toEqual({ stage: 3, roundInStage: 3 });
    expect(stageForRound(14)).toEqual({ stage: 3, roundInStage: 4 });
    expect(stageForRound(15)).toEqual({ stage: 3, roundInStage: 5 });
    expect(stageForRound(16)).toEqual({ stage: 3, roundInStage: 6 });
    expect(stageForRound(17)).toEqual({ stage: 3, roundInStage: 7 });
  });

  it("stage 4: rounds 18-24 map correctly", () => {
    expect(stageForRound(18)).toEqual({ stage: 4, roundInStage: 1 });
    expect(stageForRound(21)).toEqual({ stage: 4, roundInStage: 4 });
    expect(stageForRound(24)).toEqual({ stage: 4, roundInStage: 7 });
  });

  it("stage 5: rounds 25-31 map correctly", () => {
    expect(stageForRound(25)).toEqual({ stage: 5, roundInStage: 1 });
    expect(stageForRound(28)).toEqual({ stage: 5, roundInStage: 4 });
    expect(stageForRound(31)).toEqual({ stage: 5, roundInStage: 7 });
  });

  it("isPveRound is true for all known PvE rounds", () => {
    for (const r of KNOWN_PVE_ROUNDS) {
      expect(isPveRound(r), `round ${r} should be PvE`).toBe(true);
    }
  });

  it("isPveRound is false for all known PvP rounds", () => {
    for (const r of KNOWN_PVP_ROUNDS) {
      expect(isPveRound(r), `round ${r} should be PvP`).toBe(false);
    }
  });

  it("stage 1 has exactly 3 PvE rounds (rounds 1-3)", () => {
    let count = 0;
    for (let r = 1; r <= 3; r++) {
      if (isPveRound(r)) count++;
    }
    expect(count).toBe(3);
  });

  it("each stage 2-4 has exactly 2 PvE rounds (roundInStage 4 and 7)", () => {
    for (let stage = 2; stage <= 4; stage++) {
      // Stage starts at round 4 + (stage-2)*7
      const stageStart = 4 + (stage - 2) * 7;
      let pveCount = 0;
      for (let ris = 1; ris <= 7; ris++) {
        const round = stageStart + ris - 1;
        const isExpectedPve = ris === 4 || ris === 7;
        expect(isPveRound(round), `stage ${stage} roundInStage ${ris} (round ${round}) PvE=${isExpectedPve}`).toBe(isExpectedPve);
        if (isExpectedPve) pveCount++;
      }
      expect(pveCount).toBe(2);
    }
  });

  it("exhaustive check rounds 1-25: PvE/PvP pattern correct", () => {
    const expected: boolean[] = [
      // r1  r2  r3  r4     r5     r6     r7   r8     r9     r10
      true, true, true, false, false, false, true, false, false, true,
      // r11    r12    r13    r14  r15    r16    r17
      false, false, false, true, false, false, true,
      // r18    r19    r20    r21  r22    r23    r24  r25
      false, false, false, true, false, false, true, false,
    ];
    for (let i = 0; i < expected.length; i++) {
      const round = i + 1;
      expect(isPveRound(round), `round ${round}`).toBe(expected[i]);
    }
  });
});

describe("loot generation", () => {
  // Stage-1 PvE rounds: 1, 2, 3
  it("is deterministic: same seed + round → identical orbs and contents", () => {
    for (const round of [1, 2, 3]) {
      const a = generateLoot(round, mulberry32(0xabc), gameData);
      const b = generateLoot(round, mulberry32(0xabc), gameData);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(a.length).toBeGreaterThan(0);
    }
  });

  it("orb count and rarities match the round's drop config", () => {
    for (const round of [1, 2, 3]) {
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
      for (const round of [1, 2, 3]) {
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

  it("loot drops exist for all defined PvE rounds (stages 1-4)", () => {
    const pveRounds = [1, 2, 3, 7, 10, 14, 17, 21, 24];
    for (const round of pveRounds) {
      const drops = gameData.loot.roundDrops[String(round)];
      expect(drops, `round ${round} has loot drops`).toBeDefined();
      expect(drops!.length).toBeGreaterThan(0);
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

  it("every defined PvE stage references real mobs", () => {
    const mobIds = new Set(gameData.mobs.mobs.map((m) => m.id));
    for (const stage of gameData.mobs.stages) {
      expect(stage.units.length).toBeGreaterThan(0);
      for (const u of stage.units) {
        expect(mobIds.has(u.mobId), `mobId ${u.mobId} in stage ${stage.stage}-${stage.roundInStage}`).toBe(true);
      }
    }
  });

  it("pveStageForRound returns correct stage for all defined stage entries", () => {
    for (const stageDef of gameData.mobs.stages) {
      // Compute the absolute round for this stage+roundInStage
      let round: number;
      if (stageDef.stage === 1) {
        round = stageDef.roundInStage;
      } else {
        round = 4 + (stageDef.stage - 2) * 7 + stageDef.roundInStage - 1;
      }
      const found = pveStageForRound(round, gameData);
      expect(found, `stage ${stageDef.stage} roundInStage ${stageDef.roundInStage} → round ${round}`).not.toBeNull();
      expect(found!.name).toBe(stageDef.name);
    }
  });

  it("pveStageForRound returns null on PvP rounds", () => {
    for (const round of [4, 5, 6, 8, 9]) {
      expect(pveStageForRound(round, gameData), `round ${round} should have no stage`).toBeNull();
    }
  });

  it("builds the mob board on the enemy side without touching the unit pool", () => {
    const state = createMatch(1, gameData);
    const poolBefore = [...state.pool.values()].reduce((s, v) => s + v, 0);
    const stage = pveStageForRound(1, gameData)!;
    const board = buildMobBoard(state, stage, gameData);
    expect(board.units.length).toBe(stage.units.length);
    for (const u of board.units) expect(u.team).toBe(1);
    // Pool conservation: building a mob board never touches the pool
    const poolAfter = [...state.pool.values()].reduce((s, v) => s + v, 0);
    // The starting-unit draw at createMatch already happened; compare against the post-createMatch pool
    expect(poolAfter).toBe(poolBefore);
  });

  it("runs mob combat for every alive player, awards base gold + loot, and deals no HP damage", () => {
    const state = createMatch(11, gameData);
    fieldBoards(state);
    expect(isPveRound(state.round, gameData)).toBe(true); // round 1 is PvE
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

describe("previewPveStage", () => {
  it("returns null on a non-PvE round", () => {
    // Round 4 is the first PvP round (stage 2, roundInStage 1)
    const state = createMatch(1, gameData);
    state.round = 4;
    expect(isPveRound(4)).toBe(false);
    expect(previewPveStage(state, gameData)).toBeNull();
  });

  it("returns null on every known PvP round", () => {
    const state = createMatch(1, gameData);
    for (const round of KNOWN_PVP_ROUNDS) {
      state.round = round;
      expect(previewPveStage(state, gameData), `round ${round} should return null`).toBeNull();
    }
  });

  it("returns a BoardState matching buildMobBoard's unit composition (count, defIds, positions, stats) on a PvE round", () => {
    // Round 1 is a known PvE round with a defined stage
    const state = createMatch(1, gameData);
    expect(isPveRound(state.round)).toBe(true);

    const stage = pveStageForRound(state.round, gameData)!;
    expect(stage).not.toBeNull();

    // Build the authoritative board (mutates state.nextUid)
    const uidBefore = state.nextUid;
    const real = buildMobBoard(state, stage, gameData);
    const uidAfterReal = state.nextUid;
    expect(uidAfterReal).toBeGreaterThan(uidBefore); // confirms buildMobBoard mutated state

    // Build the preview (must not mutate state.nextUid further)
    const preview = previewPveStage(state, gameData)!;
    expect(preview).not.toBeNull();
    expect(state.nextUid).toBe(uidAfterReal); // preview did not advance the counter

    // Same number of units on side 1
    expect(preview.units.length).toBe(real.units.length);
    for (const u of preview.units) expect(u.team).toBe(1);

    // Sort both by position for a stable comparison (order may vary)
    const key = (u: UnitInstance) => `${u.pos.q},${u.pos.r}`;
    const sortedReal = [...real.units].sort((a, b) => key(a).localeCompare(key(b)));
    const sortedPreview = [...preview.units].sort((a, b) => key(a).localeCompare(key(b)));

    for (let i = 0; i < sortedReal.length; i++) {
      const r = sortedReal[i]!;
      const p = sortedPreview[i]!;
      // defId, tier, star, stats, position must match exactly
      expect(p.defId).toBe(r.defId);
      expect(p.tier).toBe(r.tier);
      expect(p.star).toBe(r.star);
      expect(p.pos).toEqual(r.pos);
      expect(p.hp).toBe(r.hp);
      expect(p.maxHp).toBe(r.maxHp);
      expect(p.ad).toBe(r.ad);
      expect(p.as).toBe(r.as);
      expect(p.armor).toBe(r.armor);
      expect(p.mr).toBe(r.mr);
      expect(p.range).toBe(r.range);
      expect(p.mana).toBe(r.mana);
      expect(p.maxMana).toBe(r.maxMana);
      expect(p.abilityDamage).toBe(r.abilityDamage);
      // uid differs by design (preview uses negative disposable ids)
    }
  });

  it("preview uids are all negative", () => {
    const state = createMatch(1, gameData);
    expect(isPveRound(state.round)).toBe(true);
    const preview = previewPveStage(state, gameData)!;
    expect(preview.units.length).toBeGreaterThan(0);
    for (const u of preview.units) {
      expect(u.uid, `uid ${u.uid} should be negative`).toBeLessThan(0);
    }
  });

  it("CRITICAL no-side-effect: state.nextUid is unchanged after multiple calls and boards are structurally identical", () => {
    const state = createMatch(42, gameData);
    expect(isPveRound(state.round)).toBe(true);

    const uidSnapshot = state.nextUid;

    // Call three times; each must return the same board and leave state untouched
    const boards = [
      previewPveStage(state, gameData)!,
      previewPveStage(state, gameData)!,
      previewPveStage(state, gameData)!,
    ];

    // state.nextUid must be exactly as it was before any preview call
    expect(state.nextUid).toBe(uidSnapshot);

    // All three boards must be structurally identical (same units, same positions)
    const serialized = boards.map((b) =>
      JSON.stringify(
        [...b.units].sort((a, bb) => `${a.pos.q},${a.pos.r}`.localeCompare(`${bb.pos.q},${bb.pos.r}`))
      )
    );
    expect(serialized[0]).toBe(serialized[1]);
    expect(serialized[1]).toBe(serialized[2]);

    // All uids across all three calls must be negative
    for (const board of boards) {
      for (const u of board.units) {
        expect(u.uid).toBeLessThan(0);
      }
    }
  });

  it("preview is consistent across all defined PvE rounds with a known stage", () => {
    // Verify previewPveStage returns non-null for every PvE round that has a
    // stage definition in mobs.json, and null for rounds without one.
    for (const round of KNOWN_PVE_ROUNDS) {
      const state = createMatch(1, gameData);
      state.round = round;
      const stage = pveStageForRound(round, gameData);
      const preview = previewPveStage(state, gameData);
      if (stage) {
        expect(preview, `round ${round} has a stage, preview should be non-null`).not.toBeNull();
        expect(preview!.units.length).toBe(stage.units.length);
      } else {
        // PvE round but no stage entry in mobs.json — preview returns null (no stage to show)
        expect(preview, `round ${round} has no stage entry, preview should be null`).toBeNull();
      }
    }
  });
});
