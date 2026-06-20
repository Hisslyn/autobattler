# Path & purpose

`packages/client/src/audio/director.ts` -- the pure "decision layer" of the audio system: maps game phase/scene to a music state, resolves file-vs-generative music source, computes equal-power crossfade gains, and runs the autoplay-unlock state machine. Deliberately Web-Audio-free so it's fully unit-testable.

# Responsibility

Owns every piece of audio DECISION logic that doesn't need a real `AudioContext`/node graph: phase->state mapping, state->mood mapping, file-resolution priority, crossfade math, and unlock-state transitions. `packages/client/src/audio/manager.ts` owns the actual nodes and calls into this module for all the "what should happen" decisions.

# Exports

- `type MusicState = "menu" | "planning" | "combat" | "results"` -- the four distinct music states the director can drive.
- `type MusicSource = "file" | "generative"` -- where a state's audio ultimately comes from once resolved.
- `function phaseToMusicState(phase: string): MusicState` -- maps a driver phase string to a music state: `"PLANNING"` -> `planning`, `"COMBAT"` -> `combat`, `"RESOLUTION"` -> `combat` (deliberately holds tension through the result overlay rather than dropping back to a calmer mood), any other value (e.g. match-over/menu) -> `planning` as the default fallback. Note `"results"` state exists in the type but is NOT reachable from this function -- it must be set directly by caller logic for the match-over screen (this function only handles in-match phase strings).
- `function stateToMood(state: MusicState): MusicMood` -- maps a `MusicState` to the generative `MusicMood` (from `music.ts`): `menu`->`menu`, `results`->`menu` (results "underscores like the menu" per the inline comment), `planning`->`planning`, `combat`->`combat`.
- `function resolveMusicSource(_state: MusicState, hasFile: boolean): MusicSource` -- trivial resolution: `hasFile ? "file" : "generative"`. The `_state` parameter is unused (prefixed accordingly) -- kept for call-site symmetry/future extensibility, not currently state-dependent.
- `function musicFilePaths(state: MusicState, base = "/audio"): string[]` -- returns `[<base>/music/<state>.mp3, <base>/music/<state>.ogg]` in priority order (mp3 tried first).
- `function sfxFilePaths(name: string, base = "/audio"): string[]` -- returns `[<base>/sfx/<name>.mp3, <base>/sfx/<name>.ogg]` in priority order.
- `function crossfadeGains(progress: number): { out: number; in: number }` -- equal-power crossfade: clamps `progress` to [0,1], returns `{ out: cos(p*PI/2), in: cos((1-p)*PI/2) }` -- keeps combined perceived loudness roughly constant through the transition (as opposed to a linear fade, which dips in the middle).
- `type AudioUnlockState = "locked" | "unlocked"`.
- `function nextUnlockState(prev: AudioUnlockState, ctxState: AudioContextState | null): AudioUnlockState` -- sticky unlock: once `"unlocked"`, stays `"unlocked"` forever regardless of subsequent `ctxState`; otherwise unlocks only when `ctxState === "running"`.
- `function becameUnlocked(prev: AudioUnlockState, next: AudioUnlockState): boolean` -- true exactly on the `locked`->`unlocked` transition edge (`prev==="locked" && next==="unlocked"`) -- the precise moment the manager should (re)start music.

# Key behavior

All functions are pure, synchronous, side-effect-free transformations -- no Web Audio API calls, no `AudioContext`, no timers. The intended call pattern: the match scene/driver feeds the current phase string into `phaseToMusicState`, `manager.ts` resolves the mood via `stateToMood` and the source via `resolveMusicSource` (after probing whether `musicFilePaths(state)` resolved to a real file), uses `crossfadeGains` to compute gain ramps during a state transition, and tracks `AudioUnlockState` across user-gesture events, calling `becameUnlocked` to know exactly when to kick off playback for the first time.

# Invariants & constraints

- This module must stay 100% pure and Web-Audio-free -- that's the explicit design reason it exists separately from `manager.ts` ("so they can be unit-tested without Web Audio", per the header comment). Any new audio DECISION (not node-graph mechanics) belongs here, not in `manager.ts`.
- `phaseToMusicState` is total (has a default case) -- it never throws on an unrecognized phase string, always falling back to `"planning"`.
- The unlock state machine is intentionally one-directional/sticky -- once unlocked, a context that somehow reports non-"running" again would NOT relock per this function (matches real browser behavior: once a user gesture has run, the context generally stays usable).
- `crossfadeGains`'s clamp means callers can pass any `progress` (including out-of-range) safely; the equal-power formula (`cos`-based, not linear) is the load-bearing detail -- changing it to linear would alter the perceived loudness dip during transitions.

# Depends on

`./music.js` (type-only: `MusicMood` from `packages/client/src/audio/music.ts`).

# Used by

`packages/client/src/audio/manager.ts` (the consumer that wraps these pure decisions around real Web Audio nodes -- `setMusicState`, `play`, `resume`). Likely exercised directly by `packages/client/tests/audio.test.ts`. The match scene (`scenes/match.ts`) and `main.ts`/driver code feed phase/scene info into this module indirectly via `manager.ts`.

# Notes

- `MusicState` includes `"results"` but `phaseToMusicState` cannot produce it -- any caller wanting "results" music (the match-over screen) must set that state directly rather than deriving it from a phase string; worth knowing if debugging why match-over music doesn't change as expected from a phase-driven call site.
