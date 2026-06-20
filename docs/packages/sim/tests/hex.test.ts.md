# packages/sim/tests/hex.test.ts

**Path & purpose** — `packages/sim/tests/hex.test.ts`. Unit tests for `hex.ts`'s geometry primitives (`hexDistance`, `hexNeighbors`, `inBounds`) and its A* pathfinder (`hexAstar`), including a randomized seeded fuzz test that validates pathfinding correctness across many random obstacle layouts.

**Responsibility** — Verifies the hex-grid distance metric is correct/symmetric, neighbor enumeration respects board bounds, and `hexAstar` always produces valid paths (adjacent steps, never through blocked cells except an exempted occupied goal, no revisits, terminates correctly for unreachable/trivial cases).

**Key behavior — test helpers**
- `key(c: HexCoord)`: a LOCAL re-implementation of the SAME `r * COLS + q` encoding used internally by both `hex.ts`'s own `hexAstar` and `engine.ts`'s separate local helper — this test file is now the THIRD place this exact formula appears (alongside the two production files), all of which must stay in agreement.

**Key behavior — test by test**
- **`describe("hexDistance")`**: same-cell is `0`; each of the 6 canonical neighbor directions is distance `1` (spot-checks 3 of the 6: `{1,0}`, `{0,1}`, `{-1,1}`); a handful of hand-computed known longer distances (`{0,0}→{3,0}` is 3, `{0,0}→{2,2}` is 4, `{1,2}→{4,5}` is 6); and symmetry (`dist(a,b) === dist(b,a)`) for an arbitrary pair.
- **`describe("hexNeighbors")`**: a corner cell (`{0,0}`) has FEWER than 6 neighbors (confirms off-board directions are filtered out) and every returned neighbor satisfies `inBounds`; a fully-interior cell (`{3,4}`, away from any edge given `COLS=7,ROWS=8`) has EXACTLY 6 neighbors.
- **`describe("hexAstar")`**:
  1. **"returns empty path for same start/goal"**: `hexAstar(p, p, ∅) → []`.
  2. **"finds direct path length 1 to neighbor"**: an adjacent goal with no obstacles returns a single-step path containing exactly that neighbor.
  3. **"finds path around obstacle"**: blocks the direct hex between start and a 2-away goal; asserts a non-empty path is found AND that the blocked cell never appears in it (the path successfully routes AROUND the obstacle).
  4. **"blocked (occupied) goal at range is still pathable up to the goal"**: explicitly tests the documented "occupied-goal exemption" — marks the GOAL cell itself as blocked (simulating an enemy unit standing on it), confirms a path is still found, that the path's LAST step IS the goal (you can path onto an occupied goal), and that NO OTHER step besides the goal itself ever enters a blocked hex (the exemption applies ONLY to the destination, not to any intermediate blocked cell that happens to be on a possible route).
  5. **"fully-walled start returns exactly the empty path"**: blocks an ENTIRE row (`r=1`, every `q` in `0..COLS-1`) which the comment notes "every route from row 0 to rows >= 2 crosses it" — confirms `hexAstar` correctly returns `[]` (not a partial path, not an error, not an infinite loop) when the goal is provably unreachable.
  6. **"path never enters occupied hexes across random seeded boards"** — the file's fuzz test: for 25 different seeds, uses `mulberry32(seed)` (THIS package's own deterministic PRNG, reused here purely as a convenient seeded random-test-data generator, not testing the PRNG itself) to scatter 15 random blocked cells across the full `COLS*ROWS` grid, computes the resulting free-cell list, picks a random `start` and `goal` from the free cells (re-rolling `goal` if it happened to equal `start`), runs `hexAstar`, and for EVERY step in the resulting path asserts: the step is never in `blocked`, the step is EXACTLY hex-distance 1 from the previous position (no skipped/teleporting steps), and the step is in-bounds — finally, if any path was found, asserts its last step IS the goal. This is the single most rigorous correctness check in the file — exercising the pathfinder against many different random topologies rather than a handful of hand-picked scenarios.
  7. **"path does not revisit cells"**: runs a path on an open board and asserts every step's encoded key is UNIQUE (`Set` size equals array length) — confirms the A* implementation never produces a path that loops back through an already-visited cell (which would be both wasteful and a sign of a backtracking bug).

**Invariants & constraints**
- This file is the definitive correctness spec for `hex.ts`'s pathfinding — particularly the OCCUPIED-GOAL EXEMPTION rule (test #4), which is a subtle, easy-to-get-wrong detail (it would be natural to assume ALL blocked cells are strictly impassable, but the actual rule carves out the destination cell as a special case) that a future agent modifying movement/targeting logic should be aware of.
- The fuzz test (#6) reuses the PACKAGE'S OWN `mulberry32` PRNG purely as a deterministic source of "random-looking" test scenarios — this is NOT testing the PRNG itself (that's `prng.test.ts`'s job) and is a common, reasonable pattern: using a known-good seeded RNG to generate reproducible fuzz-test inputs without needing `Math.random()` (which would make a failing fuzz case non-reproducible across runs) — fitting this package's broader "no Math.random" ethos even in its OWN test suite.
- 25 seeds × 15 random-obstacle scenarios each gives reasonably broad coverage of obstacle topologies on a board this small (56 cells total), though it's not exhaustive — a future regression in `hexAstar`'s correctness has a good (not guaranteed) chance of being caught here.

**Depends on** — `vitest`; `../src/hex.js` (`hexDistance`, `hexAstar`, `hexNeighbors`, `inBounds`, `COLS`, `ROWS`, `HexCoord` type — the full public surface of `hex.ts`); `../src/prng.js` (`mulberry32`, used only as a fuzz-test data generator).

**Used by** — Run as part of `npm test`; not imported elsewhere.

**Notes** — None beyond what's covered above; this is a clean, focused, self-contained geometry test file with no notable gaps relative to `hex.ts`'s exported surface (every export is exercised by at least one test).
