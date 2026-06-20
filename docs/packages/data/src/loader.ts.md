# Path & purpose

`packages/data/src/loader.ts` — the single typed entry point for `@autobattler/data`. Imports every raw JSON content file, types it, assembles the `gameData: GameData` singleton, and exports the pure helper functions (`recipeResult`, `mmrToRank`, `itemKind`, `itemTier`, `getOrCreateRadiantItem`, `radiantItemId`) that every other package uses to interpret content. This file IS the package's `main`/`exports` entry per `package.json`.

# Responsibility

Owns: (1) every TypeScript type describing the shape of JSON content (`UnitDataDef`, `TraitDataDef`, `ItemDataDef`, `EconomyData`, `GameplayData`, `MobDataDef`/`MobStageDef`/`MobsData`, `LootEntry`/`LootData`, `RankBand`, the aggregate `GameData`); (2) loading + casting the 8 raw JSON imports into that `GameData` shape as the `gameData` singleton; (3) pure derivation helpers that other packages must use rather than re-implementing (recipe lookup, rank lookup, item kind/tier classification, radiant-item generation); (4) the `DATA_VERSION` constant recorded on every persisted match.

# Exports

- `type AbilityEffectData` — discriminated union of the 5 engine-supported ability effect shapes: `{kind:"magic_damage"}`, `{kind:"burn", burn, duration}`, `{kind:"shield", amount, duration}`, `{kind:"buff", stat, value, duration}` (stat restricted to `"ad"|"as"|"armor"|"mr"|"abilityDamage"`), `{kind:"stealth", duration}`.
- `interface AbilityDataDef {name, manaCost, effect}` — a unit's ability.
- `interface UnitDataDef {id,name,tier,origin,classes,hp,ad,as,armor,mr,range,mana,manaStart,abilityDamage,ability,traits}` — full unit content shape; `traits` is the flattened `[origin, ...classes]` the sim/rules actually resolve against (kept in sync with `origin`/`classes` by the data author, not derived at load time here).
- `interface TraitBreakpoint {count, effect:{stat,value}}` and `interface TraitDataDef {id,name,kind:"origin"|"class",breakpoints}`.
- `type ItemPassiveData` — `{kind:"burn",value,duration}` or `{kind:"shield",value,duration}` (note: DIFFERENT field name `burn`/`amount` vs `value` compared to `AbilityEffectData`'s burn/shield shapes — item passives and unit ability effects are structurally similar but NOT type-identical).
- `interface PairPassiveData {partnerId, effect: ItemPassiveData}` — artifact pair-bonus shape.
- `type ItemKind = "component"|"completed"|"consumable"|"artifact"|"mythical"`.
- `type ConsumableEffect = "remove_item"|"reforge"|"radiant_upgrade"`.
- `interface ItemDataDef {id,name,stats,component?,recipe?,passive?,kind?,consumableEffect?,pairPassive?}`.
- `interface StreakEntry {min,max,bonus}`, `interface EconomyData {...}` (full shape — see `economy.json.md` for field semantics), `interface GameplayData {...}` (see `gameplay.json.md`).
- `interface MobDataDef` — reuses unit-combat-stat shape (`hp,ad,as,armor,mr,range,mana,manaStart,abilityDamage,traits`) plus `isMob: true` (literal true), optional `campType` (cosmetic) and optional `ability`.
- `interface MobPlacement {mobId, slot, star}`, `interface MobStageDef {stage, roundInStage, name, campType?, units}`, `interface MobsData {mobs, stages}`.
- `type LootRarity = "common"|"uncommon"|"rare"|"legendary"`.
- `type LootEntry` — discriminated union `{kind:"gold",amount,weight}` | `{kind:"component",id,weight}` | `{kind:"item",id,weight}`.
- `interface RoundDrop {rarity, count}`, `interface LootData {tables: Record<LootRarity,LootEntry[]>, roundDrops: Record<string,RoundDrop[]>}`.
- `interface RankBand {id, name, minMmr}`.
- `interface GameData {units, traits, items, economy, gameplay, mobs, loot}` — the aggregate shape of the whole content package.
- `const DATA_VERSION = "0.1.0"` — recorded on every persisted match (per CLAUDE.md). NOTE: hardcoded as a literal string here, NOT derived from `package.json`'s `"version"` field — the two could drift independently (currently both happen to read `"0.1.0"`).
- `function recipeResult(aId, bId, items = gameData.items): string | null` — pure, unordered-pair recipe lookup: scans `items` for an entry whose `recipe` matches `[aId,bId]` in EITHER order, returns its `id`, or `null` if no completed item combines that pair. Artifacts/mythicals (no `recipe` field) can never be a result. Used by `commands.ts`'s COMBINE_ITEMS/EQUIP-auto-combine and the client's `combinePreview.ts`/`equipPreview`.
- `const RANK_BANDS: RankBand[]` — `ranks.json`'s `bands` array, cast and exported directly (ascending `minMmr` order, per CLAUDE.md).
- `function mmrToRank(mmr): RankBand` — pure: walks `RANK_BANDS` in order, keeps the LAST band whose `minMmr <= mmr` (since the array is ascending, the loop's `else break` stops at the first band that's too high, so it returns the highest qualifying band). Boundaries inclusive on `minMmr`; MMR below the lowest band clamps to the lowest band (the initial `band = RANK_BANDS[0]!` default). Used by client Profile/Leaderboard rank badges.
- `function itemKind(item): ItemKind` — pure: returns `item.kind` if present, else derives `"component"` (if `item.component` truthy) or `"completed"` (otherwise) — the back-compat derivation for the original 9+36 items that never got an explicit `kind` field.
- `function radiantItemId(baseId): string` — pure: `"radiant_" + baseId`. The deterministic naming convention for a base item's tier-4 variant.
- `function getOrCreateRadiantItem(baseId, items, multiplier): ItemDataDef | null` — pure + MEMOIZED (via the module-level `radiantCache: Map<string,ItemDataDef>`): looks up `baseId` in `items`, returns `null` if not found or not `itemKind === "completed"` (artifacts/mythicals/components/consumables are never radiant-upgraded). Otherwise builds a new `ItemDataDef` with every stat scaled `Math.round((value * multiplier) / 1000)` (nearest-rounding per design-notes.md's documented rounding rule, NOT the sim's truncating fixed-point math), carries the base item's `passive` unchanged if present, sets `kind: "completed"` (the radiant item is STILL classified as `"completed"` kind-wise, even though its TIER is 4/radiant — tier and kind are separate axes), and caches the result keyed by `baseId` so repeated calls return the SAME object reference.
- `function itemTier(itemId, items, economy): number | null` — pure: returns the numeric tier bucket (1=component, 2=completed, 3=artifact, 4=radiant, 5=mythical, reading the actual numbers from `economy.itemTier*` fields rather than hardcoding 1-5). Radiant ids are detected by the `"radiant_"` STRING PREFIX before any array lookup (so a radiant item resolves to tier 4 even if, hypothetically, its base item were removed from the array — the prefix alone is sufficient). Consumables and unknown ids return `null` (no tier).
- `const gameData: GameData` — the singleton object every other package imports. Built by casting each raw JSON import (`rawUnits as UnitDataDef[]`, etc.) — NO RUNTIME VALIDATION beyond the TypeScript cast (a malformed JSON file would silently produce wrong-shaped data at runtime; `packages/data/tests/integrity.test.ts` is the actual validation layer, run separately).

# Key behavior

**Module-load-time side effect — eager radiant materialization**: immediately after constructing `gameData`, a `for` loop iterates a SNAPSHOT of `gameData.items` (`[...gameData.items]`, copied before the loop to avoid iterating the array while pushing into it), and for every item where `itemKind(item) === "completed"`, calls `getOrCreateRadiantItem(item.id, gameData.items, gameData.economy.radiantStatMultiplier)` and PUSHES the result directly into `gameData.items`. This means: **every completed item's radiant variant is NOT lazily generated on first reforge/upgrade as design-notes.md's "lazily/once" phrasing might suggest — it's generated EAGERLY at module import time and lives in `gameData.items` from the moment the module loads.** The code comment explains why: `packages/sim/src/engine.ts`'s `applyItems` does a plain `data.items.find(...)` lookup with no special-casing for radiant ids, so for a unit holding a `radiant_xxx` item to resolve correctly in combat, that id must ALREADY be a real entry in `data.items` — there's no on-demand fallback in the sim. `getOrCreateRadiantItem`'s memoization means this eager pass and any LATER call (e.g. from `commands.ts`'s `radiant_enhancer` consumable logic) return the identical cached object, so there's no duplicate-entry risk from calling it twice.
- Artifacts/mythicals are excluded from this eager pass (the `itemKind(item) !== "completed"` guard skips them) — confirmed by the function's own null-return for non-completed base items.
- `gameData.items.length` is therefore LARGER than the raw `items.json` array's length by exactly the number of completed items (36, since all 36 get a radiant pushed) — any code counting `gameData.items.length` expecting it to equal `items.json`'s 51 entries would be wrong; it's actually 51 + 36 = 87 after this module runs.

# Invariants & constraints

- `gameData` is a SINGLETON, mutated once at module load (the radiant-push loop) and never again — there is no re-load/refresh mechanism; the object identity is stable for the lifetime of the process. Tests/other modules that import `gameData` all share this one mutated object.
- `recipeResult`'s default parameter `items = gameData.items` means calling it with no third argument implicitly depends on `gameData` already being fully constructed (including the eager radiant push) — fine in practice since module evaluation order guarantees this, but worth knowing this isn't a fully "pure" default in the strictest sense (it closes over a mutable module-level singleton).
- `itemKind`'s back-compat derivation (`component flag` → `"component"`/`"completed"`) ONLY correctly classifies the original 9+36 items; any NEW item added to `items.json` without an explicit `kind` AND without a `recipe`/`component` flag would incorrectly fall through to `"completed"` by default — content authors must remember to set `kind` explicitly for consumables/artifacts/mythicals (which they currently do, per `items.json`'s actual content).
- `mmrToRank`'s loop assumes `RANK_BANDS` is sorted ascending by `minMmr` (per CLAUDE.md's ranks.json description: "ordered rank bands ... by ascending minMmr") — it does NOT sort defensively; a malformed `ranks.json` with out-of-order bands would produce wrong results silently (the `else break` exits at the first descending step, not after scanning the whole array).
- `getOrCreateRadiantItem`'s stat-scaling loop does `if (value === undefined) continue` — defensive against `Partial<Record<string,number>>`'s optional values, though in practice every stat key present in an `ItemDataDef.stats` object has a real number (TypeScript's `Partial` is structural, not runtime-enforced).
- The raw JSON imports use `with { type: "json" }` import attributes (a modern ESM JSON-import syntax) — this requires Node's JSON-modules support and the `"type":"module"` package.json setting (confirmed present in `packages/data/package.json`).

# Depends on

- The 8 raw JSON content files in the same directory: `units.json`, `traits.json`, `items.json`, `economy.json`, `gameplay.json`, `ranks.json`, `mobs.json`, `loot.json` — all imported via the `with {type:"json"}` ESM JSON-import syntax.
- Nothing else — no other package, no runtime npm dependency (matches the package.json having zero `dependencies`).

# Used by

- Every other workspace package (`sim`, `rules`, `server`, `client`, `balance`) imports `gameData` and/or the helper functions from `@autobattler/data` — this is the most widely-depended-on file in the entire monorepo given the architecture described in CLAUDE.md.
- Specifically: `packages/sim/src/engine.ts` (applies item stats/passives/pair-passives, reads `data.items.find` directly including radiant ids that must already be eagerly present); `packages/rules/src/commands.ts` (EQUIP/UNEQUIP/COMBINE_ITEMS/USE_CONSUMABLE use `recipeResult`, `itemKind`, `itemTier`, `getOrCreateRadiantItem`/`radiantItemId` for the `radiant_enhancer` consumable); `packages/server/src/mmr.ts` and client Profile/Leaderboard use `mmrToRank`/`RANK_BANDS`; `packages/client/src/itemModel.ts`/`itemIcon.ts`/`inspectModel.ts`/`combinePreview.ts` consume the type defs and helpers for display.

# Notes

- The most important non-obvious fact in this file for any agent touching the item system: radiant items are EAGER, not lazy, despite how `design-notes.md`'s prose phrases it ("derives `radiant_<baseId>` lazily/once"). "Once" is accurate (memoized); "lazily" is misleading — the eager module-load pass means every radiant variant exists in `gameData.items` before any game logic runs, specifically because the sim's `applyItems` has no special-case fallback for unrecognized ids and needs a real array entry to `find`.
- `gameData.items.length` being 87 (51 authored + 36 eagerly-generated radiants) rather than 51 is the kind of fact that would surprise a reader who only read `items.json` — any code/test iterating `gameData.items` expecting exactly the JSON file's contents should account for this.
- `DATA_VERSION` is a separately-hardcoded literal, not derived from `package.json` — a version bump in one place doesn't automatically propagate to the other.
