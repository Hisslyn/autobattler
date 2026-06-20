# Path & purpose

`packages/client/tests/statFormat.test.ts` — unit tests for `formatStat`/`formatStatDelta` (`packages/client/src/statFormat.ts`), covering the attack-speed fixed-point ÷1000 conversion, raw-integer passthrough for every other stat key, unknown-key fallback, and signed-delta formatting.

# Responsibility

Pins the single-source stat-display contract: `as` (attack speed) is the ONLY stat key requiring the fixed-point scale-1000 conversion to a 2-decimal string; every other known key (and any unrecognized key) displays as its raw stored integer.

# Exports

None — Vitest test file.

# Key behavior

`describe("formatStat")`:
- "shows attack speed as fixed-point ÷1000 to 2 decimals": `formatStat("as", 750)` → `"0.75"`, `formatStat("as", 1100)` → `"1.10"`, `formatStat("as", 600)` → `"0.60"` — confirms the division by `SCALE=1000` and `.toFixed(2)` formatting, including the trailing-zero case (`1.10`, `0.60` not `1.1`/`0.6`).
- "shows hp/ad/armor/mr/range/mana/abilityDamage as raw integers": one assertion per of the 7 non-`as` `StatKey` values, each just stringifies the input value unchanged (`formatStat("hp", 700)` → `"700"`, etc.) — covers every member of the `StatKey` union except `"as"`.
- "passes unknown stats through as their raw value": `formatStat("mystery", 42)` → `"42"` — proves the function accepts any string (the `StatKey | string` signature) and falls through to the raw-integer branch for anything not literally `"as"`.

`describe("formatStatDelta")`:
- "signs attack-speed deltas as fixed-point": `formatStatDelta("as", 280)` → `"+0.28"`, `formatStatDelta("as", 120)` → `"+0.12"`, `formatStatDelta("as", -280)` → `"-0.28"` — confirms sign is prepended separately from the magnitude's fixed-point conversion (`Math.abs` before dividing, so the sign character and the `0.XX` digits are correct together).
- "signs raw-integer deltas": `formatStatDelta("ad", 25)` → `"+25"`, `formatStatDelta("armor", 800)` → `"+800"`, `formatStatDelta("hp", -100)` → `"-100"` — confirms the non-`as` branch also signs correctly (positive gets explicit `+`, unlike plain `formatStat` which never signs).

# Invariants & constraints

- Does not test `value = 0` for either function (no assertion for a zero delta, which would format as `"+0"` per the `value < 0 ? "-" : "+"` ternary — zero is not negative, so it takes the `+` branch). Not a gap exploited by current callers per the source comments, but worth knowing if a caller ever passes a zero buff/breakpoint delta and expects different formatting.
- The `SCALE = 1000` constant is duplicated here only implicitly (the test hardcodes expected ratios like `750→0.75`) — it does not import or assert against `packages/sim/src/fixed.ts`'s scale constant, relying instead on the comment-documented invariant that they must match.

# Depends on

- `../src/statFormat.js` (`formatStat`, `formatStatDelta`) — the two pure functions under test.
- `vitest` (`describe`, `it`, `expect`).

# Used by

Not imported elsewhere — standalone Vitest test file.

# Notes

- `statFormat.ts`'s `StatKey` type is exported from the source but not imported/used directly in this test file — all calls pass string literals, relying on TypeScript's literal-string widening against the `StatKey | string` parameter type (so a typo'd stat key like `"mystery"` is intentionally allowed by the signature, exercised by the "unknown stats" test).
