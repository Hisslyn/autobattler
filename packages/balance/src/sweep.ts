import type { GameData } from "@autobattler/data";
import { runMatchup } from "./runner.js";
import {
  COMPOSITIONS,
  buildBoard,
  activeTraits,
  compGold,
  unitGoldCost,
  type Composition,
} from "./compositions.js";

export interface SweepConfig {
  /** Completed items handed to each comp (0 = itemless, 6 = itemized). */
  itemsPerComp: number;
}
export const DEFAULT_CONFIG: SweepConfig = { itemsPerComp: 0 };

export interface CompStat {
  id: string;
  name: string;
  winRate: number;
  games: number;
}

export interface UnitStat {
  defId: string;
  tier: number;
  /** Gold-contribution-weighted win rate across this unit's comps. */
  winRate: number;
  appearances: number;
  /** Spread (population variance) of the unit's per-comp win rates. */
  variance: number;
  /** True when comps disagree widely → the unit isn't the driver. */
  disagree: boolean;
}

export interface TierStat {
  tier: number;
  /** Mean per-unit win rate of units of this tier. */
  winRate: number;
  units: number;
}

export interface TraitStat {
  id: string;
  /** Average win rate of comps that activate this trait. */
  winRate: number;
  comps: number;
}

export interface SweepReport {
  itemsPerComp: number;
  comps: CompStat[];
  /** matrix[i][j] = comp i (team 0) win rate vs comp j (team 1). */
  matrix: number[][];
  compOrder: string[];
  units: UnitStat[];
  tiers: TierStat[];
  traits: TraitStat[];
  avgGameLength: number;
  overtimeRate: number;
  seeds: number;
  totalCombats: number;
}

/** Variance above this flags a unit whose comps disagree (std > ~0.14). */
const DISAGREE_VAR = 0.02;

/**
 * Round-robin every comp vs every other over `seeds` seeds, both orientations.
 * Pure + deterministic: identical (comps, seeds, config, data) -> identical report.
 */
export function runSweep(
  data: GameData,
  seeds: number,
  config: SweepConfig = DEFAULT_CONFIG,
  comps: Composition[] = COMPOSITIONS
): SweepReport {
  const n = comps.length;
  const boards0 = comps.map((c) => buildBoard(c, 0, data, config.itemsPerComp));
  const boards1 = comps.map((c) => buildBoard(c, 1, data, config.itemsPerComp));

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

  // Per-unit: weight each comp by the unit's gold share of that comp, aggregate
  // across its comps, and track the spread of the raw per-comp win rates.
  const unitAcc = new Map<string, { tier: number; wsum: number; weight: number; rates: number[] }>();
  for (const c of comps) {
    const wr = compWinRate.get(c.id) ?? 0;
    const gold = compGold(c, data);
    for (const cu of c.units) {
      const def = data.units.find((d) => d.id === cu.defId)!;
      const share = gold ? unitGoldCost(def, cu.star) / gold : 0;
      const acc = unitAcc.get(cu.defId) ?? { tier: def.tier, wsum: 0, weight: 0, rates: [] };
      acc.wsum += wr * share;
      acc.weight += share;
      acc.rates.push(wr);
      unitAcc.set(cu.defId, acc);
    }
  }
  const units: UnitStat[] = [...unitAcc.entries()]
    .map(([defId, a]) => {
      const winRate = a.weight ? a.wsum / a.weight : 0;
      const mean = a.rates.reduce((s, x) => s + x, 0) / a.rates.length;
      const variance = a.rates.reduce((s, x) => s + (x - mean) ** 2, 0) / a.rates.length;
      return { defId, tier: a.tier, winRate, appearances: a.rates.length, variance, disagree: variance > DISAGREE_VAR };
    })
    .sort((a, b) => b.winRate - a.winRate);

  // Per-tier: mean of per-unit win rates grouped by tier (exposes tier-power
  // bias that survives equal-gold normalization).
  const tierAcc = new Map<number, { sum: number; units: number }>();
  for (const u of units) {
    const acc = tierAcc.get(u.tier) ?? { sum: 0, units: 0 };
    acc.sum += u.winRate;
    acc.units += 1;
    tierAcc.set(u.tier, acc);
  }
  const tiers: TierStat[] = [...tierAcc.entries()]
    .map(([tier, a]) => ({ tier, winRate: a.sum / a.units, units: a.units }))
    .sort((a, b) => a.tier - b.tier);

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
    itemsPerComp: config.itemsPerComp,
    comps: compStats,
    matrix,
    compOrder: comps.map((c) => c.id),
    units,
    tiers,
    traits,
    avgGameLength: totalCombats ? lengthSum / totalCombats : 0,
    overtimeRate: totalCombats ? overtimeSum / totalCombats : 0,
    seeds,
    totalCombats,
  };
}
