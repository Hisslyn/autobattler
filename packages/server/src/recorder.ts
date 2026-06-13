import { gameData, DATA_VERSION } from "@autobattler/data";
import type { MatchPlayerRecord, Repository } from "./db/index.js";
import { computeMmrDeltas } from "./mmr.js";
import type { MmrChange } from "@autobattler/protocol";

export interface SeatResult {
  seat: number;
  accountId: string | null; // null for bots
  placement: number; // 1 = winner
}

/**
 * Persists a finished match: fetches current MMR for account seats, computes
 * Elo deltas (bots count at the starting MMR for the lobby average but are
 * never persisted), then writes the match + profile MMR updates through the
 * repository in one call (single transaction in the pg impl).
 * Returns per-seat MMR changes for account seats.
 */
export async function recordMatchResult(
  repo: Repository,
  matchId: string,
  seats: SeatResult[]
): Promise<Record<number, MmrChange>> {
  const start = gameData.economy.mmrStart;
  const mmrBefore = await Promise.all(
    seats.map(async (s) => {
      if (s.accountId === null) return start;
      const profile = await repo.getProfile(s.accountId);
      return profile?.mmr ?? start;
    })
  );

  const deltas = computeMmrDeltas(
    seats.map((s, i) => ({ mmr: mmrBefore[i]!, placement: s.placement }))
  );

  const players: MatchPlayerRecord[] = seats.map((s, i) => ({
    accountId: s.accountId,
    seat: s.seat,
    placement: s.placement,
    mmrBefore: s.accountId === null ? null : mmrBefore[i]!,
    mmrAfter: s.accountId === null ? null : mmrBefore[i]! + deltas[i]!,
  }));

  await repo.recordMatch(matchId, DATA_VERSION, players);

  const changes: Record<number, MmrChange> = {};
  for (const p of players) {
    if (p.accountId !== null) {
      changes[p.seat] = { before: p.mmrBefore!, after: p.mmrAfter! };
    }
  }
  return changes;
}
