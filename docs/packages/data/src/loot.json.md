# Path & purpose

`packages/data/src/loot.json` — PvE loot content: 4 weighted rarity tables (common/uncommon/rare/legendary) of possible rewards, and a per-PvE-round schedule (`roundDrops`) of how many orbs of each rarity drop on a given round number. Loaded and typed as `LootData` by `packages/data/src/loader.ts`, exposed as `gameData.loot`.

# Responsibility

Owns the entire reward content for PvE rounds: what can drop (gold amounts, loose components, completed/consumable/artifact/mythical items) at each rarity, their relative weights, and which round numbers award which rarity/count combinations. This is pure data — the actual seeded resolution algorithm lives in `packages/rules/src/loot.ts` (`generateLoot`/`applyLootOrb`), not here.

# Exports

Not code — JSON, typed via `loader.ts`'s `LootData`/`LootEntry`/`RoundDrop`/`LootRarity` interfaces:
```
type LootRarity = "common" | "uncommon" | "rare" | "legendary";
type LootEntry = {kind:"gold",amount,weight} | {kind:"component",id,weight} | {kind:"item",id,weight};
interface RoundDrop { rarity: LootRarity; count: number }
interface LootData { tables: Record<LootRarity, LootEntry[]>; roundDrops: Record<string, RoundDrop[]> }
```

# Key behavior (content map)

