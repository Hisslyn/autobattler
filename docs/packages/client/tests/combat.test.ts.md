# Path & purpose

`packages/client/tests/combat.test.ts` -- integration tests proving the client's pure combat-playback reducer (`combat/reducer.ts`) and display-row-mirroring helper (`combat/player.ts`'s `flipRows`/`toDisplayHex`) correctly and exactly reproduce/derive from the REAL sim engine's (`@autobattler/sim`) `simulateCombat` output, across five fixed seeds.

# Responsibility

Owns: end-to-end conformance coverage between the engine's canonical `CombatResult` and the client's independently-implemented event-log reducer -- proving "folding the log" always reconstructs the same final state the engine itself computed (no drift), that intermediate (mid-playback) states are well-formed (no negative HP, no events for already-dead units), and that the display-side row-flipping math used to keep "my units on the bottom" regardless of which sim side I am is correct and self-inverse.

# Exports

None (a Vitest test file). Defines local helpers `makeBoard(team)` (builds a `BoardState` from the first 5 unit defs in `gameData.units`, deliberately "mixed melee/ranged/caster so logs contain moves, attacks, casts, deaths" per its comment, with team 0 positioned in the sim's near rows and team 1 mirrored into the far rows) and `endEvent(log)` (asserts and returns the log's last event, narrowed to the `"end"` variant via `Extract<CombatEvent, {type:"end"}>`).

# Key behavior

A module constant `SEEDS = [1, 2, 42, 1337, 0xbeef]` drives every suite -- five fixed seeds chosen to exercise determinism/correctness across varied (but reproducible) random outcomes, not five arbitrary throwaway numbers.

**"reducer conformance"**: for each seed, runs the REAL engine (`simulateCombat(makeBoard(0), makeBoard(1), seed, gameData)`), gets the log's `end` event, then uses the reducer's `stateAtTick(events, end.tick)` to fold the WHOLE log up to the end tick. Asserts: (1) the folded state has exactly `10` units tracked (5 per side -- everyone who ever appeared, dead or alive, stays in the reducer's unit map); (2) `final.ended === true` and `final.winnerSide === result.winner` (the reducer's own end-detection matches the engine's authoritative winner); (3) the SET of uids the reducer considers "surviving" (`final.survivingUids`) exactly matches the engine's own `result.survivingUnits` uid list (sorted before comparing, so set-equality not ordering is what's checked); (4) for every unit in the folded state, if the engine's `survivingUnits` list contains that uid, the reducer's corresponding unit MUST be `alive:true` with `hp`/`mana`/`pos` EXACTLY matching the engine's final per-survivor record -- and if NOT in survivors, the reducer's unit MUST be `alive:false`. This is the strongest possible check that the client's independently-implemented pure fold never silently disagrees with the engine's own authoritative bookkeeping (a discrepancy here would mean the client's PLAYBACK of a server-canon combat could show different end-state than what actually happened).

**"mid-playback consistency"**: two checks on INTERMEDIATE ticks (not just the end). (1) `stateAtTick(log, floor(end.tick/2))` -- HP for every tracked unit must be `>= 0` (no negative-HP artifacts mid-fold, which would indicate the reducer applied damage events incorrectly or out of order). (2) walks the FULL event log in order maintaining a `dead` set populated by `death` events, and asserts NO `move`/`attack`/`cast` event for a uid ever occurs AFTER that uid's `death` event appeared earlier in the log -- i.e. the engine's own event ordering guarantee (no actor activity after death) holds for all five seeds, and at least one death occurs in each (`dead.size > 0`, sanity-checking the test boards actually produce a decisive combat, not a draw/stall).

**"display mirroring"**: tests `flipRows`/`toDisplayHex` from `combat/player.ts` using the sim's own grid constants `COLS`/`ROWS` from `@autobattler/sim/src/hex.js`. (1) "flipRows is involutive": for EVERY hex coordinate in the grid, applying `flipRows` twice returns the original coordinate exactly -- the row-flip transform is its own inverse, confirming CLAUDE.md's stated invariant ("row flip is involutive"). (2) "each side's own units map to the bottom display rows": for sim rows in the bottom HALF (`0..3`, owned by side 0) transformed via `toDisplayHex(pos, 0)` (viewing AS side 0), the result lands in the display's bottom half (`r >= HALF`); for sim rows in the top half (`4..7`, owned by side 1) transformed via `toDisplayHex(pos, 1)` (viewing AS side 1), the result ALSO lands in the display bottom half -- i.e. regardless of which sim-side you actually are, YOUR OWN units always display on the bottom rows (the column `q` is preserved unchanged in both cases -- only rows flip). (3) "B-side transform mirrors opponent units to the top rows": confirms the complementary direction -- from side 0's viewpoint, the OPPONENT's rows (4..7, side 1's home rows) map to the display's TOP half (`r < HALF`), and symmetrically from side 1's viewpoint, rows 0..3 (the actual side-0 home rows) also map to the display top half. Together, these two tests fully specify the mirroring contract: "my rows on the bottom, opponent's rows on top," REGARDLESS of which numeric sim side ("0" or "1") I actually am.

