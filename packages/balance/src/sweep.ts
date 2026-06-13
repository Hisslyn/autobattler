import type { GameData } from "@autobattler/data";
import { runMatchup } from "./runner.js";
import { COMPOSITIONS, buildBoard, activeTraits, type Composition } from "./compositions.js";

export interface CompStat {
  id: string;
  name: string;
  winRate: number;
  games: number;
}

export interface UnitStat {
  defId: string;
  /** Appearance-weighted average win rate of comps containing this unit. */
  winRate: number;
  appearances: number;
}

export interface TraitStat {
  id: string;
  /** Average win rate of comps that activate this trait. */
  winRate: number;
  comps: number;
}

export interface SweepReport {
  comps: CompStat[];
  /** matrix[i][j] = comp i (team 0) win rate vs comp j (team 1). */
  matrix: number[][];
  compOrder: string[];
  units: UnitStat[];
  traits: TraitStat[];
  avgGameLength: number;
  overtimeRate: number;
  seeds: number;
  totalCombats: number;
}

/**
 * Round-robin every comp vs every other over `seeds` seeds, both orientations.
 * Pure + deterministic: identical (comps, seeds, data) -> identical report.
 */
export function runSweep(
  data: GameData,
  seeds: number,
  comps: Composition[] = COMPOSITIONS
): SweepReport {
  const n = comps.length;
  const boards0 = comps.map((c) => buildBoard(c, 0, data));
  const boards1 = comps.map((c) => buildBoard(c, 1, data));

  const matrix: number[][] = comps.map(() => new Array(n).fill(0));
  const wins = new Array(n).fill(0);
  const games = new Array(n).fill(0);

  let lengthSum = 0;
  let overtimeSum = 0;
  let totalCombats = 0;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const r = runMatchup(boards0[i]!, boards1[j]!, seeds, data);
      matrix[i]![j] = r.winRateA;
      // comp i played as team 0; comp j as team 1.
      wins[i] += r.winsA + r.draws * 0.5;
      games[i] += r.combats;
      wins[j] += r.winsB + r.draws * 0.5;
      games[j] += r.combats;
      lengthSum += r.avgLength * r.combats;
      overtimeSum += r.overtimeRate * r.combats;
      totalCombats += r.combats;
    }
  }

  const compStats: CompStat[] = comps.map((c, i) => ({
    id: c.id,
    name: c.name,
    winRate: games[i] ? wins[i] / games[i] : 0,
    games: games[i],
  }));
  const compWinRate = new Map(compStats.map((c) => [c.id, c.winRate]));

  // Per-unit: appearance-weighted average of its comps' win rates.
  const unitAcc = new Map<string, { sum: number; appearances: number }>();
  for (const c of comps) {
    const wr = compWinRate.get(c.id) ?? 0;
    for (const cu of c.units) {
      const acc = unitAcc.get(cu.defId) ?? { sum: 0, appearances: 0 };
      acc.sum += wr;
      acc.appearances += 1;
      unitAcc.set(cu.defId, acc);
    }
  }
  const units: UnitStat[] = [...unitAcc.entries()]
    .map(([defId, a]) => ({ defId, winRate: a.sum / a.appearances, appearances: a.appearances }))
    .sort((a, b) => b.winRate - a.winRate);

  // Per-trait: average win rate over comps that activate the trait.
  const traitAcc = new Map<string, { sum: number; comps: number }>();
  for (const c of comps) {
    const wr = compWinRate.get(c.id) ?? 0;
    for (const t of activeTraits(c, data)) {
      const acc = traitAcc.get(t) ?? { sum: 0, comps: 0 };
      acc.sum += wr;
      acc.comps += 1;
      traitAcc.set(t, acc);
    }
  }
  const traits: TraitStat[] = [...traitAcc.entries()]
    .map(([id, a]) => ({ id, winRate: a.sum / a.comps, comps: a.comps }))
    .sort((a, b) => b.winRate - a.winRate);

  return {
    comps: compStats,
    matrix,
    compOrder: comps.map((c) => c.id),
    units,
    traits,
    avgGameLength: totalCombats ? lengthSum / totalCombats : 0,
    overtimeRate: totalCombats ? overtimeSum / totalCombats : 0,
    seeds,
    totalCombats,
  };
}
