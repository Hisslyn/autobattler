import { describe, it, expect } from "vitest";
import { gameData } from "@autobattler/data";
import { computeMmrDeltas } from "../src/mmr.js";

const K = gameData.economy.mmrK;

describe("MMR Elo deltas", () => {
  it("equal-MMR lobby, placements 1..8: known answers, symmetric around 0", () => {
    const entrants = Array.from({ length: 8 }, (_, i) => ({ mmr: 1000, placement: i + 1 }));
    const deltas = computeMmrDeltas(entrants);

    // expected = 0.5 for everyone; actual = (8 - p) / 7
    const known = entrants.map((e) => Math.round(K * ((8 - e.placement) / 7 - 0.5)));
    expect(deltas).toEqual(known);
    expect(deltas).toEqual([20, 14, 9, 3, -3, -9, -14, -20]);

    // symmetric around 0
    expect(deltas.reduce((a, b) => a + b, 0)).toBe(0);
    for (let i = 0; i < 4; i++) {
      expect(deltas[i]).toBe(-deltas[7 - i]!);
    }
  });

  it("winner gains, last place loses in an equal lobby", () => {
    const entrants = Array.from({ length: 8 }, (_, i) => ({ mmr: 1000, placement: i + 1 }));
    const deltas = computeMmrDeltas(entrants);
    expect(deltas[0]!).toBeGreaterThan(0);
    expect(deltas[7]!).toBeLessThan(0);
  });

  it("higher-MMR player placing 8th loses more than lower-MMR player placing 8th", () => {
    const bots = Array.from({ length: 7 }, (_, i) => ({ mmr: 1000, placement: i + 1 }));
    const highLobby = [...bots, { mmr: 1400, placement: 8 }];
    const lowLobby = [...bots, { mmr: 600, placement: 8 }];

    const highDelta = computeMmrDeltas(highLobby)[7]!;
    const lowDelta = computeMmrDeltas(lowLobby)[7]!;
    expect(highDelta).toBeLessThan(lowDelta); // more negative = bigger loss
    expect(highDelta).toBeLessThan(0);
  });
});
