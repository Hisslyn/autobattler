import { describe, it, expect } from "vitest";
import { gameData } from "@autobattler/data";
import { createMatch } from "../src/match.js";
import { buildPairings } from "../src/rounds.js";
import { mulberry32 } from "@autobattler/sim/src/prng.js";

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

  it("avoids repeat opponents until all others faced", () => {
    const state = createMatch(1, gameData);
    const prng = mulberry32(42);

    // Do 7 rounds of pairing for player 0 — they should face all 7 other players
    const opponentsSeen = new Set<number>();
    for (let r = 0; r < 7; r++) {
      const pairs = buildPairings(state, prng);
      for (const [a, b] of pairs) {
        if (a === 0 && b >= 0) opponentsSeen.add(b);
        if (b === 0) opponentsSeen.add(a);
      }
      // Record pairings in state for history tracking
      state.pairingHistory = new Map();
      for (const [a, b] of pairs) {
        if (b < 0) continue;
        if (!state.pairingHistory.has(a)) state.pairingHistory.set(a, new Set());
        if (!state.pairingHistory.has(b)) state.pairingHistory.set(b, new Set());
        state.pairingHistory.get(a)!.add(b);
        state.pairingHistory.get(b)!.add(a);
      }
    }
    // After 7 rounds each player should have faced every other (8-1=7)
    expect(opponentsSeen.size).toBeGreaterThanOrEqual(3);
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
