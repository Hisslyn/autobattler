# Path & purpose

`packages/client/tests/lootReveal.test.ts` -- unit tests for `lootReveal.ts`'s pure `lootRevealModel(orbs, data)`: turning a round's already-decided, seeded `LootOrb[]` (from the rules layer) into a deterministic, ordered sequence of reveal steps for the Pixi loot-orb-reveal animation, plus the reduced-motion summary totals.

# Responsibility

Owns: regression coverage that the reveal sequence is empty for no orbs, orders steps by ASCENDING rarity (common -> uncommon -> rare -> legendary) while preserving each rarity's ORIGINAL drop order for ties (stable sort), assigns the correct playback `destination` (gold orbs fly to the gold counter, item/component orbs fly to inventory), resolves item/component reward names from real game data for display labels, computes correct `totalGold`/`itemCount` summary totals (for the reduced-motion instant-summary form), and produces byte-identical output for the same input (determinism -- this model performs NO randomness of its own, it only re-sequences an already-decided list).

# Exports

None (a Vitest test file). Module-scope fixtures: `component` (first real item with `.component` truthy), `completed` (first real item with `.recipe` truthy); a hand-built `orbs: LootOrb[]` fixture of 4 orbs deliberately ordered NOT by rarity (`legendary item, common gold(2), rare component, common gold(3)`) specifically to exercise the re-sorting behavior and the tie-break-by-original-order rule (the two `common` golds are 2nd and 4th in the input but must both end up first in output, in their original relative order).

# Key behavior

- "is empty for no orbs": `lootRevealModel([], gameData)` has `.empty===true` and `.steps.length===0`.
- "orders reveal steps by ascending rarity, stable within a rarity": feeding the 4-orb fixture (input rarity order `legendary, common, rare, common`) produces `.steps` in rarity order `[common, common, rare, legendary]` -- a full re-sort, NOT input order; within the two `common` steps, their gold amounts come out `[2, 3]` (NOT `[3, 2]`) -- proving ties break by ORIGINAL DROP INDEX (the first `common` orb in the input array, despite being 2nd overall, comes out before the second `common` orb which was 4th in the input) rather than by amount, content, or any other secondary key; `.steps.map(s=>s.order)` is the contiguous `[0,1,2,3]` -- `order` is the OUTPUT/playback position, not a copy of the input index.
- "routes gold to the gold counter and items/components to inventory": for every step, `.destination` is exactly `"gold"` when `.content.kind==="gold"` and `"inventory"` otherwise (covers both `"component"` and `"item"` content kinds under the same `"inventory"` destination).
- "resolves item/component names from data for the reveal label": the step whose `.content.kind==="item"` has `.content.name` exactly equal to the real item's `.name` field from `gameData.items` (proving the reveal label is resolved via `itemModel`/data lookup, not just echoing the raw id).
- "summarizes total gold + item count for the reduced-motion form": `.totalGold===5` (the two gold orbs, `2+3`) and `.itemCount===2` (the one component orb + the one completed-item orb, NOT counting either gold orb) -- confirms `itemCount` counts non-gold REWARDS, regardless of whether they're a component or a fully completed item.
- "is deterministic for the same orb list": calling `lootRevealModel(orbs, gameData)` twice on the SAME input produces `JSON.stringify`-identical output both times -- the function has no internal randomness or mutable state; it is a pure re-derivation of its input.

# Invariants & constraints

- `lootRevealModel` performs NO randomness and makes NO decisions about WHAT was looted -- that's entirely the rules layer's job (`generateLoot`, seeded from the match prng). This model's only job is SEQUENCING (rarity-ascending order) and DISPLAY DERIVATION (resolving names/colors/destinations) of an already-fully-decided orb list. Calling it twice on identical orbs MUST produce identical output -- this is asserted directly and is the property that lets the client safely re-render the reveal (e.g. on a re-render after a layout change) without redoing or re-randomizing anything.
- The stable-sort tie-break is BY ORIGINAL ARRAY INDEX, not by any property of the reward itself (not gold amount, not item id) -- a maintainer must preserve `a.i - b.i` as the tie-break in any refactor of the sort, or orbs of the same rarity would silently reorder relative to their actual drop sequence (only cosmetically wrong, since the underlying gold/item awarding already happened server/rules-side, but it would break the "same seed -> identical animation" guarantee this system advertises).
- `order` in each `RevealStep` is the FINAL, POST-SORT playback index (`0..steps.length-1`), distinct from each orb's original position in the input array -- a consumer must use `.order` for animation sequencing, never assume it equals the orb's index in the original `LootOrb[]`.
- `itemCount` and `totalGold` are independent running sums computed in the SAME pass that builds `.steps` (single iteration over the sorted list) -- they are NOT derived by re-filtering `.steps` afterward, though the observable result is equivalent.

# Depends on

- `vitest` (`describe`, `it`, `expect`, `toBe`, `toHaveLength`, `toEqual`).
- `@autobattler/data` (`gameData`).
- `@autobattler/rules/src/loot.js` (`LootOrb` type only, for fixture typing).
- `../src/lootReveal.js` (`lootRevealModel`).

# Used by

Not imported by any other file (a leaf test file); run as part of the client package's `npm test`/vitest suite. Indirectly validates the model consumed by `scenes/match.ts`'s `lootLayer`/`startLootReveal` (per CLAUDE.md: orbs pop in by ascending rarity with distinct color+shape, crack open to reveal content, then fly to the gold counter / item bar; reduced-motion shows the instant summary chip built from `totalGold`/`itemCount` instead of the full animated sequence).

# Notes

- `lootReveal.ts`'s own header comment explicitly states the architecture invariant this test enforces: "the orbs and their contents are already decided by rules... this only turns that list into an ordered, deterministic sequence of reveal steps... Same orb list -> identical steps" -- directly mirroring the project-wide PvE-loot determinism invariant in CLAUDE.md ("PvE loot is seeded-deterministic... the future client only animates the reveal").
- `rewardName`/`rewardContent` (internal, unexported helpers in `lootReveal.ts`) route through `itemModel(reward.id, data)?.name ?? reward.id` for non-gold rewards -- meaning an UNKNOWN item id (one that fails to resolve via `itemModel`) would still produce a usable (if less friendly) reveal label by falling back to the raw id string rather than crashing; this fallback path is not directly exercised by this test file's fixtures (both `component` and `completed` are guaranteed-real items via `gameData.items.find`).
- The `color` field on each `RevealStep` comes from `rarityColor(orb.rarity)` (the theme.ts `RARITY_COLOR` map covered by CLAUDE.md's loot rarity orb colors `lootCommon/lootUncommon/lootRare/lootLegendary`) -- this test file does not assert on the exact color VALUES, only that the sequencing/routing/naming/summary logic is correct; color-value correctness would be covered (if at all) by a `theme.ts`-focused test, not this one.
