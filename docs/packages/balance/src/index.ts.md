# Path & purpose

`/Users/azat/Desktop/autobattler/packages/balance/src/index.ts` — the public barrel/entry module for `@autobattler/balance` (matches the package's `package.json` `main`/`exports["."]` pointing at this file). Re-exports the package's full public API from its internal modules.

# Responsibility

Owns nothing itself — pure re-export surface. Defines what "importing `@autobattler/balance`" gives a consumer, hiding internal module boundaries (`runner.ts`, `sweep.ts`, `report.ts`, `compositions.ts`) behind one import path.

# Exports

Re-exports, grouped by source module:
- From `./runner.js`: `runMatchup`, `type MatchupResult`.
- From `./sweep.js`: `runSweep`, `DEFAULT_CONFIG`, `type SweepConfig`, `type SweepReport`, `type CompStat`, `type UnitStat`, `type TierStat`, `type TraitStat`.
- From `./report.js`: `renderMarkdown`.
- From `./compositions.js`: `COMPOSITIONS`, `buildBoard`, `activeTraits`, `compGold`, `unitGoldCost`, `LEVEL`, `BUDGET`, `BUDGET_TOLERANCE`, `type Composition`, `type CompUnit`.

Any file wanting balance functionality (sweep results, composition data, the markdown renderer, or the raw matchup runner) should import from `@autobattler/balance` (this file) rather than reaching into `packages/balance/src/<module>.ts` directly.

# Key behavior

Pure re-export statements, no logic, no runtime side effects beyond module evaluation order (importing this file transitively evaluates `runner.ts`, `sweep.ts`, `report.ts`, and `compositions.ts` — note `compositions.ts` has module-load-time side effects: it eagerly builds `COMPOSITIONS` from real `gameData`, so importing `@autobattler/balance` always pays that cost).

# Invariants & constraints

- Must stay in sync with the actual exports of `runner.ts`/`sweep.ts`/`report.ts`/`compositions.ts` — if a new public type/function is added to any of those files and intended for external use, it should be added here too.
- Uses `.js` extension specifiers in imports despite source being `.ts` — required because the package is `type: "module"` (native ESM) and TypeScript's ESM mode requires the post-compilation extension in import specifiers, even though `tsx`/vitest run the `.ts` files directly.

# Depends on

`./runner.js` (-> `packages/balance/src/runner.ts`), `./sweep.js` (-> `sweep.ts`), `./report.js` (-> `report.ts`), `./compositions.js` (-> `compositions.ts`) — all sibling files in this package.

# Used by

Anything importing `@autobattler/balance` as a package (per the package.json `exports` map, this file IS that import target). `packages/balance/tests/balance.test.ts` likely imports from here rather than individual files.

# Notes

- `runner.ts` itself was not yet read/documented at the time of writing this entry (its own file gets its own doc); this file's description of `runMatchup`/`MatchupResult` is based solely on what's re-exported here and `CLAUDE.md`'s one-line summary ("runMatchup(boardA, boardB, seeds, data): N seeded combats → win rate, avg length, overtime rate, avg survivors").
