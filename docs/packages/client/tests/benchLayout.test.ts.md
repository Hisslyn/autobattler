# Path & purpose

`packages/client/tests/benchLayout.test.ts` -- unit tests for `benchLayout.ts`'s three pure geometry functions: `benchGeom` (landscape/full-design-width bench+sell-control layout), `portraitBenchGeom` (region-based bench layout for portrait), and `benchSlotAtX` (pointer-x to slot-index hit test).

# Responsibility

Owns: regression coverage proving the bench rail's geometry math produces correctly-fitted, correctly-sized, and correctly-centered slot/sell-control rectangles, and that the pointer-to-slot hit test correctly maps positions to slot indices (including out-of-band and edge-clamping behavior).

# Exports

None (a Vitest test file).

# Key behavior

**`benchGeom` suite** (constants `W=390` design width, `Y=532` bench center, matching the historical landscape hardcoded position per CLAUDE.md's note that the portrait height-driven layout "restores the prior hardcoded positions exactly at the design height (844)"):
- "fits 9 slots + the sell control within the design width with margins": computes the rail's right edge (`startCx - slotW/2 + 9*slotW`) and confirms (a) the left margin is exactly `8` (matching `benchGeom`'s hardcoded `margin=8`), (b) the rail's right edge sits exactly `6px` before `sellX` (the hardcoded `gap=6`), and (c) the sell control's right edge (`sellX + sellW`) sits exactly `8px` from the design width's right edge -- i.e. the WHOLE row (9 slots + gap + sell control) is laid out symmetrically within `8px` margins on both sides.
- "gives a larger touch target than the old 32x32 slot": confirms `slotW * slotH > 32*32` (the historical/previous bench slot size, referenced as a comparison baseline in a comment, not via any live constant) and `slotH >= 34` (the default `regionH` value) -- this test's comment is effectively a regression note documenting a PAST UX improvement ("comfortable thumb targets" per the source's own doc comment) and guards against ever shrinking back below it.
- "centers the row on benchY": confirms `top + slotH/2 === Y` exactly -- the geometry's vertical center matches the input `benchY` parameter precisely.
- "benchGeom with regionH=36 returns slotH=36": confirms the optional third `regionH` parameter (default `34`) flows straight through to `slotH` -- this is the parameter CLAUDE.md references as letting "portrait slot height track the bench region (now 36px)".

**`portraitBenchGeom` suite** (fixed `bench: Rect = {x:8, y:524, w:312, h:36}`):
- "slotW is one-ninth of the bench width": `slotW === bench.w/9` exactly.
- "startCx is the center of slot 0 within the bench bounds": confirms `startCx` is between `bench.x` and `bench.x+bench.w` inclusive, and precisely equals `bench.x + slotW/2`.
- "slot 8 center stays within the bench right edge": confirms `startCx + 8*slotW <= bench.x + bench.w` -- the LAST slot's center (not just its right edge) must not exceed the bench region's right boundary, a slightly stronger constraint than just "fits" since slot 8 still has half its width extending further right beyond its center.
- "slotH and centerY track the region": `slotH === bench.h` exactly (no padding/margin subtracted -- the region's full height IS the slot height) and `centerY === bench.y + bench.h/2`.

**`benchSlotAtX` suite** (built on a real `benchGeom(W,Y)` instance `g`):
- "maps each slot center to its index": for all `i` in `0..8`, `benchSlotAtX(g.startCx + i*g.slotW, g) === i` -- confirms the function correctly inverts the slot-index-to-x-center formula for every slot, not just the first/last.
- "returns null outside the 9-slot band": confirms a point one full slot-width to the LEFT of slot 0's center, and a point 2px past the END of slot 8's band, both return `null` (not clamped to 0/8 -- genuinely out of range returns no match).
- "clamps the edges to valid indices": confirms a point exactly at slot 0's LEFT EDGE (plus a tiny `0.1` epsilon to dodge floating-point boundary ambiguity) returns `0`, and a point just inside slot 8's RIGHT EDGE (minus `0.1`) returns `8` -- i.e. points strictly WITHIN the 9-slot band (even at the very edges) always resolve cleanly to a valid index without off-by-one errors, while the previous test confirms points genuinely outside the band return `null`.

# Invariants & constraints

- The `8/8/6` margin/gap numbers (left margin, right margin, slot-to-sell gap) in the first `benchGeom` test are NOT named constants imported from the source -- they're hardcoded expected values in the test that must be kept in sync manually if `benchLayout.ts`'s internal `margin`/`gap` constants are ever changed; a reader changing those constants in the source MUST update this test's expected values too, or it will fail (correctly, since the layout contract changed) but with no obvious indication that the change was deliberate vs. a regression.
- `benchSlotAtX`'s null-vs-clamp behavior is intentionally asymmetric to the eye but precise in practice: it does NOT clamp out-of-range pointer positions to the nearest valid slot (a position far to the left or right returns `null`, signaling "not over the bench at all" -- appropriate for drag-and-drop logic deciding whether a drop target is even valid) but DOES resolve any position strictly within the 9-slot band's bounds to a valid index even at sub-pixel edges (via `Math.max(0, Math.min(8, ...))` internally, confirmed indirectly by the edge tests here).
- The `0.1` epsilon used in the "clamps the edges" test is a deliberate float-precision safety margin, not part of the geometry contract itself -- a maintainer should not read this as "there's a 0.1px dead zone at slot edges" in the actual implementation; it's purely a test-authoring technique to avoid asserting exactly AT a floating-point boundary value.

# Depends on

- `vitest` (`describe`, `it`, `expect`, `toBeCloseTo`).
- `../src/benchLayout.js` (`benchGeom`, `benchSlotAtX`, `portraitBenchGeom`, `Rect` type).

# Used by

Not imported by any other file (a leaf test file); run as part of the client package's `npm test`/vitest suite.

# Notes

- This test file complements (but does not replace) visual verification of the bench -- it proves the MATH is internally consistent (margins, gaps, centering, hit-test inversion) but says nothing about whether `390`/`532`/`8`/`34` are the RIGHT values for a good-looking/comfortable UI; that judgment lives in the source comments and the broader layout system's design intent (`layout.ts`/`PORTRAIT_LAYOUT_SPEC.md`).
- The "gives a larger touch target than the old 32x32 slot" test is a rare example in this codebase of a test whose primary purpose is historical/regression ("don't backslide on a past UX fix") rather than verifying a property newly introduced by the function itself -- worth knowing if investigating why `32*32` appears as a magic number with no corresponding named constant in the source.
