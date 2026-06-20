# Path & purpose

`packages/client/src/boardProjection.ts` -- renderer-only perspective-projection math: the single source of truth for warping the flat hex board into a tilted on-screen trapezoid and back, via an exact projective homography pair.

# Responsibility

Owns the entire "tilted board" visual effect's geometry: builds a 3x3 homography matrix mapping a flat board-space rectangle onto a perspective trapezoid (near/bottom edge wide, far/top edge narrowed), and its exact inverse for hit-testing screen taps back to board coordinates. The sim/rules/protocol packages stay in flat hex-grid coordinates and never see this module -- it is purely a client-side visual transform layered on top of `hexToPixel`'s existing flat mapping.

# Exports

- `interface Pt { x: number; y: number }` -- a 2D point.
- `interface Rect { x: number; y: number; w: number; h: number }` -- a design-space rectangle.
- `interface BoardProjection` -- the built projection object:
  - `readonly rect: Rect` -- the source board-space rect this projection was built from.
  - `readonly tilt: number` -- the effective (clamped 0..0.9) tilt amount actually used.
  - `readonly corners: { tl: Pt; tr: Pt; br: Pt; bl: Pt }` -- the projected screen corners of `rect` (the rendered trapezoid's four corners, in board-space corner order TL/TR/BR/BL).
  - `forward(p: Pt): Pt` -- maps a board-space point to its on-screen (tilted) point.
  - `inverse(p: Pt): Pt | null` -- maps a screen point back to board-space; returns `null` if the recovered point falls outside `rect` (plus a forgiving ~2px-or-2%-of-width margin) -- i.e. the tap was off the board.
  - `inverseRaw(p: Pt): Pt` -- same inverse mapping but WITHOUT the off-board bounds check, always returns a point; documented use case: surfaces sharing the board's exact ground plane beyond its rect (e.g. a front bench platform butted against the board's near edge) so they warp identically to the board.
  - `scaleAt(p: Pt): number` -- the local horizontal magnification (depth scale) at a board-space point: ~1 at the near/bottom edge, shrinking toward the far/top edge; computed by forward-projecting `p` and a point epsilon to its right and measuring the resulting on-screen delta. Used so entities (unit tokens) visually scale down with apparent distance, matching the ground perspective exactly (not an approximation).
- `function makeBoardProjection(rect: Rect, tilt: number = BOARD_TILT, dst: Rect = rect): BoardProjection` -- the builder. `rect` is the board-space source rectangle (today's flat `hexToPixel` output range). `tilt` (default the themed `BOARD_TILT` constant) controls how much the far edge narrows, clamped to [0, 0.9]. `dst` is the on-screen destination footprint the board renders into; defaults to `rect` itself (in which case `tilt=0` is byte-identical to a flat, untilted board -- the identity case). When `dst` differs from `rect`, the homography ALSO rescales/reshapes the board-space grid onto a wider/shallower on-screen footprint (e.g. a near-square grid laid out as a wide, shallow perspective floor) -- forward/inverse remain an exact pair regardless.

# Key behavior

- Internally builds two unit-square-to-quadrilateral homographies via `squareToQuad` (Heckbert's projective mapping algorithm: maps the unit square's 4 corners to 4 arbitrary points, returning the affine form directly when the 4 points form a parallelogram, the full projective form otherwise) -- one for the source rect's 4 corners, one for the destination trapezoid's 4 corners -- then composes `dst-homography * inverse(src-homography)` (via `mul`/`inv`, both straightforward 3x3 matrix operations) to get the final forward matrix `fwdM`. The inverse matrix `invM` is `inv(fwdM)` -- a true matrix inverse, not a re-derivation, which is exactly what guarantees `forward`/`inverse` round-trip any point precisely.
- The destination trapezoid's corners are computed directly from `dst` + `tilt`: bottom edge spans the FULL `dst.w` (near/player edge, unchanged), top edge narrows to `dst.w * (1-tilt)` centered on `dst`'s horizontal center (far/enemy edge narrows symmetrically inward). This produces the documented "near edge wide, far edge narrow" trapezoid, with TRUE perspective foreshortening of rows in between (not just a linear horizontal squeeze) because the underlying transform is a full projective homography, not an affine shear.
- `eps` for `scaleAt`'s numeric derivative is `max(1e-3, rect.w * 1e-4)` -- scaled to the rect size so the finite-difference approximation stays numerically stable across different board sizes.
- `margin` for `inverse`'s off-board tolerance is `max(2, rect.w * 0.02)` -- a forgiving few pixels so edge taps near the board boundary still resolve to a valid board point rather than `null`.

# Invariants & constraints

- **This is the single source of truth for the tilt visual effect** -- per the file header, no other module should re-derive or duplicate this warp. Any code needing to convert between board-space and on-screen-space coordinates for the hex board must go through a `BoardProjection` instance's `forward`/`inverse`/`inverseRaw`/`scaleAt`, never reimplement the math.
- `forward` and `inverse` are mathematically EXACT inverses of each other (same homography, true matrix-inverted) -- any future change to this file must preserve that exactness; approximating one independently of the other would break round-tripping (which hit-testing functionally depends on).
- `tilt=0` with `dst===rect` (the defaults' edge case) is the EXACT identity transform, byte-identical to no projection at all -- this is explicitly relied upon as the "flat board" fallback/baseline case.
- `tilt` is clamped to [0, 0.9] -- 1.0 would collapse the far edge to a single point (degenerate), so 0.9 is the practical ceiling.
- The sim/rules/protocol packages must NEVER import this module or be aware of the tilt transform -- it is purely a rendering concern layered on top of already-flat hex coordinates (`hexToPixel`'s output is what gets fed into `rect`/`forward`, not the other way around).
- `BoardProjection` objects are meant to be cached/rebuilt only when their underlying `rect`/`tilt`/`dst` change (see `scenes/match.ts`'s `projCache` with a `key` string) -- rebuilding the homography on every frame would be wasteful; this file itself doesn't cache, callers must.

# Depends on

`./theme.js` (`BOARD_TILT` -- the themed default tilt constant, value `0.4` per `theme.ts` line 225, the single source of truth for how much the far edge narrows in the standard board presentation).

# Used by

`packages/client/src/scenes/match.ts` (`this.proj` getter lazily builds/caches a `BoardProjection` via `makeBoardProjection(this.gridFrame, BOARD_TILT, dst)`, used for all hex-board rendering positions and pointer hit-testing in the tilted perspective view). `packages/client/src/layout.ts` (referenced, likely for board-region sizing math that accounts for the projected footprint).

# Notes

- The `squareToQuad` algorithm's parallelogram special-case (`Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9`) returns a simpler affine-only matrix (bottom row `[0,0,1]`, no perspective divide needed) -- this triggers whenever the 4 target points happen to form a parallelogram (e.g. the `dst===rect, tilt=0` identity case, or any non-tilted rectangular mapping), giving an exact non-perspective shortcut rather than relying on the projective formula degrading gracefully.
- `apply(m, p)` always performs the homogeneous divide (`x/w`, `y/w`) -- even in the affine case where `w` is always 1, so the function is uniform regardless of which branch `squareToQuad` took.
- Comments in the file are unusually extensive/precise about the exact mathematical guarantees (exact inverse pair, true projective not affine, identity at defaults) -- this reflects that subtle bugs in this kind of homography code (e.g. swapping `fwdM`/`invM`, or using an approximate inverse) would be very hard to detect visually but would silently break hit-testing precision at the board edges.
