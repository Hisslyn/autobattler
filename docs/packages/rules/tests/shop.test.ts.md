# packages/rules/tests/shop.test.ts

**Path & purpose** — `packages/rules/tests/shop.test.ts`. Small sanity suite for `shop.ts`'s `rollShop`, confirming the level-gated tier distribution behaves correctly at the extremes (level 1 floor, level 9 ceiling) and that the shop has the data-configured slot count.

**Responsibility** — Verifies the shop-roll tier-gating mechanic at a behavioral/statistical level (not exact-distribution): a level-1 player should NEVER see anything above tier 1, and a level-9 (max level) player should EVENTUALLY see tier-3+ units given enough rolls — basic guardrails against a level-gating bug that lets low-level players see high-tier units (which would break the intended progression curve) or a bug that prevents high-level players from ever seeing higher tiers (a content-availability bug).

**Exports** — None (test file).

**Key behavior / test coverage**
- **"level 1 shop only rolls tier-1 units"**: a level-1 player's shop is rolled 50 times in a row (one shared `mulberry32(99)` instance advancing across all 50 calls), and on EVERY single roll, every non-null shop slot has `tier === 1` — an EXHAUSTIVE check (zero tolerance) since the entire point of the level-1 gate is that tier 2+ should be COMPLETELY unreachable, not just rare.
- **"level 9 shop can roll tier 3+ units"**: a level-9 (max level, confirmed elsewhere to be the level cap) player's shop is rolled up to 200 times (stopping early once a tier-3+ unit is seen), expecting `sawHighTier` to flip true within that budget — a STATISTICAL/existence check (not exhaustive), proving tier 3+ is reachable at max level without needing to pin the exact odds (which live in `economy.json`'s `shopOdds` table and are tested for their exact values elsewhere, if at all — this test only proves non-zero reachability).
- **"shop has correct number of slots"**: `player.shop.length === gameData.economy.shopSlots` — confirms the shop's slot COUNT is read from data (not hardcoded to 5 in `rules` code), consistent with CLAUDE.md's "all tuning numbers live in packages/data" invariant.

**Invariants & constraints** — The level-1 test's zero-tolerance design (50/50 rolls must ALL be tier 1) is appropriate specifically because tier-1-only-at-level-1 should be an ABSOLUTE gate, not a probabilistic tendency — if `shopOdds`'s level-1 row ever has a non-zero weight for tier 2+, this test fails immediately on the very first violating roll. The level-9 test's 200-roll budget with early-exit is a pragmatic balance between keeping the test fast and making a false negative (tier 3+ truly reachable but not observed) implausibly unlikely given the actual configured odds.

**Depends on** — `vitest`; `@autobattler/data` (`gameData`); `../src/match.js` (`createMatch`); `@autobattler/sim/src/prng.js` (`mulberry32`); `../src/shop.js` (`rollShop`, the function under test).

**Used by** — Not imported elsewhere; runs under `npm test`.

**Notes** — This suite does NOT test `rollTier`'s or `pickDefIdForTier`'s exact weighted-probability math directly (no statistical-distribution-shape assertions like the rarity-weighting test in `pve.test.ts`) — it only tests the OBSERVABLE BOUNDARY behavior (tier-1 floor at level 1, tier-3+ ceiling reachability at level 9). A reader wanting to verify EXACT shop-odds percentages would need to consult `economy.json`'s `shopOdds` table directly or write a new statistical test, since this file intentionally stays at the coarse sanity-check level.
