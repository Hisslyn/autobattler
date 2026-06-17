import { describe, it, expect } from "vitest";
import {
  resolveLayout,
  centeredModal,
  landscapeBenchSlotCenter,
  landscapeBenchSlotAt,
  planningRegionAt,
  opponentRailTile,
  portraitRegions,
  shopCardContentLayout,
  LANDSCAPE_THRESHOLD,
  PORTRAIT_W, PORTRAIT_H,
  LANDSCAPE_W, LANDSCAPE_H,
} from "../src/layout.js";
import type { Rect, MatchLayout } from "../src/layout.js";
import { landscapeHudControls } from "../src/hudControlsLayout.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** True if rect A and rect B overlap (axis-aligned, exclusive right/bottom edge). */
function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

/** All unique pairs from an array. */
function pairs<T>(arr: T[]): [T, T][] {
  const result: [T, T][] = [];
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      result.push([arr[i]!, arr[j]!]);
    }
  }
  return result;
}

/** Assert a rect stays within [0, maxW) × [0, maxH). */
function withinBounds(r: Rect, maxW: number, maxH: number): boolean {
  return r.x >= 0 && r.y >= 0 && r.x + r.w <= maxW && r.y + r.h <= maxH;
}

/** Core regions to check for non-overlap and bounds (excludes traitTabBar which sits within traitRail column). */
function coreRegions(layout: MatchLayout): Rect[] {
  const { board, traitRail, opponentRail, shop, bench, hud } = layout.regions;
  return [board, traitRail, opponentRail, shop, bench, hud];
}

// ── Orientation detection ─────────────────────────────────────────────────────

describe("orientation detection", () => {
  it("picks landscape for a 844×390 viewport", () => {
    const layout = resolveLayout({ viewportW: 844, viewportH: 390 });
    expect(layout.orientation).toBe("landscape");
    expect(layout.designW).toBe(LANDSCAPE_W);
    expect(layout.designH).toBe(LANDSCAPE_H);
  });

  it("picks portrait for a 390×844 viewport", () => {
    const layout = resolveLayout({ viewportW: 390, viewportH: 844 });
    expect(layout.orientation).toBe("portrait");
    expect(layout.designW).toBe(PORTRAIT_W);
    expect(layout.designH).toBe(PORTRAIT_H);
  });

  it("threshold is at LANDSCAPE_THRESHOLD", () => {
    // Just at threshold → landscape
    const atThreshold = resolveLayout({ viewportW: Math.ceil(390 * LANDSCAPE_THRESHOLD), viewportH: 390 });
    expect(atThreshold.orientation).toBe("landscape");

    // Just below threshold → portrait
    const below = resolveLayout({ viewportW: 390, viewportH: 390 });
    expect(below.orientation).toBe("portrait");
  });

  it("1.0 aspect (square) stays portrait", () => {
    const layout = resolveLayout({ viewportW: 600, viewportH: 600 });
    expect(layout.orientation).toBe("portrait");
  });

  it("16:9 landscape phone gives landscape", () => {
    const layout = resolveLayout({ viewportW: 844, viewportH: 390 });
    expect(layout.orientation).toBe("landscape");
  });
});

// ── Scale-to-fit ──────────────────────────────────────────────────────────────

describe("scale-to-fit", () => {
  it("landscape scale fits the design within the viewport", () => {
    const vW = 844, vH = 390;
    const layout = resolveLayout({ viewportW: vW, viewportH: vH });
    expect(layout.designW * layout.scale).toBeLessThanOrEqual(vW + 0.001);
    expect(layout.designH * layout.scale).toBeLessThanOrEqual(vH + 0.001);
  });

  it("portrait scale fits the design within the viewport", () => {
    const vW = 390, vH = 844;
    const layout = resolveLayout({ viewportW: vW, viewportH: vH });
    expect(layout.designW * layout.scale).toBeLessThanOrEqual(vW + 0.001);
    expect(layout.designH * layout.scale).toBeLessThanOrEqual(vH + 0.001);
  });

  it("portrait scale on a larger screen scales up proportionally", () => {
    const layout = resolveLayout({ viewportW: 780, viewportH: 1688 });
    expect(layout.scale).toBeCloseTo(780 / PORTRAIT_W, 3);
  });

  it("landscape scale on a wider screen scales up proportionally", () => {
    const layout = resolveLayout({ viewportW: 1688, viewportH: 780 });
    expect(layout.scale).toBeCloseTo(780 / LANDSCAPE_H, 3);
  });
});

