# Path & purpose

`packages/client/tests/settings.test.ts` — unit tests for `loadSettings`/`saveSettings` (`packages/client/src/settings.ts`), covering defaults, the speed-preference enum coercion, round-tripping, out-of-range clamping, and corrupt-JSON resilience, all against an injected mock storage (no real `localStorage`).

# Responsibility

Guards the defensive-parsing contract of the settings persistence layer: `loadSettings` must NEVER throw and must always return a fully-populated, range-valid `Settings` object regardless of what garbage (or nothing) is in storage.

# Exports

None — Vitest test file. Defines a local `mockStorage()` helper (not exported) returning `{store, getItem, setItem}` backed by a `Map<string,string>`, satisfying the `Pick<Storage,"getItem"|"setItem">` shape `loadSettings`/`saveSettings` require.

# Key behavior

- "returns defaults when storage is empty": `loadSettings(mockStorage())` (empty map, `getItem` returns `null`) equals `DEFAULT_SETTINGS` exactly.
- "defaults combat speed to 0.25x": asserts `DEFAULT_SETTINGS.defaultSpeed === 0.25` AND that loading from empty storage also yields `0.25` — pins the documented "quarter the old 1x pace" default.
- "accepts each supported combat speed (0.25/0.5/1/2)": for each of the 4 valid `PlaybackSpeedPref` values, writes `{defaultSpeed: speed}` as the ONLY stored field, then asserts `loadSettings(...).defaultSpeed` round-trips exactly — exercises every branch of the ternary chain in `loadSettings` (`raw.defaultSpeed === 2 ? 2 : === 1 ? 1 : === 0.5 ? 0.5 : 0.25`).
- "round-trips a full settings object": builds a custom `Settings` object with every field at a non-default value (including booleans flipped: `muted: true`, `musicEnabled: false`, `reducedMotion: true`), calls `saveSettings` then `loadSettings`, asserts deep equality — proves the full read/write path preserves all 7 fields, not just speed.
- "clamps out-of-range volumes and coerces bad fields to defaults": stores `{masterVolume: 5, sfxVolume: -2, defaultSpeed: 7, muted: "yes"}` (all invalid: volumes outside [0,1], speed not in the enum, muted wrong type). Asserts `masterVolume` clamps to `1`, `sfxVolume` clamps to `0`, `defaultSpeed` falls through every ternary branch to the default `0.25` (since `7` matches none of `2`/`1`/`0.5`), and `muted` (wrong type, not `boolean`) falls back to `DEFAULT_SETTINGS.muted` (`false`).
- "survives corrupt JSON": stores the literal string `"{not json"` (invalid JSON) and asserts `loadSettings` returns `DEFAULT_SETTINGS` exactly — exercises the `try/catch` around `JSON.parse` in `loadSettings` that resets `raw = {}` on parse failure rather than throwing.

# Invariants & constraints

- `mockStorage()` only implements `getItem`/`setItem` — `loadSettings`/`saveSettings` never call `removeItem`/`clear`/`length`/`key`, so the `Pick<Storage,...>` narrowing is sufficient; if either function started using more of the `Storage` interface this mock would need extending.
- The "accepts each supported speed" test writes ONLY `{defaultSpeed: speed}` (not a full settings object) — this also implicitly verifies `loadSettings` merges partial objects onto defaults rather than requiring every field present (the other 6 fields fall back to `DEFAULT_SETTINGS` values via each field's own coercion, untested explicitly here but exercised as a side effect).
- `saveSettings` itself swallows storage write errors (e.g. private-mode quota) via its own try/catch — this test does NOT exercise that failure path (no test simulates `setItem` throwing).

# Depends on

- `../src/settings.js` (`loadSettings`, `saveSettings`, `DEFAULT_SETTINGS`, `Settings` type) — the module under test.
- `vitest` (`describe`, `it`, `expect`).

# Used by

Not imported elsewhere — standalone Vitest test file.

# Notes

- The mock's `store: Map<string,string>` field is exposed but unused by any assertion in this file (no test reads `s.store` directly) — present only as a debugging convenience / for potential future tests.
- `SettingsStore` (the pub/sub class wrapping `loadSettings`/`saveSettings` with live `localStorage` and listener notification) is NOT covered by this test file at all — only the two pure functions are tested here.
