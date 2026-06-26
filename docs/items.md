# Item Catalog

**Source:** `packages/data/src/items.json` + `packages/data/src/loader.ts`

All item definitions live exclusively in `packages/data`. The `packages/balance` package contains no item data. No item content logic exists outside data.

---

## Classification

Items have five distinct tier buckets, defined by `itemKind(item)` in `loader.ts`:

| Tier | Kind | How obtained | Count in JSON |
|------|------|-------------|---------------|
| 1 | `component` | Loot / shop drops | 9 |
| 2 | `completed` | Combine two components via recipe | 36 |
| 3 | `artifact` | Loot-only, high-power | 6 |
| 4 | `radiant` | Dynamic — generated at load time from completed items (`getOrCreateRadiantItem`) | 36 (derived) |
| 5 | `mythical` | Loot-only, supreme power | 3 |

Additionally there are 3 `consumable` items that occupy no unit slot and have no tier.

**JSON total: 57 items** (9 components + 36 completed + 3 consumables + 6 artifacts + 3 mythicals). Radiant items (36) are not in JSON; they are synthesized at startup by `loader.ts` and pushed into `gameData.items`.

---

## Stat fields

All stat values are stored as-is (raw integers). Attack speed (`as`) is fixed-point scale 1000 (e.g. 150 = 0.150 attacks/s additive bonus). All other stats (`hp`, `ad`, `armor`, `mr`, `mana`, `abilityDamage`) are plain integers in the same scale the engine uses natively.

Passive fields:
- `passive.kind: "burn"` — on-hit burn DoT applied to the struck target. Fields: `value` (damage per tick), `duration` (ticks).
- `passive.kind: "shield"` — start-of-combat absorb shield on the bearer. Fields: `value` (absorb pool), `duration` (ticks).

Artifact pair-passive field (`pairPassive`): active only when the named `partnerId` artifact is also equipped on the same unit. Uses the same burn/shield shape.

---

## Tier 1 — Components (9)

Stat-only. `component: true` in JSON. No recipe, no passive.

| id | Name | Stats |
|----|------|-------|
| `iron_sword` | Iron Sword | `ad: 100` |
| `chain_vest` | Chain Vest | `armor: 200` |
| `mana_crystal` | Mana Crystal | `mana: 30`, `abilityDamage: 50` |
| `recurve_bow` | Recurve Bow | `as: 150` |
| `negatron_cloak` | Negatron Cloak | `mr: 150` |
| `giants_belt` | Giant's Belt | `hp: 400` |
| `sorcerer_rod` | Sorcerer Rod | `abilityDamage: 100` |
| `sparring_gloves` | Sparring Gloves | `ad: 40`, `as: 80` |
| `tear_flask` | Tear Flask | `mana: 20`, `hp: 200` |

---

## Tier 2 — Completed Items (36)

Each is the unordered combination of exactly two components. Recipe is stored as `recipe: [componentA, componentB]`. Items are listed below grouped by their first component.

### iron_sword combinations (7)

| id | Name | Recipe | Stats | Passive |
|----|------|--------|-------|---------|
| `iron_sword__chain_vest` | Iron Sword + Chain Vest | `iron_sword` + `chain_vest` | `ad: 100`, `armor: 200` | — |
| `iron_sword__mana_crystal` | Iron Sword + Mana Crystal | `iron_sword` + `mana_crystal` | `ad: 100`, `mana: 30`, `abilityDamage: 50` | — |
| `iron_sword__recurve_bow` | Iron Sword + Recurve Bow | `iron_sword` + `recurve_bow` | `ad: 100`, `as: 150` | — |
| `iron_sword__negatron_cloak` | Iron Sword + Negatron Cloak | `iron_sword` + `negatron_cloak` | `ad: 100`, `mr: 150` | — |
| `iron_sword__giants_belt` | Iron Sword + Giant's Belt | `iron_sword` + `giants_belt` | `ad: 100`, `hp: 400` | — |
| `iron_sword__sorcerer_rod` | Iron Sword + Sorcerer Rod | `iron_sword` + `sorcerer_rod` | `ad: 100`, `abilityDamage: 100` | burn on-hit: `value: 30`, `duration: 40` |
| `iron_sword__sparring_gloves` | Iron Sword + Sparring Gloves | `iron_sword` + `sparring_gloves` | `ad: 140`, `as: 80` | — |
| `iron_sword__tear_flask` | Iron Sword + Tear Flask | `iron_sword` + `tear_flask` | `ad: 100`, `mana: 20`, `hp: 200` | — |

