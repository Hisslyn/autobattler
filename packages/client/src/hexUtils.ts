export const HEX_R = 24;
export const HEX_W = HEX_R * 2;
export const HEX_H = Math.round(HEX_R * 1.732);
export const BOARD_COLS = 7;
export const BOARD_ROWS = 4;
export const BOARD_SLOTS = BOARD_COLS * BOARD_ROWS;

/** Convert board slot index to pixel center. */
export function hexToPixel(
  q: number,
  r: number,
  offsetX: number,
  offsetY: number
): { x: number; y: number } {
  return {
    x: offsetX + q * HEX_W + (r % 2) * HEX_R,
    y: offsetY + r * HEX_H,
  };
}

/**
 * Map a pointer position to the nearest board slot index within the player's
 * 4 rows.  Returns -1 if the pointer is farther than HEX_R from every hex center.
 */
export function hexFromPointer(
  px: number,
  py: number,
  offsetX: number,
  offsetY: number
): number {
  let best = -1;
  let bestDist = HEX_R * HEX_R; // squared threshold
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let q = 0; q < BOARD_COLS; q++) {
      const { x, y } = hexToPixel(q, r, offsetX, offsetY);
      const d2 = (px - x) ** 2 + (py - y) ** 2;
      if (d2 < bestDist) {
        bestDist = d2;
        best = r * BOARD_COLS + q;
      }
    }
  }
  return best;
}
