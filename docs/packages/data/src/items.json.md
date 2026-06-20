# Path & purpose

`packages/data/src/items.json` — the complete item roster: 9 stat-only base components, 36 completed (crafted) items (one per unordered component pair), 3 consumables, 6 artifacts, and 3 mythicals (51 entries total). Loaded and typed as `ItemDataDef[]` by `packages/data/src/loader.ts`, exposed as `gameData.items`.

# Responsibility

Owns every item's identity, stat bundle, recipe relationship, passive/pair-passive, and kind classification. This is the data backing the entire item system described in `design-notes.md` (phases 1-3): crafting, on-hit/start-of-combat passives, consumables, and loot-only artifact/mythical tiers.

# Exports

Not code — a JSON array, typed by the `ItemDataDef` interface in `loader.ts`:
```
interface ItemDataDef {
  id: string; name: string; stats: Partial<Record<string, number>>;
  component?: boolean;       // true for the 9 base components
  recipe?: [string, string]; // unordered component pair for completed items
  passive?: ItemPassiveData; // at most one, on completed items only
  kind?: ItemKind;           // "component"|"completed"|"consumable"|"artifact"|"mythical"; derived from `component` when absent (back-compat)
  consumableEffect?: ConsumableEffect; // "remove_item"|"reforge"|"radiant_upgrade", consumables only
  pairPassive?: PairPassiveData; // artifact-only, present only on paired artifacts
}
```

# Key behavior (content map)

**9 base components** (`component: true`, no `kind` field — back-compat derives `kind: "component"`): `iron_sword` (ad 100), `chain_vest` (armor 200), `mana_crystal` (mana 30 + abilityDamage 50), `recurve_bow` (as 150), `negatron_cloak` (mr 150), `giants_belt` (hp 400), `sorcerer_rod` (abilityDamage 100), `sparring_gloves` (ad 40 + as 80), `tear_flask` (mana 20 + hp 200).

