import { gameData } from "@autobattler/data";

export interface MmrEntrant {
  mmr: number;
  placement: number; // 1 = winner ... n = last
}

/**
 * Elo-style deltas for a free-for-all lobby: each player's expectation is the
 * standard Elo expectation vs the average MMR of the other entrants; actual
 * score is (n - placement) / (n - 1); delta = round(K * (actual - expected)).
 */
export function computeMmrDeltas(
  entrants: MmrEntrant[],
  k = gameData.economy.mmrK,
  eloDivisor = gameData.economy.mmrEloDivisor
): number[] {
  const n = entrants.length;
  const total = entrants.reduce((sum, e) => sum + e.mmr, 0);
  return entrants.map((e) => {
    const avgOthers = (total - e.mmr) / (n - 1);
    const expected = 1 / (1 + Math.pow(10, (avgOthers - e.mmr) / eloDivisor));
    const actual = (n - e.placement) / (n - 1);
    return Math.round(k * (actual - expected));
  });
}
