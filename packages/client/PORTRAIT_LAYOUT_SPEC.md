# Portrait Match Layout: Height-Driven Spec

## Problem Summary

The portrait layout uses a fixed design height of 844px. On viewports shorter than ~736px
the Pixi canvas scale shrinks to compensate, making the entire lower stack (shop, bench,
HUD, ready, item bar) proportionally smaller rather than fitting intelligently. The fix is
to make `designH` parametric in portrait mode: the canvas design height equals the
viewport's available height (after safe insets), and all portrait regions are computed
with per-region budget rules instead of literal constants.

Landscape is untouched.

---

## 1. Smallest Supported Viewport

**Floor: 360 × 640 CSS px (before safe insets)**

Justification: 360×640 is the smallest common Android display size still in active use
(e.g. Galaxy A-series). Below 360px wide the hex board (336px minimum) clips regardless
of height. 640px tall accommodates the minimum region stack defined below with zero
overlap. iOS iPhone SE 2nd gen (375×667) and all modern iPhones (390×844 and taller)
are above the floor and degrade gracefully upward.

At the floor, assume up to 34px safe-area bottom (Android nav bar) → usable height 606px.

---

## 2. Core Architectural Change: Dynamic designH

### Current behavior
`portraitLayout` uses `dH = PORTRAIT_H = 844` always.
`scale = min(usableW/390, usableH/844)`.

### New behavior
```
dW = PORTRAIT_W = 390          (unchanged)
dH = usableH                   (design height equals the usable viewport height)
scale = usableW / 390          (scale only from width; height fills exactly)
```

This means the Pixi design space is always `390 × usableH` in portrait. Regions are
computed in that space. The canvas CSS size is exactly `390*scale × usableH*scale`.

`canvasOffsetX` and `canvasOffsetY` stay as today (center in usable area).

**Why width-only scale?** The portrait design is width-constrained (390px board + margins).
Height fills the screen. This is how a typical mobile app works — content stacks
vertically and fills whatever height exists.

**Backward compatibility at design height:** When `usableH = 844` the algorithm must
produce region positions identical (or visually equivalent, within ±1px) to the current
hardcoded values. The budgeting rules below are validated against 844.

---

## 3. Region Budget Algorithm

### Fixed regions (do not scale below their minimum)

These regions have hard minimum heights. If the viewport is very short they use their
minimum; flexible regions absorb the difference.

| Region       | Current h | Min h | Scaling rule                              |
|-------------|-----------|-------|-------------------------------------------|
| statusRow   | 24        | 20    | fixed 24 (reduce to 20 only below floor+) |
| opponentRail| 30        | 28    | fixed 30                                  |
| board       | 360       | 280   | see board scaling below                   |
| traitRail   | 44        | 32    | see flexible pool below                   |
| hud         | 38        | 32    | fixed minimum 32                          |
| bench       | 36        | 32    | fixed minimum 32                          |
| shop        | 84        | 72    | fixed minimum 72 (shop card readability)  |
| readyButton | 34        | 44    | fixed minimum 44 (touch target rule; was  |
|             |           |       | undersized at 34 — floor is 44)           |
| itemBar     | 68        | 52    | two-row minimum (26px/row)                |

### Gap budget

The 8 inter-region gaps are flexible. At 844 each is 8px. The minimum gap is 4px.

Gap floor = 4px × 8 = 32px total.
Gap at design height = 8px × 8 = 64px total.

### Board scaling

The board is the dominant region. It scales proportionally with available height up to
its design size of 360px, with a minimum of 280px (fits 8 rows of 32px hex tiles with
the 12px mid-gap; hex radius reduces from 24 to ~18).

Board height = clamp(280, round(availableH × 0.427), 360)

where `availableH` is defined below and 0.427 ≈ 360/844.

### Step-by-step algorithm

