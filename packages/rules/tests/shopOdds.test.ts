/**
 * shopOdds exact tier-probability pins.
 *
 * rollTier (private to shop.ts) uses:
 *   roll = prng() % rowSum   (rowSum = sum of all weights; always 100 for every
 *                              row in economy.json)
 *   tier = first t where cumulative > roll
 *
 * Expected tier boundaries for three representative levels (table-derived from
 * economy.json shopOdds; values would need updating if the table is changed):
 *
 *   Level 1 row  [100, 0, 0, 0, 0]   rowSum=100
 *     roll 0–99 → tier 1 always
 *
 *   Level 5 row  [35, 35, 25, 5, 0]  rowSum=100
 *     roll 0–34  → tier 1 (cumulative 35)
 *     roll 35–69 → tier 2 (cumulative 70)
 *     roll 70–94 → tier 3 (cumulative 95)
 *     roll 95–99 → tier 4 (cumulative 100)
 *     tier 5 weight = 0 → impossible
 *
 *   Level 9 row  [10, 18, 40, 22, 10] rowSum=100
 *     roll 0–9   → tier 1 (cumulative 10)
 *     roll 10–27 → tier 2 (cumulative 28)
 *     roll 28–67 → tier 3 (cumulative 68)
 *     roll 68–89 → tier 4 (cumulative 90)
 *     roll 90–99 → tier 5 (cumulative 100)
 */

import { describe, it, expect } from "vitest";
import { gameData } from "@autobattler/data";
import { buildInitialPool } from "../src/pool.js";
import { rollShop } from "../src/shop.js";
import type { MatchState } from "../src/state.js";
import type { Prng } from "@autobattler/sim/src/prng.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal single-player MatchState with a full pool, no units held. */
function makeState(level: number): MatchState {
  const pool = buildInitialPool(gameData);
  const state: MatchState = {
    players: [
      {
        id: 0,
        hp: 100,
        gold: 50,
        xp: 0,
        level,
        bench: [],
        board: [],
        items: [],
        shop: [],
        winStreak: 0,
        loseStreak: 0,
        alive: true,
        lastBoard: null,
        placement: null,
        roundWins: 0,
        roundLosses: 0,
        totalDamageTaken: 0,
        totalDamageDealt: 0,
      },
    ],
    pool,
    round: 1,
    phase: "PLANNING",
    prngState: 0,
    nextUid: 10000,
    pairingHistory: new Map(),
    placements: [],
    lastPairings: [],
    lastRoundSeed: 0,
    lastCombatResults: new Map(),
    lastOpponentBoards: new Map(),
    lastLootOrbs: new Map(),
    lastRoundResult: new Map(),
  };
  return state;
}

/**
 * Build a PRNG that returns values from the provided sequence.
 * rollShop consumes 2 PRNG calls per slot (tier roll + unit index pick).
 * shopSlots = 6 → 12 total calls per rollShop invocation.
 *
 * We only care about the tier roll for slot 0 (first call), so we set:
 *   seq[0] = tier boundary value (raw uint32; % 100 gives the test roll)
 *   seq[1] = 0                   (picks the first available candidate)
 *   seq[2..11] = 0               (remaining slots use first candidate)
 */
function makeSeq(firstTierRoll: number): Prng {
  // Create a sequence of 12 values: boundary value first, 0 for the rest.
  const seq = [firstTierRoll, ...Array(11).fill(0)];
  let idx = 0;
  return () => seq[idx++ % seq.length]!;
}

/** Run rollShop and return the tier of the first non-null slot. */
function firstTier(level: number, tierRoll: number): number | null {
  const state = makeState(level);
  const prng = makeSeq(tierRoll);
  rollShop(state, 0, prng, gameData);
  const slot = state.players[0]!.shop[0];
  return slot?.tier ?? null;
}

// ---------------------------------------------------------------------------
// Verify the shopOdds table shape first (no surprise row sums)
// ---------------------------------------------------------------------------

describe("shopOdds table invariants (economy.json)", () => {
  const odds = gameData.economy.shopOdds;

  it("each row sums to 100", () => {
    for (let r = 0; r < odds.length; r++) {
      const sum = odds[r]!.reduce((a, b) => a + b, 0);
      expect(sum, `row ${r} sum`).toBe(100);
    }
  });

  it("level 1 row has 100% weight on tier 1, zero elsewhere", () => {
    // table-derived: shopOdds[0] = [100,0,0,0,0]
    expect(odds[0]).toEqual([100, 0, 0, 0, 0]);
  });

  it("level 5 row exact weights [35,35,25,5,0]", () => {
    // table-derived: shopOdds[4]
    expect(odds[4]).toEqual([35, 35, 25, 5, 0]);
  });

  it("level 9 row exact weights [10,18,40,22,10]", () => {
    // table-derived: shopOdds[8]
    expect(odds[8]).toEqual([10, 18, 40, 22, 10]);
  });
});