**36 completed items**: every unordered pair among the 9 components (C(9,2)=36), id = `<a>__<b>` (components alphabetically/insertion-ordered with double-underscore join, matching the order they're combined in this file — e.g. `iron_sword__chain_vest`), name = `"<A Name> + <B Name>"`, `stats` = the union/sum of both components' stats, `recipe: [componentA, componentB]` (the unordered pair `recipeResult` matches against). NO explicit `kind` field on these either — back-compat derives `kind: "completed"` (since `component` is absent/falsy but a `recipe` is present).

**Passives on completed items** — exactly 3 of the 36 carry a `passive` field (confirmed by grep: `iron_sword__sorcerer_rod`, `chain_vest__giants_belt`, `negatron_cloak__sorcerer_rod`):
- `iron_sword__sorcerer_rod` (ad 100 + abilityDamage 100): `passive: {kind:"burn", value:30, duration:40}` — on-hit burn.
- `chain_vest__giants_belt` (armor 200 + hp 400, exact stat field names not re-verified but follows the union pattern): `passive: {kind:"shield", value:?, duration:?}` — start-of-combat shield (confirmed kind=shield at line 229 in the raw file).
- `negatron_cloak__sorcerer_rod` (mr 150 + abilityDamage 100): `passive: {kind:"burn", value:?, duration:?}` — another on-hit burn.

Per CLAUDE.md's items.json summary, "a completed item is a stat bundle + at most one passive (burn on-hit or shield start-of-combat)" — these 3 are that "at most one" instantiated; the other 33 completed items have no `passive` field at all (stat-bundle-only).

**3 consumables** (`kind: "consumable"`, empty `stats: {}`, each with a `consumableEffect`): `item_remover` (`remove_item`), `reforger` (`reforge`), `radiant_enhancer` (`radiant_upgrade`) — full semantics in `design-notes.md`'s consumables section. None have `component`/`recipe`/`passive`/`pairPassive` fields.

**6 artifacts** (`kind: "artifact"`, loot-only, may carry `pairPassive`):
- `warblade` (ad 220, as 200) — `pairPassive: {partnerId:"warplate", effect:{kind:"burn", value:40, duration:50}}`.
- `warplate` (armor 420, hp 600) — `pairPassive: {partnerId:"warblade", effect:{kind:"burn", value:40, duration:50}}` (mirror of warblade's — same effect values on both sides of the pair).
- `voidstaff` (abilityDamage 280, mana 40) — `pairPassive: {partnerId:"voidmantle", effect:{kind:"shield", value:600, duration:120}}`.
- `voidmantle` (mr 320, hp 500) — `pairPassive: {partnerId:"voidstaff", effect:{kind:"shield", value:600, duration:120}}` (mirror).
- `stormrider` (as 300, ad 120, mr 150) — NO `pairPassive` (unpaired).
- `titan_heart` (hp 1100, armor 250) — NO `pairPassive` (unpaired).

**3 mythicals** (`kind: "mythical"`, loot-only, NEVER carry `pairPassive`): `eclipse_crown` (ad 250, abilityDamage 350, as 180), `undying_bulwark` (hp 1800, armor 450, mr 350), `arcane_engine` (abilityDamage 500, mana 80, as 200).

# Invariants & constraints

- The 36 completed items are EXHAUSTIVE over all unordered pairs of the 9 components (C(9,2)=36) — adding or removing a base component would require regenerating the full completed-item set to maintain this exhaustiveness, and `recipeResult`'s lookup assumes every pair has exactly one completed-item match.
- `id` for completed items follows `<componentA>__<componentB>` with a literal double underscore — this exact format is also used by the unit-art/item-art drop-in convention (`public/items/<itemId>.png`, e.g. `iron_sword__sorcerer_rod.png` per CLAUDE.md's item-art section) and by `pairPassive.partnerId` lookups (artifact ids, not double-underscore joined, since artifacts aren't crafted).
- `kind` is OPTIONAL and absent on every component/completed-item entry in this file — the loader's `itemKind()` function (line ~300 in `loader.ts`) derives it from `component`/`recipe` presence when the explicit field is missing, per the interface comment "Explicit kind; when absent, derived from `component` (back-compat)." Only consumables/artifacts/mythicals carry an EXPLICIT `kind` in this file (since there's no other way to distinguish them from a "missing kind defaults to completed" rule).
- Radiant (tier-4) items are NEVER present in this file — confirmed by the absence of any `radiant_` prefixed entry; they are derived lazily at runtime by the loader's `recipeResult`-adjacent radiant-generation logic (a `radiantCache` Map in `loader.ts`), scaling a base completed item's stats by `economy.json`'s `radiantStatMultiplier` (1750 = ×1.75) with nearest-rounding per `design-notes.md`'s rounding rule.
- `pairPassive.effect` reuses the SAME passive primitive shape as completed items' `passive` field (`{kind:"burn"|"shield", value, duration}`) — no new engine primitives, per design-notes.md.
- Both items in a pair carry IDENTICAL `effect` values pointing at each other (`warblade`↔`warplate` both specify burn 40/50; `voidstaff`↔`voidmantle` both specify shield 600/120) — this is what design-notes.md describes as the engine "processing each item's pairPassive in slot order" (for burn, redundant since identical; for shield, ADDITIVE since each item independently grants its own 600, totaling 1200 when both equipped).

# Depends on

Nothing — a leaf JSON file with no imports. References its own ids internally (`recipe`/`pairPassive.partnerId` arrays), validated for consistency only by `packages/data/tests/integrity.test.ts` (not this file itself).

# Used by

- `packages/data/src/loader.ts` — loads + types this array, exposes as `gameData.items`; also implements `itemKind()`, `recipeResult()` (recipe lookup), and the radiant-item lazy-derivation cache, all reading from this array.
- `packages/rules/src/commands.ts` — EQUIP/UNEQUIP/COMBINE_ITEMS/USE_CONSUMABLE all read item defs from here (stats to apply, recipe to validate combine, passive/pairPassive for the sim to apply at combat start, consumableEffect to dispatch the right consumable logic).
- `packages/sim/src/engine.ts` — applies each unit's equipped items' stat bundles + passives (burn/shield) + pair-passives at combat start (per CLAUDE.md: "Applies item stat bundles per unit at combat start").
- `packages/client/src/itemModel.ts`/`itemIcon.ts`/`combinePreview.ts`/`inspectModel.ts` — display models reading stats/kind/passive/recipe for the inventory bar, equip/combine previews, and inspect panels.
- `packages/data/tests/integrity.test.ts` — cross-checks this file's internal consistency (recipe pairs resolve, ids are unique, etc. — exact assertions to be confirmed when that test file is documented).

# Notes

- This file mixes TWO different "shapes" of entry depending on era: the original 9 components + 36 completed items (no explicit `kind`, relying on back-compat derivation) vs the newer consumables/artifacts/mythicals (always explicit `kind`). A reader scanning for "all artifact items" should filter on `kind === "artifact"` directly rather than relying on absence-based inference, since absence-based inference only correctly disambiguates component-vs-completed (not the newer kinds).
- The file has no `version` or schema marker of its own — `packages/data/package.json`'s `"version": "0.1.0"` is the closest thing, and per the `economy.json` doc's note, it hasn't been bumped despite this file's substantial phase-2/3 growth.
