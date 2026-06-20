# Path & purpose

`packages/client/src/traitDetailModel.ts` -- pure derivation that builds the trait-detail panel's display model: every breakpoint of a trait, each one's human-readable stat-grant description, and which breakpoints are reached/active given the player's current unit count for that trait.

# Responsibility

Owns: reading a trait's breakpoint list from `traits.json` (via `GameData`), sorting them ascending, determining the "active" breakpoint (the highest one the current count satisfies) vs. "reached" (cumulative -- every breakpoint at or below the active one), and formatting each breakpoint's stat effect into a readable string (`"+200 Armor"`, `"+0.28 Attack Speed"`, etc.) via `formatStatDelta` + a stat-name label map. No Pixi, no game logic (mirrors only -- the actual bonus application happens in `sim`'s `applyTraits`).

# Exports

- `interface TraitDetailRow { count, effect, active, reached }` -- one breakpoint row: `count` (the unit-count threshold), `effect` (formatted string), `active` (true ONLY for the highest breakpoint currently satisfied), `reached` (true for this breakpoint AND every lower one once the active threshold is met or exceeded -- cumulative, not just the active one).
- `interface TraitDetailModel { id, name, kind, count, rows }` -- `kind: "origin" | "class"` (mirrors `TraitDataDef.kind`), `count` (the player's current distinct-unit count for this trait, passed in by the caller), `rows: TraitDetailRow[]` (one per breakpoint, sorted ascending by count).
- `const STAT_LABEL: Record<string,string>` -- maps raw stat keys (`hp`/`ad`/`as`/`armor`/`mr`/`abilityDamage`) to display names (`"HP"`/`"AD"`/`"Attack Speed"`/`"Armor"`/`"Magic Resist"`/`"Ability Power"`). NOT exported (module-private).
- `function breakpointEffect(effect: {stat:string; value:number}): string` -- formats one breakpoint's stat grant as `"${formatStatDelta(stat,value)} ${label}"` (e.g. `"+200 Armor"`); falls back to the raw stat key string if not in `STAT_LABEL`.
- `function traitDetailModel(traitId: string, count: number, data: GameData): TraitDetailModel | null` -- looks up the trait def in `data.traits` by id; returns `null` if not found (an unknown trait id). Otherwise sorts `trait.breakpoints` ascending by `count`, computes `activeCount` via a reduce that tracks the HIGHEST breakpoint count `<= count` seen so far (or `null` if none satisfied), then maps every breakpoint to a `TraitDetailRow` with `active = (bp.count === activeCount)` and `reached = (bp.count <= count)`.

# Key behavior

The active-breakpoint determination is a simple linear scan (via `reduce`) over the SORTED breakpoint list: since breakpoints are sorted ascending and the reduce keeps overwriting `acc` whenever `bp.count <= count`, the final `acc` value after the full scan is necessarily the LARGEST breakpoint count that's `<= count` (later iterations with smaller-or-equal-to-count thresholds always overwrite earlier ones, and since the list is sorted ascending, the last satisfying entry is the largest). This correctly handles non-contiguous breakpoint sets (e.g. 2/4/6 unit-count thresholds per CLAUDE.md) without needing to know the specific breakpoint values in advance.

# Invariants & constraints

- `reached` is CUMULATIVE (every breakpoint at/below the active one is `reached=true`), while `active` is marked on EXACTLY ONE row (the highest satisfied) or NONE (if `count` is below every breakpoint's threshold, `activeCount` stays `null` and no row's `bp.count === null` can ever be true, so no row is active) -- a caller rendering the panel must use these two different semantics correctly (e.g. checkmarks for `reached`, a highlighted/bold row for `active`).
- `STAT_LABEL` covers exactly the stat keys actually used by trait breakpoint effects in `traits.json` (`hp`/`ad`/`as`/`armor`/`mr`/`abilityDamage`) -- it does NOT include `range`/`mana` (present in `statFormat.ts`'s broader `StatKey` union) since those aren't granted by any current trait breakpoint. If a future trait grants a stat not in this map, `breakpointEffect` gracefully falls back to the raw key string (e.g. `"+50 mana"` instead of a properly-cased label) rather than erroring -- but the display would look inconsistent until this map is updated.
- This file presumes the CALLER already computed `count` correctly as "distinct units of this trait the player fields" -- it does not recompute trait counts from a board itself (that's `hudModel.ts`'s `traitStripModel`'s job). This separation means `traitDetailModel` is reusable for ANY count source (the trait strip, the scout overlay's view of an opponent's board, etc.) without coupling to board-reading logic.
- Returns `null` (not throwing) for an unrecognized `traitId` -- callers must handle the null case (e.g. don't open the panel, or show nothing) since CLAUDE.md confirms display panels are "dismissable" and tolerant of missing data.

# Depends on

- `@autobattler/data` (`GameData`, `TraitDataDef` types) -- reads `data.traits` (the trait definitions including `breakpoints`).
- `./statFormat.js` (`formatStatDelta`) -- formats each breakpoint's signed stat value (handles the `as` fixed-point/1000 conversion internally).

# Used by

- `packages/client/src/inspectPanel.ts` -- `renderTraitDetail` consumes a `TraitDetailModel` to draw the trait panel (diamond + name/kind/count + per-breakpoint rows marking reached/active via shape+arrow, per CLAUDE.md).
- `packages/client/src/scenes/match.ts` -- `openTraitDetail` (tapping a trait-strip chip or the scout overlay's trait chips) calls `traitDetailModel(traitId, count, gameData)` then passes the result to `renderTraitDetail`.

# Notes

- This file's "active" vs "reached" distinction mirrors the engine's actual breakpoint semantics precisely (`sim`'s `applyTraits` only applies the highest satisfied breakpoint's bonus per CLAUDE.md's `engine.ts` description: "Applies trait breakpoint bonuses per team at combat start" -- only the top reached threshold's bonus counts, not a stacking of every reached breakpoint) -- this is why `active` exists as a separate concept from `reached`: the UI needs to show the player WHICH SINGLE breakpoint is actually contributing the bonus right now, while `reached` rows are informational ("you've also cleared this lower threshold, but only the higher one's bonus applies").
- No test file for this module was observed in this pass, but the manifest path list (per the earlier summary) does not show a dedicated `traitDetailModel.test.ts` in the pending queue at this exact point -- if a later file in the queue is named that, the cross-reference between this doc and that test should be kept consistent when documenting it.
