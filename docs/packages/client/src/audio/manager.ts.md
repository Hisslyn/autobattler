# Path & purpose

`packages/client/src/audio/manager.ts` -- the Web Audio engine: owns the real `AudioContext` and node graph, synthesizes SFX from the pure palette (`sfx.ts`), drives generative or file-based music (`music.ts`/`director.ts`), and exposes `play()`/`setMusicState()`/`handleCombatFx()`/`resume()` as the client's entire audio surface.

# Responsibility

Owns all actual Web Audio API usage in the client: context lifecycle, the gain-node mix graph (master -> sfx/music buses -> generative/file sub-buses), SFX voice rendering (ADSR envelopes, oscillators, filtered noise, reverb send), music crossfading between generative and dropped-in files, and lazy loading/caching of override audio files. Consumes `SettingsStore` for volumes/mute/music-toggle and the combat fx stream for SFX triggers -- never reads game logic or `MatchState` directly.

# Exports

- `function computeGain(masterVolume: number, channelVolume: number, muted: boolean): number` -- pure helper (exported for testability) mirroring the node graph's actual gain math: returns 0 if muted, else `clamp01(masterVolume) * clamp01(channelVolume)`. Mirrors but does not directly drive `applyVolumes` (that method sets gains on separate master/channel nodes whose product equals this).
- `class AudioManager` -- the engine. Constructor: `new AudioManager(settings: SettingsStore, assetsBase = "/audio")`; subscribes to `settings.subscribe` so volume/mute/music-toggle changes immediately re-apply (`applyVolumes` + `applyMusic`).
  - `resume(): void` -- call from a user-gesture handler (browser autoplay policy requirement). Lazily builds the audio graph via `ensure()`, resumes the context if suspended, then transitions the unlock state machine (`nextUnlockState`) and re-applies music. Safe to call repeatedly/idempotently.
  - `play(name: SfxName, delaySec = 0): void` -- plays a designed SFX. Checks for a cached override sample first (lazy-loaded via `loadSfxOverride`); if none, renders the procedural `SfxSpec` from `SFX_SPECS[name]` through `renderVoice` for each voice in the spec, with per-trigger pitch jitter (`spec.jitterCents`) and a +-10% velocity randomization so repeated triggers don't fatigue the ear. `delaySec` schedules the sound into the future (e.g. sequencing economy cues after a round start).
  - `handleCombatFx(fx: CombatFx[]): void` -- the SOLE bridge between combat visuals and combat audio. Takes one playback frame's fx array, dedupes by category (one sound per effect-type per frame regardless of how many simultaneous fx of that type occurred), and plays: `crit` (if any fx had `crit:true`), `attack` (melee `contact`), `impact` (ranged `impact` only if no melee contact also fired that frame, since melee already voices the swing), `projectile` (any `projectile` fx), one cast sound per distinct `abilityHit.effect` kind via `castSfx`, and `death` (any `dissolve`).
  - `setMusicState(state: MusicState): Promise<void>` -- public entry to drive the music director; sets `currentState` and calls `applyMusic()`.
- `export type { SfxName }` (re-exported from `./sfx.js`) and `export type { MusicState }` (re-exported from `./director.js`) -- convenience re-exports so consumers only need to import from `manager.ts`.

# Key behavior

