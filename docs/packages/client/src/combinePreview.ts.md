# Path & purpose

`packages/client/src/combinePreview.ts` -- pure combine-preview resolver (phase 10b item system): wraps the data package's `recipeResult` lookup so the drag-and-drop UI layer can preview what combining two items (or equipping one onto a unit) would produce, without performing the actual combine/equip command.

# Responsibility

Owns the PREVIEW logic only -- given two item ids (or an incoming item + a unit's currently-held items), determines whether a recipe match exists and what the resulting completed item would look like. The actual mutation (fusing components, equipping onto a unit) is performed server/rules-side via `COMBINE_ITEMS`/`EQUIP` commands (`packages/rules/src/commands.ts`); this module never sends commands or mutates state -- it only mirrors the rules' decision logic so the UI can render an accurate "would combine into X" or "no recipe" hint before the player commits.

# Exports

- `type CombinePreview = { ok: true; result: ItemModel } | { ok: false; reason: "same-entry" | "no-recipe" }` -- the discriminated result of previewing a two-item combine.
- `function combinePreview(aId: string, aIndex: number, bId: string, bIndex: number, data: GameData): CombinePreview` -- previews combining the inventory item at index `aIndex` (id `aId`) with the one at `bIndex` (id `bId`). Returns `{ok:false, reason:"same-entry"}` immediately if `aIndex === bIndex` (dragging an item onto itself is never a combine, checked by INDEX not id, since duplicate ids can occupy different inventory slots). Otherwise calls `recipeResult(aId, bId, data.items)`; if no recipe exists, returns `{ok:false, reason:"no-recipe"}`; if a recipe exists but the resulting item id somehow fails to resolve via `itemModel` (defensive, shouldn't normally happen), ALSO returns `{ok:false, reason:"no-recipe"}` (the result-resolution failure is folded into the same reason rather than getting its own case); otherwise returns `{ok:true, result: <ItemModel>}`.
- `function equipPreview(itemId: string, heldIds: readonly string[], data: GameData): { kind:"combine"; slot:number; result:ItemModel } | { kind:"add"; result:ItemModel } | null` -- previews equipping a loose inventory item onto a unit that already holds `heldIds`. Resolves the incoming item's model first (`itemModel(itemId, data)`); returns `null` only if the incoming id itself is unknown/unresolvable. Then scans `heldIds` in order; for the FIRST held item that completes a recipe with the incoming item (via `recipeResult`), returns `{kind:"combine", slot: <that held item's index>, result: <combined ItemModel>}` -- mirroring the rules' EQUIP auto-combine behavior exactly (rules also fuses in place if a held component completes a recipe, "auto-combines in place... net slots unchanged"). If no held item completes a recipe with the incoming one, falls through to `{kind:"add", result: incoming}` (a plain add, subject to the slot cap which THIS function does NOT check -- the caller is responsible for cap-checking before sending an EQUIP command, per the function's own doc comment: "subject to the slot cap, checked by the caller").

# Key behavior

Both functions are pure, synchronous, side-effect-free wrappers around `@autobattler/data`'s `recipeResult(aId, bId, items?)` (the canonical unordered-pair recipe lookup) and `itemModel.ts`'s `itemModel(id, data)` (the pure item-presentation model builder). Neither function has any internal state or randomness; calling either twice with identical arguments always yields an identical result (referentially-equal-content, not necessarily the same object instance).

# Invariants & constraints

- **Must stay a pure mirror of the rules' actual combine/equip decision logic, never diverge from it** -- if `packages/rules/src/commands.ts`'s `COMBINE_ITEMS`/`EQUIP` auto-combine semantics ever change (e.g. a different conflict-resolution order, a different recipe lookup), this file must be updated in lockstep or the UI will show a preview that doesn't match what actually happens when the command is sent. The file header explicitly frames this as "this only previews the already-decided result" -- the SOURCE of truth for what's combinable is `recipeResult` (from data) plus the rules' command logic, not this file.
- `equipPreview`'s held-item scan returns the FIRST matching slot, not all matching slots -- if a unit somehow held multiple items that could each complete a recipe with the incoming item (shouldn't normally arise given the item system's constraints, but not structurally impossible), only the lowest-indexed match is previewed/would-be-combined. This must match whatever order the actual `EQUIP` command's rules logic scans in, or the preview could mislead the player about which held item gets consumed.
- `combinePreview`'s `aIndex === bIndex` short-circuit operates on INDEX equality, not id equality -- two different inventory slots holding the same item id (e.g. two loose `iron_sword`s) are correctly treated as combinable with each other (since recipes can be of two identical components, depending on data), only literally dragging an item onto its own slot is rejected.
- Neither function ever throws -- `combinePreview` always returns a `CombinePreview` value, `equipPreview` returns `null` only for a genuinely unknown incoming item id (a data/state inconsistency, not a normal "no recipe" outcome) and otherwise always returns a `combine`/`add` result.

# Depends on

`@autobattler/data` (`recipeResult` -- the pure unordered-pair recipe lookup; type `GameData`). `./itemModel.js` (`itemModel`, type `ItemModel` -- the pure item-presentation model this module wraps around recipe results).

# Used by

`packages/client/src/scenes/match.ts` (the item inventory bar's drag-and-drop logic: dragging one inventory chip onto another calls `combinePreview` to show a live hint -- per `CLAUDE.md`: "drag onto another inventory item -> COMBINE_ITEMS with a live combine-preview hint (`combinePreview`; `itemCombineNo` ring + NO_RECIPE toast when no recipe, no command sent)"; dragging an item chip onto a unit calls `equipPreview` to determine whether the drop would combine-in-place or simply add, informing the `itemCombineOk` flourish shown afterward).

# Notes

- The "phase 10b" label in the file header ties this module to a specific development phase (the items/loot/PvE system rollout) -- consistent with several other item-system files (`itemModel.ts`, `lootReveal.ts`, etc.) sharing that phase tag in their own headers.
- `equipPreview`'s `null` case (unknown incoming item id) is a distinct failure mode from `combine`/`add` -- callers must explicitly handle three possible outcomes (`null`, `combine`, `add`), not just two, when deciding what UI feedback to show.
