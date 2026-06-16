// Pure layout module: resolves orientation, scale-to-fit, design dimensions,
// and named region rects for the match scene.  No Pixi, no DOM, no I/O.
// Mirror style: benchLayout.ts / hudModel.ts.
//
// Orientation rule
// ────────────────
// aspect = viewportW / viewportH
//   >= LANDSCAPE_THRESHOLD  →  landscape (design 844×390)
//   <  LANDSCAPE_THRESHOLD  →  portrait  (design 390×844)
//
// LANDSCAPE_THRESHOLD = 1.1 — a little above 1.0 so a square-ish phone still
// gets portrait; 16:9 landscape (≈1.78) and 19.5:9 landscape (≈2.17) both flip.
// Portrait is preserved below 1.1, which covers virtually all held-portrait phones
// (390×844 = 0.46 aspect).

export const LANDSCAPE_THRESHOLD = 1.1;

// ── Design dimensions ────────────────────────────────────────────────────────

export const PORTRAIT_W  = 390;
export const PORTRAIT_H  = 844;
export const LANDSCAPE_W = 844;
export const LANDSCAPE_H = 390;

// ── Geometry ─────────────────────────────────────────────────────────────────
// Board constants (mirrors hexUtils.ts — kept local so this module stays pure
// with zero cross-package imports).
const HEX_R    = 24;
const HEX_W    = HEX_R * 2;         // 48
const HEX_H    = Math.round(HEX_R * 1.732); // 42
const BOARD_COLS = 7;
const BOARD_ROWS = 4;

// Full hex grid span (both sides share the same W; H = both sides).
const BOARD_GRID_W = BOARD_COLS * HEX_W;             // 336
const BOARD_GRID_H_SIDE = BOARD_ROWS * HEX_H;        // 168
const BOARD_GRID_H = BOARD_GRID_H_SIDE * 2 + 12;     // 348  (12px gap between sides)

// ── Types ────────────────────────────────────────────────────────────────────

export interface Rect { x: number; y: number; w: number; h: number }

export interface SafeInsets {
  top:    number;
  right:  number;
  bottom: number;
  left:   number;
}

export interface MatchRegions {
  /** Full hex board panel (enemy rows + own rows), in design space. */
  board:        Rect;
  /** Opponent health/seat rail. */
  opponentRail: Rect;
  /** Trait tracker rail. */
  traitRail:    Rect;
  /** Shop 5-card strip. */
  shop:         Rect;
  /** 9-slot bench. */
  bench:        Rect;
  /** HUD cluster: gold / level+xp / streak / reroll / buy-xp. */
  hud:          Rect;
  /** Loose item inventory bar. */
  itemBar:      Rect;
  /** Ready button. */
  readyButton:  Rect;
  /** Stage chip + timer status row. */
  statusRow:    Rect;
  /** Sell control (beside bench). */
  sellControl:  Rect;
}

export interface MatchLayout {
  orientation: "landscape" | "portrait";
  /** Design-space width fed to Pixi. */
  designW: number;
  /** Design-space height fed to Pixi. */
  designH: number;
  /**
   * CSS pixel scale: multiply design coords by this to get CSS pixel coords.
   * Pixi canvas CSS size = designW*scale × designH*scale, centered.
   */
  scale: number;
  /**
   * CSS pixel offset of the canvas top-left corner inside the viewport.
   * Incorporates centering + safe-area insets so the canvas never sits under a notch.
   */
  canvasOffsetX: number;
  canvasOffsetY: number;
  /** Named rects, all in design space (multiply by scale for CSS pixels). */
  regions: MatchRegions;
  /** Portrait only: actual design height used (= usable viewport height). */
  portraitDesignH?: number;
}

export interface ResolveLayoutInput {
  viewportW: number;
  viewportH: number;
  /** Safe-area insets in CSS pixels (env(safe-area-inset-*)). Default 0. */
  safe?: Partial<SafeInsets>;
}

// ── Portrait layout ──────────────────────────────────────────────────────────
// Height-driven: the portrait design height equals the usable viewport height
// (viewport minus safe insets), the scale comes from width alone, and the lower
// region stack is budgeted with per-region minimums + surplus distribution so
// the 844px design case stays visually equivalent to the prior hardcoded values
// while shorter viewports fit the stack without globally shrinking.
//
// See PORTRAIT_LAYOUT_SPEC.md for the full algorithm.