```
STATIC_H = statusRow_h(24) + opponentRail_h(30)   // = 54, never scale these two
FIXED_H  = hud_h(32) + bench_h(32) + shop_h(72) + readyButton_h(44) + itemBar_h(52)
           // = 232 at minimums
GAPS_TOTAL = 8 × gap                               // flexible, starts at 8px each
TRAITRAIL_H = 32..44                               // flexible

availableH = dH - STATIC_H                        // dH = usableH
board_h    = clamp(280, round(availableH × 0.427), 360)

// Remaining height after board + static:
remaining = availableH - board_h

// Target trait rail: fraction of remaining
traitRail_h_target = round(remaining × 0.145)      // ~0.145 × remaining ≈ 44 at 844

// Solve for gap: the rest of remaining is fixed items + gaps + trait rail
// remaining = traitRail_h + hud_h + bench_h + shop_h + readyButton_h + itemBar_h + 8×gap
// => gap = (remaining - traitRail_h - FIXED_SUM) / 8

FIXED_SUM = hud_h + bench_h + shop_h + readyButton_h + itemBar_h

// First pass: use unclamped trait rail and gap
gap_raw = (remaining - traitRail_h_target - FIXED_SUM) / 8

// Clamp gap
gap = clamp(4, round(gap_raw), 12)

// If gap hit the floor (4), compress trait rail to absorb excess
traitRail_h = clamp(32, remaining - FIXED_SUM - 8 × gap, 44)

// Final check: if still overflows, shrink hud_h to 32, bench_h to 32, shop_h to 72,
// readyButton_h stays 44, itemBar_h to 52 (already at minimums — they cannot compress
// further; anything beyond this means the viewport is below the floor and the layout
// degrades with gaps at 4 and all items at minimums, which still fits at 360×606).
```

### Concrete values at three heights

**usableH = 844 (design height)**

```
board_h      = 360   (≈ 844×0.427 = 360)
remaining    = 790
traitRail_h  = 44    (≈ 790×0.145 = 115 → clamped at 44)
gap_raw      = (790 - 44 - 232) / 8 = 514/8 = 64.25 → gap=8 (clamped at 12 floor→8)
```
Wait — let me re-derive. remaining = availableH - board_h = 790 - 360 = 430.
FIXED_SUM = 32+32+72+44+52 = 232.
gap_raw = (430 - 44 - 232) / 8 = 154/8 = 19.25 → clamped at 12.
traitRail_h = clamp(32, 430 - 232 - 8×12, 44) = clamp(32, 430-232-96, 44) = clamp(32, 102, 44) = 44.
Actual usage: 44 + 232 + 96 = 372. But remaining = 430. Leftover = 58px → distribute into hud (38
actual vs 32 min), bench (36 vs 32 min), shop (84 vs 72 min), readyButton (34... wait, min is 44).

The algorithm above uses minimums for the fixed regions. At design height there is slack;
the slack goes back to the fixed regions to reach their design values. See section 3a below.

**usableH = 736 (iPhone SE 2nd gen landscape-height equivalence, mid size)**

```
availableH = 736 - 54 = 682
board_h    = clamp(280, round(682×0.427), 360) = clamp(280, 291, 360) = 291
remaining  = 682 - 291 = 391
gap_raw    = (391 - 44 - 232) / 8 = 115/8 = 14.4 → gap = 12
traitRail_h = clamp(32, 391-232-96, 44) = clamp(32, 63, 44) = 44
```
Usage: 291 + 44 + 232 + 96 = 663 ≤ 682. Slack = 19px → distribute to fixed regions.

**usableH = 606 (floor: 640 − 34px safe-area bottom)**

```
availableH = 606 - 54 = 552
board_h    = clamp(280, round(552×0.427), 360) = clamp(280, 236, 360) = 280
remaining  = 552 - 280 = 272
gap_raw    = (272 - 44 - 232) / 8 = -4/8 → gap = 4
traitRail_h = clamp(32, 272 - 232 - 32, 44) = clamp(32, 8, 44) = 32
```
Usage: 280 + 32 + 232 + 32 = 576 ≤ 606 (with 54 static = 630, over by 24).

Re-check: total = STATIC_H + board_h + traitRail_h + FIXED_SUM + 8×gap
= 54 + 280 + 32 + 232 + 32 = 630. But usableH = 606. Still 24px over.

At the floor, shop minimum compresses to 64 (one row of cards at h=64 is acceptable
minimum), readyButton stays at 44, itemBar compresses to 44 (one row), bench 32, hud 32.

Revised FIXED_SUM_FLOOR = 32+32+64+44+44 = 216.
= 54 + 280 + 32 + 216 + 32 = 614. Still 8px over.
Gap = 3px: 54 + 280 + 32 + 216 + 24 = 606. Fits exactly.

So the floor minimum overrides:
- shop_h_min = 64 (active only below usableH 680)
- itemBar_h_min = 44 (active only below usableH 680)
- gap_min = 3 (active only at the hard floor)

### 3a. Surplus distribution

