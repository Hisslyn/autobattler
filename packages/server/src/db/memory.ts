import { randomUUID } from "node:crypto";
import { gameData } from "@autobattler/data";
import { signToken } from "../auth.js";
import type { MatchHistoryEntry, MatchPlayerRecord, Profile, Repository } from "./repo.js";

interface MatchRow {
  matchId: string;
  dataVersion: string;
  endedAt: number;
  players: MatchPlayerRecord[];
}

export class MemoryRepository implements Repository {
  private accountsByDevice = new Map<string, string>(); // deviceId → accountId
  private tokens = new Map<string, string>(); // token → accountId
  private profiles = new Map<string, Profile>();
  private matches: MatchRow[] = [];

  async createGuest(deviceId: string, name?: string): Promise<{ accountId: string; token: string }> {
    const existing = this.accountsByDevice.get(deviceId);
    if (existing) {
      if (name) this.profiles.get(existing)!.name = name;
      return { accountId: existing, token: signToken(existing) };
    }
    const accountId = randomUUID();
    const token = signToken(accountId);
    this.accountsByDevice.set(deviceId, accountId);
    this.tokens.set(token, accountId);
    this.profiles.set(accountId, { accountId, name: name ?? "Guest", mmr: gameData.economy.mmrStart });
    return { accountId, token };
  }

  async findByToken(token: string): Promise<{ accountId: string } | null> {
    const accountId = this.tokens.get(token);
    return accountId ? { accountId } : null;
  }

  async getProfile(accountId: string): Promise<Profile | null> {
    const p = this.profiles.get(accountId);
    return p ? { ...p } : null;
  }

  async updateProfile(accountId: string, patch: { name?: string; mmr?: number }): Promise<void> {
    const p = this.profiles.get(accountId);
    if (!p) return;
    if (patch.name !== undefined) p.name = patch.name;
    if (patch.mmr !== undefined) p.mmr = patch.mmr;
  }

  async recordMatch(matchId: string, dataVersion: string, players: MatchPlayerRecord[]): Promise<void> {
    this.matches.push({ matchId, dataVersion, endedAt: Date.now(), players: players.map((p) => ({ ...p })) });
    for (const p of players) {
      if (p.accountId !== null && p.mmrAfter !== null) {
        const profile = this.profiles.get(p.accountId);
        if (profile) profile.mmr = p.mmrAfter;
      }
    }
  }

  async leaderboard(n: number): Promise<Profile[]> {
    return [...this.profiles.values()]
      .sort((a, b) => b.mmr - a.mmr)
      .slice(0, n)
      .map((p) => ({ ...p }));
  }

  async matchHistory(accountId: string, limit: number): Promise<MatchHistoryEntry[]> {
    const out: MatchHistoryEntry[] = [];
    for (let i = this.matches.length - 1; i >= 0 && out.length < limit; i--) {
      const m = this.matches[i]!;
      const me = m.players.find((p) => p.accountId === accountId);
      if (!me) continue;
      out.push({
        matchId: m.matchId,
        dataVersion: m.dataVersion,
        endedAt: m.endedAt,
        seat: me.seat,
        placement: me.placement,
        mmrBefore: me.mmrBefore,
        mmrAfter: me.mmrAfter,
      });
    }
    return out;
  }

  async close(): Promise<void> {}
}