// Static (never-scaled) top band heights.
const P_STATUS_Y = 4;
const P_STATUS_H = 24;
const P_RAIL_H   = 30;
const P_STATIC_H = P_STATUS_H + P_RAIL_H; // 54 (status margin + rail), board starts at 58
const P_BOARD_Y  = P_STATUS_Y + P_STATUS_H + P_RAIL_H; // 58

// Region minimum / design (max) heights.
const P_BOARD_MIN = 280;
const P_BOARD_MAX = 360;
const P_BOARD_FRAC = 360 / 844; // ≈ 0.4265

const P_TRAIT_MIN = 32;
const P_TRAIT_MAX = 44;
const P_TRAIT_FRAC = 0.145;

const P_HUD_MIN = 32,   P_HUD_MAX = 38;
const P_BENCH_MIN = 32, P_BENCH_MAX = 36;
const P_SHOP_MIN = 72,  P_SHOP_MAX = 84,  P_SHOP_MIN_FLOOR = 64;
const P_READY_H = 44;   // fixed touch target — never inflated, never compressed
const P_ITEM_MIN = 52,  P_ITEM_MAX = 68,  P_ITEM_MIN_FLOOR = 44;

const P_GAP_MAX = 8;
const P_GAP_MIN = 4;
const P_GAP_FLOOR = 3;
const P_GAP_COUNT = 8;

// Below this usable height the floor minimums for shop/itemBar/gap kick in.
const P_FLOOR_THRESHOLD = 680;

const P_MARGIN = 8;     // board / bench side margin
const P_COL_X  = 9;     // trait/hud/shop/ready/item column inset

/**
 * Pure budget algorithm: given the usable design height, returns the portrait
 * region rects. Unit-testable without viewport / scale logic.
 */
