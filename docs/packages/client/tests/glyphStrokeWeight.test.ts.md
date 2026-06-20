# Path & purpose

`packages/client/tests/glyphStrokeWeight.test.ts` -- unit tests for `theme.ts`'s pure `glyphStrokeWeight(size)` function, which maps a glyph's rendered pixel size to the stroke weight (line thickness) it should be drawn with, confirming the exact four-band piecewise formula and explicitly locking the large-token band's behavior as byte-identical to a prior inline formula it replaced.

# Responsibility

Owns: regression coverage for the legibility-tuning formula shared by `glyphs.ts` and `itemIconDraw.ts` (per CLAUDE.md: "`glyphs.ts`/`itemIconDraw.ts` share one step-based stroke-weight formula... now exported as the pure `glyphStrokeWeight(size)` fn") -- confirming each of the four size bands returns its documented constant/formula, and that the one band deliberately left UNCHANGED from the old pre-refactor formula (`≤20 -> 2`) still produces the exact same value, so no board/combat token visually shifted when the formula was centralized.

# Exports

None (a Vitest test file).

# Key behavior

Five tests against `glyphStrokeWeight` (imported from `theme.ts`), one per behavioral band plus an explicit byte-identical regression check:
- "returns 1.5 for very small chip/rail sizes (<=9)": `glyphStrokeWeight(8)` and `glyphStrokeWeight(9)` both equal `1.5` exactly (`toBe`) -- the smallest band, used for trait-chip/rail-sized glyphs.
- "returns 1.8 for bench/shop token sizes (10-13)": `glyphStrokeWeight(10)` and `glyphStrokeWeight(13)` both equal `1.8` exactly -- confirms both the lower boundary (`10`, just past the previous band's `<=9` cutoff) and the upper boundary (`13`, the last value before the next band) of this range.
- "returns 2 for standard board token sizes (14-20)": `glyphStrokeWeight(14)` and `glyphStrokeWeight(20)` both equal `2` exactly -- again both boundaries of the band.
- "returns proportional weight for large sizes (>20)": `glyphStrokeWeight(21)` is checked with `toBeCloseTo` against `Math.max(2, 21 * 0.1)` (i.e. `2.1`, since `21*0.1=2.1 > 2`) and `glyphStrokeWeight(32)` against `3.2` -- confirming the `>20` band is `size * 0.1` (floored at a minimum of `2`, though for any input `>20` the `*0.1` term already exceeds `2` so the floor is never actually the binding constraint in this band).
- "large-token band is byte-identical to the old formula for size 16 (board token)": `glyphStrokeWeight(16)` equals exactly `2`, with an inline comment explicitly stating "Old: size<=20 -> 2. New: size<=20 -> 2. Must be exactly 2, unchanged." -- this is a deliberate regression guard ensuring the formula's CENTRALIZATION (extracting it from inline duplicated code in `glyphs.ts`/`itemIconDraw.ts` into one shared `theme.ts` export) did not also change this specific band's numeric output, which would have visually thickened/thinned every board and combat token's glyph stroke as an unintended side effect.

# Invariants & constraints

- Per `theme.ts`'s own doc comment (visible above the function): the OLD inline formula was `<=9 -> 1.2, <=13 -> 1.5, <=20 -> 2, else proportional`; the NEW centralized formula is `<=9 -> 1.5, <=13 -> 1.8, <=20 -> 2, else proportional` -- ONLY the two SMALL bands were intentionally made heavier (boosting ink density at small chip/rail/bench sizes, particularly for 2x-DPR legibility per CLAUDE.md's polish-pass notes); the large-token band (`<=20 -> 2`) and the proportional band (`>20`) were intentionally left mathematically identical. This test file is the enforcement mechanism for that "only the small bands changed" intent -- a reader changing this formula must preserve the `<=20 -> 2` exact-2 output unless deliberately also intending to re-thicken every existing board/combat/shop token glyph.
- The four bands are mutually exclusive and exhaustive over all positive sizes (`<=9`, `10-13`, `14-20`, `>20`) -- there is no gap or undefined region; a maintainer adding a NEW band must insert it without disturbing the existing boundary values these tests pin (`9`, `10`, `13`, `14`, `20`, `21`).
- The proportional `>20` band's `Math.max(2, size*0.1)` floor of `2` is logically present but never exercised as the BINDING term within this test's covered range, since `size*0.1` only equals `2` at exactly `size=20` (already covered by the previous band) and exceeds `2` for any `size>20` -- a reader should not assume this test proves the floor clause is reachable/necessary; it may exist defensively rather than for any input this formula is actually called with in practice.

# Depends on

- `vitest` (`describe`, `it`, `expect`, `toBe`, `toBeCloseTo`).
- `../src/theme.js` (`glyphStrokeWeight`).

# Used by

Not imported by any other file (a leaf test file); run as part of the client package's `npm test`/vitest suite. Indirectly validates a formula consumed by `glyphs.ts`'s `drawGlyph` and `itemIconDraw.ts`'s `drawEmblem`, both of which call `glyphStrokeWeight(size)` to pick stroke thickness when rendering procedural vector glyphs/emblems at various on-screen sizes (chip, bench, board, shop, inspect-panel).

# Notes

- This is a small, single-purpose test file (30 lines) but it directly enforces a "no unintended visual regression during a refactor" guarantee called out explicitly in both the source comment and this test's own inline comment -- a useful pattern for any future centralization of previously-duplicated inline formulas: pin the unchanged band(s) with an explicit byte-identical assertion, not just coverage of the new/changed bands.
- The five test names group naturally by stable "who uses this size" semantic labels (chip/rail, bench/shop token, board token) rather than purely numeric ranges, mirroring how `theme.ts`'s own doc comment describes the bands' purpose -- useful context for anyone trying to map a SPECIFIC on-screen element to which stroke-weight band it falls into.
