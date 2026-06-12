import { describe, it, expect } from "vitest";
import { hexFromPointer, hexToPixel, HEX_R, BOARD_COLS } from "../src/hexUtils.js";

const OX = 27; // arbitrary offsetX
const OY = 265; // arbitrary offsetY

describe("hexFromPointer", () => {
  it("returns correct slot when pointer is exactly on hex center", () => {
    for (let r = 0; r < 4; r++) {
      for (let q = 0; q < BOARD_COLS; q++) {
        const { x, y } = hexToPixel(q, r, OX, OY);
        const slot = hexFromPointer(x, y, OX, OY);
        expect(slot).toBe(r * BOARD_COLS + q);
      }
    }
  });

  it("returns -1 when pointer is far from any hex", () => {
    // Far above the board
    const slot = hexFromPointer(OX, OY - HEX_R * 10, OX, OY);
    expect(slot).toBe(-1);
  });

  it("returns nearest hex for pointer slightly off-center", () => {
    const { x, y } = hexToPixel(3, 2, OX, OY);
    const slot = hexFromPointer(x + 4, y - 3, OX, OY);
    expect(slot).toBe(2 * BOARD_COLS + 3);
  });

  it("returns -1 when pointer is equidistant between hexes and outside threshold", () => {
    // Point far to the left
    const slot = hexFromPointer(-200, OY, OX, OY);
    expect(slot).toBe(-1);
  });
});