export function portraitRegions(designH: number): MatchRegions {
  const dW = PORTRAIT_W;
  const dH = Math.max(1, Math.round(designH));

  const lowFloor = dH < P_FLOOR_THRESHOLD;
  const shopMin = lowFloor ? P_SHOP_MIN_FLOOR : P_SHOP_MIN;
  const itemMin = lowFloor ? P_ITEM_MIN_FLOOR : P_ITEM_MIN;

  // Board claims a fraction of the height available below the static top band.
  const availableH = dH - P_STATIC_H;
  let boardH = clamp(P_BOARD_MIN, Math.round(availableH * P_BOARD_FRAC), P_BOARD_MAX);

  // Fixed lower regions at their minimums.
  const fixedSum = P_HUD_MIN + P_BENCH_MIN + shopMin + P_READY_H + itemMin;

  // Height left for trait rail + fixed lower regions + the 8 inter-region gaps.
  let remaining = availableH - boardH;

  // Target trait rail as a fraction of the leftover, then solve the gap.
  const traitTarget = clamp(P_TRAIT_MIN, Math.round(remaining * P_TRAIT_FRAC), P_TRAIT_MAX);
  const gapRaw = (remaining - traitTarget - fixedSum) / P_GAP_COUNT;
  const gapMin = lowFloor ? P_GAP_FLOOR : P_GAP_MIN;
  let gap = clamp(gapMin, Math.round(gapRaw), P_GAP_MAX);

  // Trait rail absorbs whatever the gap clamp left over.
  let traitH = clamp(P_TRAIT_MIN, remaining - fixedSum - P_GAP_COUNT * gap, P_TRAIT_MAX);

  // Region heights start at their minimums; surplus inflates them toward design.
  let hudH   = P_HUD_MIN;
  let benchH = P_BENCH_MIN;
  let shopH  = shopMin;
  const readyH = P_READY_H;
  let itemH  = itemMin;

  // ── Surplus distribution (section 3a) ─────────────────────────────────────
  // Anything still unused after the minimum stack inflates regions toward their
  // design values in priority order; the last bucket widens the gap.
  const usedNow = () =>
    P_STATIC_H + boardH + traitH + hudH + benchH + shopH + readyH + itemH + P_GAP_COUNT * gap;

  let surplus = dH - usedNow();
  if (surplus > 0) {
    // 1. board → 360
    const grow = (cur: number, max: number): [number, number] => {
      const add = Math.min(surplus, Math.max(0, max - cur));
      return [cur + add, surplus - add];
    };
    [boardH, surplus]  = grow(boardH, P_BOARD_MAX);
    [shopH,  surplus]  = grow(shopH,  P_SHOP_MAX);
    // readyButton intentionally fixed at 44 (saves thumb travel).
    [itemH,  surplus]  = grow(itemH,  P_ITEM_MAX);
    [hudH,   surplus]  = grow(hudH,   P_HUD_MAX);
    [benchH, surplus]  = grow(benchH, P_BENCH_MAX);
    [traitH, surplus]  = grow(traitH, P_TRAIT_MAX);
    // 8. gap up to 8, distributed evenly across the 8 gaps.
    if (surplus > 0 && gap < P_GAP_MAX) {
      const perGap = Math.min(P_GAP_MAX - gap, Math.floor(surplus / P_GAP_COUNT));
      gap += perGap;
      surplus -= perGap * P_GAP_COUNT;
    }
  }

  // ── Cumulate y positions from the static top band ─────────────────────────
  const colW = dW - 2 * P_COL_X;

  const boardY = P_BOARD_Y;
  const traitY = boardY + boardH + gap;
  const hudY   = traitY + traitH + gap;
  const benchY = hudY + hudH + gap;
  const shopY  = benchY + benchH + gap;
  const readyY = shopY + shopH + gap;
  const itemY  = readyY + readyH + gap;

  // sell control (right of bench)
  const sellW  = 44;
  const benchGap = 6;
  const railW  = dW - 2 * P_MARGIN;
  const benchW = railW - sellW - benchGap;
  const sellX  = P_MARGIN + benchW + benchGap;

  return {
    statusRow:    { x: 0,        y: P_STATUS_Y, w: dW,    h: P_STATUS_H },
    opponentRail: { x: 0,        y: P_STATUS_Y + P_STATUS_H, w: dW, h: P_RAIL_H },
    board:        { x: P_MARGIN, y: boardY, w: dW - 2 * P_MARGIN, h: boardH },
    traitRail:    { x: P_COL_X,  y: traitY, w: colW,  h: traitH },
    hud:          { x: P_COL_X,  y: hudY,   w: colW,  h: hudH },
    bench:        { x: P_MARGIN, y: benchY, w: benchW, h: benchH },
    sellControl:  { x: sellX,    y: benchY, w: sellW,  h: benchH },
    shop:         { x: P_COL_X,  y: shopY,  w: colW,  h: shopH },
    readyButton:  { x: P_COL_X,  y: readyY, w: colW,  h: readyH },
    itemBar:      { x: P_COL_X,  y: itemY,  w: colW,  h: itemH },
  };
}