**`tables`** — one weighted entry list per rarity, consumed by `pickEntry` in `rules/src/loot.ts` (sums all `weight`s, rolls `prng() % total`, walks entries subtracting weight until the roll falls under one — i.e. each entry's drop probability is `weight / sum(all weights in that table)`):

- `common` (8 entries, weight sum 100): mostly small gold (1g×40, 2g×30, 3g×15 = 85% gold) plus 5 cheap components at weight 3 each (iron_sword, recurve_bow, chain_vest, sparring_gloves, tear_flask — notably NOT all 9 components, only 5 "starter" ones).
- `uncommon` (11 entries, weight sum 154): larger gold (3g×25, 5g×15) plus ALL 9 components at weight 12 each, plus `item_remover` (consumable) at weight 6.
- `rare` (16 entries, weight sum ~122): gold (6g×14, 10g×8), 3 higher-value components (mana_crystal/sorcerer_rod/giants_belt at weight 10 each), 4 specific completed items (`iron_sword__recurve_bow`, `chain_vest__negatron_cloak`, `giants_belt__tear_flask`, `mana_crystal__sorcerer_rod` — NOT all 36, a curated subset) at weight 8/6, both consumables (`item_remover`/`reforger`) at weight 6, and ALL 6 artifacts (warblade/warplate/voidstaff/voidmantle/stormrider/titan_heart) at weight 3 each — this is the FIRST rarity tier where artifacts can drop.
- `legendary` (13 entries): one gold entry (15g×10), 7 specific completed items at weight 8 (notably including the 3 passive-bearing completed items `iron_sword__sorcerer_rod`/`chain_vest__giants_belt`/`negatron_cloak__sorcerer_rod`, plus 4 plain-stat ones `recurve_bow__sparring_gloves`/`mana_crystal__tear_flask`/`giants_belt__sorcerer_rod`/`sorcerer_rod__sparring_gloves`), `reforger` again at weight 6, `radiant_enhancer` at weight 6 (this is the ONLY rarity `radiant_enhancer` appears in — radiant upgrades are legendary-exclusive loot), and ALL 3 mythicals (eclipse_crown/undying_bulwark/arcane_engine) at weight 6 each.

**`roundDrops`** — a sparse map keyed by STRINGIFIED round number (`"1"`, `"2"`, etc, per `Record<string, RoundDrop[]>`) listing the rarity/count orbs awarded on that specific PvE round:
- Round 1: 2× common.
- Round 2: 1× common + 1× uncommon.
- Round 3: 1× uncommon + 1× rare.
- Round 7: 2× uncommon.
- Round 10: 1× uncommon + 1× rare.
- Round 14: 2× rare.
- Round 17: 1× rare + 1× legendary.
- Round 21: 2× rare + 1× legendary.
- Round 24: 2× legendary.

Rounds not listed here (any PvE round number absent from this map) get `drops = [] ?? []` in `generateLoot` — zero orbs (a no-op, not an error).

# Invariants & constraints

- The `roundDrops` key set (1,2,3,7,10,14,17,21,24) directly encodes the PvE round schedule described in CLAUDE.md/design-notes.md: stage 1 is rounds 1-3 (all PvE), then stage 2+ spans 7 rounds each with roundInStage 4 and 7 being PvE — so absolute PvE round numbers are 1,2,3 (stage 1) then 7,10 (stage 2: roundInStage 4→round 7, roundInStage 7→round 10), then 14,17 (stage 3), then 21,24 (stage 4), etc. This file currently only defines drops through round 24 (stage 4) — any PvE round beyond 24 (stage 5+) would resolve to zero orbs unless this map is extended, a likely content gap for long matches.
- Loot is escalating but NOT exclusively progressive — rarity tables overlap (rare items appear in both `rare` and partially mirror into `legendary`'s reused consumables) and weight sums differ per table (100/154/~122/~85) — `pickEntry`'s probability is always relative to its OWN table's weight sum, never compared across tables, so the literal weight numbers aren't comparable round-to-round without first identifying which table they're in.
- Every `kind:"item"` id referenced here MUST exist in `items.json` (or be a radiant id, though none are referenced directly here since radiants only drop via the `radiant_enhancer` consumable, not as a direct loot pull) — there is no cross-file validation enforced by this JSON itself (left to `packages/data/tests/integrity.test.ts`).
- Loot is NEVER pooled (per CLAUDE.md: "PvE loot is seeded-deterministic... items are NOT pooled") — drawing a component/item from this table does not affect `economy.json`'s `poolCounts` or any unit-pool conservation invariant; this is an entirely separate reward system from unit drafting.
- Determinism: `generateLoot(round, prng, data)` (in rules/src/loot.ts) consumes the prng stream in a fixed, deterministic order (one `pickEntry` call per orb, in `roundDrops[round]`'s listed order, each orb's count expanded into individual `pickEntry` calls) — identical seed + this exact file content always produces identical orbs.

# Depends on

Nothing — a leaf JSON file with no imports. Implicitly depends on `items.json`'s ids being valid (referenced by `kind:"item"` entries) but this is not a structural/import dependency, just content cross-referencing.

# Used by

- `packages/data/src/loader.ts` — loads + types this file as `LootData`, exposes as `gameData.loot`.
- `packages/rules/src/loot.ts` — `generateLoot(round, prng, data)` reads `data.loot.roundDrops[String(round)]` and `data.loot.tables[rarity]` to build the round's `LootOrb[]`; `applyLootOrb` then folds the resolved reward into the player's gold/inventory.
- `packages/rules/src/rounds.ts` — `runPveRound` calls `generateLoot` once per PvE round (per-player seeded), stores the result in `MatchState.lastLootOrbs` for the client reveal.
- `packages/server/src/room.ts` — sends each human player their own `lastLootOrbs` privately via the `LOOT` S2C message before the RESOLUTION phase change.
- `packages/client/src/lootReveal.ts` — `lootRevealModel(orbs, data)` orders the already-decided orbs (ascending rarity) into reveal animation steps; reads item/component ids from `gameData.items` to render icons/names, but does not re-derive the orbs (the rules package already decided them).

# Notes

- The asymmetry in `common`'s component list (only 5 of 9 components, all "cheap-stat" ones like iron_sword/recurve_bow/chain_vest/sparring_gloves/tear_flask, omitting mana_crystal/negatron_cloak/giants_belt/sorcerer_rod) versus `uncommon`'s full 9-component list appears to be an intentional pacing choice (early PvE rounds shouldn't hand out the higher-impact components) rather than an oversight, but isn't documented anywhere outside this inference.
- `radiant_enhancer` being legendary-exclusive (the only place it can drop) makes radiant upgrades a notably scarce resource — consistent with design-notes.md's "reforge scarcity" framing for the broader consumable economy.
- The file has no version marker; like `items.json`, its phase-2/3 content (artifacts/mythicals/consumables in the tables) postdates `packages/data/package.json`'s `"0.1.0"` version without a corresponding bump.
