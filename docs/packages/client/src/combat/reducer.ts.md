# Path & purpose

`packages/client/src/combat/reducer.ts` -- the pure event-log reducer: derives playback state strictly by folding `CombatEvent`s in log order, with no Pixi and no `MatchState` involvement.

# Responsibility

Owns the canonical in-memory representation of "what does the board look like after N events have happened" -- positions, hp/mana, alive/dead, overtime flag, and end-of-combat outcome -- computed exclusively by replaying the event log. This is the foundational primitive `CombatPlayer` (`player.ts`) builds its time-based playback on top of.

# Exports

- `interface PlaybackUnit { uid, side, defId, star, pos, hp, maxHp, mana, maxMana, alive, items }` -- one unit's full reducer-tracked state. `items` is the unit's equipped item id list (snapshotted from the `init` event, never mutated afterward during playback -- items don't change mid-combat).
- `interface PlaybackState { units: Map<number, PlaybackUnit>; overtime: boolean; ended: boolean; winnerSide: 0 | 1 | "draw" | null; survivingUids: number[] }` -- the full reducer state at any point in the fold.
- `function emptyPlaybackState(): PlaybackState` -- constructs a fresh zeroed state (`units` empty map, `overtime: false`, `ended: false`, `winnerSide: null`, `survivingUids: []`).
- `function applyEvent(state: PlaybackState, ev: CombatEvent): PlaybackState` -- mutates `state` in place according to `ev.type` and returns it (for chaining convenience): `init` populates `state.units` from the event's per-unit snapshot array (one `set` per unit, deep-copying `hex`/`items`, `alive` always starts true); `move` updates `pos` on the matching unit; `hp`/`mana` overwrite the absolute value on the matching unit; `death` sets `alive = false`; `overtime_start` sets `overtime = true`; `end` sets `ended = true`, copies `winnerSide` and `survivingUids` (cloned array); `attack`/`cast` are explicit no-ops on reducer state (documented: "attack/cast carry no state change of their own (hp/mana arrive as separate absolute-value events); they only drive fx" -- i.e. `player.ts`'s `emitFx` is what does anything visually/aurally meaningful with these two event types, this reducer only tracks STATE, and attack/cast don't change state directly).
- `function stateAtTick(log: CombatEvent[], t: number): PlaybackState` -- a convenience one-shot fold: builds a fresh state and applies every event in `log` whose `tick <= t`, stopping (via `break`) at the first event whose tick exceeds `t` (relies on the log being tick-ordered, per the inline comment "log is tick-ordered" -- does NOT sort, just assumes and short-circuits).

# Key behavior

Pure, synchronous, single-pass fold -- `applyEvent` is the only place state mutation logic lives, and it's a straightforward switch over `CombatEvent.type` with one case per event kind from `@autobattler/sim`'s `CombatEvent` union. No event type is silently ignored: `attack`/`cast` are explicitly matched and intentionally do nothing (not a fallthrough default), so adding a new `CombatEvent` variant to the sim without updating this switch's cases would surface as a TypeScript exhaustiveness concern if the switch is written exhaustively (worth verifying when the sim's event union grows).

# Invariants & constraints

- Must stay pure: no Pixi imports, no timers, no I/O, no `MatchState` reads -- explicitly called out in the file header ("no Pixi, no MatchState"). This is the deepest layer of the "combat playback = pure reducer over the event log" invariant; `player.ts` (the playback clock) and `view.ts` (the renderer) both build on top of this without it ever reaching back into game logic.
- `applyEvent` MUTATES the passed-in `state` object (not a copy-on-write) -- callers (`player.ts`'s `advance`/`skipToEnd`, and `stateAtTick`'s internal loop) rely on this for performance (no per-event object churn over a potentially-long combat log) but must be careful never to share a `PlaybackState` across two independent playback cursors without intending shared mutation.
- `stateAtTick`'s early-`break` on the first over-tick event assumes the log is monotonically tick-ordered -- this matches the sim's documented guarantee ("Emits ordered CombatEvent log" per `CLAUDE.md`'s engine.ts section) but if that ordering guarantee were ever violated, `stateAtTick` would silently stop folding too early rather than erroring.
- HP/mana are tracked as whatever absolute values the events carry (already fixed-point-resolved or real values, per the sim's documented event payload convention: "mana/hp (absolute values, emitted only on change, hp clamped at 0)") -- this reducer does no clamping/validation itself, fully trusting the upstream event log's correctness (consistent with "server result is canon" -- if the log says hp=500, the reducer just stores 500).

# Depends on

`@autobattler/sim/src/types.js` (type-only: `CombatEvent`). `@autobattler/sim/src/hex.js` (type-only: `HexCoord`).

# Used by

`packages/client/src/combat/player.ts` (`CombatPlayer` calls `applyEvent`/`emptyPlaybackState` to drive its time-based playback cursor). Likely also used directly by `stateAtTick` callers wanting a one-shot snapshot without the full clock machinery (e.g. a static preview, a test, or a "jump to tick N" debug feature) -- `CLAUDE.md`'s combat/ section explicitly calls out `stateAtTick` as a named export of this file.

# Notes

- `items` being snapshotted once at `init` and never touched again during playback is consistent with the sim's documented behavior that item stat bundles are applied once "at combat start" -- there's no mid-combat item event type to react to.
