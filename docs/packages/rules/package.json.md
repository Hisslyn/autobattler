# packages/rules/package.json

**Path & purpose** — `packages/rules/package.json`. npm workspace package manifest for `@autobattler/rules`, the pure match-state-machine package (no I/O).

**Responsibility** — Declares package identity, module type, dependency list, and — notably — explicit per-file subpath exports for every individual rules source module, not just a single barrel entry point.

**Exports** — Not code; package metadata. Key fields:
- `name`: `"@autobattler/rules"`.
- `version`: `"0.1.0"`.
- `type`: `"module"` — ESM.
- `main`: `./src/match.ts` — the default import path (`import { ... } from "@autobattler/rules"`) resolves to `match.ts` (which exports `createMatch`/`advancePhase`/`runMatchToEnd`), making the match lifecycle API the package's "headline" surface.
- `exports`: a map of subpaths, EACH pointing at its own individual source file rather than a single barrel: `.` → `match.ts`, `./src/commands.js` → `commands.ts`, `./src/state.js` → `state.ts`, `./src/economy.js` → `economy.ts`, `./src/rounds.js` → `rounds.ts`, `./src/loot.js` → `loot.ts`, `./src/pool.js` → `pool.ts`, `./src/shop.js` → `shop.ts`, `./src/ai.js` → `ai.ts`. Note `ai.ts` is exported but ISN'T listed among the dependents that typically import it (`packages/server` uses it for bot policy) — still part of the public surface.
- `dependencies`: `@autobattler/data` (content/types — units, traits, items, economy, mobs, loot tables) and `@autobattral/sim` (the pure combat engine `simulateCombat` rules invokes for each round's combat phase).

**Key behavior** — Unlike `@autobattler/balance` or `@autobattler/protocol` (which expose one barrel path), this package exposes EVERY major source file as its own named subpath import (e.g. `import { ... } from "@autobattler/rules/src/commands.js"`), in addition to the default `.` import resolving to `match.ts`. This lets consumers import just `commands.ts`'s `applyCommand` without pulling in (or appearing to depend on) the rest of the match lifecycle module, even though in practice most of these modules are interdependent within the package.

**Invariants & constraints**
- This package MUST stay pure (no I/O) per CLAUDE.md's hard invariant — the dependency list itself enforces this indirectly: both declared dependencies (`@autobattler/data`, `@autobattler/sim`) are also pure, so nothing in the dependency graph introduces I/O.
- Every subpath in `exports` must have a real corresponding `.ts` file; adding a new top-level rules module (e.g. a hypothetical `newmodule.ts`) that other packages need to import directly requires adding its subpath here too, or it stays import-invisible outside the package (though intra-package imports between rules files don't need this — only EXTERNAL package imports go through `exports`).
- `.js` extensions in the subpath keys are TypeScript/Node ESM resolution convention (mirrors how `.ts` files import each other with `.js` specifiers) — they resolve to the sibling `.ts` files listed as values.

**Depends on** — `@autobattler/data` (typed game content), `@autobattler/sim` (pure combat engine, invoked once per combat round).

**Used by** — `packages/server` (room.ts drives the match lifecycle via `createMatch`/`advancePhase`, applies commands via `applyCommand`, runs AI via `applyAiCommands`) and `packages/client` (`driver.ts`'s `LocalDriver` runs the full rules match state machine locally for Practice mode, using the same subpath imports as the server).

**Notes** — The explicit per-file `exports` map (rather than one barrel `index.ts`) is somewhat unusual in this monorepo (most other packages use a single barrel) — it reflects that `rules` has several genuinely independent concerns (pool/shop/economy/loot/ai/commands/rounds/state) that consumers may want to import surgically, plus it avoids the maintenance overhead of keeping a manual barrel file in sync as the package grows.