// ── Safe-area insets ──────────────────────────────────────────────────────────

describe("safe-area insets", () => {
  it("landscape with left/right insets shrinks usable width and shifts offset", () => {
    const vW = 844, vH = 390;
    const noSafe  = resolveLayout({ viewportW: vW, viewportH: vH });
    const withSafe = resolveLayout({ viewportW: vW, viewportH: vH, safe: { left: 44, right: 44 } });

    // Usable width is reduced → smaller or equal scale.
    expect(withSafe.scale).toBeLessThanOrEqual(noSafe.scale + 0.001);

    // Canvas starts further right (notch offset).
    expect(withSafe.canvasOffsetX).toBeGreaterThan(noSafe.canvasOffsetX - 0.001);
  });

  it("portrait with top/bottom insets shrinks usable height", () => {
    const vW = 390, vH = 844;
    const noSafe   = resolveLayout({ viewportW: vW, viewportH: vH });
    const withSafe  = resolveLayout({ viewportW: vW, viewportH: vH, safe: { top: 44, bottom: 34 } });
    expect(withSafe.scale).toBeLessThanOrEqual(noSafe.scale + 0.001);
    expect(withSafe.canvasOffsetY).toBeGreaterThan(noSafe.canvasOffsetY - 0.001);
  });

  it("canvas offset + scaled size stays within the safe-area-bounded viewport", () => {
    const vW = 844, vH = 390;
    const safe = { left: 44, right: 44, top: 0, bottom: 0 };
    const layout = resolveLayout({ viewportW: vW, viewportH: vH, safe });
    const right  = layout.canvasOffsetX + layout.designW * layout.scale;
    const bottom = layout.canvasOffsetY + layout.designH * layout.scale;
    expect(layout.canvasOffsetX).toBeGreaterThanOrEqual(safe.left - 0.001);
    expect(right).toBeLessThanOrEqual(vW - safe.right + 0.001);
    expect(layout.canvasOffsetY).toBeGreaterThanOrEqual(safe.top - 0.001);
    expect(bottom).toBeLessThanOrEqual(vH - safe.bottom + 0.001);
  });
});

// ── Landscape region geometry ─────────────────────────────────────────────────