**"skip"**: confirms `stateAtTick(log, end.tick)` produces a result EQUAL (`toEqual`, deep structural) to manually folding the ENTIRE log via `events.reduce(applyEvent, emptyPlaybackState())` -- i.e. the optimized/targeted `stateAtTick` lookup is behaviorally indistinguishable from a full linear fold to the same tick, which is the correctness guarantee behind the "skip to end" playback feature (jumping straight to the final state must show exactly what a full real-time playback would have shown).

# Invariants & constraints

- This is the PRIMARY test proving the "combat playback = pure reducer over the event log" invariant from CLAUDE.md actually holds in practice -- a regression where the client's reducer diverges from the engine's own bookkeeping (e.g. a missed event type, an off-by-one in HP/mana updates) would be caught by the "reducer conformance" suite's exact per-survivor HP/mana/pos equality checks, which is a stronger check than just "the winner matches."
- `makeBoard`'s board construction reuses the FIRST 5 unit defs in `gameData.units` UNCONDITIONALLY (`gameData.units.slice(0,5)`) -- this means the specific units exercised by this test depend on `data/units.json`'s ordering; the test's correctness doesn't depend on WHICH units these are (the assertions are generic over outcome), but the comment's claim ("mixed melee/ranged/caster") is an assumption about the data's current ordering that isn't separately enforced -- if `units.json`'s ordering changed such that the first 5 were all-melee, the test would likely still pass (the assertions don't require ability casts to occur) but would silently lose some of its intended event-type coverage.
- The display-mirroring tests use the SIM's raw `COLS`/`ROWS` constants directly (not any client-side hardcoded grid size) -- this couples the test correctly to the actual hex grid dimensions wherever they're defined, so a grid-size change in `sim/hex.ts` automatically updates these tests' iteration bounds without further changes needed.
- `endEvent`'s assertion (`expect(last.type).toBe("end")`) will FAIL LOUDLY (not silently cast) if the engine's log doesn't end with an `end` event, which is itself an implicit conformance check on the engine's own event-emission contract (every combat log ends with exactly one `end` event) -- a side benefit of this helper beyond just type narrowing.

# Depends on

- `vitest` (`describe`, `it`, `expect`).
- `@autobattler/data` (`gameData`).
- `@autobattler/sim` (`simulateCombat`) -- the REAL engine, not a mock.
- `@autobattler/sim/src/hex.js` (`COLS`, `ROWS`).
- `@autobattler/sim/src/types.js` (`BoardState`, `CombatEvent` types).
- `../src/combat/reducer.js` (`emptyPlaybackState`, `applyEvent`, `stateAtTick`).
- `../src/combat/player.js` (`flipRows`, `toDisplayHex`).

# Used by

Not imported by any other file (a leaf test file); run as part of the client package's `npm test`/vitest suite.

# Notes

- This file straddles the sim/client boundary more than most client tests -- it directly imports and runs the REAL sim engine rather than mocking it, making it both a client-reducer test AND an implicit (if narrow) regression check on `simulateCombat`'s event-emission contract (ordering, end-event presence, survivor bookkeeping). A maintainer changing the sim engine's event log shape should expect this test to be among the first client-side tests to catch a breaking change.
- The five fixed seeds (`1, 2, 42, 1337, 0xbeef`) appear to be chosen for variety/memorability rather than any documented statistical significance -- a reader adding a sixth seed for additional coverage would be consistent with the existing pattern (no special meaning attached to the specific numbers beyond producing varied, reproducible combats).
