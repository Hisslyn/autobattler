# Path & purpose

`packages/client/src/settings.ts` -- client-side preference persistence: the `Settings` shape, its localStorage load/save functions, defaults, and the live `SettingsStore` holder with change notification used throughout the client (audio volumes, combat playback speed, reduced motion).

# Responsibility

Owns the single source of truth for every persisted client preference EXCEPT the player's display name (explicitly NOT here -- name lives server-side, changed via `PATCH /profile`, per the file's header comment and CLAUDE.md). Provides load-with-fallback parsing (tolerant of corrupt/missing/partial stored JSON), clamped numeric ranges, and a pub/sub store so any module can react to a preference change without polling.

# Exports

- `type PlaybackSpeedPref = 0.25 | 0.5 | 1 | 2` -- the four allowed default-combat-speed values. Comment clarifies `0.25` is the new EXPERIENCED-player default (quarter the old pace) and `"1x"` keeps its prior meaning throughout the codebase (i.e. this isn't a renumbering of what "1x" means, just a new slower option added below it).
- `interface Settings { masterVolume, sfxVolume, musicVolume, muted, musicEnabled, defaultSpeed, reducedMotion }` -- the full preference shape: three 0..1 volume sliders, a master `muted` boolean (zeroes all audio regardless of slider values), `musicEnabled` (an INDEPENDENT on/off toggle for music separate from `musicVolume` -- muting music via this flag is different from setting its volume to 0), `defaultSpeed` (`PlaybackSpeedPref`), `reducedMotion` (gates non-essential animation/tweens across the renderer).
- `const DEFAULT_SETTINGS: Settings` -- `{masterVolume:0.7, sfxVolume:0.8, musicVolume:0.5, muted:false, musicEnabled:true, defaultSpeed:0.25, reducedMotion:false}`.
- `function loadSettings(storage: StorageLike): Settings` -- reads `localStorage["ab.settings"]`, JSON-parses it (any parse failure or missing key falls back to an empty object, NOT a thrown error), then rebuilds a FULL `Settings` object field-by-field: each volume is clamped to `[0,1]` via `clamp01` (falls back to the default if the stored value isn't a finite number), booleans are type-checked (fallback to default if not literally a boolean), `defaultSpeed` is validated against the exact 4 allowed values via a chained ternary (any other stored value, including corrupted/future values, silently resolves to `0.25`).
- `function saveSettings(storage: StorageLike, settings: Settings): void` -- JSON-stringifies and writes to the same key; wrapped in try/catch (a write failure, e.g. private browsing mode, is silently ignored).
- `class SettingsStore` -- the live holder.
  - `constructor(storage: StorageLike = localStorage)` -- defaults to the real browser `localStorage` but accepts an injectable mock; loads immediately via `loadSettings`.
  - `get(): Settings` -- returns the current in-memory settings object (NOT a fresh copy -- callers receive the same reference until the next `update`).
  - `update(patch: Partial<Settings>): void` -- merges `patch` onto the current settings (`{...current, ...patch}`), persists via `saveSettings`, then synchronously notifies every subscriber with the NEW settings object.
  - `subscribe(fn: (s: Settings) => void): () => void` -- adds a listener, returns an unsubscribe closure (removes it from the internal `Set`).

# Key behavior

The load path is defensively layered: `loadSettings` never throws (a malformed/missing localStorage value falls back to `{}`, and every field is independently validated/clamped/defaulted rather than trusting the parsed JSON's shape wholesale) -- so a corrupted stored blob degrades gracefully to all-defaults rather than crashing the client at boot. `SettingsStore.update` is the SOLE mutation path; every consumer that wants to change a preference calls `store.update({field: value})` rather than mutating `get()`'s returned object directly (which would silently fail to persist or notify).

# Invariants & constraints

- `get()` returns the LIVE object by reference, not a defensive copy -- a caller that mutates the returned object directly would corrupt the store's internal state without going through `update`'s persist+notify path. The codebase relies on callers treating `get()`'s result as read-only.
- `loadSettings`/`saveSettings` both swallow storage exceptions silently (no logging) -- a developer debugging a "settings aren't persisting" issue in a restrictive browser context (private mode, disabled storage, storage quota) would get NO error signal from this file; the symptom would just be settings silently reverting to defaults each session.
- `defaultSpeed`'s validation is a literal value whitelist (the chained ternary), NOT a `PlaybackSpeedPref` type-guard -- if the union type `PlaybackSpeedPref` is ever extended with a new value, this ternary chain must be manually updated too or the new value will be silently rejected and fall back to `0.25`.
- `musicEnabled` and `musicVolume` are deliberately independent controls (per the field comment) -- a consumer must check BOTH to decide whether music should actually play (muting via `musicEnabled=false` is a different state than `musicVolume=0`, presumably so re-enabling restores the previous volume rather than requiring the user to re-set it).
- The player's display name is explicitly OUT OF SCOPE here by design -- a reader looking for name-change logic should go to `auth.ts`'s `patchName` / the server's `PATCH /profile`, not this file.

# Depends on

Nothing -- no imports; relies only on the ambient `Storage`-shaped interface (`Pick<Storage, "getItem"|"setItem">`) and the global `localStorage` as the default.

# Used by

- `packages/client/src/main.ts` -- constructs the single `SettingsStore` instance shared across the menu and match scene; `applyReducedMotion` subscribes to toggle the `reduced-motion` DOM class; passes `settings` into `AudioManager` and `MatchScene`'s options.
- `packages/client/src/audio/manager.ts` -- reads volumes/`muted`/`musicEnabled` to drive the Web Audio gain graph (per CLAUDE.md's audio section).
- `packages/client/src/scenes/match.ts` -- reads `settings.get().defaultSpeed` (initial `playbackSpeed`) and `settings.get().reducedMotion` throughout (gates tweens/particles/cross-fades; e.g. `onCombatPhase`'s cross-fade skip, `startPlayback`'s `reducedMotion` flag passed to `CombatPlayer`/`CombatView`).
- `packages/client/src/ui/app.ts` -- the themed Settings screen presumably reads/writes via `store.update(...)` for every slider/toggle (master/sfx/music volume, mute, music on/off, default speed, reduced motion), per CLAUDE.md's UI section.

# Notes

- The `0.25` default-speed comment ("the new experienced default... 1x keeps its prior meaning everywhere") signals this default was CHANGED at some point from a faster default to a slower one -- a reader investigating playback-speed-related UX regressions or A/B-test history should know this was a deliberate, documented pacing change, not an oversight.
- There's no schema-versioning mechanism for the persisted JSON blob -- if `Settings`'s shape changes in a way that's NOT just "add a new field with a default" (e.g. renaming a field, changing a field's semantic meaning while keeping its name), `loadSettings`'s per-field validation would silently accept stale/wrong data under the old key name with no migration path. Currently this isn't a problem since every change so far has been additive, but it's a latent footgun for larger settings refactors.
