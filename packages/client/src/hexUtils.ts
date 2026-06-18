export const HEX_R = 24;
export const HEX_W = HEX_R * 2;
export const HEX_H = Math.round(HEX_R * 1.732);
export const BOARD_COLS = 7;
export const BOARD_ROWS = 4;
export const BOARD_SLOTS = BOARD_COLS * BOARD_ROWS;

/**
 * Circumradius (center→vertex) of the regular POINTY-TOP hexagon that tessellates
 * the offset lattice `hexToPixel` produces. The lattice is row-offset (each row
 * shifted by HEX_R), so its nearest neighbours are HEX_W apart in a row and
 * √(HEX_R²+HEX_H²) apart diagonally — i.e. a pointy-top packing (vertical edges
 * shared left/right, slanted edges shared on the diagonals). Two regular hexes
 * share an edge when their centres are R·√3 apart; sizing R to the (larger)
 * diagonal distance makes the slanted edges meet exactly and the vertical edges
 * overlap by a sub-pixel hair, so the field tiles with zero gaps (drawn in flat
 * board space, then projected — the homography preserves shared edges).
 */
export const HEX_TILE_R = Math.sqrt(HEX_R * HEX_R + HEX_H * HEX_H) / Math.sqrt(3);

/**
 * Convert board slot index to pixel center.
 * `scale` (default 1) shrinks/grows the grid spacing about (offsetX, offsetY);
 * landscape renders the fixed 7×4 grid scaled-to-fit its board region while
 * portrait keeps scale=1 (byte-identical to the original mapping).
 */
export function hexToPixel(
  q: number,
  r: number,
  offsetX: number,
  offsetY: number,
  scale = 1
): { x: number; y: number } {
  return {
    x: offsetX + (q * HEX_W + (r % 2) * HEX_R) * scale,
    y: offsetY + r * HEX_H * scale,
  };
}

/**
 * Map a pointer position to the nearest board slot index within the player's
 * 4 rows.  Returns -1 if the pointer is farther than HEX_R*scale from every
 * hex center. `scale` must match the value passed to hexToPixel.
 */
export function hexFromPointer(
  px: number,
  py: number,
  offsetX: number,
  offsetY: number,
  scale = 1
): number {
  let best = -1;
  let bestDist = (HEX_R * scale) ** 2; // squared threshold (scaled)
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let q = 0; q < BOARD_COLS; q++) {
      const { x, y } = hexToPixel(q, r, offsetX, offsetY, scale);
      const d2 = (px - x) ** 2 + (py - y) ** 2;
      if (d2 < bestDist) {
        bestDist = d2;
        best = r * BOARD_COLS + q;
      }
    }
  }
  return best;
}
