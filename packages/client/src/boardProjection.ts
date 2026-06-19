// Board perspective projection — renderer-only, the SINGLE source of truth for
// how the client warps the flat hex board into a tilted trapezoid and back.
//
// The sim, rules and protocol stay in flat hex-grid coordinates and never see
// this module. "Board space" = the flat design-space pixel coordinates produced
// by hexToPixel (today's mapping, unchanged). forward() warps a board-space
// point into the tilted screen point; inverse() recovers the board-space point
// from a screen point (null when the screen point lies outside the board).
//
// forward/inverse are an exact pair: both come from one 3×3 homography and its
// matrix inverse, so any point round-trips. When the destination defaults to the
// source rect, BOARD_TILT = 0 is the identity (byte-identical to a flat board).
// The mapping is a true projective (perspective) transform — the far edge narrows
// AND rows foreshorten — so the source rectangle renders as a trapezoid: near edge
// (player/bottom) wide, far edge (enemy/top) narrow.
//
// A separate `dst` rect lets the (near-square) board-space grid be warped onto a
// WIDE, SHALLOW on-screen footprint: the grid fills `rect` uniformly, and the
// homography stretches it across `dst` (near edge = dst.w, far edge = dst.w·(1−t)),
// so the hexes lay back as one coherent perspective grid. forward/inverse stay an
// exact pair (still one homography + its inverse) regardless of dst.
import { BOARD_TILT } from "./theme.js";

export interface Pt {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Row-major 3×3 homogeneous matrix.
type Mat3 = [number, number, number, number, number, number, number, number, number];

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Homography mapping the unit square — corners (0,0),(1,0),(1,1),(0,1) — onto
 * the four given points (Heckbert's projective mapping). Returns the affine form
 * when the points form a parallelogram.
 */
function squareToQuad(p0: Pt, p1: Pt, p2: Pt, p3: Pt): Mat3 {
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;
  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) {
    // Affine (parallelogram): bottom row is [0,0,1].
    return [p1.x - p0.x, p3.x - p0.x, p0.x, p1.y - p0.y, p3.y - p0.y, p0.y, 0, 0, 1];
  }
  const denom = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / denom;
  const h = (dx1 * sy - sx * dy1) / denom;
  return [
    p1.x - p0.x + g * p1.x, p3.x - p0.x + h * p3.x, p0.x,
    p1.y - p0.y + g * p1.y, p3.y - p0.y + h * p3.y, p0.y,
    g, h, 1,
  ];
}

function mul(a: Mat3, b: Mat3): Mat3 {
  const r = new Array<number>(9).fill(0);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += a[i * 3 + k]! * b[k * 3 + j]!;
      r[i * 3 + j] = s;
    }
  }
  return r as Mat3;
}

function inv(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const Cc = d * h - e * g;
  const det = a * A + b * B + c * Cc;
  const id = 1 / det;
  return [
    A * id, (c * h - b * i) * id, (b * f - c * e) * id,
    B * id, (a * i - c * g) * id, (c * d - a * f) * id,
    Cc * id, (b * g - a * h) * id, (a * e - b * d) * id,
  ];
}

function apply(m: Mat3, p: Pt): Pt {
  const x = m[0] * p.x + m[1] * p.y + m[2];
  const y = m[3] * p.x + m[4] * p.y + m[5];
  const w = m[6] * p.x + m[7] * p.y + m[8];
  return { x: x / w, y: y / w };
}

export interface BoardProjection {
  /** Source rectangle (board space) this projection was built from. */
  readonly rect: Rect;
  /** The effective tilt amount (clamped). */
  readonly tilt: number;
  /** Projected screen corners of `rect` (the rendered trapezoid). */
  readonly corners: { tl: Pt; tr: Pt; br: Pt; bl: Pt };
  /** Board-space → screen. */
  forward(p: Pt): Pt;
  /** Screen → board-space, or null if the screen point is off the board. */
  inverse(p: Pt): Pt | null;
  /**
   * Screen → board-space WITHOUT the off-board bounds check (always returns a
   * point). For surfaces that extend the same ground plane beyond `rect` — e.g.
   * a front bench platform butted against the board's near edge — so they share
   * the board's exact forward/inverse mapping.
   */
  inverseRaw(p: Pt): Pt;
  /**
   * Depth scale multiplier at a board-space point: ≈1 at the near (bottom) edge,
   * shrinking toward the far (top) edge. Equals the projection's local
   * horizontal magnification, so entities scale exactly with the ground.
   */
  scaleAt(p: Pt): number;
}

/**
 * Build a perspective projection mapping board-space `rect` onto an on-screen
 * destination trapezoid. `tilt` defaults to the themed BOARD_TILT.
 *
 * `dst` is the screen-space footprint the board renders into; it defaults to
 * `rect` (in which case tilt = 0 is the exact identity, the flat-board case).
 * The destination's near (bottom) edge spans `dst.w`; its far (top) edge narrows
 * to `(1 − tilt)·dst.w` about the dst center. When `dst` differs from `rect` the
 * homography also scales the grid from board space onto the wider/shallower
 * footprint — forward/inverse remain exact inverses either way.
 *
 * forward/inverse operate in `rect`'s board space; inverse returns null when the
 * recovered board point falls outside `rect` (+ a forgiving edge margin).
 */
export function makeBoardProjection(
  rect: Rect,
  tilt: number = BOARD_TILT,
  dst: Rect = rect
): BoardProjection {
  const { x, y, w, h } = rect;
  const t = clamp(tilt, 0, 0.9);
  const k = 1 - t; // top-edge half-width factor (far edge narrows toward center)

  // Source rectangle (unit-square corner order: TL, TR, BR, BL).
  const s0: Pt = { x, y };
  const s1: Pt = { x: x + w, y };
  const s2: Pt = { x: x + w, y: y + h };
  const s3: Pt = { x, y: y + h };
  // Destination trapezoid (screen space): bottom edge full `dst` width, top edge
  // narrowed about the dst center. The homography supplies the row foreshortening
  // (and any source→dst scaling) for free.
  const dcx = dst.x + dst.w / 2;
  const dhw = dst.w / 2;
  const d0: Pt = { x: dcx - dhw * k, y: dst.y };
  const d1: Pt = { x: dcx + dhw * k, y: dst.y };
  const d2: Pt = { x: dst.x + dst.w, y: dst.y + dst.h };
  const d3: Pt = { x: dst.x, y: dst.y + dst.h };

  const fwdM = mul(squareToQuad(d0, d1, d2, d3), inv(squareToQuad(s0, s1, s2, s3)));
  const invM = inv(fwdM);
  const eps = Math.max(1e-3, w * 1e-4);
  // Forgiving off-board margin so edge taps still resolve to a board point.
  const margin = Math.max(2, w * 0.02);

  return {
    rect,
    tilt: t,
    corners: { tl: d0, tr: d1, br: d2, bl: d3 },
    forward: (p) => apply(fwdM, p),
    inverse: (p) => {
      const bp = apply(invM, p);
      if (bp.x < x - margin || bp.x > x + w + margin || bp.y < y - margin || bp.y > y + h + margin) {
        return null;
      }
      return bp;
    },
    inverseRaw: (p) => apply(invM, p),
    scaleAt: (p) => {
      const a = apply(fwdM, p);
      const b = apply(fwdM, { x: p.x + eps, y: p.y });
      return Math.abs(b.x - a.x) / eps;
    },
  };
}
