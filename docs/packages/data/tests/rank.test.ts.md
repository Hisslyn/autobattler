# packages/data/tests/rank.test.ts

**Path & purpose** — `packages/data/tests/rank.test.ts`. Vitest suite of known-answer tests for `mmrToRank` (from `loader.ts`) against the real `ranks.json` band thresholds, plus a structural sanity check on `RANK_BANDS` ordering.

**Responsibility** — Owns regression coverage for the MMR-to-rank-band mapping: every band boundary (inclusive-on-min semantics), the below-floor clamp behavior, and the invariant that `RANK_BANDS` stays sorted ascending (which `mmrToRank`'s linear-scan implementation silently depends on).

**Exports** — None (test file). No local helpers beyond the inline `cases` array.

**Key behavior**
- `describe("mmrToRank known-answer band boundaries")` runs a table of 13 `[mmr, expectedBandId]` known-answer pairs covering every transition point in the real `ranks.json` data: 0/500/999→bronze, 1000/1199→silver, 1200/1399→gold, 1400/1599→platinum, 1600/1799→diamond, 1800/99999→master. Each pair is exactly at or just below/above a real band's `minMmr` (0, 1000, 1200, 1400, 1600, 1800 from `ranks.json`), directly verifying the documented "boundary inclusive on minMmr" rule (e.g. exactly 1000 is already `silver`, not `bronze`).
- A separate test confirms negative MMR (`-500`) clamps to the lowest band (`RANK_BANDS[0]`, i.e. bronze) rather than throwing or returning undefined.
- A final structural test asserts `RANK_BANDS[i].minMmr > RANK_BANDS[i-1].minMmr` for every consecutive pair — i.e. strictly ascending, no ties, no out-of-order entries. This guards the assumption `mmrToRank`'s implementation makes (a linear scan keeping the last `minMmr <= mmr` match) without re-sorting.

**Invariants & constraints**
- This test is tightly coupled to the ACTUAL values in `ranks.json` (it is not abstracted/parameterized off the loaded bands) — if `ranks.json`'s thresholds ever change, every literal in the `cases` table here must be updated to match, or the test will fail (intentionally, as a content-change tripwire).
- Tests both real `RANK_BANDS` content (via `loader.ts`'s actual JSON-backed export) and the pure function logic together — there's no isolated/mocked unit test of `mmrToRank` against a synthetic band list, so a bug in `ranks.json` itself (e.g. an out-of-order entry) would also be caught by the "sorted ascending" test, not just a logic bug in `mmrToRank`.

**Depends on** — `packages/data/src/loader.ts` (`mmrToRank`, `RANK_BANDS`) — the only import; transitively depends on `packages/data/src/ranks.json`'s actual content matching the hardcoded expectations in this file.

**Used by** — Run by `npm test` (vitest) as part of the data package's test suite; not imported by any other module.

**Notes** — None of the test cases probe a tie at a band's exact upper edge from the OTHER direction explicitly labeled (e.g. 1199 is silver, 1200 is gold — both are present, confirming the cutover is precisely at 1200 with no gap or overlap). The suite intentionally hardcodes Bronze/Silver/Gold/Platinum/Diamond/Master id strings rather than reading them from `RANK_BANDS` by index, so renaming a band id in `ranks.json` would also surface here as a clear test failure.
