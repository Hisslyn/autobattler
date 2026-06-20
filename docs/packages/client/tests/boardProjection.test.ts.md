# Path & purpose

`packages/client/tests/boardProjection.test.ts` -- unit tests for `boardProjection.ts`'s `makeBoardProjection(rect, tilt?, dst?)`: the projective homography that warps the flat hex board's design-space rectangle into a tilted on-screen trapezoid (and back). Verifies the identity case (tilt=0), exact forward/inverse invertibility, the trapezoid's true-perspective shape (narrowing far edge + foreshortened rows), depth-scale behavior, the separate source-vs-destination footprint case, and off-board inverse-null handling.

# Responsibility

Owns: regression coverage proving the single homography-based projection math that the ENTIRE tilted-board renderer depends on (hex placement, unit token positions/scale, drag hit-testing) is mathematically correct -- exact invertibility, identity-at-zero-tilt, and the specific perspective shape (trapezoid narrowing toward the far/enemy edge, rows compressing toward the far edge, near-edge entities rendering larger than far-edge ones).

# Exports

None (a Vitest test file).

# Key behavior

A shared `near(a, b, tol=1e-6)` helper compares two points via `toBeCloseTo` (4 decimal places) on both x and y (note: the `tol` parameter is accepted but never actually used in the comparison -- `toBeCloseTo` uses its own fixed precision of `4`, not `tol`; the unused `void tol;` line suppresses the unused-parameter lint warning -- this is a minor latent inconsistency in the test helper, see Notes).

