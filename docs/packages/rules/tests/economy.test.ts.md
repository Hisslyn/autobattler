# packages/rules/tests/economy.test.ts

**Path & purpose** — `packages/rules/tests/economy.test.ts`. Known-answer Vitest suite for `economy.ts`'s `calcIncome` and `levelForXp`, pinning the EXACT numeric behavior of the live `economy.json` tuning values (base income, interest cap/rate, streak bonus breakpoints, level thresholds).

**Responsibility** — Regression-guards the economy formulas against both logic bugs AND accidental `economy.json` tuning changes — since every test asserts a SPECIFIC expected number (not just "is greater than X"), any future edit to `economy.json`'s `baseIncome`/`interestPer`/`interestCap`/`streakTable`/`levelXpThresholds` that changes these specific values will fail this suite, forcing a deliberate test update alongside the data change.

**Exports** — None (test file). Internal helper `makePlayer(overrides={})` builds a fully-populated zeroed `PlayerState` (all fields explicitly defaulted: `hp:100, gold:0, xp:0, level:1`, empty bench/board/items/shop, zero streaks, `alive:true`, `lastBoard:null`, `placement:null`, zeroed match-stat accumulators) with any test-specific overrides spread on top — useful as a reference for the FULL `PlayerState` shape when constructing test fixtures elsewhere.

**Key behavior / test coverage — pins these EXACT live `economy.json` values:**
- `baseIncome = 5` (zero gold, zero streak → income exactly 5).
- `interestPer = 10`, `interestCap = 5`: 50 gold → +5 interest (capped, since `floor(50/10)=5` exactly hits the cap); 100 gold → STILL +5 (confirms the cap, not just coincidentally hitting 5); 23 gold → +2 interest (`floor(23/10)=2`, uncapped partial case).
- `streakTable` breakpoints (pinned exactly): win-streak 2 → +1 bonus; win-streak 3 → +2 bonus; win-streak 5 (and by extension "5+") → +3 bonus; lose-streak 3 → +2 bonus (confirms lose streaks use the SAME bonus curve as win streaks at the same length, per `economy.ts`'s documented lack of win/lose-specific differentiation).
- Combined case: 30 gold (+3 interest) + win-streak 3 (+2 bonus) + 5 base = 10 total — confirms additive composition of all three income components.
- `levelForXp`: 0 xp → level 1; XP exactly at `levelXpThresholds[1]` (defaulting to 2 if that index doesn't exist, though it should) → level 2 (note: index `[1]` corresponds to level 3's threshold per `economy.ts`'s indexing convention — wait, actually per `levelForXp`'s loop, `thresholds[i]` is the xp needed for level `i+1`, so `thresholds[1]` is the threshold for level 2 — the test's comment "at first threshold" combined with using index `[1]` and expecting level 2 is CONSISTENT with that indexing, i.e. `thresholds[0]` would be level 1's threshold which is trivially 0/already met, so the first MEANINGFUL threshold to test against is index `[1]` for level 2); 9999 xp (an arbitrarily large number, presumably beyond the last configured threshold) → level 9 (confirms `levelXpThresholds` has at least 9 entries / max level is 9, and that `levelForXp` correctly clamps at the top rather than erroring or extrapolating).

**Invariants & constraints** — This file's value is ENTIRELY in being a known-answer pin against live content; the formulas themselves are documented in `economy.ts`'s own doc. Any reader needing exact current tuning numbers (base income, interest mechanics, streak bonuses, max level) can treat this file as a reliable, executable source of truth, more concrete than prose.

**Depends on** — `vitest`; `@autobattler/data` (`gameData`, for the live `economy.json` values under test); `../src/economy.js` (`calcIncome`, `levelForXp`, the functions under test); `../src/state.js` (`PlayerState` type, for `makePlayer`'s return type).

**Used by** — Not imported elsewhere; runs under `npm test`.

**Notes** — The max-level test using `9999` as an arbitrarily-large XP value confirms max level is 9 for the CURRENT `economy.json` — if a future content update extends `levelXpThresholds` to support a higher max level, this specific assertion (`toBe(9)`) would need updating; it's a deliberately content-coupled test by design (per this suite's stated purpose), not a bug.