Note: `iron_sword` combines with all 8 other components = 8 entries, but `iron_sword + iron_sword` doesn't exist (no self-combine). Actual count for iron_sword as first: 8 (the last entry above rounds out the set — all 8 non-self pairings are listed).

### chain_vest combinations (7)

| id | Name | Recipe | Stats | Passive |
|----|------|--------|-------|---------|
| `chain_vest__mana_crystal` | Chain Vest + Mana Crystal | `chain_vest` + `mana_crystal` | `armor: 200`, `mana: 30`, `abilityDamage: 50` | — |
| `chain_vest__recurve_bow` | Chain Vest + Recurve Bow | `chain_vest` + `recurve_bow` | `armor: 200`, `as: 150` | — |
| `chain_vest__negatron_cloak` | Chain Vest + Negatron Cloak | `chain_vest` + `negatron_cloak` | `armor: 200`, `mr: 150` | — |
| `chain_vest__giants_belt` | Chain Vest + Giant's Belt | `chain_vest` + `giants_belt` | `armor: 200`, `hp: 400` | shield start-of-combat: `value: 350`, `duration: 100` |
| `chain_vest__sorcerer_rod` | Chain Vest + Sorcerer Rod | `chain_vest` + `sorcerer_rod` | `armor: 200`, `abilityDamage: 100` | — |
| `chain_vest__sparring_gloves` | Chain Vest + Sparring Gloves | `chain_vest` + `sparring_gloves` | `armor: 200`, `ad: 40`, `as: 80` | — |
| `chain_vest__tear_flask` | Chain Vest + Tear Flask | `chain_vest` + `tear_flask` | `armor: 200`, `mana: 20`, `hp: 200` | — |

### mana_crystal combinations (6)

| id | Name | Recipe | Stats | Passive |
|----|------|--------|-------|---------|
| `mana_crystal__recurve_bow` | Mana Crystal + Recurve Bow | `mana_crystal` + `recurve_bow` | `mana: 30`, `abilityDamage: 50`, `as: 150` | — |
| `mana_crystal__negatron_cloak` | Mana Crystal + Negatron Cloak | `mana_crystal` + `negatron_cloak` | `mana: 30`, `abilityDamage: 50`, `mr: 150` | — |
| `mana_crystal__giants_belt` | Mana Crystal + Giant's Belt | `mana_crystal` + `giants_belt` | `mana: 30`, `abilityDamage: 50`, `hp: 400` | — |
| `mana_crystal__sorcerer_rod` | Mana Crystal + Sorcerer Rod | `mana_crystal` + `sorcerer_rod` | `mana: 30`, `abilityDamage: 150` | — |
| `mana_crystal__sparring_gloves` | Mana Crystal + Sparring Gloves | `mana_crystal` + `sparring_gloves` | `mana: 30`, `abilityDamage: 50`, `ad: 40`, `as: 80` | — |
| `mana_crystal__tear_flask` | Mana Crystal + Tear Flask | `mana_crystal` + `tear_flask` | `mana: 50`, `abilityDamage: 50`, `hp: 200` | — |

### recurve_bow combinations (5)

| id | Name | Recipe | Stats | Passive |
|----|------|--------|-------|---------|
| `recurve_bow__negatron_cloak` | Recurve Bow + Negatron Cloak | `recurve_bow` + `negatron_cloak` | `as: 150`, `mr: 150` | — |
| `recurve_bow__giants_belt` | Recurve Bow + Giant's Belt | `recurve_bow` + `giants_belt` | `as: 150`, `hp: 400` | — |
| `recurve_bow__sorcerer_rod` | Recurve Bow + Sorcerer Rod | `recurve_bow` + `sorcerer_rod` | `as: 150`, `abilityDamage: 100` | — |
| `recurve_bow__sparring_gloves` | Recurve Bow + Sparring Gloves | `recurve_bow` + `sparring_gloves` | `as: 230`, `ad: 40` | — |
| `recurve_bow__tear_flask` | Recurve Bow + Tear Flask | `recurve_bow` + `tear_flask` | `as: 150`, `mana: 20`, `hp: 200` | — |

