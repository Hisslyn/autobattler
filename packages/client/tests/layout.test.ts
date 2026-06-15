import { describe, it, expect } from "vitest";
import {
  resolveLayout,
  centeredModal,
  landscapeBenchSlotCenter,
  landscapeBenchSlotAt,
  LANDSCAPE_THRESHOLD,
  PORTRAIT_W, PORTRAIT_H,
  LANDSCAPE_W, LANDSCAPE_H,
} from "../src/layout.js";
import type { Rect, MatchLayout } from "../src/layout.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** True if rect A and rect B overlap (axis-aligned, exclusive right/bottom edge). */
function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + b.h > b.y  // intentional: rect b's height from b.y
  );
}

// Corrected overlap check using standard AABB test.
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

/** Core regions to check for non-overlap and bounds. */
function coreRegions(layout: MatchLayout): Rect[] {
  const { board, traitRail, opponentRail, shop, bench, hud, itemBar } = layout.regions;
  return [board, traitRail, opponentRail, shop, bench, hud, itemBar];
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
      { name: "itemBar",      r: regions.itemBar },
    ];
    for (const [a, b] of pairs(named)) {
      expect(rectsOverlap(a.r, b.r))
        .toBe(false);
    }
  });

  it("board panel is large enough to hold the hex grid", () => {
    // 7 cols × 48 = 336 wide; 8 rows × 42 + 12 gap = 348 tall.
    expect(regions.board.w).toBeGreaterThanOrEqual(336);
    expect(regions.board.h).toBeGreaterThanOrEqual(348);
  });

  it("board is horizontally centered in the design space", () => {
    const cx = regions.board.x + regions.board.w / 2;
    expect(cx).toBeCloseTo(designW / 2, 0);
  });

  it("statusRow spans the full design width", () => {
    expect(regions.statusRow.x).toBe(0);
    expect(regions.statusRow.w).toBe(designW);
  });

  it("bench has 9 slot positions (3×3 grid) that stay inside the bench rect", () => {
    for (let i = 0; i < 9; i++) {
      const { x, y } = landscapeBenchSlotCenter(i, regions.bench);
      expect(x).toBeGreaterThanOrEqual(regions.bench.x);
      expect(x).toBeLessThanOrEqual(regions.bench.x + regions.bench.w);
      expect(y).toBeGreaterThanOrEqual(regions.bench.y);
      expect(y).toBeLessThanOrEqual(regions.bench.y + regions.bench.h);
    }
  });

  it("traitRail and bench are in the left column (x < board.x)", () => {
    expect(regions.traitRail.x + regions.traitRail.w).toBeLessThanOrEqual(regions.board.x);
    expect(regions.bench.x + regions.bench.w).toBeLessThanOrEqual(regions.board.x);
  });

  it("opponentRail, hud, shop, readyButton are in the right column (x > board right)", () => {
    const boardRight = regions.board.x + regions.board.w;
    expect(regions.opponentRail.x).toBeGreaterThanOrEqual(boardRight);
    expect(regions.hud.x).toBeGreaterThanOrEqual(boardRight);
    expect(regions.shop.x).toBeGreaterThanOrEqual(boardRight);
    expect(regions.readyButton.x).toBeGreaterThanOrEqual(boardRight);
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
      { name: "itemBar",      r: regions.itemBar },
    ];
    for (const [a, b] of pairs(named)) {
      expect(rectsOverlap(a.r, b.r)).toBe(false);
    }
  });

  it("portrait board is at the existing hardcoded position", () => {
    // match.ts: BOARD_PANEL_X=8, BOARD_PANEL_Y=58, W=374, H=360
    expect(regions.board.x).toBe(8);
    expect(regions.board.y).toBe(58);
    expect(regions.board.w).toBe(374);
    expect(regions.board.h).toBe(360);
  });

  it("portrait uses design 390×844", () => {
    expect(layout.designW).toBe(390);
    expect(layout.designH).toBe(844);
  });
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
