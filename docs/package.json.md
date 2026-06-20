# Path & purpose

`/Users/azat/Desktop/autobattler/package.json` — the root npm workspace manifest for the entire monorepo. Declares the workspace, shared dev tooling, and the top-level scripts referenced throughout `CLAUDE.md`.

# Responsibility

Owns: the npm workspaces glob (`packages/*`), the minimum Node engine requirement, and every cross-package command a developer or agent runs from the repo root (`test`, `typecheck`, `dev`, `server`, `balance`). It is the entry point for `npm install`, `npm test`, etc.

# Exports

Not code — package metadata. Notable fields:
- `name: "autobattler"`, `private: true` (never published to a registry).
- `workspaces: ["packages/*"]` — every directory under `packages/` is an npm workspace package.
- `engines.node: ">=20"` — enforced minimum Node version (per `CLAUDE.md`).
- `scripts`:
  - `pretest` -> `npm run typecheck` (runs automatically before `npm test` via npm's lifecycle hook).
  - `test` -> `vitest run --reporter=verbose` (runs every workspace's vitest suite from the root `vitest.config.ts`).
  - `typecheck` -> `tsc --build` (project-references build using the root `tsconfig.json`; must exit 0).
  - `dev` -> `npm run dev --workspace=packages/client` (delegates to the client's Vite dev server script).
  - `server` -> `tsx packages/server/src/index.ts` (runs the authoritative WS+HTTP server directly from TypeScript source via `tsx`, no build step).
  - `balance` -> `tsx packages/balance/src/cli.ts` (runs the balance sweep CLI directly from source).
- `devDependencies`: `tsx` (TS executor, used to run server/balance without a compile step), `typescript`, `vite`, `vitest` — these are the only devDependencies hoisted to the root; per-package dependencies live in each package's own `package.json`.

# Key behavior

`npm install` at the repo root installs and links all workspace packages in one pass (npm workspaces symlink `packages/*` into a shared `node_modules`, deduping where possible). `npm test` always typechecks the whole project (via `pretest`) before running any test, so a type error anywhere in the project tree fails `npm test` even if the specific test file under change is unrelated. `npm run server` and `npm run balance` bypass any build artifacts and run TypeScript directly via `tsx`, so editing `packages/server/src/*.ts` or `packages/balance/src/*.ts` takes effect on the next invocation with no separate compile step.

# Invariants & constraints

- Every workspace command in `CLAUDE.md`'s "Commands" section maps directly to a script here — if a new top-level command is documented in `CLAUDE.md`, it must be added here too (and vice versa, this is the practical source of truth for what commands exist).
- `npm test` always runs `typecheck` first; a project that fails `tsc --build` will never reach the vitest suite, so a "tests are failing" report could actually be a type error.
- No `build` script exists at the root — the project does not produce a compiled output via a root command (the client has its own Vite build, see `packages/client/package.json` / `vite.config.ts`); server and balance are run directly from source via `tsx`.

# Depends on

`tsx`, `typescript`, `vite`, `vitest` (devDependencies). Implicitly depends on every `packages/*/package.json` via the workspaces mechanism.

# Used by

Every developer/CI workflow and every other package indirectly (npm workspaces resolves intra-monorepo package references like `@autobattler/data`, `@autobattler/sim`, etc. through this root manifest). `vitest.config.ts` and the root `tsconfig.json` are the direct technical consumers of the workspace structure this file declares.

# Notes

- Uses `vitest ^4.1.9` — a notably newer major version than what `AUDIT.md`'s 2026-06-13 snapshot implied ("vite 5/vitest 1 era" dependency vulnerabilities) — dependencies have been upgraded since that audit was written, another sign that doc/audit content drifts and the live `package.json` should be trusted over older docs.
