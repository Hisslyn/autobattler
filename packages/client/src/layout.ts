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
// Three-column design on 844×390:
//
//  ┌─ LEFT (w≈240) ──────┬─ CENTER (w=352) ──────────┬─ RIGHT (w≈234) ──────┐
//  │ statusRow (h=22)    │ statusRow (h=22)           │ statusRow (h=22)     │
//  ├─────────────────────┤                             ├──────────────────────┤
//  │ traitRail           │  BOARD PANEL               │ opponentRail         │
//  │ (vertical chips)    │  enemy zone  (4 rows)      │  (8 tiles 4×2)       │
//  │ (h=172)             │  ──────────────────        │  (h=64)              │
//  │                     │  player zone (4 rows)      ├──────────────────────┤
//  ├─────────────────────┤                             │ hud (gold/xp/streak) │
//  │ bench (3×3 grid)    │                             │  (h=46)              │
//  │  (h=108, 36/slot)   │                             ├──────────────────────┤
//  │                     │                             │ shop (5 cards, tall) │
//  ├─────────────────────┤                             │  (h≈152)             │
//  │ sellControl (h=32)  │                             ├──────────────────────┤
//  ├─────────────────────┤                             │ readyButton (h=32)   │
//  │ itemBar (h=36)      │                             │                      │
//  └─────────────────────┴────────────────────────────┴──────────────────────┘
//
// Board panel: needs to fit 7 cols × 48 = 336w, 8 rows × 42 + 12 = 348h.
// In landscape dH=390.  Board panel h=358 (6px margin top+bottom), w=352 (8px side).
// Board is horizontally centered in the center column.
//
// Left col: trait rail (vertical) + 9-slot bench (3 rows × 3 cols) + sell + item bar.
// Bench slots are 36px tall (vs 32 before) so a r=13 unit token has breathing room.
// Stack sums to exactly dH-contentTop (364px) — fills the column top-to-bottom.
//
// Right col: opponent rail (8 tiles 4×2, 32px tall each) + HUD + shop + ready.
// Shop height fills remaining right-column space after other elements so the
// column does not leave a large empty gap at the bottom.
//
// Items (itemBar) appear on the LEFT so the dominant planning gesture (drag item
// onto board units) stays entirely on the left side of the screen.
// The Ready button + shop cards stay on the RIGHT, thumb-reachable with the right hand.

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

  // ── Column geometry ───────────────────────────────────────────────────────
  const margin = 6;

  // Center column: wide enough for the board grid + 2×8 side margins.
  const boardPanelW = BOARD_GRID_W + 16;   // 336 + 16 = 352
  const boardPanelH = BOARD_GRID_H + 10;   // 348 + 10 = 358

  // Board panel centered vertically in dH.
  const boardPanelX = Math.round((dW - boardPanelW) / 2);   // ~246
  const boardPanelY = Math.round((dH - boardPanelH) / 2);   // ~16

  // Left column: from x=0 to the left edge of the board panel.
  const leftColW  = boardPanelX - margin;    // ~240
  const leftColX  = margin;

  // Right column: from the right edge of the board panel to dW.
  const rightColX = boardPanelX + boardPanelW + margin;
  const rightColW = dW - rightColX - margin;

  // ── Status row (all three columns share the same y=0 band) ───────────────
  const statusH = 22;
  const contentTop = statusH + 4;  // y where column content begins

  // ── Left column regions ───────────────────────────────────────────────────
  // Trait rail: vertical strip of chips.
  // The four left-column regions + three inter-gaps must sum to dH-contentTop (364px):
  //   traitRailH(172) + 4 + benchH(108) + 4 + sellH(32) + 4 + itemBarH(36) = 360px
  //   leaving a 4px bottom margin — fills cleanly without overflow.
  const traitRailH = 172;
  const traitRailY = contentTop;

  // Bench: 9 slots arranged 3 cols × 3 rows in the left column.
  // Each slot is leftColW/3 wide × 36px tall — 36 gives a r=13 token 5px top/bottom
  // breathing room vs the 3px margin the previous 32px produced.
  const benchSlotCols = 3;
  const benchSlotRows = 3;  // 9 slots
  const benchSlotW   = Math.floor(leftColW / benchSlotCols);
  const benchSlotH   = 36;
  const benchH       = benchSlotRows * benchSlotH; // 108
  const benchY       = traitRailY + traitRailH + 4;

  // Sell control: full-width strip below bench.
  const sellH        = 32;
  const sellY        = benchY + benchH + 4;

  // Item bar: full-width strip, bottom of left column.
  const itemBarH     = 36;
  const itemBarY     = sellY + sellH + 4;

  // ── Right column regions ──────────────────────────────────────────────────
  // Opponent rail: 8 tiles in a 4×2 grid (4 wide, 2 tall).
  // Tile height raised from 28→32: avatar (r=8, span=18px) + HP bar bottom at 22px
  // from tile top — 32px gives 10px breathing vs the previous 6px.
  const railTileW   = Math.floor(rightColW / 4);
  // Raised 32→36 so the seat number + the level label (now below the disc) +
  // the HP bar all fit without overlapping inside one tile.
  const railTileH   = 36;
  const railCols    = 4;
  const railRows    = 2;
  const railH       = railRows * railTileH;   // 72
  const railY       = contentTop;

  // HUD row: gold + xp + streak + buttons.
  const hudH        = 46;
  const hudY        = railY + railH + 6;

  // Shop: 5 cards — in landscape they run in a single wide row.
  // shopCardH fills remaining right-column space after the fixed elements so the
  // right column does not leave a large empty gap at the bottom.
  // Fixed overhead: statusH(22) + gap(4) + railH(64) + gap(6) + hudH(46) + gap(6)
  //                 + readyH(32) + gap(6) + gap(6, shop-to-ready) = 192px
  // Available for shop: dH - 192 = 198px, capped at 152 for visual balance.
  const shopCardW   = Math.floor(rightColW / 5) - 2;
  const shopY       = hudY + hudH + 6;
  const readyH      = 32;
  // Compute max shop height that leaves room for the ready button and a bottom margin.
  const shopCardH   = Math.min(152, dH - shopY - readyH - 6 - 6);
  const shopH       = shopCardH;

  // Ready button: below shop.
  const readyY      = shopY + shopH + 6;

  // Item bar on right: secondary location (items primarily on the left;
  // this slot is reserved but visually redundant — kept for API parity).
  // We repurpose it as extra HUD overflow / hidden (w=0 sentinel) so the
  // existing right-side layout math stays clean.
  // For the spec, itemBar refers to the LEFT column bar.

  // ── Assemble regions ─────────────────────────────────────────────────────
  const regions: MatchRegions = {
    statusRow: {
      x: 0,
      y: 0,
      w: dW,
      h: statusH,
    },
    board: {
      x: boardPanelX,
      y: boardPanelY,
      w: boardPanelW,
      h: boardPanelH,
    },
    traitRail: {
      x: leftColX,
      y: traitRailY,
      w: leftColW,
      h: traitRailH,
    },
    bench: {
      x: leftColX,
      y: benchY,
      w: leftColW,
      h: benchH,
    },
    sellControl: {
      x: leftColX,
      y: sellY,
      w: leftColW,
      h: sellH,
    },
    itemBar: {
      x: leftColX,
      y: itemBarY,
      w: leftColW,
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
    shop: {
      x: rightColX,
      y: shopY,
      w: rightColW,
      h: shopH,
    },
    readyButton: {
      x: rightColX,
      y: readyY,
      w: rightColW,
      h: readyH,
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
 * @param pad      - minimum padding from the safe-area edges (design units, default 20)
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