describe("landscape regions", () => {
  const layout = resolveLayout({ viewportW: 844, viewportH: 390 });
  const { designW, designH, regions } = layout;

  it("all core regions are within design bounds", () => {
    for (const r of coreRegions(layout)) {
      expect(withinBounds(r, designW, designH)).toBe(true);
    }
  });

  it("core regions are pairwise non-overlapping", () => {
    const named = [
      { name: "board",        r: regions.board },
      { name: "traitRail",    r: regions.traitRail },
      { name: "opponentRail", r: regions.opponentRail },
      { name: "shop",         r: regions.shop },
      { name: "bench",        r: regions.bench },
      { name: "hud",          r: regions.hud },
    ];
    for (const [a, b] of pairs(named)) {
      expect(rectsOverlap(a.r, b.r))
        .toBe(false);
    }
  });

  it("board holds the hex grid scaled-to-fit and is the dominant region", () => {
    // The fixed 7×4 grid is 336w × 348h. Landscape renders it scaled-to-fit the
    // board region (match.ts boardScale = min(1, (w-16)/336, (h-12)/348)); the
    // scaled grid must fit inside the region, and the board is the dominant
    // element — wider than the prior 352px landscape board panel.
    const gridW = 336;
    const gridH = 348;
    const scale = Math.min(1, (regions.board.w - 16) / gridW, (regions.board.h - 12) / gridH);
    expect(scale).toBeGreaterThan(0);
    expect(scale).toBeLessThanOrEqual(1);
    expect(gridW * scale).toBeLessThanOrEqual(regions.board.w);
    expect(gridH * scale).toBeLessThanOrEqual(regions.board.h);
    expect(regions.board.w).toBeGreaterThan(352);
  });

  it("board is the dominant top-center element spanning the design center", () => {
    // Top-center: the board straddles the horizontal midline.
    expect(regions.board.x).toBeLessThan(designW / 2);
    expect(regions.board.x + regions.board.w).toBeGreaterThan(designW / 2);
    // Board y is anchored to the top.
    expect(regions.board.y).toBeLessThan(designH / 4);
  });

  it("statusRow is a thin band under the board (not full-width)", () => {
    expect(regions.statusRow.x).toBe(regions.board.x);
    expect(regions.statusRow.w).toBe(regions.board.w);
    expect(regions.statusRow.y).toBeGreaterThanOrEqual(regions.board.y + regions.board.h);
    expect(regions.statusRow.y + regions.statusRow.h).toBeLessThanOrEqual(regions.shop.y);
  });

  it("bench is centered below the board and above the shop", () => {
    // Bench center x should be close to board center x.
    const benchCx = regions.bench.x + regions.bench.w / 2;
    const boardCx = regions.board.x + regions.board.w / 2;
    expect(Math.abs(benchCx - boardCx)).toBeLessThanOrEqual(2); // rounding tolerance
    // Bench y is below the board+status row.
    expect(regions.bench.y).toBeGreaterThan(regions.statusRow.y + regions.statusRow.h);
    // Bench bottom is above the shop.
    expect(regions.bench.y + regions.bench.h).toBeLessThanOrEqual(regions.shop.y);
  });

  it("bench has 9 slot positions in a single 1×9 row that stay inside the bench rect", () => {
    const centers: { x: number; y: number }[] = [];
    for (let i = 0; i < 9; i++) {
      const c = landscapeBenchSlotCenter(i, regions.bench);
      expect(c.x).toBeGreaterThanOrEqual(regions.bench.x);
      expect(c.x).toBeLessThanOrEqual(regions.bench.x + regions.bench.w);
      expect(c.y).toBeGreaterThanOrEqual(regions.bench.y);
      expect(c.y).toBeLessThanOrEqual(regions.bench.y + regions.bench.h);
      centers.push(c);
    }
    // Single row: every slot shares the same vertical center.
    for (const c of centers) expect(c.y).toBeCloseTo(centers[0]!.y, 5);
    // Nine strictly increasing, evenly spaced x positions.
    for (let i = 1; i < 9; i++) expect(centers[i]!.x).toBeGreaterThan(centers[i - 1]!.x);
    // Each slot's footprint meets the ≥32px touch floor in both dimensions.
    const slotW = regions.bench.w / 9;
    expect(slotW).toBeGreaterThanOrEqual(32);
    expect(regions.bench.h).toBeGreaterThanOrEqual(32);
  });

  it("traitRail is a thin vertical strip in the far-left column (x=0 or close)", () => {
    expect(regions.traitRail.x).toBe(0);
    // Tall and thin.
    expect(regions.traitRail.h).toBeGreaterThan(regions.traitRail.w * 3);
    // traitRail is to the left of the board.
    expect(regions.traitRail.x + regions.traitRail.w).toBeLessThanOrEqual(regions.board.x);
  });

  it("traitTabBar sits at the top of the trait column (landscape only)", () => {
    // Tab buttons occupy the top of the left column, above the traitRail content.
    expect(regions.traitTabBar.x).toBe(regions.traitRail.x);
    expect(regions.traitTabBar.w).toBe(regions.traitRail.w);
    expect(regions.traitTabBar.y).toBeLessThan(regions.traitRail.y);
    expect(regions.traitTabBar.h).toBeGreaterThan(0);
    // Together they cover a contiguous vertical strip.
    expect(regions.traitTabBar.y + regions.traitTabBar.h).toBeLessThanOrEqual(regions.traitRail.y + 4);
  });

  it("opponentRail, hud, sellControl, readyButton are in the right-edge column", () => {
    const boardRight = regions.board.x + regions.board.w;
    expect(regions.opponentRail.x).toBeGreaterThanOrEqual(boardRight);
    expect(regions.hud.x).toBeGreaterThanOrEqual(boardRight);
    expect(regions.sellControl.x).toBeGreaterThanOrEqual(boardRight);
    expect(regions.readyButton.x).toBeGreaterThanOrEqual(boardRight);
  });

  it("shop is a full-width strip pinned to the bottom edge", () => {
    expect(regions.shop.x).toBe(0);
    expect(regions.shop.w).toBe(designW);
    expect(regions.shop.y + regions.shop.h).toBe(designH);
    expect(regions.shop.h).toBeGreaterThanOrEqual(64); // touch-target floor
  });

  it("the right-edge column stacks rail → hud → sell → ready without overlap", () => {
    const stack = [regions.opponentRail, regions.hud, regions.sellControl, regions.readyButton];
    for (let i = 1; i < stack.length; i++) {
      const prev = stack[i - 1]!;
      const cur = stack[i]!;
      expect(cur.y).toBeGreaterThanOrEqual(prev.y + prev.h);
    }
    // Whole stack sits above the bottom shop strip.
    expect(regions.readyButton.y + regions.readyButton.h).toBeLessThanOrEqual(regions.shop.y);
  });

  it("sellControl is detached from the bench (it lives in the right-edge column)", () => {
    expect(regions.sellControl.x).toBeGreaterThan(regions.bench.x + regions.bench.w);
    expect(regions.sellControl.y).toBeGreaterThan(regions.hud.y);
  });

  it("interactive regions meet their touch-target minimums", () => {
    expect(regions.readyButton.h).toBeGreaterThanOrEqual(44);
    expect(regions.shop.h).toBeGreaterThanOrEqual(64);
    expect(regions.bench.h).toBeGreaterThanOrEqual(32);
    expect(regions.hud.h).toBeGreaterThanOrEqual(32);
  });

  it("opponentRail stacks seat tiles vertically (4 rows, each ≥ 36px)", () => {
    // The corner rail holds 8 tiles as a 2-col × 4-row vertical stack.
    expect(regions.opponentRail.h / 4).toBeGreaterThanOrEqual(36);
  });

  it("bench is NOT in the far-left trait column (it moved below the board)", () => {
    // Bench is horizontally centered under the board, not in the left column.
    expect(regions.bench.x).toBeGreaterThan(regions.traitRail.x + regions.traitRail.w);
  });
});