### negatron_cloak combinations (4)

| id | Name | Recipe | Stats | Passive |
|----|------|--------|-------|---------|
| `negatron_cloak__giants_belt` | Negatron Cloak + Giant's Belt | `negatron_cloak` + `giants_belt` | `mr: 150`, `hp: 400` | — |
| `negatron_cloak__sorcerer_rod` | Negatron Cloak + Sorcerer Rod | `negatron_cloak` + `sorcerer_rod` | `mr: 150`, `abilityDamage: 100` | burn on-hit: `value: 25`, `duration: 60` |
| `negatron_cloak__sparring_gloves` | Negatron Cloak + Sparring Gloves | `negatron_cloak` + `sparring_gloves` | `mr: 150`, `ad: 40`, `as: 80` | — |
| `negatron_cloak__tear_flask` | Negatron Cloak + Tear Flask | `negatron_cloak` + `tear_flask` | `mr: 150`, `mana: 20`, `hp: 200` | — |

### giants_belt combinations (3)

| id | Name | Recipe | Stats | Passive |
|----|------|--------|-------|---------|
| `giants_belt__sorcerer_rod` | Giant's Belt + Sorcerer Rod | `giants_belt` + `sorcerer_rod` | `hp: 400`, `abilityDamage: 100` | — |
| `giants_belt__sparring_gloves` | Giant's Belt + Sparring Gloves | `giants_belt` + `sparring_gloves` | `hp: 400`, `ad: 40`, `as: 80` | — |
| `giants_belt__tear_flask` | Giant's Belt + Tear Flask | `giants_belt` + `tear_flask` | `hp: 600`, `mana: 20` | — |

### sorcerer_rod combinations (2)

| id | Name | Recipe | Stats | Passive |
|----|------|--------|-------|---------|
| `sorcerer_rod__sparring_gloves` | Sorcerer Rod + Sparring Gloves | `sorcerer_rod` + `sparring_gloves` | `abilityDamage: 100`, `ad: 40`, `as: 80` | — |
| `sorcerer_rod__tear_flask` | Sorcerer Rod + Tear Flask | `sorcerer_rod` + `tear_flask` | `abilityDamage: 100`, `mana: 20`, `hp: 200` | — |

### sparring_gloves combinations (1)

| id | Name | Recipe | Stats | Passive |
|----|------|--------|-------|---------|
| `sparring_gloves__tear_flask` | Sparring Gloves + Tear Flask | `sparring_gloves` + `tear_flask` | `ad: 40`, `as: 80`, `mana: 20`, `hp: 200` | — |

---

## Tier 2 — Passives summary

Only 2 of the 36 completed items carry a passive:

| Item id | Passive kind | value | duration |
|---------|-------------|-------|----------|
| `iron_sword__sorcerer_rod` | burn (on-hit) | 30 | 40 |
| `chain_vest__giants_belt` | shield (start-of-combat) | 350 | 100 |
| `negatron_cloak__sorcerer_rod` | burn (on-hit) | 25 | 60 |

(3 passives total across the 36 completed items.)

---

## Tier 4 — Radiant Items (36, dynamically generated)

Radiant items are NOT stored in `items.json`. At startup, `loader.ts` calls `getOrCreateRadiantItem` for every `completed` item and pushes the result into `gameData.items`. They are never in JSON.

- **Id pattern:** `radiant_<base_completed_id>` (e.g. `radiant_iron_sword__chain_vest`)
- **Name pattern:** `"Radiant " + base.name` (e.g. `"Radiant Iron Sword + Chain Vest"`)
- **Stats:** every base stat scaled by `radiantStatMultiplier` (stored value: `1750`, fixed-point scale 1000), each rounded: `Math.round(value * 1750 / 1000)`.
- **Passive:** carried unchanged from the base item (same `value` and `duration` — not scaled).
- **kind:** `"completed"` (they resolve as completed in the item-kind system).
- **No recipe** (field absent — cannot be crafted, only upgraded via `radiant_enhancer` consumable).
- **No pairPassive** (only artifacts carry pairPassive).

