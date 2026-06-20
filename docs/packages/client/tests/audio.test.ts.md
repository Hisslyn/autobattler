# Path & purpose

`packages/client/tests/audio.test.ts` -- unit tests for every PURE (non-Web-Audio-node) piece of the client's audio system: gain math, crossfade math, the music director's state/mood/source resolution, the SFX coverage map, the autoplay-unlock state machine, and the generative music theory helpers (MIDI/scale math, chord progressions, seeded motif generation/variation, voice-leading, the mix gain table).

# Responsibility

Owns: regression coverage proving the audio system's pure logic (everything NOT requiring an actual `AudioContext`/node graph) behaves correctly in isolation -- `audio/manager.ts`'s `computeGain`, `audio/sfx.ts`'s coverage map, `audio/director.ts`'s state-resolution/crossfade/unlock functions, and `audio/music.ts`'s entire generative-composition theory layer. None of these tests touch real audio playback (no `AudioContext` is constructed) -- they validate the MATH and DATA, trusting `manager.ts` to correctly wire that math onto real nodes (untested here).

# Exports

None (a Vitest test file -- `describe`/`it` blocks only).

# Key behavior

**"audio bus gain math"**: tests `computeGain(master, channel, muted)` -- multiplies master×channel when unmuted, forces `0` when `muted=true` regardless of volumes, and clamps each volume input independently into `[0,1]` before multiplying (e.g. `computeGain(5,1,false)` clamps master to 1 → result `1`; `computeGain(-2,0.5,false)` clamps master to 0 → result `0`).

**"crossfade math"**: tests `crossfadeGains(progress)` -- at `progress=0` returns `{out:~1, in:~0}` (fully on the outgoing track), at `progress=1` returns `{out:~0, in:~1}`, at the midpoint `0.5` both gains equal `Math.SQRT1_2` (~0.707) and `out²+in²≈1` (confirming EQUAL-POWER crossfade math, which keeps combined perceived loudness constant through the fade rather than dipping at the midpoint like a linear crossfade would). Also confirms `crossfadeGains` clamps progress outside `[0,1]` to the boundary values.

