# Path & purpose

`packages/client/tests/itemModel.test.ts` -- unit tests for `itemModel.ts`'s pure item-display derivations: `itemModel(id, data)` (item id -> a full display model), `inventoryModel(items, data)` (a player's loose-item id array -> indexed display entries), `equippedSlots(unit, max, data)` (a unit's equipped items vs the slot cap), `passiveDescription(passive)` (passive-effect prose), and `itemStatLines(stats)` (a stat bundle -> fixed-point-safe display lines).

# Responsibility

Owns: regression coverage that `itemModel` correctly distinguishes a base component from a completed item (distinct boolean flag + distinct color tint), surfaces a completed item's passive description only when it actually has one, formats stat bundles through the fixed-point-safe formatter (attack speed scaled, not raw), and produces correct passive prose for both supported passive kinds; that `inventoryModel` preserves array order/index (so a UI index always maps back to a valid command target) and silently drops unknown ids; and that `equippedSlots` correctly reports occupancy/free-slots/full-at-cap.

# Exports

None (a Vitest test file). Module-scope fixtures pulled from REAL `gameData.items` content: `component` (first item with `.component` truthy), `completed` (first item with BOTH `.recipe` AND `.passive` truthy -- a completed item that actually carries a passive), `completedNoPassive` (first item with `.recipe` truthy but `.passive` falsy -- a completed item WITHOUT a passive, needed to test the "none for stat-only items" case distinctly from a pure base component).

# Key behavior

**`itemModel` suite**:
- "returns null for an unknown item id": `itemModel("__nope__", gameData)` is `null`.
- "marks a base component vs a completed item with distinct tints": `component`'s model has `.component===true`; `completed`'s model has `.component===false`; their `.color` values differ -- confirms the boolean flag AND the visual tint both correctly distinguish the two item categories.
- "surfaces a completed item's passive, none for stat-only items": the `completed` fixture's `.passive` is NOT null (it has a real passive per its selection criteria); `completedNoPassive`'s `.passive` IS null (a completed item that simply has no passive); the plain `component`'s `.passive` IS null (components never carry passives) -- three distinct cases proving the passive field's presence tracks the DATA's `passive` field exactly, not just "is this item completed."
- "formats stat bundles fixed-point-safe (attack speed divided)": finds the first real item whose stat bundle includes a non-null `as` (attack speed) value, calls `itemStatLines` directly on its stats, finds the `"Attack Speed"`-labeled line, and confirms its value string equals `"+${(stats.as/1000).toFixed(2)}"` -- e.g. a raw fixed-point `150` renders as `"+0.15"`, NEVER the raw integer -- consistent with the project-wide `statFormat.ts`/`formatStatDelta` fixed-point convention applied to item stat grants too.
- "describes both passive kinds": `passiveDescription({kind:"burn", value:30, duration:40})` matches `/burn/`; `passiveDescription({kind:"shield", value:200, duration:60})` matches `/shield/` -- the two passive kinds the engine supports per CLAUDE.md ("on-hit `burn` or `shield` start-of-combat").

**`inventoryModel` suite**:
- "preserves array order so an index maps back to a command target": building an inventory id list `[component.id, completed.id, component.id]` (the SAME component id appearing twice, at positions 0 and 2), confirms the resulting entries' `.index` values are EXACTLY `[0,1,2]` (sequential, matching source array position) and `.id` values exactly match the input array in order -- proving `inventoryModel` does NOT deduplicate or reorder; each entry's `index` is a stable, position-faithful pointer back into the ORIGINAL array, which is essential because the UI uses this index as the literal command target (e.g. for `COMBINE_ITEMS`/`EQUIP` referencing a specific inventory SLOT, not just an item id, since the same id can appear multiple times).
- "drops unknown ids": an input array `[component.id, "__nope__"]` produces an inventory with length `1` containing only the resolved `component` entry -- the unknown id is silently skipped (NOT represented as a null placeholder), which means a consumer reading `inv[i].index` must NOT assume `i` equals the original array position when unknown ids might be present (since dropped entries shift subsequent indices in the OUTPUT array, even though each entry's OWN `.index` field still correctly reflects its true original position).

**`equippedSlots` suite** (using a `unitWith(items)` helper building a minimal `UnitInstance` stub cast `as UnitInstance` carrying only an `items` array):
- "reports occupancy + free slots vs the cap": a unit with 1 item and `max=3` reports `items` length `1`, `max:3`, `free:2`, `full:false`.
- "is full at the cap": a unit with exactly 3 items (component, completed, component again) and `max=3` reports `full:true`, `free:0`.

# Invariants & constraints

- `itemModel.ts`'s `ItemTier` type (`"component"|"completed"|"radiant"|"artifact"|"mythical"|"consumable"`) and its `tierOf`/`colorForTier`/`consumableDescription`/`tier2EquippedItems` machinery represent a SUBSTANTIALLY larger item-system surface than CLAUDE.md's documented "9 stat-only components + 36 completed items" description -- this test file's fixtures and assertions only exercise the `component`/`completed` (with and without a passive) cases; it does NOT exercise `radiant`/`artifact`/`mythical`/`consumable` tiers at all, despite `itemModel.ts`'s source containing dedicated logic for all of them (e.g. `tierOf`'s radiant detection via an `id.startsWith("radiant_")` prefix check on items whose loader-reported kind is literally `"completed"`; `colorForTier`'s explicit placeholder-color comment for artifact/mythical "have no dedicated client color yet"; `consumableDescription`'s three named consumable effects `remove_item`/`reforge`/`radiant_upgrade`; `tier2EquippedItems`'s dedicated radiant_enhancer-targeting helper). A reader working on the consumable/radiant item system should treat THIS test file as incomplete coverage for those paths and verify behavior by reading `itemModel.ts`'s source directly rather than assuming this test file documents the full surface.
- `inventoryModel`'s index-preservation guarantee is THE load-bearing property enabling duplicate item ids to coexist safely in a player's inventory and still be individually addressable by UI commands -- any future refactor of `inventoryModel` must preserve "dropped entries don't renumber surviving entries' OWN index fields" even though the OUTPUT array's own array-position no longer aligns 1:1 with the original input once an unknown id is present.
- `equippedSlots`'s `max` parameter is deliberately passed in by the caller (mirroring `MAX_ITEMS_PER_UNIT` from the rules layer) specifically so `itemModel.ts` stays free of any import from `@autobattler/rules`, per its own doc comment -- a reader should pass the REAL `MAX_ITEMS_PER_UNIT` constant value at call sites, not assume `equippedSlots` enforces any cap on its own.

# Depends on

- `vitest` (`describe`, `it`, `expect`, `toBeNull`, `toBe`, `not.toBe`, `not.toBeNull`, `toMatch`, `toEqual`, `toHaveLength`).
- `@autobattler/data` (`gameData`).
- `@autobattler/sim/src/types.js` (`UnitInstance` type, for the `equippedSlots` stub fixture).
- `../src/itemModel.js` (`itemModel`, `inventoryModel`, `equippedSlots`, `passiveDescription`, `itemStatLines`).

# Used by

Not imported by any other file (a leaf test file); run as part of the client package's `npm test`/vitest suite. Indirectly validates the model consumed by `scenes/match.ts`'s item inventory bar (`inventoryModel`), `inspectPanel.ts`'s equipped-items rows and item-detail modal (`itemModel`, `passiveDescription`), and `unitToken.ts`'s equipped-item dots.

# Notes

- The fixture-selection pattern (`gameData.items.find(...)` for `component`/`completed`/`completedNoPassive`) follows this test suite's established idiom of testing against REAL content rather than synthetic fixtures (seen also in `combinePreview.test.ts`/`itemIcon.test.ts`) -- trading exact-id specificity for automatic tracking of real data changes.
- This file, combined with `itemIcon.test.ts`'s discovery of the `radiant_` prefix convention and `consumable`/`artifact`/`mythical` item kinds, strongly suggests the item system has grown a full consumable/upgrade-tier mechanic (item_remover, reforger, radiant_enhancer per `itemModel.ts`'s own doc comment) beyond what CLAUDE.md currently documents -- a reader needing the COMPLETE picture of this newer system should read `packages/data/items.json`, `itemKind`'s implementation, and the rules-layer `USE_CONSUMABLE` command handling directly, none of which this documentation pass has yet covered by file path.