**"tilt = 0 is the identity"** (`makeBoardProjection(RECT, 0)`): confirms `forward(pt)` returns the SAME point for several sample points (board-space coordinates pass through unchanged when there's no tilt), `inverse(pt)` likewise returns the same point for an interior point, and `scaleAt(pt)` returns exactly `1` everywhere (no depth scaling at all when flat) -- this is the foundational case proving the whole system collapses to a no-op flat board when `tilt=0`, matching the source's own doc comment ("BOARD_TILT = 0 is the identity, byte-identical to a flat board").

**"forward/inverse are exact inverses"** (`tilt=0.22`): round-trips a full 7×7 grid of board-space sample points (`gx,gy` from 0 to 6, spanning `RECT`) through `forward` then `inverse`, confirming each recovers the original point closely -- a strong invertibility check across the WHOLE rect, not just a couple of spot points. Also round-trips the reverse direction (a screen-space midpoint of the projected trapezoid's corners) through `inverse` then `forward`.

**"true trapezoid (near wide, far narrow)"** (`tilt=0.22`): four checks on the SHAPE.
1. The near (bottom) edge's corners (`bl.x`, `br.x`) land exactly at `RECT`'s original left/right edges -- the near edge is NEVER narrowed, full width.
2. The far (top) edge's width (`tr.x - tl.x`) is strictly LESS than the near edge's width, and specifically equals `RECT.w * (1 - 0.22)` (i.e. the far edge narrows to exactly `(1-tilt)` of the near width) -- confirming `makeBoardProjection`'s `k = 1-t` "top-edge half-width factor" comment. Also confirms the far edge stays horizontally CENTERED on the same x-center as the near edge (no asymmetric skew).
3. A horizontal segment near the FAR edge maps to a NARROWER on-screen segment than the geometrically identical segment near the NEAR edge -- direct confirmation that horizontal compression increases with depth (not just that the overall edges differ in width, but that ANY sub-segment compresses more the farther back it is).
4. Vertical "foreshortening": sampling the vertical center column at the top/middle/bottom of `RECT` and projecting each, the gap between the TOP and MIDDLE projected y-values is smaller than the gap between MIDDLE and BOTTOM -- i.e. equal board-space row-height steps produce SMALLER on-screen steps near the far edge (rows visually bunch up/compress as they recede), the second half of "true projective transform" the source comment promises (not just edges narrowing, but rows compressing too).

**"depth scale"** (`tilt=0.22`): confirms `scaleAt` at the near (bottom) edge center is `> ` the far (top) edge center's scale, the near-edge scale is `≈1` (≤2 decimal precision), and the far-edge scale is `<1` -- entities near the bottom render at roughly their nominal size, entities near the top render visually smaller, matching the perspective metaphor (farther = smaller).

**"source→destination (wide, shallow footprint)"**: tests the THIRD `dst` parameter with a near-square source rect (`384×372`) warped onto a much WIDER, SHORTER destination rect (`960×409`) at `tilt=0.4`. Confirms (1) the destination trapezoid's near edge spans the FULL `dst.w` and the far edge narrows to exactly `dst.w*(1-0.4)` (0.6× the near edge), and the trapezoid's vertical span matches `dst`'s height exactly (top at `dst.y`, bottom at `dst.y+dst.h`); (2) forward/inverse remain EXACT inverses across the full 7×7 SOURCE grid even with this stretched destination (the invertibility guarantee holds regardless of `dst` differing from `rect`, as documented); (3) `scaleAt` at the destination's near edge is `>1` (since `dst.w=960 > src.w=384`, the grid is magnified onto the wider footstep) and the far edge's scale is smaller than the near edge's (same depth-ordering holds even when overall scale is magnification rather than ≈1).

**"off-board inverse is null"** (`tilt=0.22`): confirms `inverse` returns `null` for screen points clearly outside the projected trapezoid (far left, far above, far below), and confirms it returns a NON-null point for the geometric center of the trapezoid's four corners (a guaranteed-interior point) -- proving the off-board bounds check correctly rejects clearly-outside points while accepting clearly-inside ones.

# Invariants & constraints

- This file's tests are the primary correctness guarantee behind the single most foundational rendering-math assumption in the client: that EVERY board-space coordinate (hex centers, drag positions, unit token placements) can be round-tripped through `forward`/`inverse` without drift, for ANY `tilt` in `[0, 0.9]` and ANY `dst` footprint -- a regression in the homography math (e.g. a sign error, wrong corner ordering) would very likely surface as multiple of these round-trip assertions failing simultaneously, which is a strong, fast signal.
- The shared `near()` helper's unused `tol` parameter is dead code (every call passes the default `1e-6` or omits it, and the function ignores it regardless, always using `toBeCloseTo`'s fixed 4-decimal precision) -- a reader should not assume varying the `tol` argument at any call site actually changes the comparison precision; it doesn't.
- The test's specific numeric expectations (e.g. `farW === RECT.w*(1-0.22)`) are tied to `makeBoardProjection`'s specific `k = 1-tilt` "top-edge half-width factor" formula -- if that formula's shape were ever changed (e.g. to a non-linear taper), these exact-value assertions would need to change with it; they are not testing an abstract "narrower is narrower" property alone but the PRECISE narrowing ratio.

# Depends on

- `vitest` (`describe`, `it`, `expect`, `toBeCloseTo`, `toBeNull`/`not.toBeNull`).
- `../src/boardProjection.js` (`makeBoardProjection`, `Pt`/`Rect` types).

# Used by

Not imported by any other file (a leaf test file); run as part of the client package's `npm test`/vitest suite.

# Notes

- This is one of the most mathematically rigorous test files in the client package (round-tripping a 49-point grid through forward/inverse twice, with a second dst-stretched variant) -- appropriate given `boardProjection.ts` explicitly declares itself "the SINGLE source of truth for how the client warps the flat hex board," meaning any silent regression here would visibly misplace every hex/unit/drag-target on the actual board.
- The source file's own comments make clear the sim/rules/protocol layers NEVER see this projection (they stay in flat hex-grid coordinates) -- this test file, by extension, is purely a CLIENT-rendering-layer concern with zero gameplay-logic implications; a bug here cannot affect combat determinism or server-authoritative state, only visual placement on screen.
- The `dst`-stretched test case (`SRC` near-square, `DST` wide-and-shallow) directly mirrors the real use case described in CLAUDE.md's landscape layout notes (a near-square hex grid warped onto a wide board region) -- a reader investigating why the landscape board doesn't look squished/distorted should look here for the underlying math guarantee, and at the call site in `scenes/match.ts`/`hexUtils.ts` for how the real `rect`/`dst` values are chosen.
