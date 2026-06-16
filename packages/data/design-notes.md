# Content design notes (v1)

Tuning lives entirely in JSON; this file only records intent and deferred ideas.

## Roster

50 units across tiers 13/13/12/8/4. Each unit has exactly one `origin` trait and
1–2 `classes` traits; `traits` is the flattened `[origin, ...classes]` array that
the sim and rules resolve against. Stats are role-derived (tank/bruiser/marksman/
caster/assassin/support) scaled by tier. The original 12 units keep their exact
stats and ids/order so existing determinism fixtures stay valid.

## Traits

12 origins + 10 classes. Breakpoints are derived from how many units carry the
trait: `[2]`, `[2,4]`, or `[2,4,6]` so every trait's top breakpoint is reachable.
`knight` keeps its documented armor curve (+200 / +500 / +800).

## Ability effects (all engine-supported)

- `magic_damage` — single-target magic damage to the nearest enemy (uses `abilityDamage`).
- `burn` — magic damage now + a burn DoT (true damage/tick) for a duration.
- `shield` — self shield that absorbs incoming damage for a duration.
- `buff` — self stat buff (`ad`) for a duration, reverted on expiry.
- `stealth` — start-of-combat: untargetable for a number of ticks.

Item passives reuse the same primitives: `burn` (on basic-attack hit) and
`shield` (granted at start of combat).

## Stage formula and PvE schedule

Rounds follow a two-regime formula implemented in `packages/rules/src/rounds.ts`
(`stageForRound`, `isPveRound`). All tuning (breakpoints, camp assignments) lives
in `mobs.json` and `loot.json`; the formula itself is structural code.

**Stage 1 (rounds 1–3):** every round is PvE. Players fight creep camps to learn
the game and build items before facing opponents.

**Stage 2+ (rounds 4–N):** each stage spans exactly 7 rounds. Within every stage,
`roundInStage` 4 and 7 are PvE; the remaining 5 rounds are PvP.

```
Stage 1:  R1  R2  R3
           P   P   P   (all PvE)

Stage 2:  R4  R5  R6  R7  R8  R9  R10
           -   -   -   P   -   -   P   (ris 4 and 7 are PvE)

Stage 3:  R11 R12 R13 R14 R15 R16 R17
           -   -   -   P   -   -   P

Stage 4:  R18 R19 R20 R21 R22 R23 R24
           -   -   -   P   -   -   P
```

Where `P` = PvE and `-` = PvP.

`stageForRound(round)` returns `{ stage, roundInStage }`:
- rounds 1–3: stage 1, roundInStage = round
- round 4+: stage = 2 + floor((round − 4) / 7), roundInStage = ((round − 4) % 7) + 1

`isPveRound(round)` returns true for stage 1 (all) and for roundInStage 4 or 7 in
stage 2+. Accepts an ignored optional second argument for call-site backward compatibility.

## mobs.json schema

`stages[]` entries use `{ stage, roundInStage, name, campType?, units }` — not a
flat `round` number. `pveStageForRound` derives `{ stage, roundInStage }` from the
absolute round and looks up by those two fields.

`campType` is a cosmetic display tag (shown in the combat header). It has no effect
on game logic. Mob defs (`mobs[]`) carry `isMob: true`, are never drawn from the
unit pool, and never contribute to or receive player trait bonuses.

## Camp assignment table

| Stage | roundInStage | campType       | name            | Notes                     |
|-------|--------------|----------------|-----------------|---------------------------|
| 1     | 1            | —              | Wandering Pack  | Intro wolves/beasts       |
| 1     | 2            | —              | Raiding Party   | Harder beasts             |
| 1     | 3            | —              | Den Guardians   | Tier-2 boss camp          |
| 2     | 4            | Krugs          | Krug Camp       | Stone golems, all 1-star  |
| 2     | 7            | Wolves         | Wolf Pack       | Fast packs, all 1-star    |
| 3     | 4            | Raptors        | Raptor Flock    | High-attack birds         |
| 3     | 7            | Dragons        | Dragon Brood    | Burn + magic damage       |
| 4     | 4            | Krugs          | Krug Warband    | 2-star krugs              |
| 4     | 7            | Dragons        | Ancient Dragon  | 2-star ember_drake        |

