# Path & purpose

`/Users/azat/Desktop/autobattler/docker-compose.yml` — local development infrastructure definition. Spins up a single Postgres 16 container for local persistence testing of `packages/server`.

# Responsibility

Provides the local Postgres instance that `packages/server`'s `Repository` implementation (`packages/server/src/db/postgres.ts`) connects to when `DATABASE_URL` is set. Owns nothing at runtime in production — purely a dev/test convenience.

# Exports

Not code — a Docker Compose service definition. Defines:
- service `postgres` — image `postgres:16`, env `POSTGRES_USER=autobattler`, `POSTGRES_PASSWORD=autobattler`, `POSTGRES_DB=autobattler`, port mapping `5432:5432`, named volume `pgdata` mounted at `/var/lib/postgresql/data` for persistence across container restarts.
- volume `pgdata` — top-level named volume backing the postgres data directory.

# Key behavior

`docker compose up -d` (per `CLAUDE.md`'s Commands section) starts the container in the background. The trailing comment documents the exact connection string to export afterward: `DATABASE_URL=postgres://autobattler:autobattler@localhost:5432/autobattler`. Once exported, `packages/server` switches from its in-memory `Repository` (`packages/server/src/db/memory.ts`) to the real Postgres-backed one (`packages/server/src/db/postgres.ts`), and the Postgres repo contract test suite (in `packages/server/tests/`) un-skips and runs against it.

# Invariants & constraints

- Credentials here are dev-only plaintext (`autobattler`/`autobattler`) — never reused for any real/production deployment.
- If `DATABASE_URL` is unset, the server defaults to the in-memory repo; this compose file is optional for most development/testing (only required to exercise the Postgres-backed contract tests or to test persistence-related code paths against a real database).
- Schema migrations are NOT handled by compose — `packages/server/src/db/schema.sql` is applied idempotently by server startup code, not by this file.

# Depends on

Docker / Docker Compose runtime; the `postgres:16` public image.

# Used by

Developer/CI workflow only (manual `docker compose up -d` per `CLAUDE.md`); not referenced by any source file. `packages/server/src/db/postgres.ts` and `packages/server/src/db/schema.sql` are the consumers of the resulting database once it's running.

# Notes

- Single service, no networking complexity, no app container — the server itself runs via `npm run server` outside Docker, only the database is containerized.
