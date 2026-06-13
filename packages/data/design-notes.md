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