// ── NH1: planningRegionAt ──────────────────────────────────────────────────────

describe("planningRegionAt", () => {
  const layout = resolveLayout({ viewportW: 390, viewportH: 844 });
  const r = layout.regions;
  const center = (rect: Rect): [number, number] => [rect.x + rect.w / 2, rect.y + rect.h / 2];

  it("center of the sell control returns the sell zone", () => {
    const [px, py] = center(r.sellControl);
    expect(planningRegionAt(px, py, layout, -1, null)).toEqual({ zone: "sell" });
  });

  it("sell zone uses forgiving bounds (±6px outside still maps to sell)", () => {
    const px = r.sellControl.x + r.sellControl.w + 5;
    const py = r.sellControl.y + r.sellControl.h / 2;
    expect(planningRegionAt(px, py, layout, -1, null)).toEqual({ zone: "sell" });
  });

  it("center of the shop returns a shop card index 0–4", () => {
    const [px, py] = center(r.shop);
    const got = planningRegionAt(px, py, layout, -1, null);
    expect(got?.zone).toBe("shop");
    if (got?.zone === "shop") {
      expect(got.cardIdx).toBeGreaterThanOrEqual(0);
      expect(got.cardIdx).toBeLessThanOrEqual(4);
    }
  });

  it("center of the ready button returns readyButton", () => {
    const [px, py] = center(r.readyButton);
    expect(planningRegionAt(px, py, layout, -1, null)).toEqual({ zone: "readyButton" });
  });

  it("a passed board slot wins as the board zone (matches hexFromPointer)", () => {
    const [px, py] = center(r.board);
    expect(planningRegionAt(px, py, layout, 12, null)).toEqual({ zone: "board", slotIdx: 12 });
  });

  it("a point outside every region returns null", () => {
    expect(planningRegionAt(-50, -50, layout, -1, null)).toBeNull();
  });
});