- **Node graph** (built once, lazily, in `ensure()`): `sfxGain` (+ a `ConvolverNode` reverb fed by per-voice sends) -> `masterGain` -> destination; `genGain` (generative music) and `fileGain` (dropped-in file music) both feed into `musicGain` -> `masterGain`. `genGain`/`fileGain` start at 0 and are exclusively controlled by crossfade ramps in `applyMusic` -- never both audible at once for the same state, but ramped (0.6s linear) rather than hard-switched.
- **applyVolumes**: `masterGain.gain = muted ? 0 : masterVolume`; `sfxGain.gain = sfxVolume`; `musicGain.gain = musicEnabled ? musicVolume : 0` -- the music on/off toggle gates ONLY the music channel, leaving SFX unaffected. This product structure intentionally mirrors `computeGain`'s pure formula (kept as a separate testable function since the real gain nodes can't run in a unit test).
- **musicAudible()**: CPU-saving gate -- returns false if muted, music disabled, music volume is 0, or master volume is 0; `applyMusic` checks this (plus `ctx.state !== "running"`) and if inaudible/locked, stops the generative engine and any playing file source entirely (ramping both gains to 0) rather than just silencing them, to save CPU when audio can't be heard anyway.
- **applyMusic** (the core music state machine): increments a `musicToken` guard (so a slow file-load that gets superseded by a newer state change is detected and discarded -- `if (token !== this.musicToken) return`). If audible: awaits `fileBufferFor(state)` (which tries `.mp3` then `.ogg` via `tryLoad`, caching the result including `null` for "no file"), then uses `resolveMusicSource` (from `director.ts`) to decide file-vs-generative; on file, starts/loops the `AudioBufferSourceNode` and ramps `fileGain` up / `genGain` down (and stops the generative engine); on generative, calls `gen.setMood(stateToMood(state))` + `gen.start()` and ramps the reverse.
- **SFX rendering (`renderVoice`)**: builds a per-voice ADSR gain envelope (`exponentialRampToValueAtTime` through attack/decay/sustain-hold/release phases, floored at 0.0001 since Web Audio can't ramp to exactly 0 exponentially) feeding `sfxGain`, with an optional parallel send to the shared `sfxReverb` convolver. The sound source is either an `OscillatorNode` (sine/triangle/square/sawtooth, with optional `sweepTo` pitch glide and static `detune`) or, for `wave: "noise"`, a looping white-noise `AudioBufferSourceNode` shared across all noise voices (`noiseBuffer`, lazily built once, 1 second long). An optional `BiquadFilterNode` sits between source and envelope.
- **SFX override loading**: `loadSfxOverride` tries `sfxFilePaths(name)` (mp3 then ogg) via `tryLoad`; result (including `null`) is cached in `sfxBuffers` so subsequent `play()` calls for that name either play the sample directly (`playSample`, a simple buffer source -> gain -> sfxGain chain) or keep using the synthesized voice. The cache uses `undefined` (map-miss) to distinguish "never tried" (triggers a lazy load) from "tried, no file" (cached `null`, stays synthesized).
- **Reverb impulse** (`makeImpulse`): a 0.35s stereo decaying-noise buffer (power-2.5 decay curve) built once and reused as the convolver's impulse response for all SFX reverb sends.

# Invariants & constraints

- Must stay a pure CONSUMER of `CombatFx`/`Settings`/UI events -- per the file header comment, "it never reads game logic or MatchState." Any new audio trigger should come from an existing fx/effect stream or settings change, not from new game-state reads.
- `ensure()` must be called (indirectly, via `resume()`) from within a real user-gesture event handler, or the browser's autoplay policy will leave the `AudioContext` suspended indefinitely -- `resume()` is the documented required entry point on first interaction.
- The `musicToken` increment-and-compare pattern is the load-bearing race-condition guard for `applyMusic` -- any modification to that method must preserve discarding stale async work when a newer state change supersedes an in-flight file load.
- `computeGain` is a pure mirror of the real node-graph math but is NOT actually called by `applyVolumes` (which sets node gains directly) -- it exists purely so the volume-mixing FORMULA is unit-testable without a real `AudioContext`. If the real node graph's mixing logic changes, `computeGain` must be updated to match or the test suite will silently validate stale behavior.
- A real dropped-in file always wins over generative/synthesized audio (both for music per-state and SFX per-event) -- consistent with the `public/audio/README.md` contract.
- `handleCombatFx`'s per-frame dedup (one sound per category, not one per individual fx event) is intentional -- prevents a busy combat tick with many simultaneous hits from causing an audio "wall of noise"; do not naively loop-and-play per fx without preserving this dedup.

# Depends on

`../settings.js` (type-only: `SettingsStore`, `Settings`). `../combat/player.js` (type-only: `CombatFx`, `AbilityFxKind` -- the playback fx stream this module consumes). `./sfx.js` (`SFX_SPECS`, `castSfx`, types `SfxName`/`SfxVoice` -- the pure SFX data palette). `./music.js` (`GenerativeMusic` -- the generative engine class). `./director.js` (`resolveMusicSource`, `stateToMood`, `musicFilePaths`, `sfxFilePaths`, `nextUnlockState`, types `MusicState`/`AudioUnlockState` -- the pure decision layer this module wraps real nodes around).

# Used by

Instantiated once by the client's bootstrap/main code (`main.ts` likely, or a scene) and threaded through to wherever audio needs triggering: `scenes/match.ts` (combat fx via `handleCombatFx`, economy/UI cues via `play()`, music state transitions via `setMusicState()` driven by phase changes), and the settings UI (volume/mute/music-toggle changes flow in automatically via the constructor's `settings.subscribe`).

# Notes

- The `_state` parameter naming convention seen in `director.ts`'s `resolveMusicSource` (state param unused) means this manager calls that function purely for its `hasFile` boolean logic -- the state itself doesn't currently affect file-resolution priority, only which file path is probed.
- CPU-consciousness is a recurring design concern in this file: stopping the generative engine and file source entirely (not just silencing gain) whenever music is inaudible, and caching all file-load attempts (including negative results) so repeated state changes don't re-fetch.
- The `genGain`/`fileGain` nodes start at value 0 explicitly in `ensure()` -- a freshly built graph is silent on both music sub-buses until `applyMusic` ramps one up, avoiding any audio glitch/pop on first construction.