**"music director state→track resolution"**: tests four `director.ts` functions. `phaseToMusicState`: `PLANNING→planning`, `COMBAT→combat`, `RESOLUTION→combat` (resolution reuses combat's music, not its own state), and any UNRECOGNIZED phase string (e.g. `"???"`) falls back to `planning` (a defensive default, not an error). `stateToMood`: `menu→menu`, `results→menu` (results "underscores like menu" -- calmer mood reused for the post-match screen), `planning→planning`, `combat→combat`. `resolveMusicSource(state, hasFile)`: returns `"file"` when a dropped-in file exists for that state, `"generative"` otherwise, for ALL four states. `musicFilePaths(state, baseUrl?)`/`sfxFilePaths(name, baseUrl?)`: resolve the mp3-then-ogg path pair under a default `/audio/music`/`/audio/sfx` base (overridable, e.g. for a CDN base path like `/cdn`).

**"SFX coverage map"**: four completeness checks on `sfx.ts`'s `EVENT_SFX`/`SFX_SPECS`/`SFX_NAMES`/`castSfx`. (1) every event referenced in `EVENT_SFX`'s values resolves to a defined `SFX_SPECS` entry; (2) every named SFX (`SFX_NAMES`) has at least one synth voice (`SFX_SPECS[name].voices.length > 0`); (3) `castSfx(kind)` resolves a defined spec for ALL FIVE ability-effect kinds (`magic_damage`, `burn`, `shield`, `buff`, `stealth`) -- this is the cross-check tying the combat ability-effect kinds (from `combat/player.ts`'s `AbilityFxKind`) to actual cast sounds, so a new ability kind added to the engine without a corresponding cast sound would fail here; (4) `SFX_NAMES`' coverage is BIDIRECTIONAL -- every name in `SFX_NAMES` must also be referenced somewhere in `EVENT_SFX`'s values (no orphan/unused SFX spec that nothing ever triggers).

**"autoplay unlock state"**: tests `nextUnlockState(current, contextState)`/`becameUnlocked(prev, next)` -- the browser autoplay-policy unlock state machine. `nextUnlockState`: stays `"locked"` while the AudioContext is `"suspended"` or `null`, transitions to `"unlocked"` only when the context reports `"running"`; once `"unlocked"`, STAYS unlocked even if the context later reports `"suspended"` or `"closed"` (sticky -- a later suspend, e.g. tab backgrounding, does not re-lock). `becameUnlocked` fires `true` ONLY on the exact `locked→unlocked` edge transition (used to trigger "start playing music now" exactly once).

**"generative music helpers"**: tests `music.ts`'s low-level math. `midiToFreq(69)≈440` (A4 standard tuning, equal-tempered), confirmed at octave multiples (57→220, 81→880). `degreeToMidi(rootMidi, scale, degree)` resolves a scale-degree offset (can be negative or exceed the scale length) to an absolute MIDI note, wrapping octaves correctly (`degree=7` on a 7-note scale wraps up exactly one octave: 57→69; `degree=-1` wraps down). `dueSteps(now, cursor, lookahead, stepDur)` (the Web Audio lookahead scheduler's step-due calculator) returns only grid-aligned step times within `[cursor, cursor+lookahead]` and the advanced cursor for the next call; also confirmed it "catches up" a far-behind cursor (e.g. cursor stalled at 0 while `now=100`) by starting from `now` rather than replaying every missed step (bounded catch-up, not an unbounded loop). `MOODS` ordering: `combat.bpm > planning.bpm > menu.bpm` (tempo intensity ordering) and `menu.percGain === 0` while `combat.percGain > 0` (menu has no percussion layer at all).

**"chord progressions per state"**: tests `triad(rootDegree)` (stacks `[root, root+2, root+4]` diatonic thirds, e.g. `triad(0)=[0,2,4]`, `triad(5)=[5,7,9]`), `PROGRESSIONS` (exact expected roots per mood: menu `[0,5,2,6]` i-VI-III-VII, planning `[0,3,5,4]` i-iv-VI-V, combat `[0,6,5,4]` i-VII-VI-v -- each is a SET of more than one distinct root, i.e. genuinely moving, not a static drone), each progression is exactly 4 bars long (divides evenly into the loop) and STARTS on the tonic (`roots[0]===0`, so the loop seam resolves cleanly back to "home" when it repeats), and `progressionFor(mood)` correctly expands each mood's root sequence into per-bar triads matching `MOODS[mood].progression` exactly.

**"seeded melodic motif"**: tests `generateMotif(seed, len)`/`varyMotif(motif, pass)`. Same seed+length always produces the IDENTICAL motif (determinism, e.g. for save/replay consistency across sessions), different seeds produce different phrases, the motif has exactly `len` entries each either `null` (a rest) or an integer scale-degree offset in `[-6, 10]` (bounded range, "step/skip degrees or rests" -- no huge melodic leaps), and a generated motif is "more than rests" (at least one non-null note). `varyMotif(motif, pass)` is deterministic PER PASS (same pass number on the same motif always yields the same variation) but differs across passes (`pass=1` differs from `pass=2`), with `pass=0` returning the THEME PLAINLY (a value-equal but reference-DIFFERENT copy of the original motif -- `toBe` fails, `toEqual` passes, confirming it's a fresh array not the same object) and every pass preserving the original length.

**"voice-leading"**: tests `voiceLead(prevVoicing, chordDegrees, rootMidi, scale)`. With an EMPTY previous voicing (first chord of a piece), returns the plain ascending voicing in absolute MIDI (`[57,60,64]` for root 57 + degrees `[0,2,4]` on the A-minor scale). With a real previous voicing, the next chord's voiced notes each stay within a bounded distance (`≤7` semitones) of SOME note in the previous voicing (confirming shared/stepwise motion rather than parallel big leaps), and the returned voicing is sorted ascending.

**"mixing gain table"**: tests `MIX[mood]` per-layer gain multipliers -- every layer's gain is in `(0,1]` EXCEPT `perc` which may legitimately be `0` (silenced layer, specifically menu's), the lead layer's gain always exceeds the pad's (`mix.lead > mix.pad`, lead sits "above" the pad in the mix), percussion never dominates (`mix.perc < mix.lead` AND `mix.perc <= mix.pad`), and menu specifically has `perc===0` (confirmed twice, here and in the MOODS test -- emphasizing this is a deliberate "no percussion at all in the menu mood" decision, not an accidentally-low value).

# Invariants & constraints

- This file is the authoritative cross-check that `castSfx` covers ALL FIVE current ability-effect kinds from `combat/player.ts`'s `AbilityFxKind` type -- if a sim ability-effect kind is ever added (the sim/data invariants list currently supports `magic_damage`/`burn`/`shield`/`buff`/`stealth`), this test's hardcoded `kinds` array must be updated, or a newly-added ability kind's cast sound would go untested (note: `castSfx` itself would still need a real implementation regardless; this test just wouldn't catch a missing one for the new kind until the array is updated).
- The `EVENT_SFX`/`SFX_NAMES` bidirectional-coverage check (test 4 of the SFX suite) is a STRICT completeness invariant: every defined SFX spec must be reachable from at least one game event, and every event must resolve to a defined spec. This means `sfx.ts` cannot carry "dead" unused specs, and the event map cannot reference an undefined spec -- both directions are enforced, not just one.
- `dueSteps`'s catch-up behavior is bounded ("starts at `now`, not 0" and the test asserts `times.length < 5`) -- this is an explicit anti-runaway-loop guard verified here; a regression that made the scheduler try to "replay" all missed steps from a stalled cursor would manifest as this test's `times.length` assertion failing (a very large array) rather than a timeout, making the bug fast to diagnose.
- The equal-power crossfade property (`out²+in² ≈ 1` at the midpoint) is a perceptual-loudness invariant, not just a mathematical curiosity -- a regression to a LINEAR crossfade (`out=1-progress`, `in=progress`) would still pass the "all-out at 0 / all-in at 1" test but FAIL the midpoint equal-power assertion, which is precisely why that specific test exists.

