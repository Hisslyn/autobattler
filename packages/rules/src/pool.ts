import type { GameData } from "@autobattler/data";
import type { MatchState } from "./state.js";

export function buildInitialPool(data: GameData): Map<string, number> {
  const pool = new Map<string, number>();
  for (const unit of data.units) {
    const count = data.economy.poolCounts[String(unit.tier)] ?? 0;
    pool.set(unit.id, count);
  }
  return pool;
}

export function drawFromPool(
  pool: Map<string, number>,
  defId: string
): boolean {
  const count = pool.get(defId) ?? 0;
  if (count <= 0) return false;
  pool.set(defId, count - 1);
  return true;
}

export function returnToPool(pool: Map<string, number>, defId: string): void {
  pool.set(defId, (pool.get(defId) ?? 0) + 1);
}

export function returnUnitsToPool(
  state: MatchState,
  units: import("@autobattler/sim/src/types.js").UnitInstance[]
): void {
  for (const u of units) {
    const copies = u.star === 1 ? 1 : u.star === 2 ? 3 : 9;
    for (let i = 0; i < copies; i++) {
      returnToPool(state.pool, u.defId);
    }
  }
}

export function poolAvailable(
  pool: Map<string, number>,
  defId: string
): number {
  return pool.get(defId) ?? 0;
}

export function totalPoolCount(
  pool: Map<string, number>,
  data: GameData
): number {
  let total = 0;
  for (const unit of data.units) {
    total += pool.get(unit.id) ?? 0;
  }
  return total;
}