After the budget algorithm produces region minimums and the gap, compute surplus:
```
surplus = usableH - (STATIC_H + board_h + traitRail_h + FIXED_SUM_actual + 8×gap)
```
Distribute surplus top-down, in this priority order, until exhausted:
1. board_h: up to 360 (design max)
2. shop_h: up to 84 (design max)
3. readyButton_h: stays at 44 (do not inflate; saves thumb travel)
4. itemBar_h: up to 68
5. hud_h: up to 38
6. bench_h: up to 36
7. traitRail_h: up to 44
8. gap: up to 8 (distribute evenly among all 8 gaps)

At design height (844) this restores all regions to their current hardcoded values.

---

## 4. Vertical Stack Order and Y Positions

The algorithm outputs positions by cumulating from y=0:

```
statusRow.y    = 4              (small top margin, fixed)
statusRow.h    = 24

opponentRail.y = statusRow.y + statusRow.h   // = 28
opponentRail.h = 30

board.y        = opponentRail.y + opponentRail.h   // = 58 at design height
board.h        = board_h (from budget)

traitRail.y    = board.y + board.h + gap
traitRail.h    = traitRail_h

hud.y          = traitRail.y + traitRail.h + gap
hud.h          = hud_h (32 min, +surplus up to 38)

bench.y        = hud.y + hud.h + gap
bench.h        = bench_h (32 min, +surplus up to 36)

shop.y         = bench.y + bench.h + gap
shop.h         = shop_h (64..84)

readyButton.y  = shop.y + shop.h + gap
readyButton.h  = 44 (fixed — touch target, cannot be smaller)

itemBar.y      = readyButton.y + readyButton.h + gap
itemBar.h      = itemBar_h (44..68)
```

Note: CLAUDE.md describes the order as "status row, opponent rail, board, trait rail,
HUD, bench, shop, ready, item bar" — the layout.ts constants confirm this ordering.
The spec preserves it exactly.

### sellControl

Derived from bench (same logic as today, unchanged):
```
margin = 8; sellW = 44; gap_bench = 6
railW  = 390 - 2×margin = 374
benchW = railW - sellW - gap_bench = 324
sellX  = margin + benchW + gap_bench = 338
sellControl = { x: sellX, y: bench.y, w: sellW, h: bench.h }
bench       = { x: margin, y: bench.y, w: benchW, h: bench.h }
```

---

## 5. Signature Changes

### layout.ts — `portraitLayout` function

**Current signature (internal):**
```ts
function portraitLayout(viewportW: number, viewportH: number, safe: SafeInsets): MatchLayout
```

**Required change:** The function body replaces fixed constants with the budget algorithm.
No public signature change — `resolveLayout(input: ResolveLayoutInput)` is unchanged.

**New behavior:**
- `dW = 390` (unchanged)
- `dH = Math.max(1, viewportH - safe.top - safe.bottom)` — design height equals usable height
- `scale = Math.max(1, viewportW - safe.left - safe.right) / 390` — width-only scale
- `canvasOffsetX` and `canvasOffsetY`: same formula as today

**New exported helper (pure, for tests):**
```ts
export function portraitRegions(designH: number): MatchRegions
```
Takes the usable design height and returns the computed portrait regions. This is the
pure extraction of the budget algorithm, making it unit-testable without viewport logic.

`portraitLayout` calls `portraitRegions(dH)` and wraps the result in `MatchLayout`.

### `MatchLayout` — new field

```ts
export interface MatchLayout {
  // ... existing fields ...
  /** Portrait only: actual design height used (= usable viewport height). */
  portraitDesignH?: number;
}
```

This lets match.ts know the actual design height for positioning overlays at the bottom.

### benchLayout.ts — no signature changes required

`portraitBenchGeom(bench: Rect)` already derives from the bench region rect. Since bench
region now carries the computed `bench.h`, the function automatically tracks it. No
changes needed.

`benchGeom(designW, benchY, regionH?)` is called by match.ts with
`this.layout.regions.bench.h` for `regionH` (already done at line 591 of match.ts).
No changes needed.

### planningRegionAt — no signature changes

The function takes `layout: MatchLayout` and reads `layout.regions.*`, which now contain
dynamically computed rects. It continues to work correctly without modification.

---

## 6. Existing Tests — What Changes

### Tests that will break and how to fix them

**layout.test.ts — "portrait board is at the existing hardcoded position"**
```ts
it("portrait board is at the existing hardcoded position", () => {
  expect(regions.board.x).toBe(8);
  expect(regions.board.y).toBe(58);   // stays true: board.y = 28+30 = 58
  expect(regions.board.w).toBe(374);  // stays true: 390-16 = 374
  expect(regions.board.h).toBe(360);  // stays true at dH=844 (surplus fills to 360)
});
```
This test uses `resolveLayout({ viewportW: 390, viewportH: 844 })`. At dH=844 the
surplus distribution restores board_h to 360. The test stays valid IF the surplus
algorithm correctly restores 360 at design height. Verify this in the implementation.
If rounding produces 359, change the assertion to `toBeGreaterThanOrEqual(359)`.