// ── NH2: opponentRailTile ──────────────────────────────────────────────────────

describe("opponentRailTile", () => {
  const rail: Rect = { x: 600, y: 26, w: 240, h: 72 };

  it("seat 0 in a 4-col layout → col 0, row 0", () => {
    const t = opponentRailTile(0, 4, 2, rail);
    expect(t.col).toBe(0);
    expect(t.row).toBe(0);
  });

  it("seat 7 in a 4-col layout → col 3, row 1", () => {
    const t = opponentRailTile(7, 4, 2, rail);
    expect(t.col).toBe(3);
    expect(t.row).toBe(1);
  });

  it("cx stays within the rail horizontally; cy within vertically", () => {
    for (let i = 0; i < 8; i++) {
      const t = opponentRailTile(i, 4, 2, rail);
      expect(t.cx).toBeGreaterThanOrEqual(rail.x);
      expect(t.cx).toBeLessThanOrEqual(rail.x + rail.w);
      expect(t.cy).toBeGreaterThanOrEqual(rail.y);
      expect(t.cy).toBeLessThanOrEqual(rail.y + rail.h);
    }
  });
});

// ── Portrait region geometry ──────────────────────────────────────────────────

describe("portrait regions", () => {
  const layout = resolveLayout({ viewportW: 390, viewportH: 844 });
  const { designW, designH, regions } = layout;

  it("all core regions are within design bounds", () => {
    for (const r of coreRegions(layout)) {
      expect(withinBounds(r, designW, designH)).toBe(true);
    }
  });

  it("core regions are pairwise non-overlapping", () => {
    const named = [
      { name: "board",        r: regions.board },
      { name: "traitRail",    r: regions.traitRail },
      { name: "opponentRail", r: regions.opponentRail },
      { name: "shop",         r: regions.shop },
      { name: "bench",        r: regions.bench },
      { name: "hud",          r: regions.hud },
    ];
    for (const [a, b] of pairs(named)) {
      expect(rectsOverlap(a.r, b.r)).toBe(false);
    }
  });

  it("portrait board is at the existing hardcoded x/y/w; height reclaims the freed item-bar space", () => {
    // match.ts: BOARD_PANEL_X=8, BOARD_PANEL_Y=58, W=374. With the item bar
    // removed the board grows to its new design max (P_BOARD_MAX=392).
    expect(regions.board.x).toBe(8);
    expect(regions.board.y).toBe(58);
    expect(regions.board.w).toBe(374);
    expect(regions.board.h).toBe(392);
  });

  it("portrait uses design 390×844", () => {
    expect(layout.designW).toBe(390);
    expect(layout.designH).toBe(844);
  });

  it("portrait traitTabBar is zeroed (no tab switcher in portrait)", () => {
    expect(regions.traitTabBar.w).toBe(0);
    expect(regions.traitTabBar.h).toBe(0);
  });

  it("portrait regions have a uniform inter-region gap below the trait strip", () => {
    // Each adjacent pair in the stacked lower column should sit 6–10px apart.
    const stack = [
      regions.traitRail,
      regions.hud,
      regions.bench,
      regions.shop,
      regions.readyButton,
    ];
    for (let i = 0; i < stack.length - 1; i++) {
      const gap = stack[i + 1]!.y - (stack[i]!.y + stack[i]!.h);
      expect(gap).toBeGreaterThanOrEqual(6);
      expect(gap).toBeLessThanOrEqual(10);
    }
  });
});

