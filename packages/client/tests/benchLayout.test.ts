import { describe, it, expect } from "vitest";
import { benchGeom, benchSlotAtX } from "../src/benchLayout.js";

const W = 390;
const Y = 532;

describe("benchGeom", () => {
  it("fits 9 slots + the sell control within the design width with margins", () => {
    const g = benchGeom(W, Y);
    const railRight = g.startCx - g.slotW / 2 + 9 * g.slotW;
    expect(g.startCx - g.slotW / 2).toBeCloseTo(8, 5); // left margin
    expect(railRight).toBeCloseTo(g.sellX - 6, 5);     // gap before sell control
    expect(g.sellX + g.sellW).toBeCloseTo(W - 8, 5);   // right margin
  });

  it("gives a larger touch target than the old 32x32 slot", () => {
    const g = benchGeom(W, Y);
    // Full-cell hit rect (slotW x slotH) must exceed the previous 32x32 = 1024px².
    expect(g.slotW * g.slotH).toBeGreaterThan(32 * 32);
    expect(g.slotH).toBeGreaterThanOrEqual(34);
  });

  it("centers the row on benchY", () => {
    const g = benchGeom(W, Y);
    expect(g.top + g.slotH / 2).toBe(Y);
  });
});

describe("benchSlotAtX", () => {
  const g = benchGeom(W, Y);
  it("maps each slot center to its index", () => {
    for (let i = 0; i < 9; i++) {
      expect(benchSlotAtX(g.startCx + i * g.slotW, g)).toBe(i);
    }
  });
  it("returns null outside the 9-slot band", () => {
    expect(benchSlotAtX(g.startCx - g.slotW, g)).toBeNull();
    expect(benchSlotAtX(g.startCx + 9 * g.slotW + 2, g)).toBeNull();
  });
  it("clamps the edges to valid indices", () => {
    expect(benchSlotAtX(g.startCx - g.slotW / 2 + 0.1, g)).toBe(0);
    expect(benchSlotAtX(g.startCx + 8 * g.slotW + g.slotW / 2 - 0.1, g)).toBe(8);
  });
});
