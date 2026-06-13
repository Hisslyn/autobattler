import { simulateCombat } from "@autobattler/sim";
import type { BoardState } from "@autobattler/sim/src/types.js";
import type { GameData } from "@autobattler/data";

export interface MatchupResult {
  /** Win rate of boardA over `seeds` combats (draws count as 0.5). */
  winRateA: number;
  winsA: number;
  winsB: number;
  draws: number;
  combats: number;
  avgLength: number;
  overtimeRate: number;
  avgSurvivorsA: number;
  avgSurvivorsB: number;
}

/**
 * Simulate `seeds` combats between two fixed boards (seed = 0..seeds-1) and
 * aggregate. Pure: builds nothing with I/O, no Date/Math.random.
 */
export function runMatchup(
  boardA: BoardState,
  boardB: BoardState,
  seeds: number,
  data: GameData
): MatchupResult {
  let winsA = 0;
  let winsB = 0;
  let draws = 0;
  let lengthSum = 0;
  let overtime = 0;
  let survA = 0;
  let survB = 0;

  for (let seed = 0; seed < seeds; seed++) {
    const r = simulateCombat(boardA, boardB, seed, data);
    if (r.winner === 0) winsA++;
    else if (r.winner === 1) winsB++;
    else draws++;
    lengthSum += r.ticks;
    if (r.events.some((e) => e.type === "overtime_start")) overtime++;
    survA += r.survivingUnits.filter((u) => u.team === 0).length;
    survB += r.survivingUnits.filter((u) => u.team === 1).length;
  }

  const combats = seeds || 1;
  return {
    winRateA: (winsA + draws * 0.5) / combats,
    winsA,
    winsB,
    draws,
    combats: seeds,
    avgLength: lengthSum / combats,
    overtimeRate: overtime / combats,
    avgSurvivorsA: survA / combats,
    avgSurvivorsB: survB / combats,
  };
}
