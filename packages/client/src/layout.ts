// Pure layout module: resolves orientation, scale-to-fit, design dimensions,
// and named region rects for the match scene.  No Pixi, no DOM, no I/O.
// Mirror style: benchLayout.ts / hudModel.ts.
//
// Orientation rule
// ────────────────
// aspect = viewportW / viewportH
//   >= LANDSCAPE_THRESHOLD  →  landscape (design 1280×592)
//   <  LANDSCAPE_THRESHOLD  →  portrait  (design 390×844)
//
// LANDSCAPE_THRESHOLD = 1.1 — a little above 1.0 so a square-ish phone still
// gets portrait; 16:9 landscape (≈1.78) and 19.5:9 landscape (≈2.17) both flip.
// Portrait is preserved below 1.1, which covers virtually all held-portrait phones
// (390×844 = 0.46 aspect).
//
// ── Landscape region architecture (stage 1 of the design-bible rewrite) ───────
// Landscape moved from an 844×390 edge-anchored design to a 1280×592 reference
// canvas (aspect 2.162:1) built from a 4-fixed-edge-cluster + residual-board
// model:
//   - topBar, leftRail, rightRail, bottomBar are FIXED reference dimensions,
//     clamped to a [min,max] per cluster (see LS_* constants below). They
//     never stretch past their max even when the viewport has surplus space.
//   - the board fills whatever rect remains in the center after the 4 edge
//     clusters are placed, then scales-to-fit preserving the hex-grid aspect
//     ratio inside that residual rect (match.ts's existing boardScale getter
//     already does its own scale-to-fit math from regions.board — unchanged).
//   - each cluster's start position is max(safeInset_for_that_edge, baseMargin)
//     so no interactive element ever sits under a device notch on either short
//     landscape edge. Device safe-area insets arrive in CSS px (from main.ts's
//     #safe-probe env(safe-area-inset-*) read); they're converted to DESIGN
//     units (divided by the design↔CSS scale factor) before being compared
//     against LS_BASE_MARGIN, since the cluster solve itself runs in the fixed
//     1280×592 design space.
// Portrait is completely unaffected — portraitRegions/portraitLayout below are
// byte-for-byte unchanged from the prior stage.

export const LANDSCAPE_THRESHOLD = 1.1;

// ── Design dimensions ────────────────────────────────────────────────────────

export const PORTRAIT_W  = 390;
export const PORTRAIT_H  = 844;
/**
 * Landscape reference canvas (stage-1 rewrite). Replaces the prior 844×390.
 * Aspect 1280/592 ≈ 2.162:1 — wider than a typical 16:9 phone (1.78) so 16:9
 * and 4:3 devices both exercise the surplus/clamp logic in landscapeLayout.
 */
export const LANDSCAPE_W = 1280;
export const LANDSCAPE_H = 592;

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
  /** Trait tracker rail (shared tab-content area for traits tab OR items browse tab). */
  traitRail:    Rect;
  /**
   * Landscape only: the two tab-switcher buttons ("1" traits / "2" items) that
   * toggle what fills the traitRail region. In portrait this rect is zeroed
   * (portrait has no tab switcher — both tabs sit in the same rail).
   */
  traitTabBar:  Rect;
  /** Shop 5-card strip. */
  shop:         Rect;
  /** 9-slot bench. */
  bench:        Rect;
  /** HUD cluster: gold / level+xp / streak / reroll / buy-xp. */
  hud:          Rect;
  /** Ready button. */
  readyButton:  Rect;
  /** Stage chip + timer status row. */
  statusRow:    Rect;
  /** Sell control (beside bench). */
  sellControl:  Rect;
}

/**
 * Landscape-only: the 4 fixed-dimension edge clusters of the stage-1 region
 * architecture, exposed alongside the legacy per-widget MatchRegions (which
 * still carries the same names match.ts reads — see landscapeLayout). Each
 * existing region rect is positioned INSIDE one of these 4 cluster rects;
 * this type documents/exposes that grouping for tests and future stages.
 * Undefined in portrait (portrait keeps its own independent stack).
 */
