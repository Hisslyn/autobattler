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
  landscapeClusterThickness,
  LANDSCAPE_THRESHOLD,
  LS_BASE_MARGIN,
  PORTRAIT_W, PORTRAIT_H,
  LANDSCAPE_W, LANDSCAPE_H,
} from "../src/layout.js";
import type { Rect, MatchLayout } from "../src/layout.js";
import { landscapeHudControls } from "../src/hudControlsLayout.js";
import {
  SCENE_LAYER_ORDER,
  SCENE_LAYER_NAMES,
  L0_BOARD_ENV,
  L1_HEX_GRID,
  L2_UNITS,
  L3_WATERMARK,
  L4_FRAME,
  L5_HUD,
  L6_INSPECT,
  L7_DOM_META,
  L8_TOAST,
} from "../src/combatLayout.js";

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
  it("picks landscape for an 844×390 viewport", () => {
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

  it("landscape design canvas is the new 1280×592 reference", () => {
    const layout = resolveLayout({ viewportW: 844, viewportH: 390 });
    expect(layout.designW).toBe(1280);
    expect(layout.designH).toBe(592);
    expect(layout.designW / layout.designH).toBeCloseTo(2.162, 2);
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
    const layout = resolveLayout({ viewportW: 2560, viewportH: 1184 });
    expect(layout.scale).toBeCloseTo(1184 / LANDSCAPE_H, 3);
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

  it("landscape cluster leading edge uses max(safeInset, baseMargin) — small inset falls back to baseMargin", () => {
    // Region solve runs in fixed DESIGN space, so a real device safe-inset (CSS
    // px) doesn't directly enter landscapeRegionsFor; this test instead pins
    // down the documented invariant: with zero device inset, every cluster's
    // leading edge sits at exactly LS_BASE_MARGIN (the floor for the no-notch
    // case), matching "max(0, baseMargin) === baseMargin".
    const layout = resolveLayout({ viewportW: 844, viewportH: 390 });
    const { topBar, leftRail, rightRail, bottomBar } = layout.clusters!;
    expect(topBar.x).toBe(LS_BASE_MARGIN);
    expect(topBar.y).toBe(LS_BASE_MARGIN);
    expect(leftRail.x).toBe(LS_BASE_MARGIN);
    expect(layout.designW - (rightRail.x + rightRail.w)).toBeCloseTo(LS_BASE_MARGIN, 5);
    expect(layout.designH - (bottomBar.y + bottomBar.h)).toBeCloseTo(LS_BASE_MARGIN, 5);
  });

  it("landscape cluster leading edge grows past baseMargin when the device safe-inset is larger", () => {
    // A real device notch reports a nonzero CSS-px inset. landscapeLayout
    // converts it to design units (÷ scale) before landscapeRegionsFor takes
    // max(safeInsetDesign, LS_BASE_MARGIN) — so a large enough inset visibly
    // pushes the cluster's leading edge inward past the bare baseMargin.
    //
    // Size the viewport so the USABLE area (viewport minus safe insets) is
    // exactly the 1280×592 design — landscapeLayout computes scale from the
    // usable area, so usable == design gives scale == 1 exactly, making the
    // CSS-px insets equal to design-space insets 1:1.
    const safe = { left: 40, top: 30, right: 0, bottom: 0 };
    const vW = LANDSCAPE_W + safe.left + safe.right;   // 1320
    const vH = LANDSCAPE_H + safe.top + safe.bottom;   // 622
    const withSafe = resolveLayout({ viewportW: vW, viewportH: vH, safe });
    const { topBar, leftRail } = withSafe.clusters!;
    expect(withSafe.scale).toBeCloseTo(1, 5);
    expect(topBar.y).toBeCloseTo(30, 1);
    expect(leftRail.x).toBeCloseTo(40, 1);
    expect(topBar.y).toBeGreaterThan(LS_BASE_MARGIN);
    expect(leftRail.x).toBeGreaterThan(LS_BASE_MARGIN);
  });
});

// ── Landscape 4-cluster + residual-board architecture (stage 1) ───────────────

describe("landscape clusters", () => {
  const layout = resolveLayout({ viewportW: 844, viewportH: 390 });
  const { designW, designH, clusters } = layout;

  it("exposes the 4 fixed-edge clusters + residual board area", () => {
    expect(clusters).toBeDefined();
    expect(clusters!.topBar).toBeDefined();
    expect(clusters!.leftRail).toBeDefined();
    expect(clusters!.rightRail).toBeDefined();
    expect(clusters!.bottomBar).toBeDefined();
    expect(clusters!.boardArea).toBeDefined();
  });

  it("portrait layout has no clusters (landscape-only concept)", () => {
    const p = resolveLayout({ viewportW: 390, viewportH: 844 });
    expect(p.clusters).toBeUndefined();
  });

  it("the 4 edge clusters are pairwise non-overlapping and within design bounds", () => {
    const { topBar, leftRail, rightRail, bottomBar } = clusters!;
    for (const r of [topBar, leftRail, rightRail, bottomBar]) {
      expect(withinBounds(r, designW, designH)).toBe(true);
    }
    for (const [a, b] of pairs([topBar, leftRail, rightRail, bottomBar])) {
      expect(rectsOverlap(a, b)).toBe(false);
    }
  });

  it("boardArea is the residual rect after the 4 edge clusters are placed", () => {
    const { topBar, leftRail, rightRail, bottomBar, boardArea } = clusters!;
    expect(boardArea.x).toBeGreaterThanOrEqual(leftRail.x + leftRail.w);
    expect(boardArea.x + boardArea.w).toBeLessThanOrEqual(rightRail.x);
    expect(boardArea.y).toBeGreaterThanOrEqual(topBar.y + topBar.h);
    expect(boardArea.y + boardArea.h).toBeLessThanOrEqual(bottomBar.y);
    // Residual area doesn't overlap any edge cluster.
    for (const r of [topBar, leftRail, rightRail, bottomBar]) {
      expect(rectsOverlap(boardArea, r)).toBe(false);
    }
  });

  it("board (the rendered region) fits inside boardArea and is a wide, shallow slab", () => {
    const { board } = layout.regions;
    const { boardArea } = clusters!;
    expect(board.x).toBeGreaterThanOrEqual(boardArea.x - 0.001);
    expect(board.y).toBeGreaterThanOrEqual(boardArea.y - 0.001);
    expect(board.x + board.w).toBeLessThanOrEqual(boardArea.x + boardArea.w + 0.001);
    expect(board.y + board.h).toBeLessThanOrEqual(boardArea.y + boardArea.h + 0.001);

    // The board is now a wide perspective slab (near edge spans most of the
    // width, laid back via BOARD_TILT) — much wider than tall, not hex-aspect.
    expect(board.w / board.h).toBeGreaterThan(1.5);
  });

  it("board near edge targets ~75% of the design width and centers on the safe-area center", () => {
    const wide = resolveLayout({ viewportW: 844, viewportH: 390 });
    const board = wide.regions.board;
    // Horizontal: board centers on the safe-area center (= designW/2 with no insets).
    const safeCenterX = wide.designW / 2;
    expect(Math.abs(board.x + board.w / 2 - safeCenterX)).toBeLessThanOrEqual(1);
    // Near (bottom) edge ≈ 75% of the design width.
    expect(board.w / wide.designW).toBeCloseTo(0.75, 2);
  });
});

describe("landscapeClusterThickness clamp behavior", () => {
  it("16:9-equivalent design aspect: clusters clamp to their reference thickness", () => {
    // The design canvas is fixed at 1280×592 regardless of viewport aspect —
    // clamp behavior is therefore driven by the fixed design dims, exercised
    // directly via landscapeClusterThickness.
    const t = landscapeClusterThickness(1280, 592);
    expect(t.topBarH).toBeGreaterThanOrEqual(30);
    expect(t.topBarH).toBeLessThanOrEqual(56);
    expect(t.bottomBarH).toBeGreaterThanOrEqual(52);
    expect(t.bottomBarH).toBeLessThanOrEqual(72);
    expect(t.leftRailW).toBeGreaterThanOrEqual(96);
    expect(t.leftRailW).toBeLessThanOrEqual(160);
    expect(t.rightRailW).toBeGreaterThanOrEqual(80);
    expect(t.rightRailW).toBeLessThanOrEqual(130);
  });

  it("never exceeds max even with a much larger design canvas (simulated 16:9 ultrawide)", () => {
    const t = landscapeClusterThickness(2560, 1184); // 2x the reference, still ~2.16:1
    expect(t.topBarH).toBeLessThanOrEqual(56);
    expect(t.bottomBarH).toBeLessThanOrEqual(72);
    expect(t.leftRailW).toBeLessThanOrEqual(160);
    expect(t.rightRailW).toBeLessThanOrEqual(130);
  });

  it("4:3-equivalent narrow usable area: clusters shrink toward their min rather than overrunning the board floor", () => {
    // A much narrower usable width than the design reference (simulating a
    // squeezed 4:3-ish landscape splitscreen) — rails compress toward MIN
    // before ever eating into the board's minimum floor.
    const t = landscapeClusterThickness(500, 592);
    expect(t.leftRailW).toBeGreaterThan(0);
    expect(t.rightRailW).toBeGreaterThan(0);
    expect(t.leftRailW + t.rightRailW).toBeLessThanOrEqual(500 - 320 + 0.5); // LS_BOARD_MIN_W=320
  });

  it("16:9 viewport (≈1.78) still resolves the fixed 1280×592 design with valid clamped clusters", () => {
    // 16:9 phone, e.g. 1920×1080 scaled down — orientation flips to landscape,
    // design stays 1280×592 (independent of the device aspect).
    const layout = resolveLayout({ viewportW: 1920, viewportH: 1080 });
    expect(layout.orientation).toBe("landscape");
    expect(layout.designW).toBe(1280);
    expect(layout.designH).toBe(592);
    const c = layout.clusters!;
    expect(c.topBar.h).toBeGreaterThanOrEqual(30);
    expect(c.bottomBar.h).toBeGreaterThanOrEqual(52);
  });

  it("4:3 viewport (1.333, still ≥ LANDSCAPE_THRESHOLD) resolves landscape with valid clamped clusters", () => {
    const layout = resolveLayout({ viewportW: 800, viewportH: 600 });
    expect(layout.orientation).toBe("landscape");
    expect(layout.designW).toBe(1280);
    expect(layout.designH).toBe(592);
    const c = layout.clusters!;
    for (const r of [c.topBar, c.leftRail, c.rightRail, c.bottomBar]) {
      expect(r.w).toBeGreaterThan(0);
      expect(r.h).toBeGreaterThan(0);
    }
    expect(rectsOverlap(c.boardArea, c.topBar)).toBe(false);
    expect(rectsOverlap(c.boardArea, c.leftRail)).toBe(false);
    expect(rectsOverlap(c.boardArea, c.rightRail)).toBe(false);
    expect(rectsOverlap(c.boardArea, c.bottomBar)).toBe(false);
  });
});

// ── Landscape region geometry (existing widget names, slotted into clusters) ──

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
      expect(rectsOverlap(a.r, b.r)).toBe(false);
    }
  });

  it("board is a wide, shallow slab: near edge ~75% of width, clear of both rails", () => {
    // The board's near (bottom) edge targets ~75% of the design width; its far
    // (top) edge narrows via BOARD_TILT in the renderer (not in the region rect).
    // The region rect is wide-and-short (board + bench fill the vertical space).
    expect(regions.board.h).toBeGreaterThan(0);
    expect(regions.board.w / designW).toBeCloseTo(0.75, 2);
    expect(regions.board.w / regions.board.h).toBeGreaterThan(1.5);
    expect(regions.board.h).toBeGreaterThanOrEqual(240); // LS_BOARD_MIN_H
    // Clears both rails (a small margin to each).
    const { leftRail, rightRail } = layout.clusters!;
    expect(regions.board.x).toBeGreaterThan(leftRail.x + leftRail.w);
    expect(regions.board.x + regions.board.w).toBeLessThan(rightRail.x);
  });

  it("board sits in the central residual area (between leftRail and rightRail clusters)", () => {
    const { leftRail, rightRail } = layout.clusters!;
    expect(regions.board.x).toBeGreaterThanOrEqual(leftRail.x + leftRail.w);
    expect(regions.board.x + regions.board.w).toBeLessThanOrEqual(rightRail.x + 0.5);
  });

  it("statusRow spans the topBar cluster and its center sits on the safe-area center (= board center)", () => {
    const { topBar } = layout.clusters!;
    expect(regions.statusRow.x).toBe(topBar.x);
    expect(regions.statusRow.w).toBe(topBar.w);
    expect(regions.statusRow.y).toBeGreaterThanOrEqual(topBar.y);
    expect(regions.statusRow.y + regions.statusRow.h).toBeLessThanOrEqual(topBar.y + topBar.h);
    // Status cluster center == board center == safe-area center.
    const statusCx = regions.statusRow.x + regions.statusRow.w / 2;
    const boardCx = regions.board.x + regions.board.w / 2;
    expect(Math.abs(statusCx - boardCx)).toBeLessThanOrEqual(1);
    expect(statusCx).toBeCloseTo(layout.designW / 2, 0);
  });

  it("topBar contains only statusRow", () => {
    const { topBar } = layout.clusters!;
    expect(regions.statusRow.y).toBeGreaterThanOrEqual(topBar.y - 0.5);
    expect(regions.statusRow.y + regions.statusRow.h).toBeLessThanOrEqual(topBar.y + topBar.h + 0.5);
  });

  it("bench butts the board's front edge (no gap), centered under the board", () => {
    const benchCx = regions.bench.x + regions.bench.w / 2;
    const boardCx = regions.board.x + regions.board.w / 2;
    expect(Math.abs(benchCx - boardCx)).toBeLessThanOrEqual(2);
    // Bench top == board bottom: the two read as one continuous play area.
    expect(regions.bench.y).toBeCloseTo(regions.board.y + regions.board.h, 0);
    // Bench sits above the bottom controls row (bottomBar).
    expect(regions.bench.y + regions.bench.h).toBeLessThanOrEqual(layout.clusters!.bottomBar.y + 0.5);
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
    for (const c of centers) expect(c.y).toBeCloseTo(centers[0]!.y, 5);
    for (let i = 1; i < 9; i++) expect(centers[i]!.x).toBeGreaterThan(centers[i - 1]!.x);
    const slotW = regions.bench.w / 9;
    expect(slotW).toBeGreaterThanOrEqual(32);
    expect(regions.bench.h).toBeGreaterThanOrEqual(32);
  });

  it("traitRail is a thin vertical strip inside the leftRail cluster", () => {
    const { leftRail } = layout.clusters!;
    expect(regions.traitRail.x).toBe(leftRail.x);
    expect(regions.traitRail.h).toBeGreaterThan(regions.traitRail.w);
    expect(regions.traitRail.x + regions.traitRail.w).toBeLessThanOrEqual(regions.board.x + 0.5);
  });

  it("traitTabBar sits at the top of the leftRail cluster (landscape only)", () => {
    expect(regions.traitTabBar.x).toBe(regions.traitRail.x);
    expect(regions.traitTabBar.w).toBe(regions.traitRail.w);
    expect(regions.traitTabBar.y).toBeLessThan(regions.traitRail.y);
    expect(regions.traitTabBar.h).toBeGreaterThan(0);
    expect(regions.traitTabBar.y + regions.traitTabBar.h).toBeLessThanOrEqual(regions.traitRail.y + 4);
  });

  it("hud (econ) + sellControl live in the bottomBar bottom row, not the right rail", () => {
    const { bottomBar, rightRail } = layout.clusters!;
    // Both sit in the bottomBar, below the bench row.
    for (const r of [regions.hud, regions.sellControl]) {
      expect(r.y).toBeGreaterThanOrEqual(regions.bench.y + regions.bench.h - 0.5);
      expect(r.y + r.h).toBeLessThanOrEqual(bottomBar.y + bottomBar.h + 0.5);
    }
    // Econ on the left; sell sits left of the money-sack shop button, which
    // owns the rightmost corner (so sell is NOT flush with the right edge).
    expect(regions.hud.x).toBe(bottomBar.x);
    expect(regions.sellControl.x + regions.sellControl.w).toBeLessThan(bottomBar.x + bottomBar.w);
    expect(regions.shop.x + regions.shop.w).toBeCloseTo(bottomBar.x + bottomBar.w, 0);
    // Neither overlaps the right rail (which is up in the middle band).
    expect(regions.hud.y).toBeGreaterThanOrEqual(rightRail.y + rightRail.h - 0.5);
  });

  it("rightRail holds opponentRail ONLY (fills the cluster)", () => {
    const { rightRail } = layout.clusters!;
    expect(regions.opponentRail.x).toBe(rightRail.x);
    expect(regions.opponentRail.y).toBe(rightRail.y);
    expect(regions.opponentRail.w).toBe(rightRail.w);
    expect(regions.opponentRail.h).toBe(rightRail.h);
  });

  it("shop region is the money-sack toggle button in the bottom-right corner", () => {
    const { bottomBar } = layout.clusters!;
    expect(regions.shop.w).toBeGreaterThan(0);
    expect(regions.shop.h).toBeGreaterThan(0);
    // Flush with the bottom row's right edge, sharing the econ/sell vertical band.
    expect(regions.shop.x + regions.shop.w).toBeCloseTo(bottomBar.x + bottomBar.w, 0);
    expect(regions.shop.y).toBeCloseTo(regions.hud.y, 0);
    // Sell sits immediately to its left (no overlap).
    expect(regions.sellControl.x + regions.sellControl.w).toBeLessThanOrEqual(regions.shop.x + 0.5);
  });

  it("bottom row lays out econ (left) + sell (right) without overlap", () => {
    expect(regions.sellControl.x).toBeGreaterThanOrEqual(regions.hud.x + regions.hud.w);
    // Both share the bottom row's vertical band.
    expect(regions.sellControl.y).toBeCloseTo(regions.hud.y, 0);
  });

  it("sellControl is detached from the bench (bench is the top row, sell the bottom-right)", () => {
    expect(regions.sellControl.x).toBeGreaterThan(regions.bench.x + regions.bench.w);
    expect(regions.sellControl.y).toBeGreaterThanOrEqual(regions.bench.y + regions.bench.h - 0.5);
  });

  it("interactive regions meet their touch-target minimums", () => {
    expect(regions.bench.h).toBeGreaterThanOrEqual(32);
    expect(regions.hud.h).toBeGreaterThanOrEqual(32);
    expect(regions.sellControl.h).toBeGreaterThanOrEqual(32);
  });

  it("readyButton is zeroed in landscape (READY is a DOM control)", () => {
    expect(regions.readyButton.w).toBe(0);
    expect(regions.readyButton.h).toBe(0);
  });

  it("opponentRail has enough height for a 1×8 vertical column (≥ 24px rows)", () => {
    expect(regions.opponentRail.h / 8).toBeGreaterThanOrEqual(24);
  });

  it("bench is NOT in the leftRail cluster (it lives in bottomBar)", () => {
    expect(regions.bench.x).toBeGreaterThan(regions.traitRail.x + regions.traitRail.w);
    expect(regions.bench.y).toBeGreaterThan(regions.traitRail.y);
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

// ── Portrait region geometry (UNTOUCHED — portrait is out of scope) ───────────

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

// ── Portrait height-driven layout (UNTOUCHED — portrait is out of scope) ──────

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
      expect(r.board.w).toBeGreaterThanOrEqual(336);
    });

    it(`sell control sits beside the bench at usableH=${usableH}`, () => {
      const layout = resolveLayout({ viewportW: 390, viewportH: usableH });
      const r = layout.regions;
      expect(r.bench.x).toBe(8);
      expect(r.bench.w).toBe(324);
      expect(r.sellControl.x).toBe(338);
      expect(r.sellControl.w).toBe(44);
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
    expect(r.board.h).toBeGreaterThanOrEqual(359);
    expect(r.shop.h).toBeGreaterThanOrEqual(83);
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
      expect(c.discY).toBeLessThan(c.nameY);
      expect(c.nameY).toBeLessThan(c.traitY);
      expect(c.traitY).toBeLessThan(c.tierY);
      expect(c.traitY + 7).toBeLessThan(c.tierY - 2);
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

  // Range of supported landscape viewports (design is now fixed 1280×592
  // regardless of viewport — these exercise different scale factors only).
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

      expect(withinBounds(reroll, layout.designW, layout.designH)).toBe(true);
      expect(withinBounds(buyXp, layout.designW, layout.designH)).toBe(true);

      expect(rectsOverlap(reroll, buyXp)).toBe(false);
      expect(reroll.w).toBeGreaterThanOrEqual(40);
      expect(buyXp.w).toBeGreaterThanOrEqual(40);
    });
  }
});

