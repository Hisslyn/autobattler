# Path & purpose

`packages/client/package.json` -- npm package manifest for `@autobattler/client`, the Vite + TypeScript + PixiJS v8 web client.

# Responsibility

Declares the client package's identity, scripts (`dev`/`build`/`typecheck`), and dependencies: every other shared workspace package it consumes (`data`, `protocol`, `rules`, `sim`) plus the rendering library (`pixi.js`).

# Exports

Not code -- package metadata.
- `name: "@autobattler/client"`, `version: "0.1.0"`, `type: "module"`, `private: true` (never published).
- `scripts`:
  - `dev` -> `vite` (starts the Vite dev server; invoked from the root via `npm run dev --workspace=packages/client`, see root `package.json`).
  - `build` -> `vite build` (produces the production bundle; not wired to a root-level script, run directly from this package or `npm run build --workspace=packages/client`).
  - `typecheck` -> `tsc --noEmit` (a package-local typecheck path distinct from the root's `tsc --build` project-references typecheck -- this one is `--noEmit`, useful for quick local iteration without the build-graph overhead).
- `dependencies`: `@autobattler/data`, `@autobattler/protocol`, `@autobattler/rules`, `@autobattler/sim` (all workspace-local, pinned `"*"`), `pixi.js` (`^8.9.2` -- the actual rendering engine, confirms the codebase is on PixiJS v8, consistent with `CLAUDE.md`'s repeated references to "the Pixi v8 path API").
- `devDependencies`: `vite` (`^8.0.16`).

# Key behavior

No runtime behavior -- static manifest. Notably, the client depends on `rules` (the full match state machine) directly, NOT just `protocol` -- this is because `LocalDriver` (`packages/client/src/driver.ts`) runs an entire local match via `packages/rules` for Practice mode (offline play), while `NetDriver` (`packages/client/src/netDriver.ts`) talks to the server via `protocol` types over `net.ts`'s WebSocket wrapper. The client also depends on `sim` directly to run/replay combat locally (`combat/player.ts`, `combat/reducer.ts`) and to build the renderer's understanding of unit stats.

# Invariants & constraints

- Depending on `rules` directly (not just `protocol`) is intentional and load-bearing for the offline Practice mode -- removing this dependency would break `LocalDriver`.
- `pixi.js ^8.9.2` -- any client rendering code MUST target the Pixi v8 API; per `CLAUDE.md`, "The entire client render layer is standardized on the Pixi v8 path API" and the deprecated v7 immediate-mode API has been fully removed.
- Two different typecheck commands exist (root `tsc --build` vs this package's `tsc --noEmit`) -- `npm test`'s `pretest` hook uses the ROOT typecheck (project references across all packages), so this package-local `typecheck` script is a convenience/local-iteration tool, not what CI/`npm test` actually runs.

# Depends on

`@autobattler/data`, `@autobattler/protocol`, `@autobattler/rules`, `@autobattler/sim` (workspace packages), `pixi.js` (third-party rendering engine), `vite` (dev/build tooling, devDependency).

# Used by

Resolved by the root npm workspaces mechanism; the root `package.json`'s `dev` script delegates here (`npm run dev --workspace=packages/client`).

# Notes

- No `vitest`/test-runner devDependency listed here despite the package having an extensive `packages/client/tests/` suite -- `vitest` is a ROOT devDependency (see root `package.json`) and the root `vitest.config.ts` presumably globs all workspaces' test directories, so the client doesn't need its own copy.
- Version `0.1.0` -- still pre-1.0, consistent with `@autobattler/data`'s `0.1.0` but inconsistent with `@autobattler/balance`'s `1.0.0`; package versions are not coordinated across the monorepo.
