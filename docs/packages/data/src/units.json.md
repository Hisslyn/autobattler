# packages/data/src/units.json

**Path & purpose** — `packages/data/src/units.json`. Content-only JSON array defining all 50 player-recruitable units: identity, tier, origin/class traits, base combat stats, and ability. Loaded by `packages/data/src/loader.ts` into `gameData.units` and consumed by the sim (combat stats/abilities), rules (pool/shop), and client (display) layers.

**Responsibility** — Owns the entire player unit roster's tuning and identity. This is the single source of every unit's base stats, ability, and trait membership — no unit content or stat numbers exist anywhere else in code. Distinct from `mobs.json` (PvE creeps, never pooled, never trait-counted).

**Exports** — Data file, no JS/TS exports. Shape is a flat array of `UnitDataDef` (interface in `loader.ts`):
```
UnitDataDef = {
  id, name, tier,
  origin: string,        // single origin trait id
  classes: string[],     // 1-2 class trait ids
  hp, ad, as, armor, mr, range, mana, manaStart, abilityDamage: number,
  ability: { name, manaCost, effect: AbilityEffectData },
  traits: string[]       // flattened [origin, ...classes] — the sim/rules resolve traits from THIS, not origin/classes directly
}
```
`AbilityEffectData` is a tagged union: `{kind:"magic_damage"}` | `{kind:"burn", burn, duration}` | `{kind:"shield", amount, duration}` | `{kind:"buff", stat: "ad"|"as"|"armor"|"mr"|"abilityDamage", value, duration}` | `{kind:"stealth", duration}`.

