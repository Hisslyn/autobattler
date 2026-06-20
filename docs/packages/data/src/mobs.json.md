# packages/data/src/mobs.json

**Path & purpose** — `packages/data/src/mobs.json`. Content-only JSON defining all PvE creep ("mob") unit definitions and the per-round PvE stage layouts (which mobs are placed where, at what star level, for which `{stage, roundInStage}` combat round). Loaded and typed by `packages/data/src/loader.ts` into `gameData.mobs: MobsData`.

**Responsibility** — Owns all PvE content: creep stat blocks/abilities (`mobs[]`) and the scripted stage encounters (`stages[]`) that `packages/rules/src/rounds.ts` (`pveStageForRound`, `buildMobBoard`, `runPveRound`) reads to build the enemy board for a PvE round. This is the only place creep tuning and encounter composition live — no PvE content logic exists in code.

**Exports** — This is a data file, not code; it has no JS/TS exports. Its shape is described by the TypeScript interfaces in `loader.ts`:
- `MobDataDef` — one creep type: `{id, name, campType?, tier, isMob: true, hp, ad, as, armor, mr, range, mana, manaStart, abilityDamage, traits: string[] (always empty for mobs), ability?: AbilityDataDef}`. `campType` is a cosmetic client-label tag (e.g. `"krugs"`, `"wolves"`, `"raptors"`, `"dragons"`); absent on the stage-1 mobs (`melee_grunt`, `archer_sprite`, `armored_boar`, `hex_imp`, `frost_wolf`, `stone_golem`), which have no camp grouping.
- `MobPlacement` — one creep placed on a stage board: `{mobId, slot, star: 1|2|3}`. `slot` is a board-slot index (the same slot numbering the rules layer uses for `BoardState`), always on the enemy half.
- `MobStageDef` — one scripted PvE encounter: `{stage, roundInStage, name, campType?, units: MobPlacement[]}`. Matched against the match's current `{stage, roundInStage}` by `pveStageForRound` in `packages/rules/src/rounds.ts`.
- `MobsData` — the top-level shape: `{mobs: MobDataDef[], stages: MobStageDef[]}`. Exposed as `gameData.mobs`.

**Key behavior**
- `mobs[]` (14 entries): stage-1 generic creeps (`melee_grunt`, `archer_sprite` at tier 1; `armored_boar`, `hex_imp` at tier 2; `frost_wolf`, `stone_golem` at tier 3 — no `campType`) plus four `campType` groups used from stage 2 onward: `krugs` (`krug_smasher` t2, `krug_pup` t1 — pup has no `ability`), `wolves` (`dire_wolf` t2, `wolf_cub` t1 — cub has no `ability`), `raptors` (`razorbeak` t3, `raptor_scout` t2), `dragons` (`ember_drake` t4, `dragon_whelp` t3).
- Every mob with an `ability` uses one of the engine-supported effect kinds: `magic_damage` (most), `shield` (`armored_boar`'s Bristle Guard, `stone_golem`'s Stoneskin — `{amount, duration}`), `buff` (`frost_wolf`'s Bloodscent +attack-speed, `dire_wolf`'s Savage Lunge +AD — `{stat, value, duration}`), `burn` (`ember_drake`'s Flame Breath — `{burn, duration}`). Two mobs (`krug_pup`, `wolf_cub`) have no `ability` at all (auto-attack only).
- `stages[]` (9 entries) script every PvE round in the match: stage 1 has 3 PvE rounds (`roundInStage` 1, 2, 3 — names "Wandering Pack"/"Raiding Party"/"Den Guardians", mixing the no-`campType` mobs), then stages 2/3/4 each have exactly 2 PvE rounds at `roundInStage` 4 and 7, themed by `campType` (stage 2 = krugs then wolves; stage 3 = raptors then dragons; stage 4 = krugs and dragons again, scaled up). Later stages reuse the same mob ids at higher `star` (e.g. stage 4's "Krug Warband"/"Ancient Dragon" repeat stage-2/3 mob ids mostly at `star: 2`) and with extra units added (e.g. stage 4's krug stage adds an `armored_boar`), so difficulty scales via star level + roster size, not new mob types.
- `pveStageForRound(round, data)` in `rounds.ts` derives `{stage, roundInStage}` from the match's absolute `round` number and looks up the matching entry here; `buildMobBoard` then places each `MobPlacement` onto a `BoardState` using uids drawn from the match's namespace (never the unit pool).

**Invariants & constraints**
- Mobs are NEVER drawn from the unit pool (`packages/rules/src/pool.ts`) — pool conservation invariant explicitly excludes PvE mobs.
- Mob `defId`s never appear in `data.units` (the player unit roster), so `applyTraits` in the sim never counts them: mobs do not contribute to, or benefit from, player trait breakpoints, by construction of this file existing as a disjoint id space from `units.json`.
- `traits` is always `[]` for every mob — mobs carry no origin/class traits.
- Every `ability.effect.kind` here must be one of the engine's supported primitives (`magic_damage`, `burn`, `shield`, `buff`); the sim has no PvE-specific behavior beyond what player abilities already support.
- `stages` entries are matched by exact `{stage, roundInStage}` pair — there is no fallback/default stage; if a round's PvE lookup misses, `pveStageForRound` returns `null` and the round is NOT treated as PvE (callers must handle that).
- Mob ids and unit ids must never collide (both live in disjoint namespaces); nothing enforces this at the type level, only by convention.

**Depends on** — Nothing (leaf JSON file). Conceptually paired with `units.json`'s stat/role conventions (mob stat fields mirror `UnitDataDef`'s combat-relevant subset) but is loaded and typed independently via `MobDataDef`/`MobStageDef` in `loader.ts`.

**Used by**
- `packages/data/src/loader.ts` — imports and types this file as `gameData.mobs`.
- `packages/rules/src/rounds.ts` — `pveStageForRound`, `buildMobBoard`, `runPveRound` read `data.mobs.mobs`/`data.mobs.stages` to construct and run PvE combat rounds.
- `packages/sim` — consumes the resulting `BoardState`/`UnitInstance`s built from these defs unchanged (no new sim behavior for mobs).
- Client (`packages/client/src/scenes/match.ts`) reads `campType`-derived presentation (PvE label, mob tint/zone) but the JSON itself is not imported directly by the client; it flows through `gameData`.

**Notes**
- The “Wandering Pack” / “Raiding Party” / “Den Guardians” names and the camp names (Krug Camp, Wolf Pack, Raptor Flock, Dragon Brood, Krug Warband, Ancient Dragon) are purely cosmetic display strings (`MobStageDef.name`), shown by the client as `PvE · <stage name> · Creeps`.
- Slot numbering reuses values like 10/12/14/16/17/19/21 — these are enemy-half board slots in the same indexing scheme player boards use; consult `packages/sim/src/hex.ts`/`BoardState` slot conventions if placing new mobs.
- Difficulty progression is entirely data-driven: later stages either reuse earlier mob ids at higher `star` or add more units to the same `campType` roster — no new mob stat tiers beyond tier 4 (`ember_drake`) exist yet.
