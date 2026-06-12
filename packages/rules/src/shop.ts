import type { GameData } from "@autobattler/data";
import type { MatchState, ShopSlot } from "./state.js";
import type { Prng } from "@autobattler/sim/src/prng.js";

// Returns the tier (1-based index) by rolling against shopOdds for the given level.
// shopOdds rows are 0-indexed by level-1; level capped at row count.
function rollTier(prng: Prng, level: number, data: GameData): number {
  const odds = data.economy.shopOdds;
  const rowIdx = Math.min(level - 1, odds.length - 1);
  const row = odds[rowIdx]!;
  const roll = prng() % 100;
  let cumulative = 0;
  for (let t = 0; t < row.length; t++) {
    cumulative += row[t]!;
    if (roll < cumulative) return t + 1;
  }
  return row.length;
}

function pickDefIdForTier(
  prng: Prng,
  tier: number,
  pool: Map<string, number>,
  data: GameData
): string | null {
  const candidates = data.units
    .filter((u) => u.tier === tier)
    .filter((u) => (pool.get(u.id) ?? 0) > 0);
  if (candidates.length === 0) return null;
  const idx = prng() % candidates.length;
  return candidates[idx]!.id;
}

export function rollShop(
  state: MatchState,
  playerId: number,
  prng: Prng,
  data: GameData
): void {
  const player = state.players[playerId];
  if (!player) return;
  const slots = data.economy.shopSlots;
  const newShop: (ShopSlot | null)[] = [];
  for (let i = 0; i < slots; i++) {
    const tier = rollTier(prng, player.level, data);
    const defId = pickDefIdForTier(prng, tier, state.pool, data);
    newShop.push(defId ? { defId, tier } : null);
  }
  player.shop = newShop;
}