# Depends on

- `vitest` (`describe`, `it`, `expect`, including `expect.closeTo` matcher usage inside `toEqual`).
- `../src/audio/manager.js` (`computeGain`).
- `../src/audio/sfx.js` (`SFX_SPECS`, `SFX_NAMES`, `EVENT_SFX`, `castSfx`, `SfxName` type).
- `../src/audio/director.js` (`phaseToMusicState`, `stateToMood`, `resolveMusicSource`, `musicFilePaths`, `sfxFilePaths`, `crossfadeGains`, `nextUnlockState`, `becameUnlocked`, `MusicState` type).
- `../src/audio/music.js` (`midiToFreq`, `degreeToMidi`, `dueSteps`, `MOODS`, `PROGRESSIONS`, `MIX`, `triad`, `progressionFor`, `generateMotif`, `varyMotif`, `voiceLead`, `MusicMood` type).
- `../src/combat/player.js` (`AbilityFxKind` type only -- used to type the `kinds` array in the cast-sound coverage test).

# Used by

Not imported by any other file (a leaf test file); run as part of the client package's `npm test`/vitest suite.

# Notes

- This is one of the most theory-dense test files in the client package -- a reader wanting to understand the generative music system's actual musical rules (which progressions, why equal-power crossfades, how motifs vary per loop) can use this file as a spec-by-example almost as effectively as reading `music.ts`'s source directly, since nearly every documented behavioral claim in CLAUDE.md's audio section has a corresponding assertion here.
- No test in this file exercises `manager.ts`'s actual node-graph wiring, `combatFx`-to-sound bridging, or real playback -- that real-audio-node layer remains untested by this suite (by design, since it requires a live `AudioContext` which isn't available/meaningful in a headless Vitest run).
