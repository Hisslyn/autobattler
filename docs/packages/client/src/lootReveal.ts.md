# Path & purpose

`packages/client/src/lootReveal.ts` -- pure sequencing model that turns a PvE round's already-decided `LootOrb[]` (from rules) into an ordered, deterministic list of reveal steps for the loot-orb-cracking animation in the match scene.

# Responsibility

Owns the *presentation order and grouping* of loot reveal: which orb animates first, what color its shell is, where its content visually flies to (gold counter vs item inventory), and the reduced-motion summary totals (`totalGold`, `itemCount`). Does NOT decide what's in the orbs -- that's already fixed by `packages/rules/src/loot.ts`'s seeded `generateLoot`. This file is purely a display-order/grouping transform over data that already exists; same orb list in -> identical `RevealStep[]` out, every time.

# Exports

- `type RevealContent = {kind:"gold",amount,label} | {kind:"component",id,name} | {kind:"item",id,name}` -- the per-step revealed content, already resolved to a display name (via `itemModel`) for components/items, or a `+N` label for gold.
- `interface RevealStep { order, rarity, color, destination: "gold"|"inventory", content }` -- one orb's reveal step: `order` is the 0-based playback index, `color` is the rarity's shell color (via `theme.ts`'s `rarityColor`), `destination` tells the Pixi layer whether to fly the result to the gold counter or the item inventory bar.
- `interface LootRevealModel { steps: RevealStep[], totalGold: number, itemCount: number, empty: boolean }` -- the full model returned by `lootRevealModel`; `empty` is true when there were no orbs (so the caller can skip the whole animation).
- `function lootRevealModel(orbs: readonly LootOrb[], data: GameData): LootRevealModel` -- THE entry point. Sorts orbs ascending by rarity (`common` < `uncommon` < `rare` < `legendary`), stable within a rarity tier by original orb-array index (so two commons reveal in their original drop order, not re-shuffled), then maps each to a `RevealStep` and accumulates `totalGold`/`itemCount` along the way.

# Key behavior

`lootRevealModel` pairs each orb with its original index, sorts by `(RARITY_ORDER[rarity], originalIndex)` -- a stable sort by rarity tier that preserves relative order within a tier -- then builds one `RevealStep` per orb in that new order (the `order` field on each step IS its position in this sorted sequence, 0-based, used by the Pixi layer to stagger the reveal animation timing). For each orb's `reward` (a `LootReward` from rules: `{kind:"gold",amount}` or `{kind:"component"|"item",id}`), `rewardContent` builds the `RevealContent`: gold rewards get a `+amount` label and accumulate into `totalGold`; component/item rewards resolve their display name via `itemModel(id, data)?.name` (falling back to the raw id if `itemModel` returns null, e.g. an unrecognized id) and increment `itemCount`. `destination` is `"gold"` for gold rewards, `"inventory"` for everything else -- this tells the caller which UI element the orb's content should visually fly toward once cracked open.

# Invariants & constraints

- **Pure, deterministic, presentation-only**: no Pixi, no mutation of orbs/rewards, no randomness of its own -- the only randomness already happened upstream in rules' seeded `generateLoot`. Same `orbs` array (same content, any object identity) always produces byte-identical `steps`.
- The function does NOT mutate the input `orbs` array (uses `.map`/`.sort` on a derived `indexed` array, not the original).
- Sort order matters for player experience (build anticipation common->legendary) but carries zero gameplay weight -- reordering here can never change what was won, only the order it's shown.
- If `itemModel(id, data)` returns null for some reward id (a data/id mismatch), the display name silently falls back to the raw id string rather than throwing -- a footgun is a malformed id rendering as a raw slug instead of a human name, but it won't crash the reveal.

# Depends on

- `@autobattler/data` (`GameData`, `LootRarity` type) -- the static item/unit data bundle needed to resolve component/item display names.
- `packages/rules/src/loot.ts` (`LootOrb`, `LootReward` types, import via `.js` extension per the ESM build) -- the already-decided orb/reward shapes this file consumes; it does not call into rules logic, only reads the types.
- `./theme.ts` (`rarityColor`) -- maps a `LootRarity` to its shell display color (`lootCommon`/`lootUncommon`/`lootRare`/`lootLegendary` theme constants per CLAUDE.md).
- `./itemModel.ts` (`itemModel`) -- resolves an item/component id to its display model (used here only for `.name`).

# Used by

`packages/client/src/scenes/match.ts` -- `startLootReveal()` calls `lootRevealModel(this.driver.getMyLootOrbs(), gameData)` when a PvE round resolves (`if (this.driver.isPveRound()) this.startLootReveal()`), then iterates `model.steps` to drive the Pixi-animated reveal (orb pop-in by rarity, crack-open, fly-to-destination), gated by `lootRevealActive` to avoid double-starts and cleaned up via `clearLootReveal()` on every phase change / match-over / destroy. Reduced-motion mode presumably renders `totalGold`/`itemCount` as an instant summary chip instead of the full animated sequence (per CLAUDE.md's description of this flow).

# Notes

- `RARITY_ORDER`'s numeric values (0-3) are only used as sort keys, never displayed or persisted -- safe to renumber if a 5th rarity tier is ever added to `loot.json`, but the `LootRarity` union type would need that tier added too (currently fixed to the 4 tiers in `packages/data`'s `loot.json`).
- The `destination` field is a hint, not a coordinate -- the actual fly-to position (gold counter HUD element vs item inventory bar slot) is resolved entirely by `scenes/match.ts`'s rendering code, not by this model.
