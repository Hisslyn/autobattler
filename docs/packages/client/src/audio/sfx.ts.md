# Path & purpose

`packages/client/src/audio/sfx.ts` -- the pure SFX palette: the entire designed sound-effect set as data (no Web Audio calls), plus the complete event-to-sound coverage map.

# Responsibility

Owns the full catalogue of SFX as declarative `SfxSpec`/`SfxVoice` data (layered synth voice definitions with ADSR envelopes, oscillator/noise sources, filters, reverb sends, pitch jitter), and the `EVENT_SFX` map asserting total coverage of every UI/combat/economy event. Deliberately contains zero Web Audio API usage so the palette itself (and its completeness) can be unit-tested without a browser audio context; `manager.ts` is the only place that actually renders these specs into sound.

# Exports

- `type SfxName` -- union of every defined sound name, grouped by category: UI (`tap`, `buy`, `sell`, `reroll`, `levelUp`, `error`), combat (`attack`, `projectile`, `impact`, `crit`, `death`, `castMagic`, `castBurn`, `castShield`, `castBuff`, `castStealth`), economy/feedback (`goldGain`, `starUp`, `roundStart`, `roundWin`, `roundLoss`, `elimination`).
- `type WaveKind = OscillatorType | "noise"` -- any standard Web Audio oscillator type, plus the synthetic `"noise"` source kind this module adds.
- `interface SfxVoice` -- one synth voice: `wave`, `freq` (Hz, or noise filter center), optional `sweepTo` (exponential pitch glide target), optional `detune` (cents, for thickening against a sibling voice), optional `filter: {type, freq, q?}`, ADSR fields `attack`/`decay`/`sustain` (0..1 fraction of gain)/`release` (all seconds except sustain), `gain` (peak), optional `delay` (start offset within the sound, used to arpeggiate a chord-like SFX), `hold` (sustain-hold duration before release).
- `interface SfxSpec` -- `voices: SfxVoice[]` (layered), optional `send` (0..1 reverb send amount), optional `jitterCents` (per-trigger random pitch variation range).
- `const SFX_SPECS: Record<SfxName, SfxSpec>` -- the full data table, one entry per `SfxName`, each composed of 1-3 layered voices. All built via the internal `v()` helper which supplies plucked-envelope defaults (`attack:0.004, decay:0.07, sustain:0, release:0.08, gain:0.3, hold:0`) overridden per-voice.
- `const SFX_NAMES: SfxName[]` -- `Object.keys(SFX_SPECS)` cast to the union type; the enumerable list of all sound names.
- `function castSfx(kind: AbilityFxKind): SfxName` -- maps an ability-effect kind to its cast sound: `magic_damage`->`castMagic`, `burn`->`castBurn`, `shield`->`castShield`, `buff`->`castBuff`, `stealth`->`castStealth`. Exhaustive switch (no default) -- relies on `AbilityFxKind`'s type being a closed union so TypeScript catches an unhandled case at compile time.
- `const EVENT_SFX` (typed `satisfies Record<string, SfxName>`) -- the complete event-name -> `SfxName` coverage map, grouped: UI events map 1:1 to their own name; combat events use descriptive keys (`meleeContact`->`attack`, `projectileFire`->`projectile`, `impact`->`impact`, `critImpact`->`crit`, `death`->`death`, `abilityMagic`->`castMagic`, etc. -- these keys are NOT necessarily identical to the fx-stream kind strings, they're documentation-oriented names the coverage test checks against); economy/feedback events map 1:1 like UI.
- `type AudioEvent = keyof typeof EVENT_SFX` -- the union of all coverage-map event keys.

# Key behavior

This file has zero runtime behavior beyond static data construction (the `v()` builder function runs at module-load time to build each voice object) and one trivial pure switch (`castSfx`). All actual sound rendering happens elsewhere (`manager.ts`'s `renderVoice`). The musical/sonic design groups everything into one A-minor tonal family (the `NOTE` constant table spans A1 through E6 named notes) so the whole SFX palette feels cohesive with itself and (per `music.ts`'s header) with the generative music.

# Invariants & constraints

- `EVENT_SFX` must remain a TOTAL map -- "every discrete UI, combat, and economy event that produces audio" per the file header -- and a test (mentioned in `CLAUDE.md`'s audio section: "`EVENT_SFX` is the total event->sound coverage map (test-enforced complete)") asserts this completeness and that every value is a key actually present in `SFX_SPECS`. Adding a new game event that should produce sound requires adding it here, and adding a new sound requires it to appear in `SFX_SPECS` keyed by a valid `SfxName`.
- `castSfx`'s switch is exhaustive over `AbilityFxKind` with no default/fallback -- if `AbilityFxKind` (defined in `combat/player.ts`) ever gains a new variant, this switch will fail to compile until updated, by design (forces the dev to decide its cast sound).
- This file must stay free of any Web Audio API surface (`AudioContext`, `OscillatorNode`, etc.) -- that's the explicit reason it's separated from `manager.ts` ("No Web Audio here," per the header), preserving testability of the data/coverage without a browser context.
- `jitterCents`/velocity randomization exists specifically to prevent "repeats don't fatigue" the ear for frequently-triggered sounds (UI taps, attacks) -- any new frequently-repeated SFX should likely set a nonzero `jitterCents`.

# Depends on

`../combat/player.js` (type-only: `AbilityFxKind` -- needed only for `castSfx`'s parameter type).

# Used by

`packages/client/src/audio/manager.ts` (`SFX_SPECS` rendered via `renderVoice`, `castSfx` used by `handleCombatFx` to pick the right cast sound per ability-effect kind). Almost certainly exercised by a dedicated coverage test (per `CLAUDE.md`'s reference to "test-enforced complete") -- likely in `packages/client/tests/audio.test.ts`.

# Notes

- `EVENT_SFX`'s combat-section keys (`meleeContact`, `projectileFire`, `critImpact`, `abilityMagic`, etc.) are deliberately distinct from the `CombatFx` kind strings used in `manager.ts`'s `handleCombatFx` (`contact`, `projectile`, `impact`, `abilityHit`) -- this map is a documentation/coverage artifact describing INTENT ("every combat event that produces audio"), not a literal runtime lookup table that `handleCombatFx` consults; the actual trigger logic in `manager.ts` is hand-written dedup/branching code, not driven by iterating `EVENT_SFX`. A reader modifying combat audio triggers should edit `handleCombatFx` directly, then keep `EVENT_SFX` in sync for documentation/test purposes.