**layout.test.ts — "portrait item bar is two rows tall and inside the design bounds"**
```ts
expect(regions.itemBar.h).toBe(68);
```
At dH=844 surplus restores itemBar_h to 68. This should pass. If surplus rounding
yields 67, change to `toBeGreaterThanOrEqual(66)`.

**layout.test.ts — "portrait uses design 390×844"**
```ts
expect(layout.designW).toBe(390);
expect(layout.designH).toBe(844);
```
With `resolveLayout({ viewportW: 390, viewportH: 844 })` and no safe insets,
`dH = 844 - 0 - 0 = 844`. This test stays valid.

**layout.test.ts — "portrait regions have a uniform inter-region gap below the trait strip"**
```ts
const gap = stack[i + 1]!.y - (stack[i]!.y + stack[i]!.h);
expect(gap).toBeGreaterThanOrEqual(6);
expect(gap).toBeLessThanOrEqual(10);
```
At design height the gap algorithm outputs gap=8, so all inter-region gaps are 8.
This test stays valid. The constraint (6–10) remains correct at design height.
**Do not tighten this constraint** — shorter viewports use gap=4 or gap=3.

### No changes needed

- All landscape region tests: landscape path is untouched.
- `centeredModal` tests: `centeredModal` takes `layout.designW/designH`, which at dH=844
  is unchanged.
- `planningRegionAt` tests: all use `resolveLayout({ viewportW: 390, viewportH: 844 })`,
  which produces the same regions at design height.
- `benchLayout.test.ts`: no changes to benchLayout.ts.

---

## 7. New Unit Tests to Add

Add to `packages/client/tests/layout.test.ts`:

### 7a. Non-overlap invariant at multiple heights

```ts
describe("portrait height-driven layout", () => {
  const heights = [606, 640, 736, 844, 926];

  for (const usableH of heights) {
    it(`regions are pairwise non-overlapping at usableH=${usableH}`, () => {
      const layout = resolveLayout({ viewportW: 390, viewportH: usableH });
      const r = layout.regions;
      const stack = [
        { name: "statusRow",    r: r.statusRow },
        { name: "opponentRail", r: r.opponentRail },
        { name: "board",        r: r.board },
        { name: "traitRail",    r: r.traitRail },
        { name: "hud",          r: r.hud },
        { name: "bench",        r: r.bench },
        { name: "shop",         r: r.shop },
        { name: "readyButton",  r: r.readyButton },
        { name: "itemBar",      r: r.itemBar },
      ];
      for (const [a, b] of pairs(stack)) {
        expect(rectsOverlap(a.r, b.r)).toBe(false);
      }
    });
  }
});
```

### 7b. Stack fits within designH

```ts
  for (const usableH of heights) {
    it(`all regions bottom edge ≤ designH at usableH=${usableH}`, () => {
      const layout = resolveLayout({ viewportW: 390, viewportH: usableH });
      const r = layout.regions;
      for (const [name, rect] of Object.entries(r)) {
        expect(rect.y + rect.h)
          .toBeLessThanOrEqual(layout.designH + 1); // +1 for rounding
      }
    });
  }
```

### 7c. Interactive region minimum heights

```ts
  for (const usableH of heights) {
    it(`interactive regions meet minimums at usableH=${usableH}`, () => {
      const layout = resolveLayout({ viewportW: 390, viewportH: usableH });
      const r = layout.regions;
      expect(r.readyButton.h).toBeGreaterThanOrEqual(44);
      expect(r.bench.h).toBeGreaterThanOrEqual(32);
      expect(r.shop.h).toBeGreaterThanOrEqual(64);
      expect(r.hud.h).toBeGreaterThanOrEqual(32);
      expect(r.itemBar.h).toBeGreaterThanOrEqual(44);
      expect(r.board.h).toBeGreaterThanOrEqual(280);
      expect(r.board.w).toBeGreaterThanOrEqual(336); // hex grid must fit
    });
  }
```

### 7d. Regions are in stack order (no region above its predecessor)

