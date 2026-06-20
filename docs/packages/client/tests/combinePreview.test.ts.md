# Path & purpose

`packages/client/tests/combinePreview.test.ts` -- unit tests for `combinePreview.ts`'s two pure functions, `combinePreview(aId, aIndex, bId, bIndex, data)` and `equipPreview(itemId, heldIds, data)`, which preview the result of combining two inventory items or equipping an item onto a unit, WITHOUT mutating any state or sending any command -- using a REAL recipe pulled from `gameData.items` so the test tracks the actual content rather than a synthetic fixture.

# Responsibility

Owns: regression coverage proving the combine/equip preview logic correctly wraps `@autobattler/data`'s pure `recipeResult` lookup -- returning the right completed-item result for a valid pair (order-independently), the right typed failure reason (`"no-recipe"` vs `"same-entry"`) for invalid pairs, and the right equip outcome (`"add"` plain vs `"combine"` auto-merge-in-place, or `null` for an unrecognized item id) for the equip-preview path.

# Exports

None (a Vitest test file). At module scope, picks the FIRST item in `gameData.items` that has a `recipe` field (`gameData.items.find(i => i.recipe)!`) and destructures its two component ids into `a`/`b` -- using real, live game data rather than a hand-built fixture, so this test automatically tracks whatever the actual recipe data currently contains.

# Key behavior

**`combinePreview` suite**:
- "previews the completed item for a valid component pair": `combinePreview(a, 0, b, 1, gameData)` returns `{ok:true, result:{id: recipe.id, ...}}` -- the SAME completed-item id the real recipe pair produces.
- "is order-independent (matches recipeResult)": calling with the operands SWAPPED (`combinePreview(b, 0, a, 1, ...)`) still succeeds and its `result.id` matches `recipeResult(a, b, gameData.items)` (the data package's own pure recipe lookup, called directly as a cross-check) -- confirming `combinePreview` doesn't care which of the two items is "A" vs "B" when resolving the unordered recipe pair, mirroring `recipeResult`'s own unordered-pair semantics.
- "reports no-recipe for a pair with no recipe": `combinePreview(a, 0, a, 1, gameData)` (the SAME component id used for both sides, at different indices) returns `{ok:false, reason:"no-recipe"}` -- the test's comment clarifies WHY this is guaranteed to have no recipe: "two copies of the same single component never form a recipe in this data" (an assumption about the current recipe data, not a hardcoded rule enforced anywhere else -- if a future recipe were ever added pairing a component with itself, this assumption would need revisiting, though that would be an unusual design choice).
- "never combines an entry with itself (same index)": `combinePreview(a, 2, b, 2, gameData)` (note: BOTH calls pass index `2`, i.e. the SAME inventory slot referenced twice) returns `{ok:false, reason:"same-entry"}` -- this is a DISTINCT failure mode from "no-recipe": even if `a` and `b` WOULD form a valid recipe together, referencing the identical inventory index for both operands is always rejected (you can't combine an item with itself), checked and reported with its own specific reason code BEFORE the recipe lookup even matters.

**`equipPreview` suite**:
- "plain add when the unit holds nothing that completes a recipe": `equipPreview(a, [], gameData)` (empty `heldIds` -- the target unit holds no items at all) returns `{kind:"add", result:{id: a}}` -- equipping onto an empty unit is just a plain add of that exact item, no combination triggered.
- "auto-combine in place when a held component completes a recipe": `equipPreview(a, ["__filler__", b], gameData)` (the unit already holds two items: a non-recipe-relevant `"__filler__"` placeholder at slot 0, and `b` -- the recipe partner for `a` -- at slot 1) returns `{kind:"combine", slot:1, result:{id: recipe.id}}` -- confirming the preview correctly (a) SCANS the held items to find one that completes a recipe with the incoming item, (b) correctly identifies slot `1` (not slot 0, where the irrelevant filler sits) as the combination target, and (c) resolves the correct completed-item id. This directly mirrors the rules-layer EQUIP auto-combine behavior described in CLAUDE.md ("EQUIP moves an inventory item onto a unit... but auto-combines in place if the unit already holds a component that completes a recipe with it").
- "returns null for an unknown incoming item id": `equipPreview("__nope__", [], gameData)` returns `null` -- an item id that doesn't exist in `gameData.items` at all produces no preview rather than throwing or returning some "add" attempt with garbage data; this is the defensive baseline for an invalid/unrecognized id.

# Invariants & constraints

- This suite deliberately tests against REAL content (`gameData.items.find(i => i.recipe)`) rather than a synthetic fixture -- per its own comment, "so the test tracks content": if `data/items.json`'s recipes are ever restructured (e.g. all single-component-pairing recipes removed, or item ids renamed), this test will pick up whatever recipe item happens to be FIRST in the array at the time, meaning its behavior is somewhat data-order-dependent but its ASSERTIONS remain valid regardless of which specific recipe is picked (none of the assertions hardcode a specific item id beyond what's derived from the data itself).
- The "no-recipe" test's correctness relies on an UNVERIFIED ASSUMPTION about the current data ("two copies of the same component never form a recipe") -- this is a soft coupling to data content rather than an enforced game rule; a reader changing `items.json` to add a self-pairing recipe (e.g. two `iron_sword`s combining into something) would need to revisit this specific test, though such a change would be unusual.
- `combinePreview`'s `"same-entry"` check (rejecting identical INDICES, not identical ids) is checked independently of and likely BEFORE the recipe lookup -- the test deliberately uses `a`/`b` (which DO form a valid recipe pair) at the SAME index to isolate that this specific guard fires even when the underlying items would otherwise combine successfully; a reader should not conflate "same-entry" (same inventory slot referenced twice) with "no-recipe" (different slots, but the pair has no valid recipe) -- they are two genuinely distinct rejection paths with distinct reason codes.

# Depends on

- `vitest` (`describe`, `it`, `expect`).
- `@autobattler/data` (`gameData`, `recipeResult`) -- both the live game-content data and the pure data-package recipe lookup used as an independent cross-check.
- `../src/combinePreview.js` (`combinePreview`, `equipPreview`).

# Used by

Not imported by any other file (a leaf test file); run as part of the client package's `npm test`/vitest suite.

# Notes

- This test exercises the client-side PREVIEW logic only -- it does not (and cannot, being a pure-function unit test) verify that the actual rules-layer `COMBINE_ITEMS`/`EQUIP` commands produce the SAME outcome the preview predicted; that end-to-end consistency depends on `combinePreview.ts`'s implementation staying in sync with `rules/commands.ts`'s real auto-combine logic, which is a manual-sync risk noted in `combinePreview.ts`'s own doc (mirrors rules' auto-combine without mutating, not via a shared single-source function).
- The `"__filler__"`/`"__nope__"` placeholder strings are clearly intentional sentinel values (not real item ids) chosen to be obviously non-matching in the recipe system -- a reader should recognize this naming convention (double-underscore-wrapped) as this test suite's idiom for "a deliberately irrelevant/invalid placeholder," not a real data fixture.
