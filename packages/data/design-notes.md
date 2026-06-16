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

## Consumables (item-system phase 1)

A third `ItemDataDef.kind`, alongside `component`/`completed` (an item with
neither `component: true` nor a `recipe` defaults to `completed` for back-compat —
see loader notes). Consumables are **not equippable** (never occupy a unit's
item slot), **not shop-purchasable**, and **not craftable** from components —
the only way to acquire one is PvE loot. They are used via the new
`USE_CONSUMABLE` rules command against a held inventory id, are single-use
(removed from the player's `items` inventory on resolution), and target a
specific unit's equipped item.

Three v1 consumables (`consumableEffect` discriminates behavior):

- `item_remover` (`remove_item`) — strips one named item off a unit and returns
  it to inventory unchanged (mirrors `UNEQUIP`). No randomness.
- `reforger` (`reforge`) — replaces one named item on a unit with a different
  random item of the **same tier** (component tier 1, completed tier 2),
  excluding the original id. Tier-restricted so a reforge never changes a
  component into a completed item or vice versa. Deterministic: resolved
  through the match's seeded prng, never `Math.random`, so the same seed +
  same call always yields the same replacement.
- `radiant_enhancer` (`radiant_upgrade`) — upgrades one named **completed**
  (tier-2) item on a unit into its tier-4 "radiant" variant: every stat in the
  base item's stat bundle scaled by `economy.radiantStatMultiplier` (1750,
  i.e. ×1.75 in the project's scale-1000 fixed-point convention). Radiant
  items are never hand-authored in `items.json`; the loader derives
  `radiant_<baseId>` lazily/once the same way `recipeResult` derives recipe
  pairs — pure, deterministic, generated from the base item's own data. A
  base item with no completed counterpart (i.e. not tier 2) cannot be
  radiant-upgraded.

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

This phase is rules/data/protocol only: no client UI renders consumables or
the `USE_CONSUMABLE` command yet (no inventory affordance to pick a consumable
+ target unit + target item). That is deferred to a later phase.

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
- // future: client UI for consumables (inventory affordance to select a
  consumable + target unit + target item and send `USE_CONSUMABLE`) — phase 1
  of the item-system expansion is rules/data/protocol only (see above)
- // future: Artifacts / Mythical items and the full Radiant item catalog
  beyond the single generic upgrade path shipped in phase 1 (out of scope for
  this phase; tracked for a later item-system phase)
