/**
 * Pins the exact mmrEloDivisor magnitude used in computeMmrDeltas.
 *
 * The symmetric equal-MMR lobby tests in mmr.test.ts pass regardless of the
 * divisor value (because expected = 0.5 for every player when all MMRs are
 * equal).  These tests use a mixed-MMR lobby so the divisor matters.
 *
 * Formula (from mmr.ts):
 *   avgOthers = (lobbyTotal - self.mmr) / (n - 1)
 *   expected  = 1 / (1 + 10 ^ ((avgOthers - self.mmr) / eloDivisor))
 *   actual    = (n - placement) / (n - 1)
 *   delta     = round(K * (actual - expected))
 *
 * All expected values below are derived from economy.json constants:
 *   K             = 40
 *   mmrEloDivisor = 400
 *   mmrStart      = 1000  (used as the baseline for other 7 entrants)
 *
 * Derivation for each case:
 *
 *   Case A — high-MMR winner (1400 MMR, placement 1):
 *     avgOthers = (7 × 1000) / 7 = 1000
 *     expected  = 1 / (1 + 10^((1000 - 1400) / 400))
 *               = 1 / (1 + 10^(-1))
 *               = 1 / 1.1
 *               ≈ 0.909090...
 *     actual    = (8 - 1) / 7 = 1.0
 *     delta     = round(40 × (1.0 - 0.909090...))
 *               = round(40 × 0.09090...)
 *               = round(3.6363...) = 4
 *
 *   Case B — low-MMR last-place (600 MMR, placement 8):
 *     avgOthers = (7 × 1000) / 7 = 1000
 *     expected  = 1 / (1 + 10^((1000 - 600) / 400))
 *               = 1 / (1 + 10^1)
 *               = 1 / 11
 *               ≈ 0.090909...
 *     actual    = (8 - 8) / 7 = 0
 *     delta     = round(40 × (0 - 0.090909...))
 *               = round(-3.6363...) = -4
 *
 *   Case C — player with 1200 MMR in a 1000-baseline lobby, placement 4:
 *     avgOthers = (7 × 1000) / 7 = 1000
 *     expected  = 1 / (1 + 10^((1000 - 1200) / 400))
 *               = 1 / (1 + 10^(-0.5))
 *               = 1 / (1 + 1/√10)
 *               ≈ 1 / (1 + 0.316227...) = 1 / 1.316227... ≈ 0.759750...
 *     actual    = (8 - 4) / 7 ≈ 0.571428...
 *     delta     = round(40 × (0.571428... - 0.759750...))
 *               = round(40 × -0.188321...) = round(-7.5328...) = -8
 *
 * If the divisor were 200 instead of 400, Case A would give:
 *   expected = 1/(1+10^(-2)) ≈ 0.990099 → delta = round(40*(1-0.990099)) = round(0.396) = 0
 * A passing test with the wrong divisor would not be caught — this is the point
 * of the test.
 */

import { describe, it, expect } from "vitest";
import { gameData } from "@autobattler/data";
import { computeMmrDeltas } from "../src/mmr.js";

const K = gameData.economy.mmrK;           // 40
const D = gameData.economy.mmrEloDivisor;  // 400
const BASE = gameData.economy.mmrStart;    // 1000

/** Build a lobby of 8 where 7 players have BASE mmr and one override. */
function lobby8(overrideMmr: number, overridePlacement: number) {
  const placements = Array.from({ length: 8 }, (_, i) => i + 1).filter(
    (p) => p !== overridePlacement
  );
  const others = placements.map((p) => ({ mmr: BASE, placement: p }));
  const target = { mmr: overrideMmr, placement: overridePlacement };
  // Insert target at its natural position so the array is in placement order
  others.splice(overridePlacement - 1, 0, target);
  return others;
}

/** Reference implementation using the documented formula and explicit divisor. */
function expectedDelta(selfMmr: number, avgOthers: number, placement: number, n: number): number {
  const exp = 1 / (1 + Math.pow(10, (avgOthers - selfMmr) / D));
  const actual = (n - placement) / (n - 1);
  return Math.round(K * (actual - exp));
}

describe("MMR Elo divisor magnitude (mixed-MMR lobby, explicit formula checks)", () => {
  it("Case A: 1400 MMR winner (placement 1) in a 1000-baseline lobby → delta +4", () => {
    // avgOthers = 1000; expected = 1/(1+10^(-1)) = 10/11 ≈ 0.909090
    // actual = 7/7 = 1; delta = round(40 × 1/11) = round(3.636...) = 4
    const entrants = lobby8(1400, 1);
    const deltas = computeMmrDeltas(entrants);
    // The target is at index 0 (placement 1)
    const targetIdx = entrants.findIndex((e) => e.mmr === 1400 && e.placement === 1);
    const computedDelta = deltas[targetIdx]!;
    const handDerivedDelta = expectedDelta(1400, BASE, 1, 8);
    expect(handDerivedDelta).toBe(4); // guard the hand-derivation
    expect(computedDelta).toBe(4);
  });

  it("Case B: 600 MMR last place (placement 8) in a 1000-baseline lobby → delta -4", () => {
    // avgOthers = 1000; expected = 1/(1+10^1) = 1/11 ≈ 0.090909
    // actual = 0/7 = 0; delta = round(40 × -1/11) = round(-3.636...) = -4
    const entrants = lobby8(600, 8);
    const deltas = computeMmrDeltas(entrants);
    const targetIdx = entrants.findIndex((e) => e.mmr === 600 && e.placement === 8);
    const computedDelta = deltas[targetIdx]!;
    const handDerivedDelta = expectedDelta(600, BASE, 8, 8);
    expect(handDerivedDelta).toBe(-4); // guard the hand-derivation
    expect(computedDelta).toBe(-4);
  });

  it("Case C: 1200 MMR mid-place (placement 4) in a 1000-baseline lobby → delta -8", () => {
    // avgOthers = 1000; expected = 1/(1+10^(-0.5)) ≈ 0.759750
    // actual = 4/7 ≈ 0.571428; delta = round(40 × -0.188321) = round(-7.5328) = -8
    const entrants = lobby8(1200, 4);
    const deltas = computeMmrDeltas(entrants);
    const targetIdx = entrants.findIndex((e) => e.mmr === 1200 && e.placement === 4);
    const computedDelta = deltas[targetIdx]!;
    const handDerivedDelta = expectedDelta(1200, BASE, 4, 8);
    expect(handDerivedDelta).toBe(-8); // guard the hand-derivation
    expect(computedDelta).toBe(-8);
  });

  it("the divisor in economy.json is exactly 400 (not just directional)", () => {
    // This is the single-source pin: if mmrEloDivisor changes the hand-derived
    // values above diverge and the cases above fail.  This assertion makes the
    // intent explicit and machine-readable.
    expect(D).toBe(400);
  });

  it("mmrStart in economy.json is exactly 1000", () => {
    expect(BASE).toBe(1000);
  });

  it("mmrK in economy.json is exactly 40", () => {
    expect(K).toBe(40);
  });
});
