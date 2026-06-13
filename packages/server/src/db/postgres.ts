import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { gameData } from "@autobattler/data";
import { signToken } from "../auth.js";
import type { MatchHistoryEntry, MatchPlayerRecord, Profile, Repository } from "./repo.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export class PostgresRepository implements Repository {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString });
  }

  /** Migrations = schema.sql, idempotent (CREATE ... IF NOT EXISTS). */
  async ensureSchema(): Promise<void> {
    const sql = readFileSync(resolve(__dirname, "schema.sql"), "utf8");
    await this.pool.query(sql);
  }

  async createGuest(deviceId: string, name?: string): Promise<{ accountId: string; token: string }> {
    const existing = await this.pool.query<{ account_id: string; token: string }>(
      "SELECT account_id, token FROM accounts WHERE device_id = $1",
      [deviceId]
    );
    if (existing.rows[0]) {
      const { account_id, token } = existing.rows[0];
      if (name) await this.updateProfile(account_id, { name });
      return { accountId: account_id, token };
    }
    const accountId = randomUUID();
    const token = signToken(accountId);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO accounts (account_id, device_id, token) VALUES ($1, $2, $3)",
        [accountId, deviceId, token]
      );
      await client.query(
        "INSERT INTO profiles (account_id, name, mmr) VALUES ($1, $2, $3)",
        [accountId, name ?? "Guest", gameData.economy.mmrStart]
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    return { accountId, token };
  }

  async findByToken(token: string): Promise<{ accountId: string } | null> {
    const res = await this.pool.query<{ account_id: string }>(
      "SELECT account_id FROM accounts WHERE token = $1",
      [token]
    );
    return res.rows[0] ? { accountId: res.rows[0].account_id } : null;
  }

  async getProfile(accountId: string): Promise<Profile | null> {
    const res = await this.pool.query<{ account_id: string; name: string; mmr: number }>(
      "SELECT account_id, name, mmr FROM profiles WHERE account_id = $1",
      [accountId]
    );
    const row = res.rows[0];
    return row ? { accountId: row.account_id, name: row.name, mmr: row.mmr } : null;
  }

  async updateProfile(accountId: string, patch: { name?: string; mmr?: number }): Promise<void> {
    if (patch.name === undefined && patch.mmr === undefined) return;
    await this.pool.query(
      `UPDATE profiles
       SET name = COALESCE($2, name), mmr = COALESCE($3, mmr), updated_at = now()
       WHERE account_id = $1`,
      [accountId, patch.name ?? null, patch.mmr ?? null]
    );
  }

  async recordMatch(matchId: string, dataVersion: string, players: MatchPlayerRecord[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO matches (match_id, data_version) VALUES ($1, $2)",
        [matchId, dataVersion]
      );
      for (const p of players) {
        await client.query(
          `INSERT INTO match_players (match_id, seat, account_id, placement, mmr_before, mmr_after)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [matchId, p.seat, p.accountId, p.placement, p.mmrBefore, p.mmrAfter]
        );
        if (p.accountId !== null && p.mmrAfter !== null) {
          await client.query(
            "UPDATE profiles SET mmr = $2, updated_at = now() WHERE account_id = $1",
            [p.accountId, p.mmrAfter]
          );
        }
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async leaderboard(n: number): Promise<Profile[]> {
    const res = await this.pool.query<{ account_id: string; name: string; mmr: number }>(
      "SELECT account_id, name, mmr FROM profiles ORDER BY mmr DESC, account_id LIMIT $1",
      [n]
    );
    return res.rows.map((r) => ({ accountId: r.account_id, name: r.name, mmr: r.mmr }));
  }

  async matchHistory(accountId: string, limit: number): Promise<MatchHistoryEntry[]> {
    const res = await this.pool.query<{
      match_id: string;
      data_version: string;
      ended_at: Date;
      seat: number;
      placement: number;
      mmr_before: number | null;
      mmr_after: number | null;
    }>(
      `SELECT m.match_id, m.data_version, m.ended_at, mp.seat, mp.placement, mp.mmr_before, mp.mmr_after
       FROM match_players mp JOIN matches m ON m.match_id = mp.match_id
       WHERE mp.account_id = $1
       ORDER BY m.ended_at DESC
       LIMIT $2`,
      [accountId, limit]
    );
    return res.rows.map((r) => ({
      matchId: r.match_id,
      dataVersion: r.data_version,
      endedAt: r.ended_at.getTime(),
      seat: r.seat,
      placement: r.placement,
      mmrBefore: r.mmr_before,
      mmrAfter: r.mmr_after,
    }));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
