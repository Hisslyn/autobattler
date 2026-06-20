# Path & purpose

`packages/client/vite.config.ts` — Vite configuration for the client dev server/build. Its entire content is a custom resolver plugin that maps the monorepo's `@autobattler/*` workspace package specifiers directly to their `.ts` source files, bypassing Node-style package resolution.

# Responsibility

Owns dev-server/build-time module resolution for cross-package imports (`@autobattler/data`, `@autobattler/sim`, `@autobattler/rules`, and several of their specific submodule import paths like `@autobattler/sim/src/prng.js`) so Vite serves/bundles the workspace packages' raw TypeScript directly rather than requiring those packages to be pre-built to JS.

# Exports

`export default defineConfig({...})` — the Vite config object, consumed automatically by the Vite CLI (`npm run dev`, `vite build`) when run from `packages/client/`.

No other exports; `ROOT` and `workspaceMap` are internal consts, not exported.

# Key behavior

- `ROOT = path.resolve(__dirname, "..")` — resolves to `packages/` (one level up from `packages/client/`), the parent directory containing all sibling workspace packages.
- `workspaceMap: Record<string,string>` — a hardcoded table of bare import specifiers to absolute `.ts` file paths:
  - `"@autobattler/data"` → `packages/data/src/loader.ts` (the package's main entry).
  - `"@autobattler/sim"` → `packages/sim/src/engine.ts` (the package's main entry).
  - `"@autobattler/sim/src/prng.js"`, `"@autobattler/sim/src/types.js"`, `"@autobattler/sim/src/hex.js"`, `"@autobattler/sim/src/fixed.js"` — direct submodule import paths (the client imports these specific sim internals directly, not just the package's main export), each mapped to the corresponding `.ts` file. Note the `.js` extension in the SPECIFIER (matching how the source TypeScript files literally write their import statements, since this repo's TS uses `.js`-suffixed relative imports per the `moduleResolution: "bundler"`/ESM convention) while the TARGET path is the real `.ts` file.
  - `"@autobattler/rules"` → `packages/rules/src/match.ts` (main entry) plus six more direct submodule mappings (`match.js`, `commands.js`, `state.js`, `economy.js`, `rounds.js`, `pool.js`, `shop.js`, `ai.js` — note: `match.js` is listed both as the bare package main AND as an explicit submodule path, redundant but harmless).
- The `defineConfig({plugins: [...]})` registers one inline plugin object named `"workspace-resolver"` implementing Vite's `resolveId(id)` hook: if `id` (the import specifier being resolved) is a key in `workspaceMap`, returns the mapped absolute path (Vite then loads that file directly as the module); otherwise returns `null` (falls through to Vite's normal resolution chain — node_modules, relative paths, etc.).
- The comment "Uses a plugin so longer matches take precedence over shorter ones" refers to JS object key lookup being exact-match (not prefix-based) — there's no actual precedence logic needed since `workspaceMap[id]` is an exact lookup, but the comment clarifies the intent that e.g. `@autobattler/sim/src/prng.js` resolves independently of (not as a sub-path under) the shorter `@autobattler/sim` entry.

# Invariants & constraints

- This map is MANUALLY maintained and must be kept in sync with whatever specific submodule paths the client's `.ts` source actually imports — if client code starts importing a NEW submodule path not yet in this table (e.g. a hypothetical `@autobattler/rules/src/loot.js`), Vite's dev server would fail to resolve it (falls through to normal resolution, which won't find a `.ts`-pointing bare specifier in `node_modules` since these are TS-source-only workspace packages with no built JS output committed).
- Workspace packages publish `.ts` files directly via their `package.json` `main`/`exports` fields (confirmed: `sim`/`data`/`rules` `package.json`s all set `"main": "./src/<entry>.ts"`) — Node's own ESM resolver (used by `tsx`/Node test runners) can follow `package.json` `exports`/`main` to find these `.ts` files, but Vite's bundler-style resolution in dev mode apparently needs this explicit plugin to shortcut straight to the file rather than going through full Node package resolution semantics for every workspace import. This file exists specifically to bridge that gap for Vite specifically (other consumers like `vitest`/`tsx` don't need it).
- Does not handle `@autobattler/protocol` or `@autobattler/server` — the client apparently never imports those packages directly (consistent with CLAUDE.md's protocol package being the shared wire-format layer the client DOES use, but perhaps via a path not requiring this explicit map, or simply not yet needed — worth verifying if client code starts importing `@autobattler/protocol` and dev-server resolution fails).

# Depends on

- `vite` (`defineConfig`) — the Vite config helper.
- Node `path` (`path.resolve`) — directory math only.
- Implicitly depends on the exact relative directory structure (`packages/client/` sibling to `packages/data/`, `packages/sim/`, `packages/rules/`) — if the monorepo were reorganized, `ROOT`'s relative resolution would break.

# Used by

- Vite itself, automatically, when running `vite` commands (`npm run dev`, any `vite build`) from within `packages/client/` (Vite auto-discovers `vite.config.ts` in the project root it's invoked from).

# Notes

- This is a workaround specific to Vite's dev-server module graph, NOT used by the actual `tsconfig.json` typecheck path (`tsc --build` from repo root resolves these imports via TypeScript's own module resolution against the workspace packages' `package.json` `exports`, unrelated to this Vite plugin) nor by `vitest` (which has its own resolution, likely via the SAME kind of npm workspace `package.json` `exports` mechanism, not this plugin — this plugin is Vite-only).
- The hardcoded, manually-maintained nature of `workspaceMap` is a deliberate simplicity trade-off over a more general "resolve any `@autobattler/<pkg>/src/<path>.js` to `<pkg-root>/src/<path>.ts`" pattern-matching resolver — as written, every individual submodule import path the client needs must be added here explicitly.