// ── Portrait height-driven layout ─────────────────────────────────────────────

describe("portrait height-driven layout", () => {
  const heights = [606, 640, 736, 844, 926];

  /** The portrait stack in render order. */
  function portraitStack(layout: MatchLayout): Rect[] {
    const r = layout.regions;
    return [
      r.statusRow,
      r.opponentRail,
      r.board,
      r.traitRail,
      r.hud,
      r.bench,
      r.shop,
      r.readyButton,
    ];
  }

  for (const usableH of heights) {
    it(`design height tracks the usable viewport height (usableH=${usableH})`, () => {
      const layout = resolveLayout({ viewportW: 390, viewportH: usableH });
      expect(layout.orientation).toBe("portrait");
      expect(layout.designH).toBe(usableH);
      expect(layout.portraitDesignH).toBe(usableH);
      // Width-only scale: canvas fills usable height exactly.
      expect(layout.scale).toBeCloseTo(390 / PORTRAIT_W, 6);
    });

    it(`regions are pairwise non-overlapping at usableH=${usableH}`, () => {
      const layout = resolveLayout({ viewportW: 390, viewportH: usableH });
      for (const [a, b] of pairs(portraitStack(layout))) {
        expect(rectsOverlap(a, b)).toBe(false);
      }
    });

    it(`stacked regions keep a non-negative gap (no overlap) at usableH=${usableH}`, () => {
      const layout = resolveLayout({ viewportW: 390, viewportH: usableH });
      const stack = portraitStack(layout);
      for (let i = 1; i < stack.length; i++) {
        const prev = stack[i - 1]!;
        const curr = stack[i]!;
        expect(curr.y).toBeGreaterThanOrEqual(prev.y + prev.h);
      }
    });

    it(`all regions bottom edge ≤ designH at usableH=${usableH}`, () => {
      const layout = resolveLayout({ viewportW: 390, viewportH: usableH });
      const r = layout.regions;
      for (const rect of Object.values(r)) {
        // traitTabBar is zeroed in portrait — skip its 0-area check
        if (rect.w === 0 && rect.h === 0) continue;
        expect(rect.y + rect.h).toBeLessThanOrEqual(layout.designH + 1);
      }
    });

    it(`interactive regions meet minimums at usableH=${usableH}`, () => {
      const layout = resolveLayout({ viewportW: 390, viewportH: usableH });
      const r = layout.regions;
      expect(r.readyButton.h).toBeGreaterThanOrEqual(44);
      expect(r.bench.h).toBeGreaterThanOrEqual(32);
      expect(r.shop.h).toBeGreaterThanOrEqual(64);
      expect(r.hud.h).toBeGreaterThanOrEqual(32);
      expect(r.board.h).toBeGreaterThanOrEqual(280);
      expect(r.board.w).toBeGreaterThanOrEqual(336); // hex grid must fit
    });

    it(`sell control sits beside the bench at usableH=${usableH}`, () => {
      const layout = resolveLayout({ viewportW: 390, viewportH: usableH });
      const r = layout.regions;
      expect(r.bench.x).toBe(8);
      expect(r.bench.w).toBe(324);
      expect(r.sellControl.x).toBe(338);
      expect(r.sellControl.w).toBe(44);
      // Sell control tracks the bench row exactly.
      expect(r.sellControl.y).toBe(r.bench.y);
      expect(r.sellControl.h).toBe(r.bench.h);
    });

    it(`portrait traitTabBar is zeroed at usableH=${usableH}`, () => {
      const layout = resolveLayout({ viewportW: 390, viewportH: usableH });
      expect(layout.regions.traitTabBar.w).toBe(0);
      expect(layout.regions.traitTabBar.h).toBe(0);
    });
  }

  it("top band is fixed regardless of height", () => {
    for (const usableH of heights) {
      const r = resolveLayout({ viewportW: 390, viewportH: usableH }).regions;
      expect(r.statusRow.y).toBe(4);
      expect(r.statusRow.h).toBe(24);
      expect(r.opponentRail.y).toBe(28);
      expect(r.opponentRail.h).toBe(30);
      expect(r.board.y).toBe(58);
    }
  });

  it("board height scales between its minimum and design max", () => {
    const short = resolveLayout({ viewportW: 390, viewportH: 606 }).regions.board.h;
    const tall = resolveLayout({ viewportW: 390, viewportH: 844 }).regions.board.h;
    expect(short).toBe(280);
    expect(tall).toBe(392);
  });

  it("portrait at design height 844 produces the prior hardcoded board position", () => {
    const r = resolveLayout({ viewportW: 390, viewportH: 844 }).regions;
    expect(r.board.x).toBe(8);
    expect(r.board.y).toBe(58);
    expect(r.board.w).toBe(374);
    expect(r.board.h).toBeGreaterThanOrEqual(359); // 360 ±1 rounding
    expect(r.shop.h).toBeGreaterThanOrEqual(83);   // 84 ±1
  });

  it("portraitRegions(844) matches full resolveLayout output", () => {
    const direct = portraitRegions(844);
    const viaResolve = resolveLayout({ viewportW: 390, viewportH: 844 }).regions;
    expect(direct.board.y).toBe(viaResolve.board.y);
    expect(direct.shop.y).toBe(viaResolve.shop.y);
    expect(direct.board.h).toBe(viaResolve.board.h);
    expect(direct.shop.h).toBe(viaResolve.shop.h);
  });
});