export interface LandscapeClusters {
  topBar:    Rect;
  leftRail:  Rect;
  rightRail: Rect;
  bottomBar: Rect;
  /** Residual central rect the board scales-to-fit inside. */
  boardArea: Rect;
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
  /** Landscape only: the 4-cluster + residual-board breakdown (stage 1). */
  clusters?: LandscapeClusters;
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
//
// NOT TOUCHED by the stage-1 landscape rewrite — kept byte-for-byte identical.

// Static (never-scaled) top band heights.
const P_STATUS_Y = 4;
const P_STATUS_H = 24;
const P_RAIL_H   = 30;
const P_STATIC_H = P_STATUS_H + P_RAIL_H; // 54 (status margin + rail), board starts at 58
const P_BOARD_Y  = P_STATUS_Y + P_STATUS_H + P_RAIL_H; // 58

// Region minimum / design (max) heights.
const P_BOARD_MIN = 280;
const P_BOARD_MAX = 392;
const P_BOARD_FRAC = 360 / 844; // ≈ 0.4265

const P_TRAIT_MIN = 32;
const P_TRAIT_MAX = 44;
const P_TRAIT_FRAC = 0.145;

const P_HUD_MIN = 32,   P_HUD_MAX = 38;
const P_BENCH_MIN = 32, P_BENCH_MAX = 36;
const P_SHOP_MIN = 72,  P_SHOP_MAX = 84,  P_SHOP_MIN_FLOOR = 64;
const P_READY_H = 44;   // fixed touch target — never inflated, never compressed

const P_GAP_MAX = 8;
const P_GAP_MIN = 4;
const P_GAP_FLOOR = 3;
const P_GAP_COUNT = 7;

// Below this usable height the floor minimums for shop/gap kick in.
const P_FLOOR_THRESHOLD = 680;

const P_MARGIN = 8;     // board / bench side margin
const P_COL_X  = 9;     // trait/hud/shop/ready column inset

/**
 * Pure budget algorithm: given the usable design height, returns the portrait
 * region rects. Unit-testable without viewport / scale logic.
 */
export function portraitRegions(designH: number): MatchRegions {
  const dW = PORTRAIT_W;
  const dH = Math.max(1, Math.round(designH));

  const lowFloor = dH < P_FLOOR_THRESHOLD;
  const shopMin = lowFloor ? P_SHOP_MIN_FLOOR : P_SHOP_MIN;

  // Board claims a fraction of the height available below the static top band.
  const availableH = dH - P_STATIC_H;
  let boardH = clamp(P_BOARD_MIN, Math.round(availableH * P_BOARD_FRAC), P_BOARD_MAX);

  // Fixed lower regions at their minimums.
  const fixedSum = P_HUD_MIN + P_BENCH_MIN + shopMin + P_READY_H;

  // Height left for trait rail + fixed lower regions + the 7 inter-region gaps.
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

  // ── Surplus distribution (section 3a) ─────────────────────────────────────
  // Anything still unused after the minimum stack inflates regions toward their
  // design values in priority order; the last bucket widens the gap.
  const usedNow = () =>
    P_STATIC_H + boardH + traitH + hudH + benchH + shopH + readyH + P_GAP_COUNT * gap;

  let surplus = dH - usedNow();
  if (surplus > 0) {
    // 1. board → its design max
    const grow = (cur: number, max: number): [number, number] => {
      const add = Math.min(surplus, Math.max(0, max - cur));
      return [cur + add, surplus - add];
    };
    [boardH, surplus]  = grow(boardH, P_BOARD_MAX);
    [shopH,  surplus]  = grow(shopH,  P_SHOP_MAX);
    // readyButton intentionally fixed at 44 (saves thumb travel).
    [hudH,   surplus]  = grow(hudH,   P_HUD_MAX);
    [benchH, surplus]  = grow(benchH, P_BENCH_MAX);
    [traitH, surplus]  = grow(traitH, P_TRAIT_MAX);
    // last: gap up to 8, distributed evenly across the 7 gaps.
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

  // sell control (right of bench)
  const sellW  = 44;
  const benchGap = 6;
  const railW  = dW - 2 * P_MARGIN;
  const benchW = railW - sellW - benchGap;
  const sellX  = P_MARGIN + benchW + benchGap;

  // Portrait has no tab switcher — traitTabBar is zeroed.
  const zeroRect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  return {
    statusRow:    { x: 0,        y: P_STATUS_Y, w: dW,    h: P_STATUS_H },
    opponentRail: { x: 0,        y: P_STATUS_Y + P_STATUS_H, w: dW, h: P_RAIL_H },
    board:        { x: P_MARGIN, y: boardY, w: dW - 2 * P_MARGIN, h: boardH },
    traitRail:    { x: P_COL_X,  y: traitY, w: colW,  h: traitH },
    traitTabBar:  zeroRect,
    hud:          { x: P_COL_X,  y: hudY,   w: colW,  h: hudH },
    bench:        { x: P_MARGIN, y: benchY, w: benchW, h: benchH },
    sellControl:  { x: sellX,    y: benchY, w: sellW,  h: benchH },
    shop:         { x: P_COL_X,  y: shopY,  w: colW,  h: shopH },
    readyButton:  { x: P_COL_X,  y: readyY, w: colW,  h: readyH },
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

// ── Landscape layout (4-cluster + residual-board architecture) ────────────────
//
// Reference canvas 1280×592 (aspect 2.162:1).
//
//  ┌──────────────────── topBar (statusRow: stage · timer · menu) ───────────┐
//  ├───────────┬───────────────────────────────────────────────┬────────────┤
//  │ leftRail  │                                                │ rightRail  │
//  │ (trait    │              board (residual, centered         │ (opponent- │
//  │  tab bar  │               on the SAFE-AREA center,         │  Rail ONLY │
//  │  + trait/ │               grown to the largest hex-aspect  │  — a 1×8   │
//  │  items    │               box that clears the wider rail)  │  vertical  │
//  │  rail)    │                                                │  column)   │
//  ├───────────┴───────────────────────────────────────────────┴────────────┤
//  │  bench row (centered under the board)                                    │
//  │  [ econ cluster ]                                         [ sell ]        │
//  └───────────────────────────────────────────────────────────────────────-┘
//
// Cluster contents:
//   topBar    = statusRow (stage label left, timer center, menu right)
//   leftRail  = traitTabBar + traitRail
//   rightRail = opponentRail ONLY (1×8 vertical seat column)
//   bottomBar = two stacked rows: bench (top) + [econ | sell] (bottom)
//   board     = residual central rect, centered on the safe-area center
//
// Each edge cluster has a FIXED reference thickness, clamped to a per-cluster
// [min,max] (see LS_* constants); surplus space goes to the board, never to a
// cluster. Each cluster's leading edge sits at max(safeInsetDesign,
// LS_BASE_MARGIN) so nothing hides under a device notch.

/** Minimum starting margin for every edge cluster, used whenever the device
 *  safe-area inset for that edge is smaller than this (in design units). */
export const LS_BASE_MARGIN = 12;

/** Gap between an edge cluster and the central board / between cluster edges. */
export const LS_GAP = 10;

// Per-cluster fixed reference dimension + clamp range.
//   topBar    — only the thin statusRow band (stage / timer / menu).
//   bottomBar — the single bottom controls row: [econ | sell | shop-toggle].
//               The bench is NO LONGER here — it butts the board's front edge
//               (see the board/bench solve below), so bottomBar shrank to just
//               the corner controls and the freed height went to the board.
//   leftRail  — trait tab bar + trait/items rail (unchanged).
//   rightRail — opponentRail ONLY (a single 1×8 vertical column of seat tiles).
const LS_TOPBAR_H_REF = 40,     LS_TOPBAR_H_MIN = 30,     LS_TOPBAR_H_MAX = 56;
const LS_BOTTOMBAR_H_REF = 60,  LS_BOTTOMBAR_H_MIN = 52,  LS_BOTTOMBAR_H_MAX = 72;
const LS_LEFTRAIL_W_REF = 120,  LS_LEFTRAIL_W_MIN = 96,   LS_LEFTRAIL_W_MAX = 160;
const LS_RIGHTRAIL_W_REF = 120, LS_RIGHTRAIL_W_MIN = 80, LS_RIGHTRAIL_W_MAX = 130;

// Minimum board footprint. The board is now a WIDE, SHALLOW perspective slab —
// its near (bottom) edge spans most of the width between the rails and it lays
// well back (boardProjection), so the floor is a wide-min / short-min pair.
const LS_BOARD_MIN_W = 320;
const LS_BOARD_MIN_H = 240;

// ── Board / bench sizing (wide-shallow board butted directly by the bench) ────
// The board's near (bottom) edge targets this fraction of the design width, then
// is capped to clear both rails by a small margin (the board centers on the
// safe-area center). The far (top) edge narrows via BOARD_TILT in the renderer.
const LS_BOARD_NEAR_FRAC = 0.75;
// Board + bench together fill this fraction of the vertical span between the top
// bar and the bottom edge; the remainder is the bottom controls row.
const LS_BOARD_BENCH_FRAC = 0.88;
// Small clearance kept between the board's near edge and each rail.
const LS_BOARD_RAIL_MARGIN = 8;
// Tiny gap below the status bar before the board begins.
const LS_BOARD_TOP_GAP = 4;

// The two bottom-corner medallion buttons (Buy XP left / shop-toggle right) are
// circular and span the bench + bottom-controls rows, so their TOP edge overhangs
// ABOVE the bench. The opponent rail (right column) shares the right edge with the
// shop button, so its bottom must clear that overhang. This is the footprint half
// (radius + rim) at the button's max radius cap; the rail bottom is capped above
// (corner-button top − LS_CORNER_GAP) so Player 8 never sits under the shop button.
const LS_CORNER_BTN_MAX_R = 56;        // buyXpGeom radius cap (mirror of hudModel)
const LS_CORNER_BTN_RIM_FRAC = 0.16;   // rimW = r * 0.16 (mirror of hudModel)
const LS_CORNER_GAP = 6;               // visible gap between rail bottom and button top

/**
 * Pure cluster-dimension solve, exposed for tests: given the usable design
 * width/height, returns each fixed-edge cluster's clamped thickness.
 * Independent of position — landscapeRegionsFor positions clusters using
 * these thicknesses plus LS_BASE_MARGIN / safe-inset margins.
 */
export function landscapeClusterThickness(
  usableW: number,
  usableH: number
): { topBarH: number; bottomBarH: number; leftRailW: number; rightRailW: number } {
  // Reference values clamp to their own [min,max] regardless of viewport — they
  // are FIXED dimensions per the spec, not scaled by the viewport. The clamp
  // exists so a future stage could re-tune the reference constants without
  // ever producing a degenerate (too-small or runaway) cluster.
  const topBarH    = clamp(LS_TOPBAR_H_MIN,    LS_TOPBAR_H_REF,    LS_TOPBAR_H_MAX);
  const bottomBarH = clamp(LS_BOTTOMBAR_H_MIN, LS_BOTTOMBAR_H_REF, LS_BOTTOMBAR_H_MAX);
  const leftRailW  = clamp(LS_LEFTRAIL_W_MIN,  LS_LEFTRAIL_W_REF,  LS_LEFTRAIL_W_MAX);
  const rightRailW = clamp(LS_RIGHTRAIL_W_MIN, LS_RIGHTRAIL_W_REF, LS_RIGHTRAIL_W_MAX);

  // Defensive floor: on a viewport far smaller than the reference, shrink the
  // rails/bars toward their MIN (never below it) so the residual board area
  // never goes negative. This only engages on viewports tighter than any
  // currently-supported device; on all tested aspects (16:9, 4:3, 2.162:1+)
  // the reference values already fit comfortably alongside LS_BOARD_MIN_*.
  const maxBarsW = Math.max(0, usableW - LS_BOARD_MIN_W);
  const maxBarsH = Math.max(0, usableH - LS_BOARD_MIN_H);
  let lw = leftRailW, rw = rightRailW, tb = topBarH, bb = bottomBarH;
  if (lw + rw > maxBarsW && maxBarsW > 0) {
    const scaleDown = maxBarsW / (lw + rw);
    lw = Math.max(LS_LEFTRAIL_W_MIN * scaleDown, 1);
    rw = Math.max(LS_RIGHTRAIL_W_MIN * scaleDown, 1);
  }
  if (tb + bb > maxBarsH && maxBarsH > 0) {
    const scaleDown = maxBarsH / (tb + bb);
    tb = Math.max(LS_TOPBAR_H_MIN * scaleDown, 1);
    bb = Math.max(LS_BOTTOMBAR_H_MIN * scaleDown, 1);
  }

  return { topBarH: tb, bottomBarH: bb, leftRailW: lw, rightRailW: rw };
}

/**
 * Landscape region solve. Builds the 4 fixed-edge clusters (clamped, positioned
 * at max(safeInsetDesign, LS_BASE_MARGIN) per edge) and the residual board, then
 * slots the named widgets into their cluster.
 *
 * Cluster mapping:
 *   topBar    = statusRow (stage · timer · menu)
 *   leftRail  = traitTabBar + traitRail
 *   rightRail = opponentRail ONLY (1×8 vertical seat column)
 *   bottomBar = bench (top row) + [econ(hud) | sellControl] (bottom row)
 *   board     = residual central rect, CENTERED on the safe-area center, grown
 *               to the largest hex-aspect (336:348) box that clears the WIDER of
 *               leftRail/rightRail symmetrically on both sides
 *
 * @param designW design-space width (always LANDSCAPE_W, 1280)
 * @param designH design-space height (always LANDSCAPE_H, 592)
 * @param safeDesign safe-area insets ALREADY CONVERTED to design units
 *   (CSS-px inset ÷ the design↔CSS scale factor) by the caller.
 */
/**
 * Pure: the TOP y of a bottom-corner medallion button whose circular footprint
 * spans the region [regionTop, regionBottom]. Mirrors match.ts's buyXpFootprint
 * (buyXpGeom radius cap + rim fraction) so the rail-clearance math here stays in
 * lockstep with the rendered button diameter. `regionW` is the button region's
 * width (only narrows the radius on very tight viewports — usually not binding).
 */
export function bottomCornerButtonTop(
  regionTop: number,
  regionBottom: number,
  regionW: number
): number {
  const regionH = Math.max(1, regionBottom - regionTop);
  const r = Math.max(16, Math.min(regionH / 2 - 1, regionW * 0.34, LS_CORNER_BTN_MAX_R));
  const rimW = Math.max(2.5, r * LS_CORNER_BTN_RIM_FRAC);
  const cy = regionTop + regionH / 2;
  return cy - (r + rimW);
}

function landscapeRegionsFor(
  designW: number,
  designH: number,
  safeDesign: SafeInsets
): { regions: MatchRegions; clusters: LandscapeClusters } {
  const { topBarH, bottomBarH, leftRailW, rightRailW } = landscapeClusterThickness(designW, designH);

  // Each cluster's leading edge clears the device notch: max(safeInset, baseMargin).
  const topY    = Math.max(safeDesign.top,    LS_BASE_MARGIN);
  const leftX   = Math.max(safeDesign.left,   LS_BASE_MARGIN);
  const rightM  = Math.max(safeDesign.right,  LS_BASE_MARGIN);
  const bottomM = Math.max(safeDesign.bottom, LS_BASE_MARGIN);

  // The safe-area horizontal center — the board, the bench, and the statusRow
  // cluster (stage + timer) all center on THIS.
  const contentRight = designW - rightM;
  const safeCenterX = (leftX + contentRight) / 2;

  const topBar: Rect = { x: leftX, y: topY, w: contentRight - leftX, h: topBarH };

  // ── Vertical budget: status bar → bottom edge splits into the board+bench
  // band (≈88%) and the bottom controls row (the remainder). ────────────────
  const vTop = topBar.y + topBar.h;
  const vBot = designH - bottomM;
  const vSpace = Math.max(1, vBot - vTop);

  // Bottom controls row (econ | sell | shop-toggle) — pinned to the bottom. Its
  // fixed thickness (LS_BOTTOMBAR_*) is ≈ the (1 − LS_BOARD_BENCH_FRAC) remainder
  // of the vertical span; the board + bench claim the rest.
  const controlsH = Math.min(bottomBarH, Math.max(LS_BOTTOMBAR_H_MIN, Math.round(vSpace * (1 - LS_BOARD_BENCH_FRAC))));
  const controlsY = vBot - controlsH;
  const bottomBar: Rect = { x: leftX, y: controlsY, w: contentRight - leftX, h: controlsH };

  // Bench butts the board's front (bottom) edge — no gap — so board + bench read
  // as one continuous play area. The bench stays flat/upright (not projected).
  const boardTop = vTop + LS_BOARD_TOP_GAP;
  const benchH = clamp(36, Math.round(vSpace * 0.085), 52);
  const benchTop = controlsY - LS_BOARD_TOP_GAP - benchH;
  const boardH = Math.max(LS_BOARD_MIN_H, benchTop - boardTop);

  // The rails flank the board+bench band. Their bottoms are capped to clear the
  // bottom-corner medallion buttons (Buy XP left / shop-toggle right), whose
  // circular footprints overhang ABOVE the bench (see LS_CORNER_* constants). The
  // right rail shares the right screen edge with the shop button, so Player 8 must
  // sit above the shop button's top; the left rail (trait rail) gets the same cap
  // for symmetry (it shares the left edge with the Buy XP button).
  const railTop = boardTop;
  // Full board+bench band height — what the board scales into (boardArea below).
  const bandH = Math.max(1, benchTop + benchH - railTop);
  // The button region spans from the bench top down to the bottom of the controls
  // row (match.ts buyXpRegionLandscape); its width is the wide left gutter, so it
  // never narrows the radius — pass designW so the helper uses the true height cap.
  const cornerBtnTop = bottomCornerButtonTop(benchTop, controlsY + controlsH, designW);
  const railBottomCap = cornerBtnTop - LS_CORNER_GAP;
  // The rendered rails stop above the corner buttons so the opponent column's
  // bottom tile (Player 8) clears the shop button's footprint. The board's
  // residual area (boardArea) keeps the FULL band height — only the rail rects
  // shorten.
  const railH = Math.max(1, Math.min(railTop + bandH, railBottomCap) - railTop);
  const leftRail: Rect  = { x: leftX, y: railTop, w: leftRailW, h: railH };
  const rightRail: Rect = { x: contentRight - rightRailW, y: railTop, w: rightRailW, h: railH };

  // ── Board width: target the near edge at LS_BOARD_NEAR_FRAC of the design
  // width, capped so it clears the WIDER rail symmetrically (smaller clearance
  // on BOTH sides keeps it centered + clear). Wide near edge, shallow height. ─
  const leftClear  = safeCenterX - (leftRail.x + leftRail.w);
  const rightClear = rightRail.x - safeCenterX;
  const halfCap = Math.max(1, Math.min(leftClear, rightClear) - LS_BOARD_RAIL_MARGIN);
  const boardHalfW = Math.min((LS_BOARD_NEAR_FRAC * designW) / 2, halfCap);
  const boardW = Math.max(LS_BOARD_MIN_W, 2 * boardHalfW);
  const board: Rect = {
    x: Math.round(safeCenterX - boardW / 2),
    y: Math.round(boardTop),
    w: Math.round(boardW),
    h: Math.round(boardH),
  };

  // Residual band between the rails that holds board + bench (board occupies the
  // top, bench the bottom). Exposed for tests; the board centers on the safe-area
  // center, not this rect's center.
  const boardArea: Rect = {
    x: leftRail.x + leftRail.w + LS_GAP,
    y: railTop,
    w: Math.max(1, rightRail.x - LS_GAP - (leftRail.x + leftRail.w + LS_GAP)),
    h: bandH,
  };

  const clusters: LandscapeClusters = { topBar, leftRail, rightRail, bottomBar, boardArea };

  // ── topBar content: statusRow — a thin band spanning the full topBar so its
  // center sits on the safe-area center (= the board center). ──────────────
  const statusH = Math.min(22, topBar.h);
  const statusRow: Rect = { x: topBar.x, y: topBar.y, w: topBar.w, h: statusH };

  // ── leftRail content: tab bar (top strip) + traitRail (remainder) ─────────
  const tabBtnH = 20;
  const traitTabBar: Rect = { x: leftRail.x, y: leftRail.y, w: leftRail.w, h: tabBtnH };
  const traitRail: Rect = {
    x: leftRail.x,
    y: leftRail.y + tabBtnH + 4,
    w: leftRail.w,
    h: Math.max(1, leftRail.h - tabBtnH - 4),
  };

  // ── rightRail content: opponentRail ONLY (1×8 vertical column). ───────────
  const opponentRail: Rect = { x: rightRail.x, y: rightRail.y, w: rightRail.w, h: rightRail.h };

  // ── bench: a 1×9 row centered on the safe-area center, butted against the
  // board's front edge (benchTop = board bottom). ───────────────────────────
  const benchSlotSize = clamp(36, benchH, 52);
  const benchW = 9 * benchSlotSize;
  const benchX = clamp(board.x, safeCenterX - benchW / 2, board.x + board.w - benchW);
  const bench: Rect = { x: benchX, y: benchTop, w: benchW, h: benchSlotSize };

  // ── bottomBar content: [econ(hud) | sellControl | shop-toggle] in one row. ─
  const econW = clamp(200, Math.round(bottomBar.w * 0.18), 250);
  const sellW = 64;
  const shopBtnW = 96;
  const colGap = 8;
  const hud: Rect = { x: bottomBar.x, y: controlsY, w: econW, h: controlsH };
  // The money-sack shop toggle owns the bottom-RIGHTMOST corner (gold lives
  // inside it now); sell sits immediately to its left. `shop` carries the
  // toggle-button rect (the shop cards themselves remain drop-down-only).
  const shopX = bottomBar.x + bottomBar.w - shopBtnW;
  const sellControl: Rect = { x: shopX - colGap - sellW, y: controlsY, w: sellW, h: controlsH };
  const shop: Rect = { x: shopX, y: controlsY, w: shopBtnW, h: controlsH };

  // readyButton is not rendered in landscape (READY is a DOM control) — zeroed.
  const readyButton: Rect = { x: 0, y: 0, w: 0, h: 0 };

  const regions: MatchRegions = {
    board,
    statusRow,
    opponentRail,
    traitRail,
    traitTabBar,
    bench,
    hud,
    sellControl,
    readyButton,
    shop,
  };

  return { regions, clusters };
}

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

  // Region/cluster solve operates in DESIGN space (0,0)..(dW,dH) — the design
  // canvas itself is what gets scaled+offset onto the physical viewport, so
  // clusters are built against the fixed 1280×592 reference, not the raw
  // viewport. Device safe-area insets (CSS px) are converted to design units
  // by dividing by the same scale factor, so a real notch still pushes each
  // cluster's leading edge inward by the correct DESIGN-space amount.
  const safeDesign: SafeInsets = scale > 0
    ? {
        top:    safe.top    / scale,
        right:  safe.right  / scale,
        bottom: safe.bottom / scale,
        left:   safe.left   / scale,
      }
    : { top: 0, right: 0, bottom: 0, left: 0 };
  const { regions, clusters } = landscapeRegionsFor(dW, dH, safeDesign);

  return {
    orientation: "landscape",
    designW: dW,
    designH: dH,
    scale,
    canvasOffsetX,
    canvasOffsetY,
    regions,
    clusters,
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
 * In landscape, the bench occupies 9 slots in a single 1×9 horizontal row
 * inside the bench region (centered below the board).  Returns the pixel
 * center of slot `i` (0..8) within the bench region, in design space.
 */
export function landscapeBenchSlotCenter(
  i: number,
  bench: Rect
): { x: number; y: number } {
  const slotW = bench.w / 9;
  return {
    x: bench.x + i * slotW + slotW / 2,
    y: bench.y + bench.h / 2,
  };
}

/**
 * Map a pointer (px, py) in design space to a bench slot index 0..8, or null
 * if outside the bench region.  Works for the landscape 1×9 single row.
 */
export function landscapeBenchSlotAt(
  px: number,
  py: number,
  bench: Rect
): number | null {
  if (px < bench.x || px >= bench.x + bench.w) return null;
  if (py < bench.y || py >= bench.y + bench.h) return null;
  const col = Math.floor((px - bench.x) / (bench.w / 9));
  return Math.max(0, Math.min(8, col));
}

// ── New pure helpers (polish pass) ─────────────────────────────────────────────

/** Named planning-phase region a pointer falls in (NH1). */
export type PlanningRegion =
  | { zone: "board"; slotIdx: number }
  | { zone: "bench"; slotIdx: number }
  | { zone: "sell" }
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
  benchSlot: number | null
): PlanningRegion {
  const r = layout.regions;
  // Order: most-specific interactive targets first.
  if (boardSlot >= 0) return { zone: "board", slotIdx: boardSlot };
  if (benchSlot !== null && inRect(px, py, r.bench, 7)) return { zone: "bench", slotIdx: benchSlot };
  if (inRect(px, py, r.sellControl, 6)) return { zone: "sell" };
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

/** Vertical content offsets for a shop card of height `cardH` (pure). */
export interface ShopCardContentLayout {
  /** Disc (token) center y, relative to the card top. */
  discY: number;
  /** Disc radius. */
  discR: number;
  /** Name label baseline y, relative to the card top. */
  nameY: number;
  /** Trait line y, relative to the card top. */
  traitY: number;
  /** Tier/cost row y, relative to the card top. */
  tierY: number;
}

/**
 * Proportional shop-card content offsets so the card reads correctly across the
 * full variable card height (shop.h ∈ [64, 84]). The tier/cost row is pinned to
 * the bottom; the trait line is clamped so it always clears it (traitY+7 < tierY-2).
 */
export function shopCardContentLayout(cardH: number): ShopCardContentLayout {
  const discR = Math.min(17, cardH * 0.2);
  const tierY = cardH - 9;
  const traitRaw = cardH * 0.71;
  // Guarantee the trait line sits above the tier/cost row: traitY ≤ (tierY-2) - 10.
  const traitY = Math.min(traitRaw, tierY - 2 - 10);
  return {
    discY: cardH * 0.31,
    discR,
    nameY: cardH * 0.57,
    traitY,
    tierY,
  };
}
