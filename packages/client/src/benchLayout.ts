// Pure layout math for the 9-slot bench rail + the sell control beside it.
// Extracted so hit-target geometry is testable without Pixi.

export interface BenchGeom {
  /** Slot height (taller than wide for comfortable thumb targets). */
  slotH: number;
  /** Sell control width. */
  sellW: number;
  /** Width of a single bench slot. */
  slotW: number;
  /** X center of slot 0. */
  startCx: number;
  /** Left X of the sell control. */
  sellX: number;
  /** Top Y of the rail (slots + sell control share this). */
  top: number;
}

/**
 * Compute bench/sell geometry for a given design width and the bench row's
 * vertical center. 8px side margins; 9 slots; a fixed-width sell control on the
 * right with a 6px gap.
 */
export function benchGeom(designW: number, benchY: number): BenchGeom {
  const slotH = 34;
  const sellW = 44;
  const margin = 8;
  const gap = 6;
  const railW = designW - 2 * margin;
  const benchW = railW - sellW - gap;
  const slotW = benchW / 9;
  return {
    slotH,
    sellW,
    slotW,
    startCx: margin + slotW / 2,
    sellX: margin + benchW + gap,
    top: benchY - slotH / 2,
  };
}

/**
 * Map a pointer x within the bench rail to a slot index 0..8, or null if the x
 * falls outside the 9-slot band. Used by drag-drop to choose the target slot.
 */
export function benchSlotAtX(x: number, geom: BenchGeom): number | null {
  const left = geom.startCx - geom.slotW / 2;
  const right = left + 9 * geom.slotW;
  if (x < left || x >= right) return null;
  return Math.max(0, Math.min(8, Math.floor((x - left) / geom.slotW)));
}