// ---------------------------------------------------------------------------
// Level 1 — tier 1 only (roll 0 and 99 both pick tier 1)
// ---------------------------------------------------------------------------

describe("shopOdds boundary mapping — level 1", () => {
  it("roll 0 → tier 1 (first weight = 100, cumulative hits 100 at tier 1)", () => {
    expect(firstTier(1, 0)).toBe(1);
  });

  it("roll 99 → tier 1 (last valid roll, still < 100 cumulative)", () => {
    expect(firstTier(1, 99)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Level 5 — row [35,35,25,5,0], boundaries: 35, 70, 95, 100
// ---------------------------------------------------------------------------

describe("shopOdds boundary mapping — level 5 [35,35,25,5,0]", () => {
  it("roll 0 → tier 1 (first roll in tier-1 band)", () => {
    expect(firstTier(5, 0)).toBe(1);
  });

  it("roll 34 → tier 1 (last roll in tier-1 band: cumulative 35, 34 < 35)", () => {
    expect(firstTier(5, 34)).toBe(1);
  });

  it("roll 35 → tier 2 (first roll in tier-2 band: cumulative 35 not > 35, next cumulative 70 > 35)", () => {
    expect(firstTier(5, 35)).toBe(2);
  });

  it("roll 69 → tier 2 (last roll in tier-2 band: 69 < 70)", () => {
    expect(firstTier(5, 69)).toBe(2);
  });

  it("roll 70 → tier 3 (first roll in tier-3 band)", () => {
    expect(firstTier(5, 70)).toBe(3);
  });

  it("roll 94 → tier 3 (last roll in tier-3 band: 94 < 95)", () => {
    expect(firstTier(5, 94)).toBe(3);
  });

  it("roll 95 → tier 4 (first roll in tier-4 band)", () => {
    expect(firstTier(5, 95)).toBe(4);
  });

  it("roll 99 → tier 4 (last valid roll: 99 < 100)", () => {
    expect(firstTier(5, 99)).toBe(4);
  });

  it("tier 5 is impossible at level 5 (weight = 0)", () => {
    // Try all 100 distinct roll values; none should yield tier 5
    for (let roll = 0; roll < 100; roll++) {
      const tier = firstTier(5, roll);
      expect(tier, `roll ${roll}`).not.toBe(5);
    }
  });
});

// ---------------------------------------------------------------------------
// Level 9 — row [10,18,40,22,10], boundaries: 10, 28, 68, 90, 100
// ---------------------------------------------------------------------------

describe("shopOdds boundary mapping — level 9 [10,18,40,22,10]", () => {
  it("roll 0 → tier 1 (first roll in tier-1 band)", () => {
    expect(firstTier(9, 0)).toBe(1);
  });

  it("roll 9 → tier 1 (last roll in tier-1 band: 9 < 10)", () => {
    expect(firstTier(9, 9)).toBe(1);
  });

  it("roll 10 → tier 2 (first roll in tier-2 band)", () => {
    expect(firstTier(9, 10)).toBe(2);
  });

  it("roll 27 → tier 2 (last roll in tier-2 band: 27 < 28)", () => {
    expect(firstTier(9, 27)).toBe(2);
  });

  it("roll 28 → tier 3 (first roll in tier-3 band)", () => {
    expect(firstTier(9, 28)).toBe(3);
  });

  it("roll 67 → tier 3 (last roll in tier-3 band: 67 < 68)", () => {
    expect(firstTier(9, 67)).toBe(3);
  });

  it("roll 68 → tier 4 (first roll in tier-4 band)", () => {
    expect(firstTier(9, 68)).toBe(4);
  });

  it("roll 89 → tier 4 (last roll in tier-4 band: 89 < 90)", () => {
    expect(firstTier(9, 89)).toBe(4);
  });

  it("roll 90 → tier 5 (first roll in tier-5 band)", () => {
    expect(firstTier(9, 90)).toBe(5);
  });

  it("roll 99 → tier 5 (last valid roll: 99 < 100)", () => {
    expect(firstTier(9, 99)).toBe(5);
  });
});
