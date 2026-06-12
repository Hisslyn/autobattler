import { describe, it, expect } from "vitest";
import { gameData } from "@autobattler/data";
import { createMatch } from "../src/match.js";
import { buildPairings, getPairingFor } from "../src/rounds.js";
import { mulberry32 } from "@autobattler/sim/src/prng.js";
import type { CombatResult } from "@autobattler/sim/src/types.js";

describe("pairing", () => {
  it("no player is paired with themselves", () => {
    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    const pairs = buildPairings(state, prng);
    for (const [a, b] of pairs) {
      expect(a).not.toBe(b);
    }
  });

  it("each player appears at most once in pairings", () => {
    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    const pairs = buildPairings(state, prng);
    const seen = new Set<number>();
    for (const [a, b] of pairs) {
      expect(seen.has(a)).toBe(false);
      seen.add(a);
      if (b >= 0) {
        expect(seen.has(b)).toBe(false);
        seen.add(b);
      }
    }
  });

  it("over 7 PvP rounds with 8 alive players, each player faces 7 distinct opponents", () => {
    const state = createMatch(1, gameData);
    const prng = mulberry32(42);

    // buildPairings records pairing history (meet counts) itself
    for (let r = 0; r < 7; r++) {
      const pairs = buildPairings(state, prng);
      expect(pairs.length).toBe(4);
    }
    for (let p = 0; p < 8; p++) {
      const met = state.pairingHistory.get(p);
      expect(met, `player ${p} has pairing history`).toBeDefined();
      expect([...met!.keys()].sort()).toHaveLength(7);
      for (const count of met!.values()) expect(count).toBe(1);
    }
  });

  it("fallback picks the least-met opponent, tiebreak lowest seat", () => {
    const state = createMatch(1, gameData);
    // Two alive players who have met: must be re-paired (least-met = only option)
    for (const p of state.players) {
      if (p.id > 1) p.alive = false;
    }
    state.pairingHistory.set(0, new Map([[1, 2]]));
    state.pairingHistory.set(1, new Map([[0, 2]]));
    const pairs = buildPairings(state, mulberry32(5));
    expect(pairs).toHaveLength(1);
    expect([...pairs[0]!].sort()).toEqual([0, 1]);
    // Meet count incremented
    expect(state.pairingHistory.get(0)!.get(1)).toBe(3);

    // Four alive: 4 has met 5 three times and 6 once → fallback prefers 6
    const state2 = createMatch(2, gameData);
    for (const p of state2.players) {
      if (![4, 5, 6, 7].includes(p.id)) p.alive = false;
    }
    state2.pairingHistory.set(4, new Map([[5, 3], [6, 1], [7, 1]]));
    state2.pairingHistory.set(5, new Map([[4, 3], [6, 1], [7, 1]]));
    state2.pairingHistory.set(6, new Map([[4, 1], [5, 1], [7, 1]]));
    state2.pairingHistory.set(7, new Map([[4, 1], [5, 1], [6, 1]]));
    const pairs2 = buildPairings(state2, mulberry32(5));
    const partnerOf4 = pairs2
      .map(([a, b]) => (a === 4 ? b : b === 4 ? a : null))
      .find((x) => x !== null);
    expect(partnerOf4).not.toBe(5);
  });

  it("ghost pairing created for odd-player-count", () => {
    const state = createMatch(1, gameData);
    // Eliminate one player to get 7 alive
    state.players[7]!.alive = false;
    state.players[7]!.lastBoard = { units: [] };

    const prng = mulberry32(1);
    const pairs = buildPairings(state, prng);

    const ghostPairs = pairs.filter(([_a, b]) => b < 0);
    expect(ghostPairs.length).toBe(1);
  });
});

describe("getPairingFor", () => {
  function makeResult(winner: 0 | 1 | "draw"): CombatResult {
    return { winner, ticks: 100, survivingUnits: [], events: [] };
  }

  it("normalizes the A-side perspective", () => {
    const state = createMatch(1, gameData);
    state.lastPairings = [[2, 5]];
    const result = makeResult(0);
    state.lastCombatResults.set(2, result);
    state.lastCombatResults.set(5, result);
    state.lastOpponentBoards.set(2, []);
    state.lastOpponentBoards.set(5, []);

    const view = getPairingFor(state, 2);
    expect(view).not.toBeNull();
    expect(view!.side).toBe(0);
    expect(view!.opponentId).toBe(5);
    expect(view!.isGhost).toBe(false);
    expect(view!.outcome).toBe("win");
  });

  it("normalizes the B-side perspective: winner 0 means the B-side player lost", () => {
    const state = createMatch(1, gameData);
    state.lastPairings = [[2, 5]];
    const result = makeResult(0); // A-side (player 2) won
    state.lastCombatResults.set(2, result);
    state.lastCombatResults.set(5, result);
    state.lastOpponentBoards.set(2, []);
    state.lastOpponentBoards.set(5, []);

    const view = getPairingFor(state, 5);
    expect(view).not.toBeNull();
    expect(view!.side).toBe(1);
    expect(view!.opponentId).toBe(2);
    expect(view!.isGhost).toBe(false);
    expect(view!.outcome).toBe("loss");

    // And when B-side wins (winner === 1), the B-side player sees a win
    const result2 = makeResult(1);
    state.lastCombatResults.set(2, result2);
    state.lastCombatResults.set(5, result2);
    expect(getPairingFor(state, 5)!.outcome).toBe("win");
    expect(getPairingFor(state, 2)!.outcome).toBe("loss");
  });

  it("handles draws and ghosts", () => {
    const state = createMatch(1, gameData);
    state.lastPairings = [[3, -2]]; // player 3 vs ghost of player 1
    state.lastCombatResults.set(3, makeResult("draw"));
    state.lastOpponentBoards.set(3, []);

    const view = getPairingFor(state, 3);
    expect(view!.isGhost).toBe(true);
    expect(view!.side).toBe(0);
    expect(view!.outcome).toBe("draw");

    expect(getPairingFor(state, 6)).toBeNull();
  });
});
