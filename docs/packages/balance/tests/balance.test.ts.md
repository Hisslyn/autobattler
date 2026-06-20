# Path & purpose

`packages/balance/tests/balance.test.ts` -- vitest suite covering the whole `@autobattler/balance` package end-to-end: runner determinism, the composition roster's invariants, sweep determinism/itemized-vs-itemless divergence, and a full smoke test that exercises the real `cli.ts` write-to-disk flow (using a temp directory instead of the repo root).

# Responsibility

Verifies the package's core guarantees actually hold against the real `gameData`: (1) `runMatchup` is deterministic, (2) every built-in `Composition` satisfies the `LEVEL`/`BUDGET` invariants enforced by `compositions.ts`'s `makeComp`, (3) every real unit in `gameData.units` appears in at least 3 comps (the per-unit statistical-signal requirement), (4) `runSweep` is deterministic and itemized/itemless configs produce genuinely different matrices, (5) `renderMarkdown` + `JSON.stringify` together produce a well-formed report containing all expected section headers and a parseable JSON shape.

# Exports

None -- test file (vitest `describe`/`it` blocks), not a module with a public API.

# Key behavior

- **"runner determinism"**: builds two fixed boards from `COMPOSITIONS[0]`/`COMPOSITIONS[1]` and asserts `runMatchup(a, b, 8, gameData)` called twice produces deep-equal (`toEqual`) results.
- **"equal-budget invariant"**: for every comp in `COMPOSITIONS`, asserts `units.length === LEVEL` (8) and `|compGold(c, gameData) - BUDGET| <= BUDGET_TOLERANCE` (30 +/- 2) -- a direct re-check of `makeComp`'s own guarantee against the live composition roster.
- **"coverage invariant"**: for every real unit def in `gameData.units`, asserts it appears in `COMPOSITIONS` at least 3 times -- guards the "every unit appears in >=3 distinct comps" design intent stated in `compositions.ts`'s header comment; this is the test that would fail if a new unit were added to `units.json` without also adding it to at least 3 `SLATES` entries.
- **"matrix determinism"**: two sub-tests. First takes the first 5 `COMPOSITIONS`, runs `runSweep(gameData, 5, {itemsPerComp:6}, subset)` twice, and asserts the full `JSON.stringify`-serialized matrix AND the full serialized `SweepReport` are byte-identical between runs (stronger than the matrix-only check) -- plus a sanity bound that every comp's `winRate` is within [0,1]. Second sub-test runs the same 5-comp subset itemless (`itemsPerComp:0`) vs itemized (`itemsPerComp:6`) and asserts their matrices are NOT identical -- proving the item-assignment path in `compositions.ts`'s `assignItems`/`buildBoard` actually changes combat outcomes.
- **"smoke report"**: creates a real temp directory (`mkdtempSync` under `os.tmpdir()`), runs a small 5-comp / 3-seed sweep for both item modes, renders markdown via `renderMarkdown`, writes both `balance-report.md` and `balance-report.json` to the temp dir (mirroring exactly what `cli.ts` does, but pointed at a disposable directory rather than `process.cwd()`), then reads them back and asserts: the markdown contains all expected section headers (top-level title, comp win matrix heading, per-tier heading, trait win-rate headings for both modes, outlier-units heading, item-mode-flips heading); the parsed JSON has 5x5 matrices, numeric `overtimeRate`, positive `totalCombats`, array-typed `units`/`tiers`/`traits` for both modes, and the correct `itemsPerComp` (0 and 6 respectively). The temp directory is always removed in a `finally` block (`rmSync` with `recursive: true, force: true`), so this test is the one exception in the test suite that legitimately touches the filesystem, and it cleans up after itself.

# Invariants & constraints

- This is the only test file in the repo (besides `packages/server`'s persistence tests) that performs real file I/O -- justified because it's testing the I/O-permitted CLI's exact write/read round-trip, and it scopes the I/O to an ephemeral OS temp directory, never the repo's own `balance-report.*` files.
- Relies on `COMPOSITIONS` having at least 2 entries (uses indices 0 and 1) and at least 5 entries (uses `.slice(0,5)`) -- if the `SLATES` table in `compositions.ts` were ever trimmed below 5 entries, several of these tests would silently operate on fewer comps than intended (no explicit length assertion guards this).
- The "coverage invariant" test is the most likely test to break when `packages/data/src/units.json` gains a new unit -- a content-side change (new unit added to data) requires a balance-side change (`compositions.ts`'s `SLATES`) to keep this test green.

# Depends on

`@autobattler/data` (`gameData` -- the real, loaded JSON content, not a mock). `../src/runner.js`, `../src/sweep.js`, `../src/report.js`, `../src/compositions.js` (relative imports directly into the package's own source modules, not through the `@autobattler/balance` barrel). `node:fs` (`mkdtempSync`, `writeFileSync`, `readFileSync`, `rmSync`), `node:os` (`tmpdir`), `node:path` (`join`) -- Node built-ins, used only within this test file's temp-directory smoke test.

# Used by

Run as part of the root `npm test` (`vitest run`) suite; not imported by any other source file.

# Notes

- Because this suite always uses the REAL `gameData` (not synthetic fixtures), it doubles as an integration check between `packages/data`'s actual content and the balance package's hardcoded `compositions.ts` roster -- a unit rename/removal in data would surface as a failure here (`makeComp` throwing "references unknown unit") even before the "coverage invariant" test runs.