50 units total, distributed 13/13/12/8/4 across tiers 1-5 (matches CLAUDE.md's documented split). 12 origins used: `frost`(4), `forest`(4), `arcane`(5), `holy`(7), `shadow`(5), `celestial`(4), `beast`(4), `dragon`(4), `storm`(4), `undead`(4), `elemental`(2), `abyssal`(3). 10 classes used (a unit can carry 1 or 2): `knight`(11), `ranger`(6), `sorcerer`(12), `assassin`(9), `warden`(7), `gunner`(5), `mystic`(6), `berserker`(7), `duelist`(6), `summoner`(4). Ability effect kinds across the roster: `magic_damage`(19), `shield`(11), `stealth`(7), `buff`(7), `burn`(6) — all five are members of the engine's supported ability-effect set (no other kinds exist).

**Key behavior**
- Stats scale with tier: tier 1 units run ~400-800 hp / 35-70 ad; tier 5 units (`god_king`, `void_reaper`, `archsage`, `world_ender`) run 1380-2550 hp / 105-235 ad with abilityDamage up to 690 — role-derived and budget-balanced by hand per CLAUDE.md's "role-derived stats" note (the actual derivation formula isn't in this file; it's a tuning convention applied when authoring each row).
- Each unit's `traits` array is the FLATTENED `[origin, ...classes]` — this is the only field the sim and rules actually read for trait counting (`applyTraits` in `packages/sim/src/engine.ts` checks `def.traits.includes(traitDef.id)`), NOT `origin`/`classes` directly; those two fields exist for clarity/display purposes (the client trait-strip and inspect models read `origin`/`classes` too, e.g. `inspectModel.ts`).
- `manaStart` is the unit's starting mana fraction at combat start (most are 0; ranged/caster units like `mage`, `cleric`, `acolyte`, `novice`, etc. start with 20-40 banked mana so their first cast comes sooner); `mana` is the full cast threshold.
- `ability.effect.kind: "stealth"` units (`rogue`, `shadowblade`, `cutpurse`, `nightblade`, `wraith`, `nightlord`, `void_reaper` — all `assassin`-class) resolve their stealth at COMBAT START, not on cast, per the engine's documented special-case for stealth (see `packages/sim/src/engine.ts` notes); their `duration` field (60 for nearly all) sets how long they remain untargetable.
- `kind: "buff"` units (`cleric`, `brawler`, `fencer`, `reaver`, `champion`, `ravager`, `world_ender`) buff their own stat (mostly `ad`, all with `duration: 100`) on cast — reverted when the buff expires.
- `kind: "shield"` units (`paladin`, `knight_errant`, `templar`, `footman`, `sentinel`, `warpriest`, `frost_knight`, `vanguard`, `treant`, `paragon`, `god_king`) grant themselves a self-absorb shield on cast, `duration: 80` for all; shield `amount` scales with tier (360 at t1 up to 1150 at t5).
- `kind: "burn"` units (`sage`, `pyromancer`, `phoenix`, `dragonlord`, `lich`, `archsage`) deal magic damage plus apply a damage-over-time burn (`duration: 60` for all, `burn` magnitude scaling 50→110 by tier).
- Stat field name `as` is fixed-point attack speed (scale 1000 = 1.0x) per the project-wide fixed-point invariant — every other numeric field here is the unit's real stat value (not fixed-point), matching the client's `statFormat.ts` convention.

**Invariants & constraints**
- Every unit MUST have exactly one `origin` and 1-2 `classes` (project convention, not enforced by a schema in this file — `packages/data/tests/integrity.test.ts` is expected to validate this).
- `id` is globally unique across this file and must never collide with any id in `mobs.json` (disjoint namespaces — mobs are excluded from trait counting and pool conservation precisely because they're absent from `data.units`).
- `traits` must equal `[origin, ...classes]` exactly (same ids, same order is not load-bearing but content must match) — a mismatch would desync the unit's displayed origin/class from what actually triggers trait bonuses in combat.
- Every `origin`/`classes` string must match an `id` in `traits.json`; every `ability.effect.kind` must be one of the engine's five supported kinds (no new ability behaviors can be introduced via data alone — the engine code must support the primitive first).
- `tier` directly drives the unit's shop cost and pool count (defined in `economy.json`'s tier-indexed tables, not here) and the star-multiplier base (`gameplay.json`'s `starMultipliers`, applied by the sim at combat start: 1.8x at 2-star, 3.24x at 3-star) — those multipliers apply to the stats stored here.
- This file carries NO position/visual data — token rendering, glyphs, and art are resolved client-side purely from `id`/`origin`/`classes` (glyph fallback) or `public/units/<id>.png` (art drop-in), never from this file.

**Depends on** — Nothing directly (leaf JSON), but every `origin`/class string must resolve against `traits.json`, and every ability effect kind must be one the sim engine supports.

**Used by**
- `packages/data/src/loader.ts` — imports as `rawUnits`, exposes `gameData.units`, typed `UnitDataDef[]`.
- `packages/sim/src/engine.ts` — `applyTraits` reads `def.traits` for trait-breakpoint counting; combat stat application reads hp/ad/as/armor/mr/range/mana/manaStart/abilityDamage as the UnitInstance's base stats before star/item/trait modifiers; ability resolution reads `ability.effect.kind` to pick the right combat primitive.
- `packages/rules/src/pool.ts` — pool counts are indexed by `tier` (from `economy.json`), and unit ids here are what's drawn/returned.
- `packages/rules/src/shop.ts` — shop slot rolls draw unit ids from the pool by tier-weighted odds (`economy.json`'s `shopOdds`).
- `packages/rules/src/ai.ts` — the seeded bot policy reads unit tiers/traits to make shop/board decisions.
- `packages/balance/src/compositions.ts` — representative comp archetypes reference these unit ids directly (`defId`+`star`).
- Client: `inspectModel.ts` (full stat block + ability description + origin/classes), `hudModel.ts`/`traitStripModel` (trait counting mirrors the sim's logic against this roster), `unitToken.ts` (tier-color ring from `tier`), `glyphs.ts` (`glyphForTraits` picks the primary class glyph from `classes[0]`), `sprites.ts` (art drop-in keyed by `id`).

**Notes** — Several units share identical stat blocks/abilities at the same tier with different origin+class pairs (e.g. `sentinel` and `frost_knight` are both t2 frost-origin shield-warden/knight hybrids with hp 1150/ad 70/shield amount 520; `champion` and `ravager` are both t3 hp1260/ad120/buff+70ad). This is intentional design symmetry (same power budget, different trait flavor), not duplication error. The roster naming sometimes reuses generic class-archetype names across tiers without an explicit tier suffix (e.g. `archer` vs `sharpshooter` vs `stormlord`/`huntress` are different units at different tiers within ranger/gunner lineage) — always resolve by `id`, never by display `name` similarity.
