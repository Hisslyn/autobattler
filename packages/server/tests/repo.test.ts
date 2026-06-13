import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { Repository } from "../src/db/repo.js";
import { MemoryRepository } from "../src/db/memory.js";
import { PostgresRepository } from "../src/db/postgres.js";

// Contract suite: every Repository impl must pass. Unique deviceIds/matchIds
// per run so the suite is safe against a shared postgres database.
function repoContract(name: string, makeRepo: () => Promise<Repository>): void {
  describe(`repository contract: ${name}`, () => {
    let repo: Repository;
    beforeAll(async () => {
      repo = await makeRepo();
    });
    afterAll(async () => {
      await repo.close();
    });

    it("createGuest creates account + profile at starting MMR", async () => {
      const deviceId = `dev-${randomUUID()}`;
      const { accountId, token } = await repo.createGuest(deviceId, "Alice");
      expect(accountId).toBeTruthy();
      expect(token).toBeTruthy();

      const profile = await repo.getProfile(accountId);
      expect(profile).toEqual({ accountId, name: "Alice", mmr: 1000 });
    });

    it("createGuest is idempotent per deviceId", async () => {
      const deviceId = `dev-${randomUUID()}`;
      const first = await repo.createGuest(deviceId, "Bob");
      const second = await repo.createGuest(deviceId);
      expect(second.accountId).toBe(first.accountId);
      expect(second.token).toBe(first.token);
    });

    it("findByToken resolves the account; unknown token is null", async () => {
      const { accountId, token } = await repo.createGuest(`dev-${randomUUID()}`);
      expect(await repo.findByToken(token)).toEqual({ accountId });
      expect(await repo.findByToken("bogus.token")).toBeNull();
    });

    it("updateProfile patches name and mmr", async () => {
      const { accountId } = await repo.createGuest(`dev-${randomUUID()}`, "Old");
      await repo.updateProfile(accountId, { name: "New" });
      await repo.updateProfile(accountId, { mmr: 1234 });
      expect(await repo.getProfile(accountId)).toEqual({ accountId, name: "New", mmr: 1234 });
    });

    it("recordMatch persists players, applies MMR, skips bots", async () => {
      const a = await repo.createGuest(`dev-${randomUUID()}`, "P1");
      const b = await repo.createGuest(`dev-${randomUUID()}`, "P2");
      const matchId = `m-${randomUUID()}`;

      await repo.recordMatch(matchId, "0.1.0", [
        { accountId: a.accountId, seat: 0, placement: 1, mmrBefore: 1000, mmrAfter: 1020 },
        { accountId: b.accountId, seat: 1, placement: 8, mmrBefore: 1000, mmrAfter: 980 },
        { accountId: null, seat: 2, placement: 2, mmrBefore: null, mmrAfter: null },
      ]);

      expect((await repo.getProfile(a.accountId))!.mmr).toBe(1020);
      expect((await repo.getProfile(b.accountId))!.mmr).toBe(980);

      const history = await repo.matchHistory(a.accountId, 10);
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        matchId,
        dataVersion: "0.1.0",
        seat: 0,
        placement: 1,
        mmrBefore: 1000,
        mmrAfter: 1020,
      });
    });

    it("matchHistory returns newest first and respects limit", async () => {
      const { accountId } = await repo.createGuest(`dev-${randomUUID()}`);
      let mmr = 1000;
      const matchIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        const matchId = `m-${randomUUID()}`;
        matchIds.push(matchId);
        await repo.recordMatch(matchId, "0.1.0", [
          { accountId, seat: 0, placement: 1, mmrBefore: mmr, mmrAfter: mmr + 10 },
        ]);
        mmr += 10;
        // ensure distinct ended_at ordering in pg (timestamp resolution)
        await new Promise((r) => setTimeout(r, 5));
      }
      const history = await repo.matchHistory(accountId, 2);
      expect(history).toHaveLength(2);
      expect(history.map((h) => h.matchId)).toEqual([matchIds[2], matchIds[1]]);
    });

    it("leaderboard orders by MMR descending", async () => {
      const low = await repo.createGuest(`dev-${randomUUID()}`, "Low");
      const high = await repo.createGuest(`dev-${randomUUID()}`, "High");
      await repo.updateProfile(low.accountId, { mmr: 900 });
      await repo.updateProfile(high.accountId, { mmr: 2000 });

      const board = await repo.leaderboard(1000);
      const ours = board.filter((p) => p.accountId === low.accountId || p.accountId === high.accountId);
      expect(ours.map((p) => p.accountId)).toEqual([high.accountId, low.accountId]);
      // globally sorted
      for (let i = 1; i < board.length; i++) {
        expect(board[i]!.mmr).toBeLessThanOrEqual(board[i - 1]!.mmr);
      }
    });
  });
}

repoContract("memory", async () => new MemoryRepository());

const databaseUrl = process.env["DATABASE_URL"];
if (databaseUrl) {
  repoContract("postgres", async () => {
    const repo = new PostgresRepository(databaseUrl);
    await repo.ensureSchema();
    return repo;
  });
} else {
  console.log("[repo.test] DATABASE_URL not set: skipping postgres repository contract tests");
  describe.skip("repository contract: postgres (skipped, DATABASE_URL not set)", () => {
    it("requires DATABASE_URL", () => {});
  });
}
