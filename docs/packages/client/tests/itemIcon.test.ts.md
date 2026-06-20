# Path & purpose

`packages/client/tests/itemIcon.test.ts` -- unit tests for `itemIcon.ts`'s pure item-icon resolution: `itemIcon(itemId, data)` (item id -> a `ComponentIcon`/`CompletedIcon`/null), `itemArtPath(itemId, base?)` (drop-in PNG path), and `resolveItemTexture(itemId, lookup, base?)` (art-vs-procedural fallback resolver), plus the `COMPONENT_EMBLEM` completeness/distinctness map.

# Responsibility

Owns: regression coverage that every base component and completed item in the real `gameData.items` content resolves to a DISTINCT procedural icon (never a generic fallback glyph), that completed items' icons are correctly DERIVED from their recipe pair (cross-checked against the pure `recipeResult` data lookup, no duplicated game logic), that non-component/non-completed item kinds (consumable/artifact/mythical) are explicitly exempted from this guarantee, and that the asset drop-in path-building/lookup-resolution helpers behave correctly for both the exists and absent-file cases.

# Exports

None (a Vitest test file). Defines `components`/`completed` module-scope constants filtering `gameData.items` by `.component`/`.recipe` presence respectively.

# Key behavior

**"component emblems"**:
- "there are the expected counts (9 components, 36 completed)": `components.length===9`, `completed.length===36` -- a direct content-count assertion matching CLAUDE.md's documented item catalog shape (9 stat-only components + 36 completed items, one per distinct unordered pair).
- "every base component maps to a distinct base emblem (no generic fallback)": for every component, `itemIcon(c.id, gameData)` resolves non-null with `kind:"component"`, and `COMPONENT_EMBLEM[c.id]` is truthy; then confirms the SET of all 9 components' emblems has size `9` (i.e. EVERY component maps to a DIFFERENT `ItemEmblem` archetype -- no two components share a visual identity).
- "only maps real component ids (no stale entries)": the INVERSE completeness direction -- every KEY in `COMPONENT_EMBLEM` must correspond to a real component id currently in `gameData.items`; catches stale/orphaned emblem-map entries left behind if a component were ever removed from the data without updating the map.

**"completed-item icons"**:
- "every completed item resolves to its two components AND a derived icon": for ALL 36 completed items, `itemIcon` resolves to a `kind:"completed"` icon (narrowed via an `if (!icon || icon.kind!=="completed") throw` guard rather than a plain assertion, giving a clear failure if any completed item somehow resolved to the wrong icon kind); `icon.components` equals the item's `recipe` field EXACTLY (order preserved, not just set-equal); the pure data-package `recipeResult(icon.components[0], icon.components[1])` independently agrees this exact pair produces this exact completed item id (a cross-check against the SAME lookup the rules layer uses, confirming `itemIcon.ts` derives its component pair from real recipe data rather than its own independent/possibly-drifted mapping); `icon.emblems` equals `[COMPONENT_EMBLEM[recipe[0]], COMPONENT_EMBLEM[recipe[1]]]` exactly, and both emblems are truthy.
- "no real item falls back to the generic glyph (every component/completed resolves)": sweeps ALL of `gameData.items`, SKIPPING any item whose `itemKind(item)` is `"consumable"`, `"artifact"`, or `"mythical"` (per the inline comment: "Consumables, artifacts, and mythicals have no procedural emblem yet -- client icon work is out of scope for the item-system data/rules phase") -- for every NON-skipped item, `itemIcon` must resolve non-null. This is the master completeness guarantee for the item catalog's PROCEDURAL-ICON-ELIGIBLE subset.
- "returns null for an unknown id (renderer's generic fallback)": `itemIcon("__nope__", gameData)` is `null` -- the renderer's documented contract is that `null` triggers ITS OWN generic-glyph fallback; this function itself never throws or invents a default icon.

