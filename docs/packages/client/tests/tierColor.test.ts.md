# Path & purpose

`packages/client/tests/tierColor.test.ts` — unit tests for `tierColor()` and the `C.tier1..tier5` palette constants (`packages/client/src/theme.ts`), pinning both the mapping function's correctness and the exact hex values of the stage-1 tier palette as a regression guard.

# Responsibility

Locks the tier→color mapping used everywhere a unit's cost tier needs a visual color (token rings, shop card accent bars, etc.): tiers 1-5 map to 5 specific hex colors, and any tier value outside [1,5] clamps to tier 1's color rather than returning `undefined`/throwing.

# Exports

None — Vitest test file.

# Key behavior

- "maps tiers 1-5 to the stage-1 palette": `tierColor(1)` through `tierColor(5)` each equal `C.tier1` through `C.tier5` respectively — confirms the function indexes the right constant for each valid tier.
- "locks the stage-1 tier hex values": hardcodes and asserts the literal hex values — `C.tier1 = 0x8b93a6` (grey), `C.tier2 = 0x5dcaa5` (teal/green), `C.tier3 = 0x378add` (blue), `C.tier4 = 0x9b87f5` (purple), `C.tier5 = 0xf0a830` (gold/orange) — a byte-for-byte regression guard so an accidental palette edit in `theme.ts` is caught immediately, separate from the mapping-correctness test above.
- "clamps out-of-range tiers to tier 1": `tierColor(0)` and `tierColor(6)` (both outside the valid 1-5 range) return `C.tier1` — confirms the `?? C.tier1` fallback in the source's `([C.tier1,...,C.tier5] as const)[tier - 1] ?? C.tier1` indexing expression (an out-of-bounds array index yields `undefined`, caught by `??`).

# Invariants & constraints

- The hex-value test is intentionally brittle by design (a "locks the values" regression guard) — ANY deliberate palette change to tier colors in `theme.ts` requires updating this test in lockstep, which is the point (forces a conscious decision, not an accidental drift).
- `tierColor(6)` clamps to tier 1 (not tier 5, not throwing) — note this is a CLAMP-TO-FIRST behavior, not clamp-to-nearest-valid or clamp-to-last; a tier of 6 (which doesn't exist in `units.json`'s tier 1-5 range per CLAUDE.md) silently displays as if it were tier 1, which could mask a data bug if it ever occurred (current `units.json` only has tiers 1-5, so this path is purely defensive).

# Depends on

- `../src/theme.js` (`C`, `tierColor`) — the palette object and mapping function under test.
- `vitest` (`describe`, `it`, `expect`).

# Used by

Not imported elsewhere — standalone Vitest test file.

# Notes

- This is one of several small, single-purpose theme-constant regression tests in the test suite (alongside `metaTheme.test.ts` for rank colors) — each pins one slice of the `theme.ts` palette rather than one monolithic theme test covering everything.