function clamp(lo: number, v: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function portraitLayout(viewportW: number, viewportH: number, safe: SafeInsets): MatchLayout {
  const dW = PORTRAIT_W;

  // Usable viewport after safe insets.
  const usableW = Math.max(1, viewportW - safe.left - safe.right);
  const usableH = Math.max(1, viewportH - safe.top  - safe.bottom);

  // Height-driven: design height == usable height; scale comes from width only,
  // so the canvas fills the usable height exactly.
  const dH = usableH;
  const scale = usableW / dW;

  const scaledW = dW * scale;
  const scaledH = dH * scale;
  const canvasOffsetX = safe.left + (usableW - scaledW) / 2;
  const canvasOffsetY = safe.top  + (usableH - scaledH) / 2;

  const regions = portraitRegions(dH);

  return {
    orientation: "portrait",
    designW: dW,
    designH: dH,
    scale,
    canvasOffsetX,
    canvasOffsetY,
    regions,
    portraitDesignH: dH,
  };
}

// ── Landscape layout ─────────────────────────────────────────────────────────
//
// Edge-anchored design on 844×390 — the board is the dominant top-center
// element; every other region is a small cluster pinned to whichever screen
// edge/corner matches its function, rather than three even columns:
//
//  ┌─┬─────────┬──────────────────────────┬──────────────┐
//  │t│ bench    │                           │ opponentRail │
//  │R│ (3×3)    │       BOARD (dominant)    │   (2×4)      │
//  │ │          │       top-center,         ├──────────────┤
//  │ ├─────────┤       scaled-to-fit 8 rows │ hud cluster  │
//  │ │ itemBar  │                           ├──────────────┤
//  │ │          │       statusRow (under)   │ sellControl  │
//  │ │          │                           │ readyButton  │
//  ├─┴──────────┴──────────────────────────┴──────────────┤
//  │              shop (5 cards, full width, h=64)          │
//  └───────────────────────────────────────────────────────┘
//
// tR = traitRail (far-left edge, x=0, thin vertical strip — icon+count chips
//      stacked top-to-bottom; its OWN region, not inset into a shared column).
// bench (3×3 grid) + itemBar = left column INBOARD of the trait-rail strip
//      (x starts past the rail), shrunk vs the prior 3-even-column design since
//      the board now claims the dominant center-top position.
//
// Board: the dominant element — wider than the prior 352px panel. The full 7×4
// hex grid spans 336×348 at native HEX size; a full 348px grid plus a full-width
// 64px bottom shop exceeds the 390px design height, so the LANDSCAPE board grid
// is rendered SCALED-TO-FIT its board region (match.ts derives the scale from
// `board.w/h` vs the native grid span and feeds the same scaled mapping +
// token radius to combat/view.ts). Portrait stays scale=1. The board region is
// sized so the scaled 8-row grid + radius fits inside it with no clipping.
//
// opponentRail: top-right corner, a 2-col × 4-row vertical stack of small seat
// tiles (match.ts passes cols=2, rows=4 to opponentRailTile) — a compact corner
// cluster, not a column-spanning horizontal grid.
//
// shop: bottom edge, full design width (844), h=64 (touch-target floor) — 5
// cards run the full width, anchored to the bottom edge.
//
// sellControl: detached from bench — relocated into the right-edge cluster
// (just above readyButton, near the bottom shop) per the brief's "near the
// shop / bottom HUD cluster" guidance, rather than sitting beside bench.

function landscapeLayout(viewportW: number, viewportH: number, safe: SafeInsets): MatchLayout {
  const dW = LANDSCAPE_W;
  const dH = LANDSCAPE_H;

  const usableW = Math.max(1, viewportW - safe.left - safe.right);
  const usableH = Math.max(1, viewportH - safe.top  - safe.bottom);
  const scale = Math.min(usableW / dW, usableH / dH);

  const scaledW = dW * scale;
  const scaledH = dH * scale;
  // Notch is typically on the left in landscape; offset canvas right by safe.left
  // so content clears the notch, then center in the remaining usable space.
  const canvasOffsetX = safe.left  + (usableW - scaledW) / 2;
  const canvasOffsetY = safe.top   + (usableH - scaledH) / 2;

  // ── Bottom edge: shop (full-width strip) ──────────────────────────────────
  const shopH = 64;            // touch-target floor, exactly met
  const shopY = dH - shopH;    // 326

  // ── Far-left edge: traitRail (its own thin vertical strip) ───────────────
  const traitRailX = 0;
  const traitRailW = 28;
  const traitRailY = 6;
  const traitRailH = shopY - traitRailY - 4;   // 316 — spans almost the full column

  // ── Left column, INBOARD of traitRail: bench (3×3) + itemBar ─────────────
  const leftColX = traitRailX + traitRailW + 4;  // 32
  const leftColW = 150;                          // shrunk vs the prior 240
  const leftGap  = 6;

  const benchX = leftColX;
  const benchY = 6;
  const benchW = leftColW;
  const benchH = 200;                            // 3 rows × ~66.7px/slot

  const itemBarX = leftColX;
  const itemBarY = benchY + benchH + leftGap;    // 212
  const itemBarW = leftColW;
  const itemBarH = shopY - itemBarY - 4;         // 106 — ≥ 44 floor

  // ── Top-center: board (dominant element, grid scaled-to-fit by match.ts) ──
  const boardX = leftColX + leftColW + 8;        // 198
  const boardY = 6;
  // Right column reserved before computing board width.
  const rightColW = 158;
  const rightColX = dW - rightColW;              // 686
  const boardW = rightColX - 8 - boardX;         // 480 — dominant, well above 352
  // Board height fills down to a thin status band above the shop.
  const statusGap = 2;
  const statusH = 16;
  const boardH = shopY - boardY - statusH - statusGap; // 300

  // Status row: thin band directly under the board (same x/w as the board),
  // filling the small gap between the board's bottom and the shop's top edge.
  const statusY = boardY + boardH + statusGap;   // 308

  // ── Right edge: opponentRail (2×4) → hud → sellControl → readyButton ──────
  const rightGap = 6;

  const railY = 6;
  const railH = 156;        // 2 cols × 4 rows of small seat tiles (≥36px/row)

  const hudY = railY + railH + rightGap;   // 168
  const hudH = 64;

  const readyH = 44;                       // fixed touch target, never compressed
  const readyY = shopY - readyH - 6;       // 276 — sits just above the shop
  const sellH  = readyY - (hudY + hudH) - 2 * rightGap; // fills the remaining gap
  const sellY  = hudY + hudH + rightGap;   // 238

  const regions: MatchRegions = {
    board: {
      x: boardX,
      y: boardY,
      w: boardW,
      h: boardH,
    },
    statusRow: {
      x: boardX,
      y: statusY,
      w: boardW,
      h: statusH,
    },
    traitRail: {
      x: traitRailX,
      y: traitRailY,
      w: traitRailW,
      h: traitRailH,
    },
    bench: {
      x: benchX,
      y: benchY,
      w: benchW,
      h: benchH,
    },
    itemBar: {
      x: itemBarX,
      y: itemBarY,
      w: itemBarW,
      h: itemBarH,
    },
    opponentRail: {
      x: rightColX,
      y: railY,
      w: rightColW,
      h: railH,
    },
    hud: {
      x: rightColX,
      y: hudY,
      w: rightColW,
      h: hudH,
    },
    sellControl: {
      x: rightColX,
      y: sellY,
      w: rightColW,
      h: sellH,
    },
    readyButton: {
      x: rightColX,
      y: readyY,
      w: rightColW,
      h: readyH,
    },
    shop: {
      x: 0,
      y: shopY,
      w: dW,
      h: shopH,
    },
  };

  return {
    orientation: "landscape",
    designW: dW,
    designH: dH,
    scale,
    canvasOffsetX,
    canvasOffsetY,
    regions,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Resolve the active layout from the current viewport size and safe insets. */
export function resolveLayout(input: ResolveLayoutInput): MatchLayout {
  const { viewportW, viewportH } = input;
  const safe: SafeInsets = {
    top:    input.safe?.top    ?? 0,
    right:  input.safe?.right  ?? 0,
    bottom: input.safe?.bottom ?? 0,
    left:   input.safe?.left   ?? 0,
  };
  const aspect = viewportW / viewportH;
  if (aspect >= LANDSCAPE_THRESHOLD) {
    return landscapeLayout(viewportW, viewportH, safe);
  }
  return portraitLayout(viewportW, viewportH, safe);
}

/**
 * Center a modal within the safe usable area (design space).
 * When the content is taller than the viewport, the rect is sized to fit and
 * the caller should enable internal scrolling.
 *
 * @param layout  - active MatchLayout
 * @param contentW - desired modal width in design space
 * @param contentH - desired modal height in design space
 * @param pad      - minimum padding from the design edges
 */
export function centeredModal(
  layout: MatchLayout,
  contentW: number,
  contentH: number,
  pad = 20
): Rect {
  const { designW, designH } = layout;
  const maxW = designW - 2 * pad;
  const maxH = designH - 2 * pad;
  const w = Math.min(contentW, maxW);
  const h = Math.min(contentH, maxH);
  return {
    x: Math.round((designW - w) / 2),
    y: Math.round((designH - h) / 2),
    w,
    h,
  };
}

// ── Landscape-specific helpers ────────────────────────────────────────────────

/**
 * In landscape, the bench occupies 9 slots in a 3-col × 3-row grid inside
 * the left column.  Returns the pixel center of slot `i` (0..8) within the
 * bench region, in design space.
 */
export function landscapeBenchSlotCenter(
  i: number,
  bench: Rect
): { x: number; y: number } {
  const col = i % 3;
  const row = Math.floor(i / 3);
  const slotW = bench.w / 3;
  const slotH = bench.h / 3;
  return {
    x: bench.x + col * slotW + slotW / 2,
    y: bench.y + row * slotH + slotH / 2,
  };
}

/**
 * Map a pointer (px, py) in design space to a bench slot index 0..8, or null
 * if outside the bench region.  Works for the landscape 3×3 grid.
 */
export function landscapeBenchSlotAt(
  px: number,
  py: number,
  bench: Rect
): number | null {
  if (px < bench.x || px >= bench.x + bench.w) return null;
  if (py < bench.y || py >= bench.y + bench.h) return null;
  const col = Math.floor((px - bench.x) / (bench.w / 3));
  const row = Math.floor((py - bench.y) / (bench.h / 3));
  const idx = row * 3 + col;
  return Math.max(0, Math.min(8, idx));
}

// ── New pure helpers (polish pass) ─────────────────────────────────────────────

/** Named planning-phase region a pointer falls in (NH1). */
export type PlanningRegion =
  | { zone: "board"; slotIdx: number }
  | { zone: "bench"; slotIdx: number }
  | { zone: "sell" }
  | { zone: "itemBar"; itemIdx: number; itemCount: number }
  | { zone: "hud" }
  | { zone: "shop"; cardIdx: number }
  | { zone: "readyButton" }
  | null;

function inRect(px: number, py: number, r: Rect, pad = 0): boolean {
  return px >= r.x - pad && px <= r.x + r.w + pad && py >= r.y - pad && py <= r.y + r.h + pad;
}

/**
 * NH1 — hit-test which planning region a pointer is in. Pure consolidation of
 * the forgiving-bounds arithmetic match.ts spreads across its drag handlers.
 * Board slot index matches hexFromPointer (computed by the caller from the hex
 * geometry, then folded in here only as a region membership test). Sell uses
 * ±6px forgiving bounds. Returns the most specific interactive region, or null.
 */
export function planningRegionAt(
  px: number,
  py: number,
  layout: MatchLayout,
  boardSlot: number,
  benchSlot: number | null,
  itemCount: number,
  itemSlot: number,
  itemGap: number
): PlanningRegion {
  const r = layout.regions;
  // Order: most-specific interactive targets first.
  if (boardSlot >= 0) return { zone: "board", slotIdx: boardSlot };
  if (benchSlot !== null && inRect(px, py, r.bench, 7)) return { zone: "bench", slotIdx: benchSlot };
  if (inRect(px, py, r.sellControl, 6)) return { zone: "sell" };
  // Item bar: walk the chips (offset past the bag glyph) to find the slot.
  if (itemCount > 0 && inRect(px, py, r.itemBar, 6)) {
    const chipStartX = r.itemBar.x + 18 + itemSlot / 2;
    for (let i = 0; i < itemCount; i++) {
      const cx = chipStartX + i * (itemSlot + itemGap);
      if (px >= cx - itemSlot / 2 - itemGap / 2 && px <= cx + itemSlot / 2 + itemGap / 2) {
        return { zone: "itemBar", itemIdx: i, itemCount };
      }
    }
  }
  if (inRect(px, py, r.readyButton)) return { zone: "readyButton" };
  if (inRect(px, py, r.shop)) {
    const cardW = r.shop.w / 5;
    const cardIdx = Math.max(0, Math.min(4, Math.floor((px - r.shop.x) / cardW)));
    return { zone: "shop", cardIdx };
  }
  if (inRect(px, py, r.hud)) return { zone: "hud" };
  return null;
}

/** Geometry of one opponent-rail tile in a cols×rows grid (NH2). */
export interface RailTile {
  col: number; row: number;
  tileX: number; tileY: number;
  cx: number; cy: number;
  tileW: number; tileH: number;
}

/**
 * NH2 — pure tile geometry for the opponent rail grid. `renderHud` and any
 * overlay wanting to highlight a seat tile share this one computation.
 */
export function opponentRailTile(
  seatIdx: number,
  cols: number,
  rows: number,
  rail: Rect
): RailTile {
  const col = seatIdx % cols;
  const row = Math.floor(seatIdx / cols);
  const tileW = rail.w / cols;
  const tileH = rail.h / rows;
  const tileX = rail.x + col * tileW;
  const tileY = rail.y + row * tileH;
  return {
    col, row, tileX, tileY,
    cx: tileX + tileW / 2,
    cy: tileY + tileH / 2,
    tileW, tileH,
  };
}