**"item art resolver"**:
- "builds the public/items drop-in path": `itemArtPath("iron_sword")` -> `"/items/iron_sword.png"`; `itemArtPath("iron_sword__sorcerer_rod")` -> `"/items/iron_sword__sorcerer_rod.png"` (confirming the documented double-underscore-joined naming convention for completed-item art files is just the item's own id with no special-casing inside `itemArtPath` itself -- the underscore-joining happens at the items.json id-naming level, not in this function); `itemArtPath("iron_sword","/assets/items")` -> `"/assets/items/iron_sword.png"` (custom `base` override).
- "returns the texture when the lookup has the file (exists branch)": a fake `lookup` function returning a sentinel `TEX` object only for the exact expected path -- confirms `resolveItemTexture("iron_sword", lookup)` returns that `TEX` object directly (pass-through on a hit).
- "falls back to null when the file is absent (procedural branch)": `resolveItemTexture("iron_sword", () => null)` is `null` (the lookup always misses); then confirms the `base` override is correctly threaded INTO the lookup key -- a lookup keyed on `/art/iron_sword.png` matches when `resolveItemTexture` is called WITH `base:"/art"`, but the SAME lookup called WITHOUT the override (defaulting to `/items/...`) misses and returns `null` -- proving `base` genuinely changes which path is queried, not just a cosmetic parameter.

# Invariants & constraints

- `itemIcon`'s "no generic fallback" guarantee per CLAUDE.md is `null` for an unknown id, but the SOURCE'S own doc comment is more precise: `null` also covers "a component with no emblem mapping," with the actual GENERIC-GLYPH fallback decision living in the RENDERER (`itemIconDraw.ts`/call sites), not in `itemIcon.ts` itself -- this function's contract is "resolve to a real icon, or null," not "always produce something drawable."
- `itemIcon` has an undocumented-in-CLAUDE.md special case (visible only in the source, not directly exercised by name in this test file): an item id starting with `"radiant_"` has NO recipe of its own and instead recurses into `itemIcon` on its own id with the `"radiant_"` prefix stripped, returning the BASE item's icon spec with the id swapped back to the radiant variant's own id. This implies a `radiant_<baseItemId>` naming convention exists in the item catalog for some upgraded/enhanced item variant (consistent with the `consumable`/`artifact`/`mythical` item kinds this test file also references via `itemKind`) -- none of which are described in CLAUDE.md's current `packages/data` notes (which describe only "9 stat-only components + 36 completed items"). A reader needing to understand radiant items, their kind taxonomy, or where they're granted (likely a loot/consumable-drop mechanic given the "radiant_enhancer drop flow" reference elsewhere in this codebase's notes) should investigate `packages/data/items.json`'s actual current content and `itemKind`'s implementation directly, as this represents real shipped content beyond what the architecture doc currently summarizes.
- The completed-item icon composition assumes EVERY completed item's `recipe` pair both resolve via `COMPONENT_EMBLEM` -- if either fails, `itemIcon` returns `null` for that completed item rather than a partial icon; the "every completed item resolves" test would catch any such gap immediately across all 36 real completed items.
- `resolveItemTexture` is intentionally GENERIC over the texture type (`<T>`) specifically so it's testable without any real Pixi texture object -- the test's fake `lookup` returns a plain object literal (`{id:"tex"}`) as a stand-in, exploiting this genericity.

# Depends on

- `vitest` (`describe`, `it`, `expect`, `toHaveLength`, `not.toBeNull`, `toBeTruthy`, `toBe`, `toEqual`).
- `@autobattler/data` (`gameData`, `itemKind`, `recipeResult`).
- `../src/itemIcon.js` (`itemIcon`, `itemArtPath`, `resolveItemTexture`, `COMPONENT_EMBLEM`).

# Used by

Not imported by any other file (a leaf test file); run as part of the client package's `npm test`/vitest suite. Indirectly validates the pure resolution layer consumed by `itemIconDraw.ts` (the Pixi-drawing counterpart per CLAUDE.md) wherever items render -- inventory bar chips, loot-orb reveal contents, equipped-item icons on `UnitToken`s, inspect equipped-items rows, and the item-detail modal.

# Notes

- This file's discovery of the `radiant_` prefix special-case and the `consumable`/`artifact`/`mythical` item kinds (via `itemKind`) is the clearest signal in this documentation pass that the item catalog has grown beyond the "45 items: 9 components + 36 completed" description in CLAUDE.md's `packages/data` section -- a future documentarian pass over `packages/data/items.json` and `itemKind`'s implementation should reconcile this, since those new kinds/variants are evidently real, tested, shipped content.
- The split between `itemIcon.ts` (pure resolution, this test's subject) and `itemIconDraw.ts` (Pixi drawing) mirrors the same pattern used for `glyphs.ts`'s `TRAIT_GLYPH`/`drawGlyph` split and `sprites.ts`'s unit-art resolver -- a consistent "pure resolution unit-tested, Pixi drawing visually unverified" architecture throughout this codebase's icon/art systems.
