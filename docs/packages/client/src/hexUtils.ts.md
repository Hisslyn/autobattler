# Path & purpose

`packages/client/src/hexUtils.ts` -- the client-side hex board geometry primitives: tile sizing constants, slot-index-to-pixel-center conversion, and pointer-to-nearest-slot hit testing for the flat (pre-projection) board layout.

# Responsibility

Owns the canonical mapping between a player board's "flat" logical hex grid (7 columns x 4 rows, row-offset/pointy-top packing) and pixel coordinates in flat board space (BEFORE any perspective/tilt projection is applied), plus the inverse pointer-hit-test. This is the geometric foundation `boardProjection.ts`'s homography is layered on top of for the tilted on-screen presentation.

# Exports

- `const HEX_R = 24` -- the hex's nominal "radius" parameter used for spacing (NOT the true circumradius -- see `HEX_TILE_R`).
- `const HEX_W = HEX_R * 2` -- horizontal spacing between adjacent hex centers in the same row.
- `const HEX_H = Math.round(HEX_R * 1.732)` -- vertical spacing between rows (`1.732` ~ `sqrt(3)`).
- `const BOARD_COLS = 7` -- fixed board width in hex columns.
- `const BOARD_ROWS = 4` -- fixed board height in hex rows (one player's half of the full 7x8 sim board, per `CLAUDE.md`'s "hex board (player 4 rows + opponent 4 rows)").
- `const BOARD_SLOTS = BOARD_COLS * BOARD_ROWS` -- total slots in one player's half (28).
- `const HEX_TILE_R = Math.sqrt(HEX_R*HEX_R + HEX_H*HEX_H) / Math.sqrt(3)` -- the ACTUAL circumradius (center-to-vertex) of the regular pointy-top hexagon that tessellates this offset lattice with zero gaps; documented at length inline (see Key behavior).
- `function hexToPixel(q: number, r: number, offsetX: number, offsetY: number, scale = 1): {x, y}` -- converts a `(q, r)` board coordinate (column, row) to a flat pixel center: `x = offsetX + (q*HEX_W + (r%2)*HEX_R) * scale`, `y = offsetY + r*HEX_H * scale`. The `(r%2)*HEX_R` term is the classic odd-row horizontal offset that produces the row-offset hex packing. `scale` uniformly shrinks/grows the whole grid's spacing about the `(offsetX, offsetY)` origin -- used by landscape layout to fit the fixed 7x4 grid into its board region; portrait always passes `scale=1` (preserving the exact original, pre-scale-support pixel mapping byte-for-byte).
- `function hexFromPointer(px: number, py: number, offsetX: number, offsetY: number, scale = 1): number` -- inverse hit test: scans all `BOARD_ROWS * BOARD_COLS` slots, computes squared distance from `(px,py)` to each slot's pixel center (via `hexToPixel`), and returns the slot index (`r * BOARD_COLS + q`) of the nearest one -- but ONLY if that nearest distance is within `(HEX_R * scale)` (returns `-1`, "no slot", if the pointer is farther than that threshold from every hex center). `scale` MUST match whatever was passed to the corresponding `hexToPixel` calls, or the hit-test threshold and the actual rendered tile positions will disagree.

# Key behavior

