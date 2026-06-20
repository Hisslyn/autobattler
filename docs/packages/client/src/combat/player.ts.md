# Path & purpose

`packages/client/src/combat/player.ts` -- the combat playback clock and frame builder: maps wall-clock time to sim ticks, folds `CombatEvent`s through the pure reducer, and emits interpolated unit positions plus a one-shot visual/audio fx stream for the view layer. Contains zero Pixi code.

# Responsibility

Owns combat PLAYBACK (not simulation): given a complete `CombatEvent` log (already produced by the server-authoritative `simulateCombat`), drives a deterministic clock at configurable speed, derives the current visual frame (`PlaybackFrame`) by combining reducer state with lerped in-flight movement, and derives the entire visual+audio fx stream purely from the log + ability/range lookups in `GameData`. Per the file header: "Playback stays a pure deterministic function of (log, seed): the same log + reducedMotion flag always yields the same fx sequence" -- this is the architectural anchor for the "combat playback = pure reducer over the event log" invariant.

# Exports

- `type PlaybackSpeed = 0.25 | 0.5 | 1 | 2` -- the four selectable playback speeds (0.25x is documented as "the new experienced default," quartering the 1x pace).
- `type AbilityFxKind = AbilityEffect["kind"]` -- re-derives the ability-effect-kind union directly from the sim's `AbilityEffect` type (so it can never drift from the sim's actual supported kinds).
- `type CombatFx` -- the discriminated union of every visual/audio fx event the player can emit: `projectile` (ranged bolt traveling `fromPos`->`toPos` over `travelTicks`, carries `crit`), `contact` (melee lunge), `impact` (hit-spark at the target, with `crit`), `floater` (damage number, weighted by `crit`/`magic`), `abilityCast` (burst at the caster, keyed by `AbilityFxKind`), `abilityHit` (landing on the target, keyed by `AbilityFxKind` -- drives per-kind sound + token aura), `dissolve` (death fade), `overtime` (the overtime-start banner cue).
- `interface UnitFrame { uid, side, defId, star, hp, maxHp, mana, maxMana, alive, hex, fromHex, moveT }` -- one unit's full presentation state at a given playback instant; `fromHex`/`moveT` are non-null only mid-move, letting the view lerp `fromHex -> hex` smoothly across the move's one-tick span.
- `interface PlaybackFrame { tick, units, fx, overtime, done }` -- the full output of one `advance()`/`skipToEnd()` call: `tick` is a float (sub-tick precision for smooth interpolation), `units` is every unit's `UnitFrame`, `fx` is this frame's fresh one-shot effects, `overtime`/`done` are state flags.
- `function flipRows(hex: HexCoord): HexCoord` -- returns `{q, r: ROWS-1-r}`; an involutive (self-inverse) vertical flip of a hex's row.
- `function toDisplayHex(hex: HexCoord, mySide: 0 | 1): HexCoord` -- maps a sim hex to display coordinates so the viewing player's own units always render on the bottom rows regardless of which sim side they were assigned: if `mySide===0` (sim rows 0..3), flips rows so they land on display rows 4..7 (bottom); if `mySide===1` (already sim rows 4..7), passes through unchanged.
- `class CombatPlayer` -- the playback engine.
  - `constructor(log: CombatEvent[], ticksPerSec: number, data: GameData, opts: { reducedMotion?: boolean } = {})` -- builds a `defId -> {range, abilityKind}` lookup (`meta`) from `data.units` up front (so per-event fx derivation never has to re-look-up data.units repeatedly), computes `endTick` from the log's final event (the `end` event's tick if present, else the last event's tick, else 0).
  - `readonly endTick: number`.
  - `get speed(): PlaybackSpeed` / `setSpeed(s: PlaybackSpeed): void`.
  - `get durationMs(): number` -- `endTick * msPerTick` (total playback duration at 1x, independent of the currently-set speed).
  - `get done(): boolean` -- true once the cursor has consumed the whole log AND elapsed wall time has reached `durationMs`.
  - `getState(): PlaybackState` -- exposes the underlying reducer state directly (read-only intent, not enforced by the type).
  - `skipToEnd(): PlaybackFrame` -- jumps straight to the final state: sets `timeMs = durationMs`, applies every remaining event through the reducer WITHOUT emitting any fx (so skip-to-end never plays stray sounds/visuals), clears in-flight move tracking, returns the final frame.
  - `advance(dtMs: number): PlaybackFrame` -- the main per-frame driver: advances `timeMs` by `dtMs * speed` (clamped to `durationMs`), computes the target tick as a float, then walks the log consuming every event whose tick is `<=` the new integer tick floor, calling `emitFx` (collecting new fx for THIS call only) and `applyEvent` (folding into reducer state) for each, tracking `move` events in the `moves` map (used for the next several frames' position lerp), and finally builds+returns the frame.

# Key behavior

- **Clock model**: `msPerTick = 1000/ticksPerSec` (independent of the engine's own internal fixed timestep -- this is purely playback pacing, looked up once at construction). `advance(dtMs)` is the sole time-driving entry point; the caller (likely a Pixi ticker in `combat/view.ts` or `scenes/match.ts`) calls it every render frame with the real elapsed wall-clock delta, and `speed` scales how fast `timeMs` advances relative to that.
- **Event consumption is strictly sequential and idempotent per tick**: the `cursor` only ever moves forward; an event is applied to the reducer exactly once, in log order, the instant the playback clock catches up to its tick. This guarantees fx are emitted in the same order the simulation produced them, deterministically tied to the same (log, speed-path) regardless of real frame-rate variance.
- **Position lookups for fx use PRE-event reducer state**: `posOf(uid)` reads `this.state.units.get(uid).pos` BEFORE `applyEvent` is called for the current event being processed (the order in `advance`'s loop is `emitFx` then `applyEvent`) -- this is explicitly documented: "attacker/target sit at their pre-event hexes (attack/cast carry no position change)." A `move` event itself updates the position only via `applyEvent`, AFTER `emitFx` has already read the prior position into the `moves` tracking map.
- **Reduced-motion downgrade** (`emitFx`'s attack case): when `reducedMotion` is true, an attack event ALWAYS emits a direct `impact` fx regardless of the attacker's range -- the traveling `projectile` bolt, the melee `contact` lunge, and the caster-side `abilityCast` burst are all dropped entirely (not just visually muted) for both ranged and melee attacks and for ability casts. This preserves: damage floaters, `impact`, `abilityHit` (with its per-kind sound trigger), `dissolve` (death), and `overtime` -- the rationale documented inline is "so readability and combat audio are preserved" even when motion-heavy fx are suppressed.
- **Ranged vs melee determination**: looked up per-event from `this.meta` keyed by the unit's `defId` (`range > 1` => ranged); a ranged attack emits `projectile` only (the view layer is responsible for spawning the landing `impact` itself once the bolt's travel time elapses, NOT this module -- contrast with melee, which emits BOTH `contact` and `impact` immediately since there's no travel delay to model).
- **`travelTicksFor(dist)`**: `clamp(round(dist*1.5), 2, 8)` -- ranged bolt travel time scales with hex distance but is capped both directions so very close or very far shots still read clearly.
- **Cast fx** (`emitFx`'s cast case): looks up the caster's `abilityKind` from `meta`; if absent, emits nothing (defensive -- shouldn't happen for a unit that actually cast). Emits `abilityCast` at the caster's position (skipped under reduced motion) and `abilityHit` at the target's position (kept always), plus a magic-flagged `floater` if `ev.dmg > 0`.
- **buildFrame**: for every unit currently in reducer state, computes `fromHex`/`moveT` by checking the `moves` map -- if the unit is alive, has a tracked move, and the current `tickFloat` is still within that move's one-tick span (`tickFloat < mv.tick + 1`), it reports the lerp-in-progress (`fromHex = mv.from`, `moveT = tickFloat - mv.tick` clamped to >=0); otherwise `fromHex = null, moveT = 1` (fully arrived, no lerp needed). The view layer is expected to interpolate `fromHex -> hex` by `moveT` for smooth movement instead of instant teleporting between hexes.

# Invariants & constraints

- **Determinism**: per the file header, this entire module must remain a pure function of `(log, ticksPerSec, data, reducedMotion, the sequence of advance()/skipToEnd() calls)` -- no `Math.random()`, no wall-clock reads beyond the `dtMs` parameter passed in by the caller, no hidden state. This is the client-side half of the "combat playback = pure reducer" invariant from `CLAUDE.md`.
- `skipToEnd` must NEVER emit fx -- any new event type added to `emitFx`'s switch must be mirrored correctly so that skip-to-end's direct `applyEvent`-only loop doesn't accidentally need fx side effects to reach a correct final state (reducer state alone must always be sufficient).
- The `meta` lookup table is built once at construction from `data.units` -- it does NOT include PvE mob units (`data.units` excludes mob defIds per `CLAUDE.md`'s sim/data invariants), so a mob caster's `abilityKind` lookup would return `undefined`/fall through to `null`, meaning `emitFx`'s cast branch's `if (!effect) break` guard silently drops ability fx for any mob whose ability isn't found in `data.units` this way -- worth checking against `mobs.json`/`combat/view.ts` if mob cast fx ever look wrong, since mobs are keyed in a SEPARATE `data.mobs` table.
- `toDisplayHex`/`flipRows` must remain involutive and consistent with the same logic used everywhere a unit's board side needs the "viewer's units on bottom" convention -- changing the flip logic here without auditing other consumers would desync rendering from hit-testing.
- `advance`'s tick consumption uses `<=` against `Math.floor(tickFloat)` -- an event exactly AT the current floored tick is applied that same call, not deferred to the next; off-by-one changes here would shift exactly when fx/state updates become visible relative to the smooth tick float.

# Depends on

`@autobattler/sim/src/types.js` (type-only: `CombatEvent`, `AbilityEffect`). `@autobattler/sim/src/hex.js` (`ROWS`, `hexDistance`, type `HexCoord`). `@autobattler/data` (type-only: `GameData`). `./reducer.js` (`applyEvent`, `emptyPlaybackState`, type `PlaybackState` -- the pure fold this module drives).

# Used by

`packages/client/src/combat/view.ts` (the Pixi rendering layer that calls `advance()`/`skipToEnd()` every frame and renders `PlaybackFrame.units`/`.fx`). `packages/client/src/audio/manager.ts` (`handleCombatFx(frame.fx)` consumes the same fx stream for sound). `packages/client/src/scenes/match.ts` (orchestrates `CombatPlayer` construction per combat phase, speed/skip controls).

# Notes

- The 0.25x speed option being "the new experienced default" (per the inline comment) suggests a relatively recent UX change toward slower default combat playback for readability; 1x's prior meaning is explicitly preserved (not redefined) for continuity with anything that assumed 1x === the original real-time pace.
- `getState()` returns the live mutable `PlaybackState` map by reference, not a clone -- callers must treat it as read-only by convention; mutating it externally would corrupt playback determinism.
