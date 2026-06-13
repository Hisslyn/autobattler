import type { Repository } from "./repo.js";
import { MemoryRepository } from "./memory.js";
import { PostgresRepository } from "./postgres.js";

export type { Repository, Profile, MatchPlayerRecord, MatchHistoryEntry } from "./repo.js";
export { MemoryRepository } from "./memory.js";
export { PostgresRepository } from "./postgres.js";

/** Postgres when DATABASE_URL is set; in-memory fallback for dev/tests. */
export async function createRepository(): Promise<Repository> {
  const url = process.env["DATABASE_URL"];
  if (url) {
    const repo = new PostgresRepository(url);
    await repo.ensureSchema();
    console.log("[db] using postgres");
    return repo;
  }
  console.log("[db] DATABASE_URL not set, using in-memory repository");
  return new MemoryRepository();
}
