# packages/rules/tests/commands.test.ts

**Path & purpose** — `packages/rules/tests/commands.test.ts`. Vitest suite covering core command legality/rejection paths in `commands.ts`'s `applyCommand`: BUY (gold/empty-slot/bench-full/merge-completes-despite-full-bench), MOVE (board cap), SELL (refund + removal, not-found rejection), REROLL/BUY_XP (gold gates), the universal `PHASE_INVALID` gate across every command outside PLANNING, and EQUIP's missing-item rejection.

**Responsibility** — Regression-guards the most load-bearing legality branches of `applyCommand` using REAL game data, ensuring every documented `CommandError` actually fires under the right conditions and that rejected commands leave state unchanged where claimed.

**Exports** — None (test file). Internal helper `makeUnit(uid, defId)` builds a minimal star-1 `UnitInstance` with empty `items: []` from a real unit def (same shape pattern as `combine.test.ts`'s helper, simpler since these tests don't need pre-equipped items).

**Key behavior / test coverage**
- **BUY**:
  - Insufficient gold (`gold=0`) against any populated shop slot → `INSUFFICIENT_GOLD`.
  - Buying an explicitly-nulled slot (`shop[4] = null`) → `EMPTY_SLOT`.
  - A FULL 9-unit bench (9 distinct defIds, no possible merge) blocks a 10th distinct purchase with `BENCH_FULL`, and confirms the bench length stayed exactly 9 (no partial mutation).
  - A FULL 9-unit bench WHERE 2 of the 9 are already the SAME defId as the shop slot being bought (so buying completes a 3-copy merge) SUCCEEDS despite the bench being nominally full — confirms `player.bench.length <= 9` after (net change ≤ 0) and that a star-2 unit of that defId now exists on the bench — this is the direct test of the "bench-full but purchase completes a merge" carve-out documented in `commands.ts`.
- **MOVE**: moving a bench unit onto the board when the board is ALREADY at the level-1 cap (1 unit already occupying board slot 0) → `BOARD_FULL`.
- **SELL**: selling an existing bench unit succeeds, removes it from bench (`length` drops to 0), and STRICTLY increases gold (`toBeGreaterThan(goldBefore)` — doesn't assert the exact refund amount, just that a positive refund happened). Selling a non-existent uid (999999) → `UNIT_NOT_FOUND`.
- **REROLL**: insufficient gold (`gold=0`) → `INSUFFICIENT_GOLD`.
- **BUY_XP**: insufficient gold (`gold=0`) → `INSUFFICIENT_GOLD`.
- **Universal phase gate**: builds a representative command list (BUY/SELL/REROLL/BUY_XP/MOVE/EQUIP) against a player with valid gold/bench/items, then for EACH of `COMBAT` and `RESOLUTION` phases, asserts EVERY command in the list returns `{ok:false, error:"PHASE_INVALID"}` — and as a sanity check, switches back to `PLANNING` and confirms a `BUY_XP` now succeeds, proving the rejection was genuinely phase-gated and not some unrelated setup bug.
- **EQUIP**: equipping an item the player's inventory doesn't contain (`items: []`, requesting `iron_sword`) → `ITEM_NOT_FOUND`.

**Invariants & constraints** — No new invariants beyond what's exercised; this is a focused legality-and-rejection regression suite, complementing `combine.test.ts` (items/recipes), `pve.test.ts` (PvE flow), `pairing.test.ts` (matchmaking fairness), and `roundStats.test.ts` (per-round stat accumulation) to cover `commands.ts`/`rounds.ts` collectively.

**Depends on** — `vitest`; `@autobattler/data` (`gameData`); `../src/match.js` (`createMatch`); `../src/commands.js` (`applyCommand`, system under test); `@autobattler/sim/src/prng.js` (`mulberry32`, fixed seed=1, unused by the commands tested here beyond satisfying the signature); `@autobattler/sim/src/types.js` (`UnitInstance` type for `makeUnit`).

**Used by** — Not imported elsewhere; runs under `npm test`.

**Notes** — The bench-full tests directly clear the default starting-unit bench entry (`player.bench = []`) before constructing their specific scenario, since `createMatch` always seeds bench slot 0 with one starting unit — any new test in this file manipulating `bench` from a freshly created match needs to account for that pre-existing entry the same way (a common footgun if a future test forgets to clear it first and gets an unexpected 10th bench entry / off-by-one).