- The lattice produced by `hexToPixel` is a row-offset ("brick-like") arrangement: each row's columns are spaced `HEX_W` apart, and odd rows are shifted right by `HEX_R` relative to even rows, with rows spaced `HEX_H` apart vertically -- the classic 2D approximation of a hex grid using only x/y offsets (no true axial/cube hex coordinates here; this is intentionally a SEPARATE, simpler coordinate system from `packages/sim/src/hex.ts`'s `HexCoord`/axial system used in actual gameplay logic).
- `HEX_TILE_R`'s derivation is the file's most subtle piece of math, explained in its own lengthy doc comment: nearest neighbors in this lattice are `HEX_W` apart within a row and `sqrt(HEX_R^2 + HEX_H^2)` apart diagonally; sizing the DRAWN hexagon's circumradius to (this diagonal distance / sqrt(3)) makes a regular hexagon's slanted edges meet exactly at the diagonal spacing while its vertical edges overlap "by a sub-pixel hair" -- the net result is the hex field tiles with ZERO gaps when each hex is drawn as a regular polygon of radius `HEX_TILE_R` centered at each `hexToPixel` position. The comment explicitly notes this is drawn "in flat board space, then projected" -- the homography (in `boardProjection.ts`) is applied AFTER this flat tiling is computed, and "preserves shared edges" (an affine/projective transform maps shared edges to shared edges, so the zero-gap property survives the tilt).
- `hexFromPointer` is a brute-force O(rows*cols) = O(28) nearest-center scan per call -- not spatially indexed, but cheap enough at this board size to run on every pointer move/tap.

# Invariants & constraints

- **`scale` must be passed identically to both `hexToPixel` (for rendering) and `hexFromPointer` (for hit-testing)** for a given board instance -- a mismatch would cause the hit-test threshold/positions to diverge from the actually-rendered tile positions, producing wrong-slot taps. This is an implicit caller contract, not enforced by the types.
- **Portrait layout must always pass `scale=1`** -- explicitly called out in the `hexToPixel` doc comment ("portrait keeps scale=1 (byte-identical to the original mapping)") as a deliberate backward-compatibility guarantee: portrait's pixel math must never change from before scale support was added.
- This file operates entirely in FLAT board space -- it has no knowledge of the tilted/projective on-screen presentation (`boardProjection.ts`'s homography). Any caller wanting the actual on-screen tilted position must compose `hexToPixel`'s output through `BoardProjection.forward`/`inverse` separately; this file's outputs are an intermediate coordinate space, not final screen pixels (in landscape mode at least -- the relationship to whether portrait applies any projection at all would need checking against `scenes/match.ts`).
- `hexFromPointer` returns `-1` (not `null`/`undefined`) to signal "no slot hit" -- callers must check for the sentinel `-1`, not falsy/nullish.
- The `(q, r)` coordinate system here (simple column/row with odd-row offset) is DELIBERATELY DISTINCT from the sim's `HexCoord` axial system in `packages/sim/src/hex.ts` -- a reader must not conflate the two; this file is purely a client-side rendering-coordinate helper, with no claim to match the sim's hex distance/neighbor/pathing math. Any code translating between a `UnitInstance.hex` (sim axial coord) and this file's `(q,r)` pixel grid needs an explicit, separate mapping (likely handled in `scenes/match.ts` or wherever boards are rendered).

# Depends on

Nothing -- zero imports, pure constants and arithmetic.

# Used by

`packages/client/src/scenes/match.ts` (the planning-phase board rendering and tap/drag hit-testing for unit placement) and likely `packages/client/src/boardProjection.ts`'s callers (composing flat hex positions through the projective transform for the tilted landscape board). Possibly also consumed by `packages/client/src/combat/view.ts`'s `toPixel` callback construction (the `HexToPixel` function type there) if the combat view's coordinate mapping is built from this file's `hexToPixel`.

# Notes

- `HEX_H`'s `Math.round(...)` means row spacing is an INTEGER pixel value (rounds `24 * 1.732 = 41.568` to `42`) while `HEX_W` (`48`) and `HEX_TILE_R` are NOT rounded -- a deliberate or incidental precision choice; if sub-pixel seams ever appear in the rendered hex grid, this asymmetric rounding (`HEX_H` integer, others float) would be a place to check first, given how carefully the zero-gap tiling math in `HEX_TILE_R`'s derivation is otherwise reasoned through.
- The 7x4 = 28-slot board size matches exactly one player's half of the sim's full 7x8 grid (`packages/sim/src/hex.ts`'s "axial hex grid 7x8" per `CLAUDE.md`) -- this file only ever renders one half at a time per call (the caller positions the opponent's half with a separate `offsetY`/flip, as referenced by `combat/player.ts`'s `toDisplayHex` row-flip logic).
