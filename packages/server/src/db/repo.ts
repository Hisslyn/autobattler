export interface Profile {
  accountId: string;
  name: string;
  mmr: number;
}

export interface MatchPlayerRecord {
  accountId: string | null; // null for bots
  seat: number;
  placement: number; // 1 = winner
  mmrBefore: number | null; // null for bots
  mmrAfter: number | null;
}

export interface MatchHistoryEntry {
  matchId: string;
  dataVersion: string;
  endedAt: number; // epoch ms
  seat: number;
  placement: number;
  mmrBefore: number | null;
  mmrAfter: number | null;
}

/**
 * All persistence goes through this interface; bots (accountId null) never
 * get accounts/profiles. recordMatch persists the match and applies every
 * non-bot player's mmrAfter to their profile atomically (single transaction
 * in the postgres impl).
 */
export interface Repository {
  /** Idempotent per deviceId: returns the existing account if one exists. */
  createGuest(deviceId: string, name?: string): Promise<{ accountId: string; token: string }>;
  findByToken(token: string): Promise<{ accountId: string } | null>;
  getProfile(accountId: string): Promise<Profile | null>;
  updateProfile(accountId: string, patch: { name?: string; mmr?: number }): Promise<void>;
  recordMatch(matchId: string, dataVersion: string, players: MatchPlayerRecord[]): Promise<void>;
  leaderboard(n: number): Promise<Profile[]>;
  matchHistory(accountId: string, limit: number): Promise<MatchHistoryEntry[]>;
  close(): Promise<void>;
}
