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
}

export interface ResolveLayoutInput {
  viewportW: number;
  viewportH: number;
  /** Safe-area insets in CSS pixels (env(safe-area-inset-*)). Default 0. */
  safe?: Partial<SafeInsets>;
}

// ── Portrait layout ──────────────────────────────────────────────────────────
// Faithfully encodes the existing match.ts constant positions so the portrait
// path is a drop-in replacement that returns rects matching the current layout.

function portraitLayout(viewportW: number, viewportH: number, safe: SafeInsets): MatchLayout {
  const dW = PORTRAIT_W;
  const dH = PORTRAIT_H;

  // Usable viewport after safe insets.
  const usableW = Math.max(1, viewportW - safe.left - safe.right);
  const usableH = Math.max(1, viewportH - safe.top  - safe.bottom);
  const scale = Math.min(usableW / dW, usableH / dH);

  const scaledW = dW * scale;
  const scaledH = dH * scale;
  const canvasOffsetX = safe.left  + (usableW - scaledW) / 2;
  const canvasOffsetY = safe.top   + (usableH - scaledH) / 2;

  // Mirror existing constants from match.ts:
  const STATUS_Y      = 4;
  const RAIL_Y        = 28;
  const BOARD_PANEL_X = 8;
  const BOARD_PANEL_W = dW - 16;
  const BOARD_PANEL_Y = 58;
  const BOARD_PANEL_H = 360;
  const TRAIT_STRIP_Y = 426;
  const HUD_ROW_Y     = 476;
  const HUD_ROW_H     = 38;
  const BENCH_Y       = 532;
  const SHOP_Y        = 574;
  const SHOP_CARD_H   = 84;
  const SHOP_START_X  = 9;
  const READY_Y       = SHOP_Y + SHOP_CARD_H + 10;
  const ITEM_BAR_Y    = READY_Y + 40;
  const ITEM_SLOT     = 30;

  // sell control (from benchGeom logic: right of bench)
  const margin  = 8;
  const sellW   = 44;
  const gap     = 6;
  const railW   = dW - 2 * margin;
  const benchW  = railW - sellW - gap;
  const sellX   = margin + benchW + gap;

  const regions: MatchRegions = {
    statusRow:    { x: 0,            y: STATUS_Y,     w: dW,           h: 24 },
    opponentRail: { x: 0,            y: RAIL_Y,       w: dW,           h: 30 },
    board:        { x: BOARD_PANEL_X, y: BOARD_PANEL_Y, w: BOARD_PANEL_W, h: BOARD_PANEL_H },
    traitRail:    { x: SHOP_START_X, y: TRAIT_STRIP_Y, w: dW - 2 * SHOP_START_X, h: 44 },
    hud:          { x: SHOP_START_X, y: HUD_ROW_Y,   w: dW - 2 * SHOP_START_X, h: HUD_ROW_H },
    bench:        { x: margin,       y: BENCH_Y - 17, w: benchW,       h: 34 },
    sellControl:  { x: sellX,        y: BENCH_Y - 17, w: sellW,        h: 34 },
    shop:         { x: SHOP_START_X, y: SHOP_Y,       w: dW - 2 * SHOP_START_X, h: SHOP_CARD_H },
    readyButton:  { x: SHOP_START_X, y: READY_Y,      w: dW - 2 * SHOP_START_X, h: 34 },
    itemBar:      { x: SHOP_START_X, y: ITEM_BAR_Y,   w: dW - 2 * SHOP_START_X, h: ITEM_SLOT },
  };

  return { orientation: "portrait", designW: dW, designH: dH, scale, canvasOffsetX, canvasOffsetY, regions };
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
  const railTileH   = 32;
  const railCols    = 4;
  const railRows    = 2;
  const railH       = railRows * railTileH;   // 64
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
