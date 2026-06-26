# Combat trace harness, scenarios & invariants

## Simulation rate: 30 Hz fixed timestep (single canonical constant)

The combat sim runs on a FIXED TIMESTEP of **30 Hz** — 30 ticks per second of
GAME time. One tick is always `1/30` s of game time on every device, independent
of wall clock, `Date`, or device FPS. Combat duration in seconds is therefore
`tickCount / 30`, deterministic and identical across devices.

- **The single constant**: `TICK_HZ = 30` lives in `packages/sim/src/fixed.ts`
  (the one sim file permitted raw numeric literals, alongside `SCALE`). To change
  the simulation rate, change ONLY this value — every per-second / duration
  derivation routes through it.
- **Durations are authored in SECONDS, converted to integer ticks** via the pure
  fixed-point helper `secondsToTicks(secondsFixed)` (also in `fixed.ts`):
  `ticks = fmul(secondsFixed, TICK_HZ) = trunc(secondsFixed * TICK_HZ / SCALE)`.
  Seconds are stored fixed-point (scale 1000 — e.g. `60000` means 60.0 s). No
  floats; the sim advances by whole integer ticks only and never reads
  wall-clock time. e.g. `secondsToTicks(60000) === 1800` ticks at 30 Hz.
- **What this converts** (formerly raw tick counts at the old 20 Hz):
  - Attack cooldown from attack speed: `attackCooldown = trunc(TICK_HZ * SCALE / as)`.
  - Overtime threshold: `data.gameplay.overtimeStartSeconds` (60000 = 60 s) →
    `secondsToTicks(...) = 1800` ticks (was `overtimeStartTick: 1200` at 20 Hz).
  - Overtime hard cap: `data.economy.overtimeHardCapSeconds` (90000 = 90 s) →
    `secondsToTicks(...) = 2700` ticks (was `overtimeHardCapTicks: 1800` at 20 Hz).
  - The data fields `ticksPerSec`, `overtimeStartTick`, and `overtimeHardCapTicks`
    no longer exist — the rate is `TICK_HZ`, the thresholds are authored in seconds.
- **Playback is decoupled from simulation** (client `combat/player.ts`): the
  renderer consumes sim ticks and maps them onto real time via a time accumulator
  (`timeMs → tickFloat`) with interpolation, reading the canonical `TICK_HZ`
  rather than hardcoding. Device refresh rate affects only smoothness — never
  outcome or measured duration (`durationMs = endTick / TICK_HZ`). The slow-mo
  dev knob is `PLAYBACK_TIME_SCALE` (a playback-rate multiplier on how fast real
  time consumes ticks, applied at the scene call site; `1` = no extra slowdown).

> **Golden re-bless note**: because the tick rate changed (20 → 30 Hz) the
> per-tick golden traces and any tick-count-pinned assertions shift. Re-blessing
> the golden traces is the QA pass, not part of this migration.

A behavior-neutral instrumentation + dev-tooling layer over the pure combat
engine (`packages/sim`). It lets you produce a deterministic, human-readable
per-tick TRACE of any fixed scenario, for debugging and for the QA invariant
suite. **It does not change combat behavior** — the trace is opt-in, never
consumes the PRNG, never changes iteration order, and never mutates any value;
the default `simulateCombat` call is byte-identical to before (proven by the
unchanged determinism suites staying green).

## Running the harness

The harness is the only I/O-permitted code in this tooling. It lives in
`scripts/trace.ts` (outside `packages/sim`) and runs via tsx:

```bash
npm run trace -- --list                                # list scenarios + descriptions
npm run trace -- --scenario melee_1v1                  # print a scenario's trace to stdout
npm run trace -- --scenario retarget_1v2 --seed 99     # override the fixture's seed
npm run trace -- --scenario mana_breakpoint --out t.txt # write the trace to a file
```

Flags:
- `--scenario <name>` — required (unless `--list`); one of the six names below.
- `--seed <n>` — optional; overrides the fixture's built-in seed.
- `--out <file>` — optional; writes the trace to a file instead of stdout.
- `--list` — print the scenario names + descriptions and exit.

The harness calls `simulateCombat(boardA, boardB, seed, gameData, { trace: true })`
and prints `formatTrace(scenario, result)`.

## The six scenarios

Source: `packages/sim/tests/fixtures/scenarios.ts` (pure; built from real
`gameData` unit defs; single-copy boards use distinct defIds so no trait reaches
a 2-count breakpoint).

1. **melee_1v1** — 1 melee (paladin) vs 1 melee (footman), placed adjacent
   (in attack range). The simplest trade-attacks case. Both self-cast (shield),
   so no magic nuke pollutes the trace.
2. **ranged_vs_melee** — 1 ranged (archer, range 3) vs 1 melee (footman). The
   melee unit must close the gap before it can attack; the archer fires across.
   Exercises movement/pathing toward a target and ranged attack at range.
3. **retarget_1v2** — 1 ranged (stormlord) vs 2 melee (footman, brawler). The
   engine recomputes the nearest enemy fresh every tick (no target stickiness),
   so the lone unit's resolved target FLIPS between the two LIVE enemies as they
   advance (`retarget_recomputed`), then switches off the first once it dies
   (`switched_target_dead`). This is the fixture whose trace exhibits a
   live-target `retarget_recomputed` — verify with the harness.
