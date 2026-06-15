import { describe, it, expect } from "vitest";
import { benchGeom, benchSlotAtX, portraitBenchGeom } from "../src/benchLayout.js";
import type { Rect } from "../src/benchLayout.js";

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

  it("benchGeom with regionH=36 returns slotH=36", () => {
    const g = benchGeom(W, Y, 36);
    expect(g.slotH).toBe(36);
  });
});

describe("portraitBenchGeom", () => {
  const bench: Rect = { x: 8, y: 524, w: 312, h: 36 };

  it("slotW is one-ninth of the bench width", () => {
    const g = portraitBenchGeom(bench);
    expect(g.slotW).toBeCloseTo(bench.w / 9, 5);
  });

  it("startCx is the center of slot 0 within the bench bounds", () => {
    const g = portraitBenchGeom(bench);
    expect(g.startCx).toBeGreaterThanOrEqual(bench.x);
    expect(g.startCx).toBeLessThanOrEqual(bench.x + bench.w);
    expect(g.startCx).toBeCloseTo(bench.x + g.slotW / 2, 5);
  });

  it("slot 8 center stays within the bench right edge", () => {
    const g = portraitBenchGeom(bench);
    expect(g.startCx + 8 * g.slotW).toBeLessThanOrEqual(bench.x + bench.w);
  });

  it("slotH and centerY track the region", () => {
    const g = portraitBenchGeom(bench);
    expect(g.slotH).toBe(bench.h);
    expect(g.centerY).toBe(bench.y + bench.h / 2);
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
