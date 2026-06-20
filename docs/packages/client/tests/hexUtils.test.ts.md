# Path & purpose

`packages/client/tests/hexUtils.test.ts` -- unit tests for `hexUtils.ts`'s `hexFromPointer` (pointer position -> nearest board slot index, or `-1` if too far from any hex), exercising it round-trip through `hexToPixel` (slot -> pixel center) using an arbitrary fixed board offset.

# Responsibility

Owns: regression coverage that the client's pointer-to-board-slot hit-testing (used for tap/drag interactions on the player's own 4-row hex board) correctly identifies the exact slot under an exact-center tap, snaps to the nearest slot for a near-center tap, and correctly rejects (`-1`) pointer positions too far from any hex center -- both far-above-the-board and far-to-the-side cases.

# Exports

None (a Vitest test file). Defines `OX=27`/`OY=265` as arbitrary fixed board-offset constants used throughout (explicitly commented as "arbitrary offsetX"/"arbitrary offsetY" -- the specific numbers carry no special meaning beyond being nonzero/non-trivial).

# Key behavior

Four tests, all driving `hexFromPointer` at `scale=1` (the default, omitted in every call):
- "returns correct slot when pointer is exactly on hex center": a full double loop over every row `r` in `[0,4)` and column `q` in `[0,BOARD_COLS)` (i.e. all 28 slots of the 7x4 player board) -- for each slot, computes its exact pixel center via `hexToPixel(q,r,OX,OY)`, feeds that exact point back into `hexFromPointer`, and confirms the returned slot index equals `r*BOARD_COLS+q` (the same row-major index `hexToPixel`/`hexFromPointer` both use internally). This is an EXHAUSTIVE round-trip check over the entire board, not a spot sample.
- "returns -1 when pointer is far from any hex": a point `HEX_R*10` pixels directly above the origin hex's row -- confirms `hexFromPointer` returns `-1` (no slot matches) when the pointer is far outside the board's vertical extent.
- "returns nearest hex for pointer slightly off-center": computes the exact center of slot `(q=3,r=2)`, then offsets the test pointer by `(+4,-3)` pixels off that exact center -- confirms `hexFromPointer` still resolves to that same slot (`2*BOARD_COLS+3`), proving the function tolerates small offsets within its acceptance radius rather than requiring pixel-perfect center hits.
- "returns -1 when pointer is equidistant between hexes and outside threshold": a point far to the LEFT of the board (`x=-200`) at the board's own `OY` row -- confirms `-1` is returned, covering the horizontal-rejection case (complementing the first rejection test's vertical case).

# Invariants & constraints

- `hexFromPointer`'s acceptance radius is `HEX_R*scale` (squared internally for comparison, avoiding a sqrt) -- a pointer further than `HEX_R` pixels (at `scale=1`, i.e. `24`px per `hexUtils.ts`'s `HEX_R` constant) from EVERY hex center returns `-1`; this test's "slightly off-center" case (`±4,∓3` px, distance `5`px) is well within that `24`px radius, while both `-1` cases are constructed to be far outside it.
- The function does a brute-force linear scan over all `BOARD_ROWS*BOARD_COLS` (28) hex centers per call, tracking the single closest one within the squared-threshold -- there is no spatial-partitioning optimization, which is fine at this board size but would not scale to a much larger grid without revisiting the algorithm.
- This test only exercises the DEFAULT `scale=1` parameter -- `hexFromPointer`'s `scale` parameter (used by the landscape layout, which scales the fixed 7x4 grid to fit its board region per `hexUtils.ts`'s own doc comment on `hexToPixel`) is NOT covered by this test file; a reader verifying landscape-mode hit-testing correctness at non-1 scale values would need to either add coverage here or find it tested elsewhere.
- `hexToPixel`'s row-offset lattice (`(r%2)*HEX_R` x-shift on odd rows) means hex centers are NOT on a simple rectangular grid -- the exhaustive round-trip test implicitly verifies this offset is correctly mirrored between `hexToPixel` (encode) and `hexFromPointer` (decode), since any mismatch between the two would break the round-trip for at least the odd rows.

# Depends on

- `vitest` (`describe`, `it`, `expect`).
- `../src/hexUtils.js` (`hexFromPointer`, `hexToPixel`, `HEX_R`, `BOARD_COLS`).

# Used by

Not imported by any other file (a leaf test file); run as part of the client package's `npm test`/vitest suite. Indirectly validates the hit-testing function consumed by `scenes/match.ts`'s board pointer-interaction code (tap-to-select, tap-to-move, drag-and-drop unit placement onto the player's own board hexes).

# Notes

- This file does not test `hexToPixel` independently with its own assertions -- it's used purely as the INVERSE-direction helper to generate exact input points for `hexFromPointer`'s tests, so its own correctness is only verified implicitly (via the round-trip succeeding) rather than via a direct expected-pixel-value assertion. A reader wanting to confirm `hexToPixel`'s exact output values directly (e.g. for a non-round-trip purpose) would not find that here.
- The file is named `hexUtils.test.ts` but only covers `hexFromPointer` (with `hexToPixel`/`HEX_R`/`BOARD_COLS` as supporting imports) -- it does NOT cover `HEX_TILE_R` (the circumradius constant documented at length in `hexUtils.ts` for hex-tessellation/projection purposes) or `HEX_W`/`HEX_H`/`BOARD_ROWS`/`BOARD_SLOTS`, which have no dedicated test coverage in this file.