// ── shopCardContentLayout ─────────────────────────────────────────────────────

describe("shopCardContentLayout", () => {
  for (const cardH of [64, 72, 84]) {
    it(`content rows are top-to-bottom ordered with no trait/tier collision at cardH=${cardH}`, () => {
      const c = shopCardContentLayout(cardH);
      // Strict vertical order: disc < name < trait < tier.
      expect(c.discY).toBeLessThan(c.nameY);
      expect(c.nameY).toBeLessThan(c.traitY);
      expect(c.traitY).toBeLessThan(c.tierY);
      // Trait line clears the tier/cost row.
      expect(c.traitY + 7).toBeLessThan(c.tierY - 2);
      // All offsets stay within the card.
      expect(c.tierY).toBeLessThanOrEqual(cardH);
      expect(c.discY - c.discR).toBeGreaterThanOrEqual(0);
    });
  }
});

// ── centeredModal ─────────────────────────────────────────────────────────────

describe("centeredModal", () => {
  it("centers within the design area", () => {
    const layout = resolveLayout({ viewportW: 844, viewportH: 390 });
    const r = centeredModal(layout, 300, 200);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    expect(cx).toBeCloseTo(layout.designW / 2, 0);
    expect(cy).toBeCloseTo(layout.designH / 2, 0);
  });

  it("clamps a too-tall modal to fit within the design height", () => {
    const layout = resolveLayout({ viewportW: 844, viewportH: 390 });
    const bigH = layout.designH + 200;
    const r = centeredModal(layout, 300, bigH, 20);
    expect(r.h).toBeLessThanOrEqual(layout.designH - 2 * 20);
    expect(r.y).toBeGreaterThanOrEqual(20);
    expect(r.y + r.h).toBeLessThanOrEqual(layout.designH - 20);
  });

  it("clamps a too-wide modal to fit within the design width", () => {
    const layout = resolveLayout({ viewportW: 390, viewportH: 844 });
    const r = centeredModal(layout, layout.designW + 100, 200, 20);
    expect(r.w).toBeLessThanOrEqual(layout.designW - 2 * 20);
    expect(r.x).toBeGreaterThanOrEqual(20);
    expect(r.x + r.w).toBeLessThanOrEqual(layout.designW - 20);
  });

  it("a normal-sized modal stays within design bounds with default padding", () => {
    const layout = resolveLayout({ viewportW: 844, viewportH: 390 });
    const r = centeredModal(layout, 320, 240);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.w).toBeLessThanOrEqual(layout.designW);
    expect(r.y + r.h).toBeLessThanOrEqual(layout.designH);
  });

  it("short landscape viewport: a tall content block is clamped to fit", () => {
    // Simulate a short landscape browser chrome scenario.
    const layout = resolveLayout({ viewportW: 667, viewportH: 375 });
    const r = centeredModal(layout, 600, layout.designH - 20);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.y + r.h).toBeLessThanOrEqual(layout.designH);
  });
});

