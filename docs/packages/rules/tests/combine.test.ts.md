# packages/rules/tests/combine.test.ts

**Path & purpose** — `packages/rules/tests/combine.test.ts`. Vitest suite covering the item recipe/combination system end-to-end: the pure `recipeResult` resolver from `@autobattler/data`, plus `commands.ts`'s `COMBINE_ITEMS`, `EQUIP` (including its auto-combine-in-place behavior), and `UNEQUIP` command handlers.

**Responsibility** — Verifies that loose component combination, equip-time auto-fusion, the item slot cap, and unequip all behave per the documented contract — using REAL game data (`gameData` from `@autobattler/data`, not mocked/synthetic items), so these tests double as a regression check against any future change to `items.json`'s recipe definitions.

**Exports** — None (test file; no symbols consumed elsewhere). Internal helper `makeUnit(uid, defId, items=[])` builds a minimal star-1 `UnitInstance` from a real unit def for test setup (mirrors the shape `commands.ts`'s BUY/`tryAutoMerge` construct, with optional pre-equipped items).

**Key behavior / test coverage**
- **`describe("recipe resolver")`** (tests `recipeResult` directly, not through commands):
  - Confirms known component pairs resolve to their completed item id REGARDLESS of argument order (`iron_sword`+`chain_vest` and `chain_vest`+`iron_sword` both → `iron_sword__chain_vest`) — the unordered-pair contract.
  - Confirms non-recipe pairs return `null`: same component twice (`iron_sword`+`iron_sword`), a completed item paired with one of its own components (`iron_sword__chain_vest`+`iron_sword`), and a bogus id (`iron_sword`+`not_an_item`).
  - Exhaustively verifies EVERY completed item in `gameData.items` that has a `recipe` field resolves correctly from its OWN two recipe component ids — a full-coverage regression guard: if a future content edit changes/breaks a recipe pairing, this test catches it immediately.
- **`describe("COMBINE_ITEMS")`** (through `applyCommand`):
  - Two loose components in inventory (`["iron_sword","chain_vest"]`) combine into one completed item (`["iron_sword__chain_vest"]`) — confirms the inventory array shrinks from 2 entries to 1.
  - A non-recipe pair (two `iron_sword`s) is rejected with `NO_RECIPE` and the inventory is left UNCHANGED (still `["iron_sword","iron_sword"]`) — confirms `COMBINE_ITEMS` doesn't partially mutate on rejection.
  - Combining against a component NOT actually in inventory (`chain_vest` requested but inventory only has `iron_sword`) is rejected with `ITEM_NOT_FOUND`.
- **`describe("EQUIP auto-combine + slot cap")`**:
  - Equipping a component onto a unit ALREADY holding its recipe partner fuses in place: unit ends with ONE slot occupied by the completed item (`["iron_sword__chain_vest"]`), and the incoming component is removed from inventory — net equipped-slot count unchanged (1 slot before, 1 slot after, just upgraded).
  - The auto-combine path works EVEN WHEN the unit is already at the 3-item cap (`["iron_sword","recurve_bow","negatron_cloak"]`, 3 items): equipping `chain_vest` (which fuses with the held `iron_sword`) still succeeds, the unit ends with EXACTLY 3 items (one of which is now the completed `iron_sword__chain_vest`) — this is the literal proof of the documented "auto-combines in place... allowed even at the cap" rule.
  - A NON-combining equip onto an ALREADY-FULL unit (3 completed items, none of which can fuse with the incoming `mana_crystal`) is rejected with `ITEM_SLOTS_FULL`, and the player's inventory is left unchanged (`mana_crystal` still in `player.items`).
- **`describe("UNEQUIP")`**:
  - Removes a specific item id from a unit's equipped list and pushes it back to inventory (unit goes from `["iron_sword","chain_vest"]` to `["chain_vest"]`; inventory goes from `[]` to `["iron_sword"]`).
  - Rejects with `ITEM_NOT_FOUND` when the unit doesn't hold the requested item id.

**Invariants & constraints** — This file doesn't assert NEW invariants beyond what `commands.ts` already implements; it's a behavioral regression suite. Notably exercises REAL recipe pairs from the live `items.json` (`iron_sword`/`chain_vest`/`recurve_bow`/`negatron_cloak`/`giants_belt`/`tear_flask`/`mana_crystal`/`sorcerer_rod`), so a future edit to those specific items' ids/recipes would need this test updated alongside the data change.

**Depends on** — `vitest` (`describe`/`it`/`expect`); `@autobattler/data` (`gameData`, `recipeResult`); `../src/match.js` (`createMatch`, for realistic `MatchState` setup); `../src/commands.js` (`applyCommand`, the system under test); `@autobattler/sim/src/prng.js` (`mulberry32`, a fixed seed=1 `prng` shared across all tests in the file — combine/equip/unequip commands don't actually consume randomness, so the specific seed value is inconsequential, just needed to satisfy `applyCommand`'s signature); `@autobattler/sim/src/types.js` (`UnitInstance` type, for `makeUnit`).

**Used by** — Not imported by any other module; run as part of `npm test` (vitest discovers `*.test.ts` files in `packages/rules/tests/`).

**Notes** — `makeUnit` constructs units with hardcoded test uids in the 7000s range (7001-7005), deliberately distinct from the match's real `nextUid` counter (which starts at 10000 per `match.ts`) to avoid any accidental collision, though since each test creates its OWN fresh `createMatch` state, collision wasn't actually a risk here — the choice reads as a defensive/clarity convention rather than a necessity.
