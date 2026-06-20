# packages/rules/tests/items.test.ts

**Path & purpose** — `packages/rules/tests/items.test.ts`. Small Vitest suite covering the PvE-loot-to-inventory-to-equip pipeline end-to-end: confirms a PvE round's gold/item grants are well-formed, and that a granted/seeded item can then be EQUIPped onto a freshly bought unit.

**Responsibility** — Integration-style regression check spanning `rounds.ts`'s `runPveRound` (via `match.ts`'s `advancePhase`), `loot.ts`'s `applyLootOrb`, and `commands.ts`'s BUY/EQUIP — verifying the pieces compose correctly across a real PLANNING→RESOLUTION→PLANNING round cycle rather than testing any one function in isolation.

**Exports** — None (test file).

**Key behavior / test coverage**
- **"awards pveBaseGold and only valid inventory item ids on a PvE round"**: creates a match with seed 11 (confirmed `state.round === 1`, i.e. round 1 IS a PvE round per the stage schedule — round 1-3 are always PvE), calls `advancePhase` ONCE (PLANNING→COMBAT→RESOLUTION, running the PvE round synchronously inside that single call), then for EVERY player (not just alive ones — though at round 1 all 8 are alive) asserts `gold >= economy.pveBaseGold` (the flat per-round PvE gold floor — `>=` rather than `===` since starting gold plus PvE gold could exceed the flat amount) and that EVERY item id in `player.items` is a real id present in `gameData.items` (built into a `Set` for O(1) lookup) — a sanity check that `generateLoot`'s weighted picks never produce a malformed/unknown item id.
- **"a granted item equips onto a unit and leaves the inventory"**: advances through one FULL round cycle (PLANNING→RESOLUTION via the first `advancePhase`, then RESOLUTION→PLANNING via the second) to get back into a buyable PLANNING phase, then deliberately OVERWRITES `player.items` to a known, deterministic value (`["iron_sword"]`) rather than relying on whatever the PvE loot RNG happened to produce — explicitly decoupling this test's correctness from loot randomness. Buys a unit from the shop (first non-null slot), then EQUIPs the seeded `iron_sword` onto the newly bought unit, and confirms the item lands on the unit (`unit.items` contains it) and leaves the inventory (`player.items` no longer contains it) — a basic BUY-then-EQUIP composition check.

**Invariants & constraints** — Demonstrates a useful testing PATTERN worth reusing: when a test needs deterministic item state but the natural path to acquire items (PvE loot) is randomized, directly overwrite `player.items` rather than trying to control the loot RNG indirectly — this keeps the test focused on the command logic under test (EQUIP) rather than coupling it to loot table contents.

**Depends on** — `vitest`; `@autobattler/data` (`gameData`); `../src/match.js` (`createMatch`, `advancePhase`); `../src/commands.js` (`applyCommand`); `@autobattler/sim/src/prng.js` (`mulberry32`, seed 3 — used only to satisfy `applyCommand`'s signature for BUY/EQUIP, neither of which consumes randomness itself).

**Used by** — Not imported elsewhere; runs under `npm test`.

**Notes** — The first test iterates `state.players` (not filtered by `alive`) — harmless here since round 1 has no eliminations yet, but a reader adapting this pattern to a LATER round should remember to filter by `alive` (PvE rounds in `rounds.ts` itself DO filter by `alive` internally; this test's loop just happens to coincide with all players being alive at round 1).