There are exactly 36 radiant variants, one per completed item.

---

## Tier 3 — Artifacts (6)

Loot-only. `kind: "artifact"` in JSON. No recipe. May carry a `pairPassive` (active only when both paired artifacts are equipped on the same unit).

| id | Name | Stats | pairPassive partnerId | pairPassive effect |
|----|------|-------|----------------------|--------------------|
| `warblade` | Warblade | `ad: 220`, `as: 200` | `warplate` | burn on-pair: `value: 40`, `duration: 50` |
| `warplate` | Warplate | `armor: 420`, `hp: 600` | `warblade` | burn on-pair: `value: 40`, `duration: 50` |
| `voidstaff` | Voidstaff | `abilityDamage: 280`, `mana: 40` | `voidmantle` | shield on-pair: `value: 600`, `duration: 120` |
| `voidmantle` | Voidmantle | `mr: 320`, `hp: 500` | `voidstaff` | shield on-pair: `value: 600`, `duration: 120` |
| `stormrider` | Stormrider | `as: 300`, `ad: 120`, `mr: 150` | — (no pairPassive) | — |
| `titan_heart` | Titan Heart | `hp: 1100`, `armor: 250` | — (no pairPassive) | — |

Notes on pairPassive: `warblade` and `warplate` are a pair (both must be on the same unit for burn to activate). `voidstaff` and `voidmantle` are a pair (both must be on the same unit for shield to activate). `stormrider` and `titan_heart` are unpaired artifacts with no `pairPassive` field.

---

## Tier 5 — Mythicals (3)

Loot-only. `kind: "mythical"` in JSON. No recipe, no passive, no pairPassive.

| id | Name | Stats |
|----|------|-------|
| `eclipse_crown` | Eclipse Crown | `ad: 250`, `abilityDamage: 350`, `as: 180` |
| `undying_bulwark` | Undying Bulwark | `hp: 1800`, `armor: 450`, `mr: 350` |
| `arcane_engine` | Arcane Engine | `abilityDamage: 500`, `mana: 80`, `as: 200` |

---

## Consumables (3, no tier)

`kind: "consumable"` in JSON. `stats: {}` (empty). Never occupy a unit item slot. Applied via `USE_CONSUMABLE` command. `itemTier` returns `null` for consumables.

| id | Name | consumableEffect |
|----|------|-----------------|
| `item_remover` | Item Remover | `remove_item` |
| `reforger` | Reforger | `reforge` |
| `radiant_enhancer` | Radiant Enhancer | `radiant_upgrade` |

---

## Item count summary

| Tier/Kind | Count in JSON | Notes |
|-----------|--------------|-------|
| Tier 1 — component | 9 | Static in items.json |
| Tier 2 — completed | 36 | Static in items.json |
| Tier 3 — artifact | 6 | Static in items.json |
| Tier 4 — radiant | 36 | Derived at load time; NOT in items.json |
| Tier 5 — mythical | 3 | Static in items.json |
| consumable | 3 | Static in items.json; no tier |
| **Total in JSON** | **57** | |
| **Total in gameData.items at runtime** | **93** | 57 + 36 radiant variants |

---

## Key loader functions

- `itemKind(item)` — resolves `component | completed | consumable | artifact | mythical` (explicit `kind` field wins; falls back to `component` flag for legacy entries).
- `itemTier(itemId, items, economy)` — returns the numeric tier (1–5) or null for consumables/unknown. Radiant ids (prefix `radiant_`) always return `economy.itemTierRadiant` (4).
- `recipeResult(aId, bId, items?)` — pure lookup; given two component ids (any order) returns the completed item id, or null. Artifacts/mythicals are never returned (they have no recipe).
- `getOrCreateRadiantItem(baseId, items, multiplier)` — builds and memoizes the radiant variant of a completed item. Stats are `Math.round(value * multiplier / 1000)`. Passive is copied unchanged.
- `radiantItemId(baseId)` — pure id derivation: `"radiant_" + baseId`.
