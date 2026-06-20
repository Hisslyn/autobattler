# Path & purpose

`packages/data/package.json` — npm package manifest for `@autobattler/data`, the JSON content + typed loader workspace package.

# Responsibility

Declares the package identity, ESM module type, and the single export entry point (`src/loader.ts`) that every other package imports content through. No dependencies, no scripts, no build step — this package ships raw `.ts`/`.json` source directly.

# Exports

Not code — package metadata consumed by Node's module resolver and the npm workspace tooling:
- `"name": "@autobattler/data"` — the workspace specifier other packages import (`import { gameData } from "@autobattler/data"`).
- `"version": "0.1.0"` — recorded by the rules/server packages as `DATA_VERSION` on every persisted match (per CLAUDE.md: "loader also exports `DATA_VERSION`").
- `"type": "module"` — ESM, not CommonJS.
- `"main": "./src/loader.ts"` and `"exports": {".": "./src/loader.ts"}` — both point directly at the TypeScript source file (no `dist/` build output committed); Node/tsx/Vite/vitest all resolve `@autobattler/data` straight to `loader.ts`.

# Key behavior

No scripts (`build`/`test`/`dev` etc.) are defined here — `packages/data` has no compilation step of its own; it's typechecked as part of the root `tsc --build` (the root tsconfig globs `packages/*/src/**/*.ts`) and its content is consumed at import time by any package that needs `gameData`.

# Invariants & constraints

- The `exports` map exposes ONLY the bare `"."` entry — there is no exports subpath for individual JSON files (e.g. no `@autobattler/data/units.json` export). Any package needing raw JSON must go through the typed loader's exported `gameData` object, not a direct file import. This enforces the "typed loader, not raw JSON" access pattern described in CLAUDE.md.
- No `dependencies` field at all — the loader (`loader.ts`) must be self-contained, importing only Node builtins / its own JSON files via relative/static import, with zero runtime dependency on any other workspace package. This matches `packages/sim` being the pure base of the dependency graph; `data` sits beside it with no deps either.
- Version `0.1.0` has apparently never been bumped despite the substantial content growth visible in `design-notes.md` (consumables, artifacts, mythicals, pair-passives phases 2-3) — worth noting if `DATA_VERSION`-based migration/compatibility logic is ever added, since the version string doesn't currently track content schema changes.

# Depends on

Nothing — a leaf manifest with no `dependencies`/`devDependencies`.

# Used by

- Every workspace package that imports `@autobattler/data` (per CLAUDE.md: `sim`/`rules`/`server`/`client`/`balance` all consume `gameData`/`DATA_VERSION`/`recipeResult`/`mmrToRank`/`RANK_BANDS` from this package) resolves through this manifest's `main`/`exports` field.
- The root `package.json`'s `workspaces: ["packages/*"]` glob picks this package up automatically; npm workspace tooling reads this file to register `@autobattler/data` in the workspace's dependency graph.

# Notes

- This is one of the simplest package.json files in the repo (no scripts, no deps) — consistent with `data` being pure content + a loader, with all actual computation happening in the consuming packages.