// ── landscapeBenchSlotAt ──────────────────────────────────────────────────────

describe("landscapeBenchSlotAt", () => {
  const layout = resolveLayout({ viewportW: 844, viewportH: 390 });
  const bench = layout.regions.bench;

  it("maps each slot center to its index", () => {
    for (let i = 0; i < 9; i++) {
      const { x, y } = landscapeBenchSlotCenter(i, bench);
      expect(landscapeBenchSlotAt(x, y, bench)).toBe(i);
    }
  });

  it("returns null outside the bench rect", () => {
    expect(landscapeBenchSlotAt(bench.x - 5, bench.y + bench.h / 2, bench)).toBeNull();
    expect(landscapeBenchSlotAt(bench.x + bench.w + 5, bench.y + bench.h / 2, bench)).toBeNull();
    expect(landscapeBenchSlotAt(bench.x + bench.w / 2, bench.y - 5, bench)).toBeNull();
    expect(landscapeBenchSlotAt(bench.x + bench.w / 2, bench.y + bench.h + 5, bench)).toBeNull();
  });
});

// ── landscape HUD controls (BUG 2: reroll/buy-xp must fit the hud region) ──────

describe("landscapeHudControls fits the hud region", () => {
  /** True if `inner` is fully contained in `outer` (inclusive edges). */
  const within = (inner: Rect, outer: Rect): boolean =>
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h;

  // Range of supported landscape viewports (design + a wider/taller phone).
  const viewports = [
    { viewportW: 844, viewportH: 390 },
    { viewportW: 1688, viewportH: 780 },
    { viewportW: 640, viewportH: 360 },
  ];

  for (const vp of viewports) {
    it(`reroll + buy-xp stay inside the hud region at ${vp.viewportW}×${vp.viewportH}`, () => {
      const layout = resolveLayout(vp);
      const hud = layout.regions.hud;
      const { reroll, buyXp } = landscapeHudControls(hud);

      expect(within(reroll, hud), "reroll within hud region").toBe(true);
      expect(within(buyXp, hud), "buy-xp within hud region").toBe(true);

      // And inside the overall design bounds (the off-screen symptom of BUG 2).
      expect(withinBounds(reroll, layout.designW, layout.designH)).toBe(true);
      expect(withinBounds(buyXp, layout.designW, layout.designH)).toBe(true);

      // The two buttons must not overlap each other.
      expect(rectsOverlap(reroll, buyXp)).toBe(false);
      // Both remain at least a usable touch width.
      expect(reroll.w).toBeGreaterThanOrEqual(40);
      expect(buyXp.w).toBeGreaterThanOrEqual(40);
    });
  }
});
