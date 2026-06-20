# packages/server/package.json

**Path & purpose** — `packages/server/package.json`. NPM package manifest for `@autobattler/server`, the authoritative Node + ws match server workspace package.

**Responsibility** — Declares the server package's identity (`@autobattler/server`, version 0.1.0, ESM `"type":"module"`, `"private":true` — never published), its runtime dependencies on the other workspace packages it composes (`data`/`protocol`/`rules`/`sim`), its external runtime deps (`pg` for Postgres, `ws` for the WebSocket server), and its dev-only type packages.

**Exports** — None (manifest, not code). `scripts.start` = `tsx src/index.ts` — runs the server directly from TypeScript source via `tsx` (no separate build step for running locally/in dev; presumably the root-level `npm run server` script, per CLAUDE.md's command list, invokes this).

**Key behavior** — N/A (static configuration). Workspace-protocol version ranges (`"*"`) for the four internal `@autobattler/*` deps mean this package always resolves to whatever version is currently checked out in the monorepo (npm workspaces symlink behavior), not a pinned/published version.

**Invariants & constraints** — `pg` and `ws` are the ONLY external runtime dependencies — consistent with CLAUDE.md's description of `server` as "Node + ws authoritative server"; `pg` is present unconditionally (not optional) even though the Postgres repo is only used when `DATABASE_URL` is set (the in-memory repo is the fallback) — meaning `pg` is always installed regardless of whether Postgres is actually used at runtime.

**Depends on** — npm workspaces resolution for `@autobattler/data`, `@autobattler/protocol`, `@autobattler/rules`, `@autobattler/sim`; external `pg`, `ws`; dev-only `@types/pg`, `@types/ws`.

**Used by** — npm workspace tooling (`npm install`, `npm run server`, `npm test` at the root) resolves this manifest to build/run/test the server package; referenced implicitly by the root `package.json`'s workspaces array (not inspected in this pass).

**Notes** — No `build`/`test` script is defined HERE — per CLAUDE.md, `npm test` (typecheck + vitest) and `tsc --build` are run from the monorepo ROOT, not per-package; this manifest only needs a `start` script for the `npm run server` convenience command. No `main`/`exports` field is declared, meaning this package is consumed only as an application entry point (`tsx src/index.ts`), never imported as a library by another package — consistent with `server` being a leaf/terminal package in the dependency graph (nothing in `packages/*` imports FROM `server`).