Dragon camp mobs use engine-supported ability effects only: `ember_drake` (tier 4)
has a `burn` ability; `dragon_whelp` (tier 3) has `magic_damage`.

Difficulty scales via mob tier + star level in `stages[].units`. Stage 4 camps use
2-star mobs to provide a meaningful late-game PvE challenge.

## Default starting bench unit

Every player begins each match with one 1-star `warrior` on bench slot 0, drawn
from the unit pool via `drawFromPool` in `createMatch`. The unit id is read from
`gameplay.startingUnitId` — not hard-coded in `match.ts`.

Pool conservation is maintained: the 8 starting-unit draws are reflected in the
pool deficit, and `totalInMatch` (pool + all bench/board/shop copies) still equals
`initialTotal()` at match start.

The warrior is drawn as a normal pool unit: if the pool is exhausted for that tier
(edge case), no unit is placed (the loop breaks). In practice tier-1 warrior has 29
pool copies; with 8 players one draw each leaves 21 in the pool.

## Consumables (item-system phase 2)

A third `ItemDataDef.kind`, alongside `component`/`completed` (an item with
neither `component: true` nor a `recipe` defaults to `completed` for back-compat —
see loader notes). Consumables are **not equippable** (never occupy a unit's
item slot), **not shop-purchasable**, and **not craftable** from components —
the only way to acquire one is PvE loot. They are used via the
`USE_CONSUMABLE` rules command against a held inventory id, are single-use
(removed from the player's `items` inventory on resolution), and target a unit.

Three consumables (`consumableEffect` discriminates behavior):

- `item_remover` (`remove_item`) — strips **every** item equipped on the
  target unit and returns each one to inventory unchanged (mirrors
  `UNEQUIP`, looped over all slots). No randomness. If the target unit holds
  zero items, this is a normal **no-op success** (not a typed error): the
  consumable is not consumed and no state changes.
- `reforger` (`reforge`) — reforges **every** item equipped on the target
  unit, each one independently replaced with a different random item of its
  **own same tier** (component tier 1, completed tier 2, artifact tier 3,
  radiant tier 4, mythical tier 5), excluding its own original id. Each
  equipped slot gets its own prng draw, processed in equipped-slot order, off
  the match's seeded prng (never `Math.random`), so the same seed + same call
  always yields the same set of replacements. The reforger is consumed exactly
  once regardless of how many items it touched. Tier-restricted per item so a
  reforge never changes the tier of any equipped item. If the target unit holds
  zero items, this is a normal **no-op success** (not consumed, no state
  change). If any equipped item has no same-tier alternative, the whole command
  fails with `NO_ALTERNATIVE_ITEM` (no partial reforge).

  **Scarcity note for artifacts/mythicals:** with only 6 artifacts and 3
  mythicals in the roster, a unit holding an artifact or mythical will
  frequently hit `NO_ALTERNATIVE_ITEM` when targeted by a reforger (5 other
  artifacts exist for tier-3 reforge; 2 other mythicals for tier-5). This is
  an **intended scarcity outcome** — the reforger is intentionally less
  reliable at high tiers. Balance consideration for a later tuning pass:
  if NO_ALTERNATIVE_ITEM becomes a dominant frustration point at high tiers,
  consider expanding the artifact/mythical roster rather than changing the
  reforge mechanic itself.

- `radiant_enhancer` (`radiant_upgrade`) — still targets exactly **one**
  named **completed** (tier-2) item on a unit (explicit `targetItemId`,
  required), upgrading it into its tier-4 "radiant" variant: every stat in
  the base item's stat bundle scaled by `economy.radiantStatMultiplier`
  (1750, i.e. ×1.75 in the project's scale-1000 fixed-point convention).
  Radiant items are never hand-authored in `items.json`; the loader derives
  `radiant_<baseId>` lazily/once the same way `recipeResult` derives recipe
  pairs — pure, deterministic, generated from the base item's own data. If
  the target unit holds **no** tier-2 (completed, non-radiant) items at all,
  the command fails with `NO_TIER_2_ITEMS_EQUIPPED`. If the unit does hold a
  tier-2 item but the given `targetItemId` isn't one (a component, a
  consumable, an artifact, a mythical, or an already-radiant variant), it
  fails with `NOT_TIER_2_ITEM`.

**Rounding rule** (applies everywhere a stat is scaled, e.g. the radiant
multiply): multiply the raw integer stat by the fixed-point multiplier (scale
1000) and round to the **nearest** integer (ties round away from zero), not
truncate — `Math.round((statValue * multiplier) / 1000)`. This differs from
`sim/fixed.ts`'s `fmul`/`fdiv` (which truncate toward zero for combat-tick
math); item stat derivation is a one-time data transform, not a hot
per-tick combat calculation, so nearest-rounding avoids visibly shaving
e.g. a `hp: 400` component down by truncation error. Document this once here
rather than re-deriving it at each call site.