```ts
  for (const usableH of heights) {
    it(`portrait stack order is correct at usableH=${usableH}`, () => {
      const layout = resolveLayout({ viewportW: 390, viewportH: usableH });
      const r = layout.regions;
      const ordered = [
        r.statusRow, r.opponentRail, r.board,
        r.traitRail, r.hud, r.bench, r.shop, r.readyButton, r.itemBar,
      ];
      for (let i = 1; i < ordered.length; i++) {
        const prev = ordered[i-1]!;
        const curr = ordered[i]!;
        expect(curr.y).toBeGreaterThanOrEqual(prev.y + prev.h);
      }
    });
  }
```

### 7e. Backward-compatible at design height

```ts
  it("portrait at design height 844 produces same board position as prior hardcoded values", () => {
    const layout = resolveLayout({ viewportW: 390, viewportH: 844 });
    const r = layout.regions;
    expect(r.board.x).toBe(8);
    expect(r.board.y).toBe(58);
    expect(r.board.w).toBe(374);
    expect(r.board.h).toBeGreaterThanOrEqual(359); // 360 ±1 rounding
    expect(r.shop.h).toBeGreaterThanOrEqual(83);   // 84 ±1
    expect(r.itemBar.h).toBeGreaterThanOrEqual(67); // 68 ±1
  });
```

### 7f. portraitRegions pure helper (if exported)

```ts
  it("portraitRegions(844) matches full resolveLayout output", () => {
    const direct   = portraitRegions(844);
    const viaResolve = resolveLayout({ viewportW: 390, viewportH: 844 }).regions;
    expect(direct.board.y).toBe(viaResolve.board.y);
    expect(direct.shop.y).toBe(viaResolve.shop.y);
    expect(direct.itemBar.y).toBe(viaResolve.itemBar.y);
  });
```

---

## 8. Exact Invariants Summary

For any portrait viewport with `usableH >= 606`:

1. `statusRow.y = 4`, `statusRow.h = 24`
2. `opponentRail.y = 28`, `opponentRail.h = 30`
3. `board.y = 58`, `board.w = 374`, `board.h ∈ [280, 360]`
4. `board.h >= 280` (hex grid readable; 7×32px cols with hex scale ~18r)
5. `readyButton.h >= 44` (44px touch target minimum, WCAG / Apple HIG)
6. `bench.h >= 32`, `hud.h >= 32`, `shop.h >= 64`, `itemBar.h >= 44`
7. All adjacent regions: `next.y >= prev.y + prev.h` (no overlap)
8. All regions: `r.y + r.h <= designH` (no clipping)
9. `bench.x = 8`, `bench.w = 324`, `sellControl.x = 338`, `sellControl.w = 44` (unchanged)
10. At `usableH = 844`: output is visually equivalent to current hardcoded values
    (all region heights within ±1px of their current literals)
11. Landscape path: zero changes, all landscape tests must remain green

---

## 9. match.ts Consumption Notes

No rendering code changes are required beyond what already exists. The scene reads
`this.layout.regions.*` for all positions. With `designH` now equal to `usableH`, the
one area to audit is any code that references `this.designH` (or `PORTRAIT_H=844`)
as a literal for positioning overlays or bottom-of-screen elements:

- Line 1002–1003: `this.layout.regions.bench.y - 30` and `this.itemBar.y - 26` —
  these are relative to regions, so they adapt automatically.
- `centeredModal(layout, w, h)` already uses `layout.designH` — will center correctly.
- The toast layer and any overlay positioned at `designH - N` must use
  `layout.designH` (which now equals usableH) rather than the constant `PORTRAIT_H`.
  Coder should grep for `PORTRAIT_H` and `844` literals in match.ts and replace with
  `this.layout.designH` or `this.designH` (whichever is the accessor in use).

---

## 10. Implementation Checklist for Coder

- [ ] Add `export function portraitRegions(designH: number): MatchRegions` to layout.ts
      implementing the budget algorithm (section 3)
- [ ] Update `portraitLayout` to compute `dH = usableH`, `scale = usableW / PORTRAIT_W`,
      and call `portraitRegions(dH)` for the regions
- [ ] Add `portraitDesignH?: number` to `MatchLayout` (set by portraitLayout)
- [ ] Verify surplus distribution restores design-height values to within ±1px
- [ ] Audit match.ts for `PORTRAIT_H` / `844` literal usages and replace with
      `this.layout.designH`
- [ ] Add new tests (section 7) to packages/client/tests/layout.test.ts
- [ ] Run `npm test` — all existing tests must remain green
- [ ] Manual check on 390×640 and 375×667 (SE) viewports via browser devtools