// ── 9-layer z-stack ordering (spec §4) ─────────────────────────────────────────

describe("scene 9-layer z-stack", () => {
  it("defines exactly 9 named layers, strictly ascending by VALUE", () => {
    // NOTE: SCENE_LAYER_ORDER/SCENE_LAYER_NAMES are sorted by each constant's
    // numeric VALUE (true stacking order), not by its L#_ name suffix — see
    // the IMPORTANT note in combatLayout.ts. L8_TOAST (suffix 8) sorts before
    // L6_INSPECT/L7_DOM_META (suffixes 6/7) in both arrays because toast's
    // VALUE places it lower in the stack (above HUD, below the modal layers).
    expect(SCENE_LAYER_ORDER.length).toBe(9);
    expect(SCENE_LAYER_NAMES.length).toBe(9);
    for (let i = 1; i < SCENE_LAYER_ORDER.length; i++) {
      expect(SCENE_LAYER_ORDER[i]!).toBeGreaterThan(SCENE_LAYER_ORDER[i - 1]!);
    }
  });

  it("L0 board env is the bottommost layer", () => {
    expect(L0_BOARD_ENV).toBe(Math.min(...SCENE_LAYER_ORDER));
  });

  it("L7 dom meta is the topmost layer (toast deviates below the modal layers)", () => {
    expect(L7_DOM_META).toBe(Math.max(...SCENE_LAYER_ORDER));
  });

  it("board content stacks L0 < L1 < L2 (env < grid < units)", () => {
    expect(L0_BOARD_ENV).toBeLessThan(L1_HEX_GRID);
    expect(L1_HEX_GRID).toBeLessThan(L2_UNITS);
  });

  it("watermark (L3) sits above units but below the frame (L4)", () => {
    expect(L3_WATERMARK).toBeGreaterThan(L2_UNITS);
    expect(L3_WATERMARK).toBeLessThan(L4_FRAME);
  });

  it("frame (L4) sits below HUD chrome (L5)", () => {
    expect(L4_FRAME).toBeLessThan(L5_HUD);
  });

  it("HUD (L5) sits below the toast layer (L8)", () => {
    expect(L5_HUD).toBeLessThan(L8_TOAST);
  });

  it("toast (L8) sits above HUD (L5) — confirms existing toast-above-HUD z-order", () => {
    expect(L8_TOAST).toBeGreaterThan(L5_HUD);
  });

  it("toast (L8) sits below the modal layers (L6 inspect, L7 dom meta) per spec", () => {
    expect(L8_TOAST).toBeLessThan(L6_INSPECT);
    expect(L6_INSPECT).toBeLessThan(L7_DOM_META);
  });
});
