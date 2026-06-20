# Path & purpose

`packages/client/src/consumablePicker.ts` -- pure routing logic for the `radiant_enhancer` consumable's drop flow (phase 2 consumables): decides whether dropping the consumable onto a unit should open an item-picker overlay or send the command directly.

# Responsibility

Owns ONLY the UI routing decision for one specific consumable item (`radiant_enhancer`): given the unit it's being dropped on, determines whether there are multiple eligible target items requiring player disambiguation (picker) or zero eligible items (send anyway, let the server reject). Never decides legality itself and never constructs/sends any command -- that responsibility belongs to the caller (which fires `USE_CONSUMABLE`) and ultimately the server/rules layer (which is the actual authority on whether the consumable's effect can apply).

# Exports

- `type RadiantDropRoute = { kind: "picker"; items: ItemModel[] } | { kind: "send" }` -- the routing decision: `picker` carries the list of eligible target items to show in a disambiguation overlay; `send` means fire the command immediately with no target item id.
- `function radiantDropRoute(unit: UnitInstance, data: GameData): RadiantDropRoute` -- the sole routing function. Calls `tier2EquippedItems(unit, data)` (from `itemModel.ts`) to get the unit's equipped completed (tier-2) items; if 1 or more exist, returns `{kind:"picker", items}` so the caller can let the player choose `targetItemId`; if zero exist, returns `{kind:"send"}` so the caller fires `USE_CONSUMABLE` with no `targetItemId` and lets the server reject with the typed error `NO_TIER_2_ITEMS_EQUIPPED` (surfaced via the normal toast path).

# Key behavior

A single pure, synchronous decision function with no side effects, no Pixi, and no command construction. It NEVER blocks or short-circuits the actual consumable-use flow -- even in the zero-items case, it still tells the caller to proceed (`send`), deliberately deferring the real legality check to the server. This mirrors the project-wide invariant that command legality is server/rules-authoritative; this file's only job is choosing whether a picker step is needed BEFORE the command is sent, not whether the command will succeed.

# Invariants & constraints

- Must never duplicate or pre-empt server-side legality checks -- the comment is explicit: "this only decides WHICH already-equipped items to show in the picker overlay, never whether the consumable's effect is legal (that's server/rules-decided)." If this file's notion of "eligible item" (tier === "completed") ever diverges from the actual rules-side definition of what `radiant_enhancer` can legally target, the picker could offer items the server would reject, or fail to offer ones it would accept -- the eligibility filter must be kept in sync with `packages/rules`'s actual `USE_CONSUMABLE`/`radiant_enhancer` validation.
- Depends on `tier2EquippedItems` (in `itemModel.ts`) for the eligibility filter, which itself is documented there as "Pure UI-routing helper... Never used to block/branch the command itself" -- the same non-authoritative framing applies transitively.
- This logic is specific to ONE consumable (`radiant_enhancer`) -- the function name and module are not generic; a future second consumable with its own targeting needs would likely need its OWN routing function/module rather than extending this one, unless the picker pattern is generalized.

# Depends on

`@autobattler/data` (type `GameData`). `@autobattler/sim/src/types.js` (type-only: `UnitInstance`). `./itemModel.js` (`tier2EquippedItems` -- the equipped-completed-items filter; type `ItemModel`).

# Used by

`packages/client/src/scenes/match.ts` (the consumable drag/drop flow: dropping a `radiant_enhancer` chip onto a board/bench unit calls `radiantDropRoute` to decide whether to open a picker overlay before firing `USE_CONSUMABLE`, or to fire it immediately).

# Notes

- The phase tag ("phase 2 consumables") in the header comment indicates this is part of a distinct, later development phase than the core item system (phase 10b) -- consumables are a separate item category from the equip/combine system documented elsewhere (`combinePreview.ts`, `itemModel.ts`).
- The file intentionally mirrors the established `itemModel.ts`/`inventoryModel` pattern of "plain functions over `GameData` + a `UnitInstance`" -- consistent with the codebase's broader convention of pure, unit-testable presentation-logic modules feeding the Pixi render layer.