Selling a unit (or `UNEQUIP`) never decomposes a completed (or radiant) item
back into its components — items always return to inventory as the single id
they are. `SELL` now also returns the unit's equipped items to the player's
inventory before removing the unit (previously they were destroyed with the
unit) — same transfer `UNEQUIP` already performs, just folded into `SELL` so
nothing is lost on sale.

Client UI is wired (no longer deferred): consumable chips read distinct in the
inventory bar (own fill/rim + per-effect glyph, never the gilded equippable
rim) and drag only onto a unit. `item_remover`/`reforger` send `USE_CONSUMABLE`
with no `targetItemId`; the renderer reports "changed" vs the no-op success
purely from a state diff around the command (renderer-is-dumb — it never
pre-inspects the unit's items to decide). `radiant_enhancer` opens a tier-2
item picker when the unit holds completed items (pick → send with
`targetItemId`; dismiss → cancel, chip returns to the bar), else sends and lets
the server reject with `NO_TIER_2_ITEMS_EQUIPPED`.

## Artifact and Mythical items (item-system phase 3)

Two new loot-only item kinds, introduced in phase 3:

### Tier overview

| Tier | Kind      | Source         | Notes                                      |
|------|-----------|----------------|--------------------------------------------|
| 1    | component | shop / loot    | 9 base components                          |
| 2    | completed | crafted / loot | 36 two-component combos                    |
| 3    | artifact  | loot only      | 6 hand-authored; may carry pair-passive    |
| 4    | radiant   | radiant_enhancer consumable | derived from completed items  |
| 5    | mythical  | loot only      | 3 hand-authored; supreme power             |

Artifacts and mythicals are **not shop-purchasable** and **not craftable**
via `recipeResult` (they have no `recipe` field). The only acquisition path
is PvE loot drops. They are equippable (occupy a unit item slot, subject to
the normal MAX_ITEMS_PER_UNIT = 3 cap) and are eligible for `item_remover`
and `reforger` — but NOT for `radiant_enhancer` (they are not `completed`
tier-2 items; targeting one returns `NOT_TIER_2_ITEM`).

### Artifact roster (tier 3)

Power benchmark: ~1.5× the primary stat of a typical tier-2 completed item
(guideline, not strict formula). Stats are hand-authored to feel distinct.

| id           | name        | stats                              | pair partner |
|--------------|-------------|------------------------------------|--------------|
| `warblade`   | Warblade    | ad 220, as 200                     | `warplate`   |
| `warplate`   | Warplate    | armor 420, hp 600                  | `warblade`   |
| `voidstaff`  | Voidstaff   | abilityDamage 280, mana 40         | `voidmantle` |
| `voidmantle` | Voidmantle  | mr 320, hp 500                     | `voidstaff`  |
| `stormrider` | Stormrider  | as 300, ad 120, mr 150             | —            |
| `titan_heart`| Titan Heart | hp 1100, armor 250                 | —            |

### Mythical roster (tier 5)

Power benchmark: ~2× the primary stat of a typical tier-2 completed item.

| id                | name            | stats                            |
|-------------------|-----------------|----------------------------------|
| `eclipse_crown`   | Eclipse Crown   | ad 250, abilityDamage 350, as 180|
| `undying_bulwark` | Undying Bulwark | hp 1800, armor 450, mr 350       |
| `arcane_engine`   | Arcane Engine   | abilityDamage 500, mana 80, as 200|

### Pair-passive mechanic

Two named artifact pairs: **Warblade + Warplate** and **Voidstaff + Voidmantle**.

When a unit holds **both** artifacts of a pair, each item's `pairPassive` is
activated at combat start. The pair passive reuses the existing passive effect
primitives (`burn` on-hit / `shield` start-of-combat) — no new engine
primitives required.

- **Warblade + Warplate pair bonus:** on-hit burn (value 40, duration 50 ticks).
  Applied by whichever item carries the `pairPassive` — since both items in the
  pair reference each other, the engine checks each item's `pairPassive.partnerId`
  against the unit's equipped items at combat start.

- **Voidstaff + Voidmantle pair bonus:** start-of-combat shield (value 600,
  duration 120 ticks). The shield stacks with any other shield sources.

The engine gates pair passives purely on the `partnerId` equip check: if the
partner id is present in the unit's `items` array, the pairPassive fires;
otherwise the item's base stats apply but the passive is skipped. Both items in
a pair carry the pairPassive field pointing to each other, so the passive effect
is naturally applied once per item (burn → one `onHitBurn` entry set; shield →
added to `unit.shield` once per item's passive). The burn case: the engine
processes each item's pairPassive in slot order, so `onHitBurn` from the second
item overwrites the first (same value — no effective difference). The shield case:
each of the two items' pairPassives adds 600 shield → total 1200 shield if both
are equipped. This is intentional and expected for the design.

Only artifact items carry `pairPassive`. Mythical items never have one (field
absent). Unpaired artifacts (`stormrider`, `titan_heart`) also lack the field.
No null/false sentinel — the field's absence means "no pair passive."

**Decision point created:** equipping both paired artifacts costs 2 of the unit's
3 item slots in exchange for a potent passive bonus. Players choose between
the pair synergy vs filling the third slot with a different item.

**Counterplay:** scouting the opponent's board reveals paired artifacts on units;
players can prioritize burst damage or silence effects to kill the paired unit
before it benefits from the passive over multiple rounds.

### Loot table placement

Artifacts appear in the `rare` rarity table (weight 3 each, 18 total new weight
out of roughly 100+ total). Mythicals appear in the `legendary` rarity table
(weight 6 each, 18 total new weight). Existing entries reduced proportionally to
keep total weight coherent. The `rare` gold entries were slightly reduced (18+10
→ 14+8) to accommodate artifacts; legendary gold reduced (14 → 10).

### Reforge scarcity at artifact/mythical tiers

With 6 artifacts (tier 3) and 3 mythicals (tier 5), a reforger targeting a unit
holding an artifact has 5 alternatives; targeting a mythical has only 2
alternatives. This makes `NO_ALTERNATIVE_ITEM` a realistic, frequent outcome when
reforging mythical items (only 2 alternatives means 1-in-3 chance per slot if
the item is picked is one of the 2 others... but with only 2 alternatives the
pool is thin). **Balance consideration:** if NO_ALTERNATIVE_ITEM becomes a dominant
player frustration at high tiers, expand the mythical roster (add 1-2 more
mythicals) rather than relaxing the reforge mechanic tier-restriction.

## future: deferred behaviors (NOT implemented — do not encode in JSON)

These would each require new engine primitives and event types; intentionally
left out of v1 content so the engine stays within its spec'd behavior set:

- // future: area-of-effect / cone / line damage abilities
- // future: heals and resurrection (negative damage / revive events)
- // future: crowd control (stun/root/knockback) needing movement-lock state
- // future: lifesteal / omnivamp on-hit healing
- // future: mana-burn and ability-silence
- // future: recipe combination at equip time (2 components → completed item);
  rules currently equip any item id directly, recipes are data-only for now
- // future: full scripted tutorial match (a guided first game with forced
  moves). Phase 9 ships only dismissable, once-shown coachmarks on the first
  Practice match (client `onboarding.ts`); a scripted tutorial is out of scope.
- // future: pair-passive on mythical items (currently only artifacts carry
  pairPassive; mythicals are intentionally simpler for the first phase)
- // future: named pair-passive interactions beyond burn/shield primitives
  (new effect kinds such as haste, omnivamp, mana-restore would require new
  engine primitives)
