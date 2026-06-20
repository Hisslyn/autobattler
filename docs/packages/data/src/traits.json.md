# packages/data/src/traits.json

**Path & purpose** — `packages/data/src/traits.json`. Content-only JSON array defining all 22 trait definitions (12 origins + 10 classes) that grant team-wide stat bonuses at unit-count breakpoints. Loaded by `packages/data/src/loader.ts` into `gameData.traits` and consumed by the sim's `applyTraits` at combat start.

**Responsibility** — Owns every trait's identity (`id`/`name`/`kind`) and its breakpoint table (unit-count threshold → flat stat bonus). This is the entire trait system's tuning surface — no trait logic or numbers exist anywhere else; `units.json` only references trait ids by string, never duplicates effect values.

**Exports** — Data file, no JS/TS exports. Shape is a flat array of `TraitDataDef` (interface in `loader.ts`):
```
TraitDataDef = { id: string, name: string, kind: "origin" | "class", breakpoints: TraitBreakpoint[] }
TraitBreakpoint = { count: number, effect: { stat: string, value: number } }
```
22 entries total:
- **12 origins** (`kind: "origin"`): `holy` (mr: 2→150, 4→350, 6→600 — only origin with a 3rd breakpoint besides knight-style classes), `shadow` (ad: 2→25, 4→60), `arcane` (abilityDamage: 2→150, 4→350), `frost` (armor: 2→150, 4→350), `forest` (as: 2→120, 4→280), `beast` (ad: 2→25, 4→60), `celestial` (hp: 2→300, 4→650), `dragon` (abilityDamage: 2→150, 4→350), `storm` (as: 2→120, 4→280), `undead` (abilityDamage: 2→150, 4→350), `elemental` (abilityDamage: 2→150 only — single breakpoint), `abyssal` (ad: 2→25 only — single breakpoint).
- **10 classes** (`kind: "class"`): `knight` (armor: 2→200, 4→500, 6→800 — the distinctive escalating armor curve called out in CLAUDE.md), `ranger` (as: 2→120, 4→280, 6→450), `sorcerer` (abilityDamage: 2→150, 4→350, 6→650), `assassin` (ad: 2→25, 4→60, 6→110), `warden` (hp: 2→300, 4→650, 6→1100), `berserker` (as: 2→120, 4→280, 6→450), `mystic` (abilityDamage: 2→150, 4→350, 6→650), `gunner` (ad: 2→25, 4→60 — only 2 breakpoints), `duelist` (as: 2→120, 4→280, 6→450), `summoner` (abilityDamage: 2→150, 4→350 — only 2 breakpoints).

**Key behavior**
- `loader.ts` casts the raw JSON straight to `TraitDataDef[]` with no transform; exposed as `gameData.traits`.
- The sim's `applyTraits(units, data)` (in `packages/sim/src/engine.ts`, called once per combat at start) computes, per team and per trait, the count of UNIQUE `defId`s (not unit copies) on that team whose `units.json` def's `traits` array includes this trait's `id`; it then finds the HIGHEST breakpoint whose `count` is `<=` that unique-unit count, and if one is active, adds `effect.value` to `effect.stat` on every unit on that team carrying the trait (via `addStat`).
- Breakpoints are non-cumulative: only the single highest reached breakpoint's effect applies, not the sum of all reached ones (e.g. a 6-knight team gets +800 armor total, not +200+500+800).
- Each unit can trigger multiple traits simultaneously (its own origin + 1-2 classes, each independently counted across the team and each independently granting its own stat bonus if its breakpoint is reached).
- All breakpoint thresholds in this file are designed so every top breakpoint is reachable by unit count, per the project's tuning intent in CLAUDE.md (2/4/6 the common pattern, 2/4 or 2-only for traits with a smaller unique-unit pool in `units.json`).

**Invariants & constraints**
- `id` here must exactly match a string appearing in some `units.json` unit's `traits` array — there is no referential-integrity check at load time; a mismatched id silently never activates (effectively dead content).
- `kind` is informational metadata used only by the client (trait-strip chip styling, glyph lookup) and design conventions ("every unit carries exactly one origin + 1-2 classes" — enforced by `units.json` content, not by this file or any validator).
- `breakpoints` should be sorted ascending by `count` — `applyTraits`'s loop (`for (const bp of traitDef.breakpoints) if (count >= bp.count) activeEffect = bp.effect`) walks in array order and keeps overwriting `activeEffect`, so an out-of-order array would make a lower, later-positioned breakpoint incorrectly win over a higher one already passed. All current entries are in fact ascending.
- `effect.stat` must be a stat name the sim's `addStat` understands (same stat-key space as `UnitInstance` fields: `hp`, `ad`, `as`, `armor`, `mr`, `abilityDamage`, etc.) — no validation enforces this; an unrecognized stat key would be a silent no-op via `addStat`'s implementation.
- This file does NOT define glyphs, colors, or display names beyond `name` — those live in the client's `theme.ts` (`TRAIT_COLOR`) and `glyphs.ts` (`TRAIT_GLYPH`), keyed by this file's `id`s; both are test-enforced complete against every id here.

**Depends on** — Nothing directly (leaf JSON), but is conceptually paired with `units.json` (whose `traits: string[]` fields are the only place these ids are referenced) and `design-notes.md` (rationale for breakpoint choices).

**Used by**
- `packages/data/src/loader.ts` — imports as `rawTraits`, exposes `gameData.traits`.
- `packages/sim/src/engine.ts` — `applyTraits` is the sole consumer of the breakpoint math; runs once per combat (per team) before combat ticks begin.
- `packages/client/src/hudModel.ts` — `traitStripModel(board, units, traits)` derives the trait-strip chip data (active breakpoint, next breakpoint, count) directly from this shape for the planning-phase HUD.
- `packages/client/src/traitDetailModel.ts` — `traitDetailModel(traitId, count, data)` builds the per-breakpoint detail rows (reached/active) shown in the trait-detail modal panel.
- `packages/client/src/theme.ts` (`traitColor`/`TRAIT_COLOR`) and `packages/client/src/glyphs.ts` (`TRAIT_GLYPH`/`drawGlyph`) map every trait `id` here to a display color and vector glyph (both test-enforced for completeness against this file's id set).
- `packages/balance/src/sweep.ts` — computes per-trait win rate using `activeTraits` derived from these breakpoints across composition sweeps.

**Notes** — `knight`'s armor curve (200/500/800) and the general 2/4/6 breakpoint pattern are explicitly called out as intentional in CLAUDE.md ("knight keeps its armor curve"). Traits with only 1-2 breakpoints (`elemental`, `abyssal`, `gunner`, `summoner`) reflect a smaller pool of eligible units in `units.json` for that trait — the top breakpoint is still reachable given how many units in the 50-unit roster carry that trait.
