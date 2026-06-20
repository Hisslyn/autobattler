# Path & purpose

`packages/client/src/inspectModel.ts` -- pure derivations for the unit-inspect panel: assembles a unit's (or PvE mob's) identity, full stat block, ability description, equipped items, and trait references from data definitions plus an optional live `UnitInstance`. No Pixi, no game logic.

# Responsibility

Owns the single canonical "what should the inspect panel show for this unit" model, covering THREE distinct viewing contexts uniformly: a shop preview (no live instance -- base stats, 1-star), an owned board/bench unit (live instance -- current hp/mana/star/items), and a PvE mob (data.mobs lookup instead of data.units, no traits, no shop cost, no items). Also owns the shared human-readable ability-description formatter used both here and by `traitDetailModel.ts`-adjacent panels.

# Exports

- `interface InspectStat { label: string; value: string }` -- one glanceable stat row.
- `interface InspectTrait { id: string; name: string; kind: "origin" | "class" }` -- a trait reference for display.
- `interface InspectModel { defId, name, tier, star, cost, origin: InspectTrait|null, classes: InspectTrait[], ability: {name,manaCost,description}|null, stats: InspectStat[], items: ItemModel[] }` -- the full panel model. `star` is "1 for a shop preview, the live star for an owned unit." `cost` is "Buy cost in gold (= tier for units; 0 for mobs -- they have no shop cost)." `items` is "empty for a shop preview / no items."
- `function abilityDescription(name: string, effect: AbilityEffectData, abilityDamage: number): string` -- the SHARED ability-effect-to-prose formatter (exported standalone, reused beyond just this file's internal model-building): exhaustively switches on `effect.kind` --
  - `magic_damage` -> `"Deals {abilityDamage} magic damage to the current target."`
  - `burn` -> `"Deals {abilityDamage} magic damage, then burns for {effect.burn} over {effect.duration} ticks."`
  - `shield` -> `"Gains a {effect.amount} shield for {effect.duration} ticks."`
  - `buff` -> `"Buffs {effect.stat} by {formatStatDelta(effect.stat, effect.value)} for {effect.duration} ticks."` (delegates the numeric formatting to `statFormat.ts`'s delta formatter, e.g. correctly rendering a fixed-point AS delta like `+280` as `"+0.28"`).
  - `stealth` -> `"Untargetable for the first {effect.duration} ticks of combat."`
  No default case -- the switch is exhaustive over the engine's full supported ability-effect kind set; adding a new effect kind to the sim without adding a case here would be a TypeScript compile error (assuming the switch's exhaustiveness is enforced, which a `never`-typed return-path check would catch).
- `function inspectModel(defId: string, instance: UnitInstance | null, data: GameData): InspectModel | null` -- the main entry point. Looks up `defId` in `data.units` first; if found, delegates to `_modelFromUnit`. If NOT found there (a PvE mob defId, since mobs are absent from `data.units` by design), falls back to searching `data.mobs.mobs` and delegates to `_modelFromMob`. Returns `null` only if `defId` is unknown in BOTH tables.

# Key behavior

- `_modelFromUnit` (internal): `star = instance?.star ?? 1` (owned units show their real star, a shop preview defaults to 1-star display). `hp`/`mana` display strings are `"current/max"` when a live instance exists, else just the def's base value(s) (`def.hp`, `def.manaStart/def.mana`). Builds 8 fixed stat rows in order (HP, AD, AS, Armor, MR, Range, Mana, Ability) -- each numeric stat (AD/AS/Armor/MR/Range) prefers the live instance's CURRENT value (post-trait/item bonuses) over the def's base value, formatted via `statFormat.ts`'s `formatStat` (so AS correctly divides by 1000 for display while the rest render raw). Resolves `origin`/`classes` via the internal `traitRef(id, data)` helper (looks up the trait by id in `data.traits`, returns `{id,name,kind}` or null if unknown -- `classes` filters out any nulls). Builds the `ability` block by calling `abilityDescription` with the def's actual `ability.effect`/`abilityDamage`. Resolves `items` by mapping the live instance's equipped item ids (or an empty array if no instance) through `itemModel(id, data)`, filtering out any that fail to resolve.
- `_modelFromMob` (internal): structurally mirrors `_modelFromUnit` but reads from `MobDataDef` instead of `UnitDataDef`, and differs in three deliberate ways: `cost` is hardcoded `0` ("Mobs have no shop cost -- omit by using 0 (rendered as tier-only in panel)"); `origin`/`classes` are hardcoded `null`/`[]` (mobs carry no traits, consistent with the engine's "mob defIds are absent from data.units, so applyTraits never counts them"); `items` is hardcoded `[]` with the comment "Mobs never hold items." The `ability` row (and stat row) is OPTIONAL/conditional -- mobs may or may not define an ability (`mob.ability` is optional per the mob data shape), so the stat-rows array conditionally spreads in an `{label:"Ability", value:...}` entry only when present, and the `ability` field on the returned model is `null` when the mob has none.
- `traitRef` is a tiny shared internal helper used only by `_modelFromUnit` (mobs never call it, since their origin/classes are hardcoded).

# Invariants & constraints

- **`inspectModel` must check `data.units` BEFORE falling back to `data.mobs.mobs`** -- this ordering encodes the project-wide rule that "a defId absent from `data.units` is a mob" (used identically by `unitToken.ts`'s mob-ring detection and `combat/view.ts`'s tier lookup); reversing the lookup order or removing the fallback would break PvE unit inspection entirely.
- `abilityDescription`'s switch MUST stay exhaustive over the engine's supported `AbilityEffectData` kind union -- per `CLAUDE.md`'s engine.ts summary, the supported set is exactly `magic_damage`/`burn`/`shield`/`buff`/`stealth`; if the sim ever adds a new ability-effect kind, this function (and likely several sibling formatters) needs a matching new case or it will fail to compile (no default/fallback case exists to silently swallow an unhandled kind).
- `_modelFromMob`'s `cost: 0` is a DISPLAY simplification, not a claim that mobs have a real zero gold cost in any economic sense -- the comment clarifies it's specifically because mobs aren't shop-purchasable at all, so "0" is just a sentinel the panel renders as "tier-only" rather than a cost figure.
- Stat values always prefer the LIVE instance's current (post-buff) values when an instance exists, falling back to the def's base values only for a no-instance shop/mob preview -- a reader adding a new stat row must follow this same `instance?.X ?? def.X` pattern to stay consistent with the rest of the model.
- `formatStat`/`formatStatDelta` (from `statFormat.ts`) are the ONLY place raw fixed-point stat values get converted to display strings in this file -- any new numeric stat added to the model must route through one of those two formatters rather than interpolating the raw value directly, to avoid leaking unscaled fixed-point numbers (e.g. AS as `750` instead of `0.75`) into the UI.

# Depends on

`@autobattler/sim/src/types.js` (type-only: `UnitInstance`). `@autobattler/data` (types `GameData`, `UnitDataDef`, `AbilityEffectData`, `MobDataDef`). `./statFormat.js` (`formatStat`, `formatStatDelta` -- the single source for fixed-point-aware stat string formatting). `./itemModel.js` (`itemModel`, type `ItemModel` -- resolves equipped item ids into display models).

# Used by

`packages/client/src/inspectPanel.ts` (`renderUnitInspect` consumes `InspectModel` directly to draw the panel: token, name, tier/cost, trait chips, ability block, stat grid, equipped-items row). `packages/client/src/scenes/match.ts` (long-press on any shop/bench/board unit, or the scout overlay's opponent-board inspection, builds an `inspectModel` and passes it to `renderUnitInspect`). `abilityDescription` may also be reused wherever a standalone ability-effect description string is needed outside the full inspect panel (e.g. potentially a tooltip).

# Notes

- The file header explicitly frames the three-context design intent: "board/bench show current hp/mana; shop shows base stats" -- this is the entire reason `instance` is nullable rather than required, and why every numeric field uses the `instance?.X ?? def.X` fallback pattern throughout both internal builder functions.
- `_modelFromMob`'s ability stat row uses array-spread conditional inclusion (`...(mob.ability ? [{...}] : [])`) rather than a later filter step -- a slightly different idiom than `_modelFromUnit` (which always includes the Ability row unconditionally, since real units always have an ability) -- this asymmetry is intentional and reflects the real data shape difference (unit `ability` is required, mob `ability` is optional).
