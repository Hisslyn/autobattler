# packages/sim/package.json

**Path & purpose** — `packages/sim/package.json`. The npm/workspace package manifest for `@autobattler/sim`, the pure deterministic combat engine package.

**Responsibility** — Declares the package's identity (`@autobattler/sim`, version `0.1.0`), its module system (ESM via `"type": "module"`), its public entry points (`exports` map), and its sole runtime dependency (`@autobattler/data`).

**Exports** — Not code; this is the manifest that DEFINES what other packages can import:
- `"."` → `./src/engine.ts` — the main barrel; `import { simulateCombat } from "@autobattler/sim"` resolves here, exposing `simulateCombat` (and whatever else `engine.ts` re-exports).
- `"./src/prng.js"` → `./src/prng.ts` — a DEEP import path explicitly allowed by this manifest, letting a consumer do `import { mulberry32 } from "@autobattler/sim/src/prng.js"` to reach the PRNG directly without going through the engine barrel.
- `"./src/types.js"` → `./src/types.ts` — similarly exposes the type definitions module (`UnitDef`, `CombatResult`, etc.) as a directly-importable deep path.
- `"./src/hex.js"` → `./src/hex.ts` — similarly exposes the hex-grid module directly.
- Note the `.js` extension in the EXPORT KEY despite the actual file being `.ts` — this is the standard TypeScript-ESM convention (source written as `.ts`, but referenced/imported using the `.js` extension it will compile to, since Node's ESM resolver requires explicit extensions and TS's `moduleResolution: "bundler"`/`"node16"` conventions expect the post-compilation extension in import specifiers even pre-compilation). Both `tests/room.test.ts` (server) and other packages observed in this session use exactly these `.js`-suffixed deep-import paths (e.g. `@autobattler/sim/src/types.js`).

**Key behavior** — Not applicable (no executable logic) — this is a static JSON manifest read by Node's module resolver and by npm workspaces tooling.

**Invariants & constraints**
- The `dependencies` list contains ONLY `@autobattler/data` (`"*"`, meaning "whatever version is in the workspace") — confirms `packages/sim`'s purity invariant at the manifest level: it has no `ws`, no `pg`, no UI libraries, nothing that could perform I/O — its only dependency is the pure data/content package.
- The 3 explicit deep-export paths (`prng.js`, `types.js`, `hex.js`) are a DELIBERATE allowlist — any OTHER internal file under `src/` (e.g. `fixed.ts`) is NOT exposed as an importable deep path via this manifest's `exports` map; however, as observed in `room.test.ts`'s documentation, at least one consumer imports `@autobattler/sim/src/types.js` directly (matching this manifest's explicit entry) — confirming the manifest accurately reflects what's intended to be reachable from outside the package.
- No `scripts`, `devDependencies`, or `files`/`types` fields are present in this manifest — type-checking/building is presumably handled centrally by the workspace root's `tsconfig.json`/`tsc --build` rather than per-package build scripts (consistent with CLAUDE.md's `npm run typecheck` being a single root-level `tsc --build` command, not delegated per-package).

**Depends on** — Nothing (it's a manifest); declares a dependency ON `@autobattler/data`.

**Used by** — npm workspaces tooling (resolves `@autobattler/sim` to this package when other workspace packages list it as a dependency); Node's ESM resolver (consults the `exports` map whenever any other file does `import ... from "@autobattler/sim"` or one of its allowed deep paths); used by `packages/rules`, `packages/balance`, `packages/server`, `packages/client` per CLAUDE.md's architecture (anywhere combat needs to be simulated).

**Notes** — The `main` field (`./src/engine.ts`) is somewhat redundant with the `exports["."]` entry (both point to the same file) — `main` is the older/legacy resolution field, kept here presumably for compatibility with tooling that doesn't understand the modern `exports` map, while `exports` is what actually governs resolution in modern Node/bundler contexts.
