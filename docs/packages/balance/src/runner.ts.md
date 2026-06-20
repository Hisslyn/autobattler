# Path & purpose

`packages/balance/src/runner.ts` -- runs N seeded combats between two fixed boards via the pure sim engine and aggregates win rate / length / overtime / survivor stats. The lowest-level building block of the balance package.

# Responsibility

Owns the single-matchup aggregation: given two `BoardState`s and a seed count, calls `simulateCombat` once per seed (seeds 0..N-1) and folds the results into one `MatchupResult`. Does not know about compositions, sweeps, or reports -- those are built on top of this.

# Exports

- `interface MatchupResult { winRateA, winsA, winsB, draws, combats, avgLength, overtimeRate, avgSurvivorsA, avgSurvivorsB }` -- the aggregated outcome of a fixed boardA-vs-boardB matchup across `seeds` combats. `winRateA` counts draws as 0.5 (so it always sums to 1.0 with the implicit "win rate B" = `1 - winRateA`).
- `function runMatchup(boardA: BoardState, boardB: BoardState, seeds: number, data: GameData): MatchupResult` -- the only function in this file. Loops `seed` from 0 to `seeds-1`, calls `simulateCombat(boardA, boardB, seed, data)` each time, and tallies: winner (0/1/draw), total ticks (for avg length), whether any `overtime_start` event appears in the event log (for overtime rate), and surviving-unit counts per team (for avg survivors).

# Key behavior

- Each seed produces one independent, fully deterministic combat via the shared sim engine (`@autobattler/sim`'s `simulateCombat`) -- same `(boardA, boardB, seed, data)` always produces the same `CombatResult`.
- `combats` in the returned result is `seeds` as passed in (not defensively floored), but the denominator used for all the averaged fields (`winRateA`, `avgLength`, `overtimeRate`, `avgSurvivorsA/B`) is `seeds || 1` (guards a divide-by-zero if `seeds === 0`, falling back to dividing by 1 -- meaning a `seeds=0` call returns all-zero rates without throwing, but `combats` itself would be `0` in the returned object while the divisor used internally was 1).
- Overtime detection is via a linear scan of `r.events` for an `"overtime_start"` event type -- relies entirely on the engine actually emitting that event type when the per-combat tick cap reaches the documented 1200-tick overtime threshold.

# Invariants & constraints

- Pure: no I/O, no `Date`, no `Math.random` (the header comment makes this explicit) -- the only randomness is the seeded sim itself, driven by the caller-supplied `seed`.
- `boardA`/`boardB` are NOT mutated or copied per-seed -- `simulateCombat` must treat them as read-only inputs (consistent with sim's purity guarantee); if it ever mutated boards in place, this loop's repeated reuse of the same `boardA`/`boardB` objects across all seeds would corrupt later seeds' inputs.
- This file makes no assumption about team assignment beyond "team 0 is A, team 1 is B" -- callers (`sweep.ts`) are responsible for building boards with `team: 0`/`team: 1` set correctly via `buildBoard`.

# Depends on

`@autobattler/sim` (`simulateCombat` -- the actual deterministic combat engine, see `packages/sim/src/engine.ts`). `@autobattler/sim/src/types.js` (type-only: `BoardState`). `@autobattler/data` (type-only: `GameData`).

# Used by

`packages/balance/src/sweep.ts` (`runSweep` calls `runMatchup(boards0[i], boards1[j], seeds, data)` for every ordered comp pair). Re-exported by `packages/balance/src/index.ts`.

# Notes

- `MatchupResult.combats` being the raw `seeds` parameter while internal averaging uses `seeds || 1` is a minor asymmetry: a `seeds=0` call would report `combats: 0` alongside `winRateA: 0` etc. computed as if dividing by 1 -- in practice `cli.ts` always passes a seeds value of at least 1 (`Math.max(1, ...)` clamp), so this edge case is unreachable from the CLI but would surprise a direct caller passing `seeds=0`.