4. **tiebreak_equidistant** — two enemies (footman uid 1001, brawler uid 1002)
   exactly equidistant from a single attacker (archer). Exercises the
   nearest/lowest-uid tiebreak: uid 1001 is chosen over uid 1002.
5. **blocked_path** — a melee attacker (squire) whose only enemy (a footman
   boxed into corner (0,0)) is walled in by the attacker's own allies (three
   rogues filling every approach hex). A* finds no path within range, so the
   squire idles for the entire combat (0 attacks). Exercises an A*-blocked path.
6. **mana_breakpoint** — a mage (range 2, `magic_damage` ability, mana 20/80)
   fills mana from attacks + damage taken and provably casts its single-target
   nuke (`act=cast`) against a closing melee footman. `magic_damage` (not burn)
   keeps damage conservation cleanly checkable.

## Trace format

`formatTrace` (in `packages/sim/tests/fixtures/formatTrace.ts`, pure) emits a
deterministic block: a header, then one line per tick per CURRENTLY-ALIVE unit,
plus an explicit retarget line on any tick where a unit's resolved target
changed. Integers only.

```
# scenario: <name>
# description: <text>
# seed: <n>
# winner: <0|1|draw>
# ticks: <n>
# traceTicks: <n>

tick <t>
  uid=<u> side=<0|1> <defId> hex=(q,r) hp=<n> mana=<n> act=<move|attack|cast|idle> tgt=<uid|-> dmg=<n>
  ...                                              (one line per alive unit, uid-ascending)
  retarget uid=<u> <fromUid|-> -> <toUid|-> reason=<code>   (only on ticks with a change)
```

Per-unit fields (one row per alive unit, end-of-tick state):
- `hex` — end-of-tick position.
- `hp` / `mana` — end-of-tick values.
- `act` — single label by precedence **cast > attack > move > idle** (a unit
  that both moves and attacks in one tick is labelled `attack`; `cast` if it
  cast; `move` if it only moved; else `idle`).
- `tgt` — the resolved target uid the engine actually used this tick (`-` if
  none): for `magic_damage`/`burn` casts and for move/attack, the `findTarget`
  result it acted on; for self-target `shield`/`buff` casts, the caster itself;
  idle-with-no-enemies → none.
- `dmg` — post-mitigation, post-shield damage this unit inflicted on others this
  tick (sum of its attack damage + cast damage). Overtime true-damage is
  environmental and is NOT attributed to any unit.

Retarget reason codes (a CHARACTERIZATION of the current stateless targeting —
the engine recomputes nearest-enemy every tick, so `retarget_recomputed` off a
still-valid target is EXPECTED, not a bug):
- `acquired_no_target` — had no resolved target last tick, has one now.
- `switched_target_dead` — previous target is no longer alive.
- `switched_target_untargetable` — previous target is alive but untargetable
  (its `untargetableUntil` > current tick).
- `switched_target_out_of_range` — previous target is alive + targetable but now
  beyond this unit's range.
- `switched_forced` — RESERVED for an explicit forcing effect (taunt). The
  current engine has none, so this is never emitted; kept for spec completeness.
- `retarget_recomputed` — previous target was still alive, targetable, and in
  range, but the nearest-recompute picked a different enemy (nearer, or a
  tiebreak flip).

## Invariants the QA suite asserts

The QA test suite (`packages/sim/tests`) asserts the following seven invariants
over the traced scenarios:

(a) **Range** — no unit attacks a target outside its range.

(b) **Target stickiness** — a unit must not change target while its current
target is alive, targetable, and in range, absent an explicit forcing effect.

(c) **Damage conservation** — cumulative hp lost by a unit equals the sum of
post-mitigation damage applied to it.

(d) **No hex collisions** — no two units occupy the same hex on any tick.

(e) **Attack cadence** — attack interval matches attack speed within rounding.

(f) **Termination** — combat terminates within a bounded tick cap.

(g) **Determinism** — the same scenario + seed yields an identical trace across
two runs; no float/Date/Math.random in the path.

Currently failing invariants (empirically determined by running
`packages/sim/tests/combatInvariants.test.ts`; wrapped in `it.fails(...)` so
the suite stays green and alerts if the bug is ever fixed):

- **(b) Target stickiness** — FAILS. `findTarget` recomputes the nearest
  enemy from scratch every tick with no concept of "current target," so a
  unit abandons a still-valid (alive, targetable, in-range) target the
  instant a different enemy becomes nearer or the uid tiebreak flips
  (`retarget_recomputed`), and an analogous drop can fire while the old
  target was itself still alive+targetable (`switched_target_out_of_range`).
  Confirmed empirically across multiple scenarios (not just `retarget_1v2` —
  e.g. `melee_1v1` also flips between an enemy and itself as a self-cast
  shield interrupts the action loop). See `engine.ts`'s per-tick
  `findTarget(unit, enemies)` calls (movement + magic_damage/burn cast
  dispatch) — no prior-target argument is ever consulted.

All other invariants — (a) range, (c) damage conservation, (d) no hex
collisions, (e) attack cadence, (f) termination, (g) determinism — currently
PASS over all six scenarios.
