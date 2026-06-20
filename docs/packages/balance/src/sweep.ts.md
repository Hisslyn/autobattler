# Path & purpose

`packages/balance/src/sweep.ts` -- runs a full round-robin tournament of every composition vs every other composition (both orientations) over N seeds each, and aggregates per-comp, per-unit, per-tier, and per-trait win-rate statistics into one `SweepReport`.

# Responsibility

Owns the round-robin orchestration (`runSweep`) and all the statistical aggregation logic that turns raw matchup results (from `runner.ts`'s `runMatchup`) into the higher-level signals consumed by `report.ts`: comp overall win rate, the full win matrix, gold-share-weighted per-unit win rate (with variance/disagreement detection), per-tier mean win rate, and per-trait average win rate.

# Exports

- `interface SweepConfig { itemsPerComp: number }` -- the one config knob: how many completed items (per `compositions.ts`'s `assignItems`, effectively just on/off) each comp's board is built with.
- `const DEFAULT_CONFIG: SweepConfig = { itemsPerComp: 0 }` -- itemless by default.
- `interface CompStat { id, name, winRate, games }` -- one composition's aggregate result.
- `interface UnitStat { defId, tier, winRate, appearances, variance, disagree }` -- one unit's aggregate result across all comps it appears in. `winRate` is gold-share-weighted (a unit that's a bigger fraction of its comp's gold spend contributes more to its own win-rate signal); `variance` is the population variance of the unit's RAW per-comp win rates (unweighted); `disagree` is `variance > DISAGREE_VAR` (0.02), flagging units whose comps strongly disagree on whether they're good (i.e. the unit may not be the actual driver of those comps' win rates).
- `interface TierStat { tier, winRate, units }` -- mean of per-unit win rates grouped by tier, with unit count.
- `interface TraitStat { id, winRate, comps }` -- average win rate of comps that activate a given trait (>=2 distinct units carrying it, per `compositions.ts`'s `activeTraits`), with comp count.
- `interface SweepReport { itemsPerComp, comps, matrix, compOrder, units, tiers, traits, avgGameLength, overtimeRate, seeds, totalCombats }` -- the full output of one sweep run.
- `function runSweep(data: GameData, seeds: number, config?: SweepConfig, comps?: Composition[]): SweepReport` -- the only function. Defaults: `config = DEFAULT_CONFIG`, `comps = COMPOSITIONS` (the 24 built-in archetypes from `compositions.ts`).

# Key behavior

1. Builds every comp's board once per team orientation: `boards0[i] = buildBoard(comps[i], 0, data, config.itemsPerComp)`, `boards1[i] = buildBoard(comps[i], 1, data, config.itemsPerComp)` (team-0 and team-1 placements differ -- front/back rows are mirrored, see `compositions.ts`).
2. Double loop over all ordered pairs `(i, j)` with `i !== j` (self-matchups skipped, hence the report's matrix diagonal is always blank/`—`): runs `runMatchup(boards0[i], boards1[j], seeds, data)`, accumulates into the `matrix[i][j]` win rate (comp i as team 0 vs comp j as team 1), into running win/game tallies for both `i` and `j` (`wins[i] += r.winsA + draws*0.5`, `wins[j] += r.winsB + draws*0.5`), and into running totals for length/overtime/combat-count.
3. Note this means EVERY comp plays every other comp exactly twice overall (once as team 0 vs the other as team 1, and vice versa via the symmetric `(j, i)` iteration) -- so a comp's aggregate win rate reflects performance from both board orientations, removing first-team-advantage bias.
4. `compStats` = one `CompStat` per comp: `winRate = wins[i] / games[i]` (0 if no games, which can't actually happen with >=2 comps).
5. Per-unit aggregation: for each comp, for each unit slot in it, looks up the unit's def, computes its "gold share" of that comp (`unitGoldCost(def, star) / compGold(comp, data)`), and accumulates a weighted win-rate sum (`wsum += compWinRate * share`, `weight += share`) plus a raw list of the comp's win rate (`rates.push(wr)`) per unique defId across all its comp appearances. Final per-unit `winRate = wsum/weight` (gold-share-weighted average across all its comps), `variance` = population variance of the raw `rates` list, `disagree = variance > 0.02`. Sorted descending by `winRate`.
6. Per-tier aggregation: groups the just-computed `units` list by `tier`, averages their (already gold-weighted) `winRate`s unweighted by gold this time -- i.e. tier stats are a flat mean of unit win rates within that tier, sorted ascending by tier.
7. Per-trait aggregation: for each comp, for each trait returned by `activeTraits(comp, data)`, accumulates that comp's overall win rate into a running sum/count keyed by trait id; final `winRate = sum/comps` is an unweighted mean across all comps activating that trait. Sorted descending by win rate.
8. Returns the full `SweepReport` with `avgGameLength`/`overtimeRate` as combat-count-weighted means across all matchups, and `totalCombats` as the grand total combat count across the whole round robin.

# Invariants & constraints

- Pure and deterministic: identical `(data, seeds, config, comps)` always produces an identical `SweepReport` (no randomness beyond the seeded sim itself, no I/O, no wall-clock). Stated explicitly in the doc comment above `runSweep`.
- `DISAGREE_VAR = 0.02` is a fixed threshold (roughly std-dev > ~0.14, per the inline comment) -- not configurable via `SweepConfig`; if balance methodology needs a different sensitivity, this constant must be edited directly.
- Self-matchups (`i === j`) are always skipped -- the matrix diagonal is always `0` (default-filled) and never populated with real data; `report.ts` renders these cells as `—` rather than `0%`.
- Per-unit win rate is gold-share weighted, but per-comp/per-trait win rates are NOT gold-weighted (straightforward win/game ratios or simple comp-count means) -- different statistics in this file use different weighting schemes; a reader should not assume consistency across `comps`/`units`/`tiers`/`traits`.
- Assumes every comp referenced in `comps` is a valid, already-budget-normalized `Composition` (as produced by `compositions.ts`'s `makeComp`) -- `runSweep` does no budget validation itself.

# Depends on

`@autobattler/data` (type-only: `GameData`). `./runner.js` (`runMatchup` -- runs the actual seeded combats for one ordered comp pair). `./compositions.js` (`COMPOSITIONS`, `buildBoard`, `activeTraits`, `compGold`, `unitGoldCost`, type `Composition` -- supplies the default comp roster and all the board-building/gold/trait-accounting helpers).

# Used by

`packages/balance/src/cli.ts` (`runSweep(gameData, seeds, { itemsPerComp: 0 })` and `runSweep(gameData, seeds, { itemsPerComp: items })` -- the two sweeps written to the report files). `packages/balance/tests/balance.test.ts` presumably exercises `runSweep` directly. Re-exported via `packages/balance/src/index.ts`.

# Notes

- With `N` comps, the round robin runs `N*(N-1)` matchups (24 comps -> 552 matchups), each running `seeds` combats -- `totalCombats = N*(N-1)*seeds`. With the CLI default `seeds=300` and the built-in 24 comps, that's 552*300 = 165,600 combats per sweep mode, doubled for the itemless+itemized pair the CLI always runs -- a meaningful compute cost worth knowing before bumping `--seeds` much higher.
- The `disagree` flag on `UnitStat` is purely informational (surfaced in `report.ts`'s outlier table) -- nothing in this file or elsewhere automatically excludes "disagreeing" units from any other statistic.
