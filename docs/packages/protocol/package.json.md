# packages/protocol/package.json

**Path & purpose** — `packages/protocol/package.json`. npm workspace package manifest for `@autobattler/protocol`, the shared WS message-type/envelope/codec package.

**Responsibility** — Declares the package identity, module type, and entry point for `@autobattler/protocol` within the npm workspaces monorepo. Per CLAUDE.md, this package has "zero runtime deps" — confirmed here: no `dependencies` field at all.

**Exports** — Not code; this is package metadata. Key fields:
- `name`: `"@autobattler/protocol"` — the workspace package identifier other packages reference (e.g. `packages/server/package.json`, `packages/client/package.json` depend on `"@autobattler/protocol": "*"`).
- `version`: `"0.1.0"`.
- `type`: `"module"` — ESM throughout, matching every other package in the monorepo.
- `main`/`exports["."]`: both point directly at `./src/index.ts` (no build step, no `dist/` — TypeScript source is consumed directly via the workspace's shared `tsconfig`/`ts-node`/vitest toolchain, same pattern as `packages/data` and `packages/balance`).

**Key behavior** — No scripts, no dependencies, no devDependencies declared at this level (shared dev tooling like `typescript`/`vitest` lives at the repo root `package.json` and is hoisted). Importing `@autobattler/protocol` from another workspace package resolves straight to the TypeScript source via the `exports` map.

**Invariants & constraints**
- MUST remain free of runtime `dependencies` — this is explicitly called out in CLAUDE.md ("zero runtime deps") so that protocol types can be imported by both server and client without pulling in either's dependency graph (no accidental coupling, e.g. no Node-only or browser-only deps leaking into shared message types).
- `main`/`exports` pointing at `.ts` directly (not a compiled `.js`) means consumers must run through the monorepo's TypeScript-aware tooling (Vite for client, ts-node/tsx or direct execution for server) — this package is never published/built standalone today.

**Depends on** — Nothing (zero dependencies by design).

**Used by** — `packages/server/package.json` and `packages/client/package.json` (both declare `"@autobattler/protocol": "*"` as a dependency) — the protocol types are the shared contract between server and client for all WS messages.

**Notes** — The complete absence of a `dependencies` key (not even an empty object) is itself meaningful: it's the strongest possible signal that this package's zero-deps invariant is intact; adding any dependency here would be an immediate, visible diff against this file.
