import { describe, it, expect } from "vitest";
import { makeBoardProjection } from "../src/boardProjection.js";
import type { Pt, Rect } from "../src/boardProjection.js";

const RECT: Rect = { x: 20, y: 100, w: 350, h: 360 };

function near(a: Pt, b: Pt, tol = 1e-6): void {
  expect(a.x).toBeCloseTo(b.x, 4);
  expect(a.y).toBeCloseTo(b.y, 4);
  void tol;
}

describe("makeBoardProjection — tilt = 0 is the identity", () => {
  const p = makeBoardProjection(RECT, 0);
  it("forward is identity", () => {
    for (const pt of [{ x: 30, y: 120 }, { x: 200, y: 300 }, { x: 369, y: 459 }]) {
      near(p.forward(pt), pt);
    }
  });
  it("inverse is identity inside the rect", () => {
    const pt = { x: 150, y: 250 };
    near(p.inverse(pt)!, pt);
  });
  it("scaleAt is 1 everywhere", () => {
    expect(p.scaleAt({ x: 30, y: 120 })).toBeCloseTo(1, 5);
    expect(p.scaleAt({ x: 300, y: 440 })).toBeCloseTo(1, 5);
  });
});

describe("makeBoardProjection — forward/inverse are exact inverses", () => {
  const p = makeBoardProjection(RECT, 0.22);
  it("round-trips board → screen → board", () => {
    for (let gy = 0; gy <= 6; gy++) {
      for (let gx = 0; gx <= 6; gx++) {
        const bp = { x: RECT.x + (RECT.w * gx) / 6, y: RECT.y + (RECT.h * gy) / 6 };
        const round = p.inverse(p.forward(bp));
        expect(round).not.toBeNull();
        near(round!, bp);
      }
    }
  });
  it("round-trips screen → board → screen", () => {
    const c = p.corners;
    const mid = { x: (c.tl.x + c.br.x) / 2, y: (c.tl.y + c.br.y) / 2 };
    near(p.forward(p.inverse(mid)!), mid);
  });
});

describe("makeBoardProjection — true trapezoid (near wide, far narrow)", () => {
  const p = makeBoardProjection(RECT, 0.22);
  it("keeps the near (bottom) edge full width", () => {
    expect(p.corners.bl.x).toBeCloseTo(RECT.x, 4);
    expect(p.corners.br.x).toBeCloseTo(RECT.x + RECT.w, 4);
  });
  it("narrows the far (top) edge symmetrically about center", () => {
    const cx = RECT.x + RECT.w / 2;
    const topW = p.corners.tr.x - p.corners.tl.x;
    const botW = p.corners.br.x - p.corners.bl.x;
    expect(topW).toBeLessThan(botW);
    expect(topW).toBeCloseTo(RECT.w * (1 - 0.22), 4);
    // symmetric: top edge centered on the board center
    expect((p.corners.tl.x + p.corners.tr.x) / 2).toBeCloseTo(cx, 4);
  });
  it("a far-edge segment maps narrower than the same near-edge segment", () => {
    const farA = p.forward({ x: RECT.x + 100, y: RECT.y });
    const farB = p.forward({ x: RECT.x + 200, y: RECT.y });
    const nearA = p.forward({ x: RECT.x + 100, y: RECT.y + RECT.h });
    const nearB = p.forward({ x: RECT.x + 200, y: RECT.y + RECT.h });
    expect(farB.x - farA.x).toBeLessThan(nearB.x - nearA.x);
  });
  it("foreshortens rows: equal board-y steps bunch toward the far edge", () => {
    const cx = RECT.x + RECT.w / 2;
    const yTop = p.forward({ x: cx, y: RECT.y }).y;
    const yMid = p.forward({ x: cx, y: RECT.y + RECT.h / 2 }).y;
    const yBot = p.forward({ x: cx, y: RECT.y + RECT.h }).y;
    // The mid row sits below the geometric midpoint (compressed toward the top).
    expect(yMid - yTop).toBeLessThan(yBot - yMid);
  });
});

describe("makeBoardProjection — depth scale", () => {
  const p = makeBoardProjection(RECT, 0.22);
  it("near edge ≈ 1, far edge < near edge", () => {
    const sNear = p.scaleAt({ x: RECT.x + RECT.w / 2, y: RECT.y + RECT.h });
    const sFar = p.scaleAt({ x: RECT.x + RECT.w / 2, y: RECT.y });
    expect(sNear).toBeGreaterThan(sFar);
    expect(sNear).toBeCloseTo(1, 2);
    expect(sFar).toBeLessThan(1);
  });
});

describe("makeBoardProjection — off-board inverse is null", () => {
  const p = makeBoardProjection(RECT, 0.22);
  it("returns null well outside the projected board", () => {
    expect(p.inverse({ x: -200, y: 250 })).toBeNull();
    expect(p.inverse({ x: 250, y: -200 })).toBeNull();
    expect(p.inverse({ x: 250, y: 2000 })).toBeNull();
  });
  it("returns a point for a screen point inside the trapezoid", () => {
    const c = p.corners;
    const center = { x: (c.tl.x + c.tr.x + c.br.x + c.bl.x) / 4, y: (c.tl.y + c.br.y) / 2 };
    expect(p.inverse(center)).not.toBeNull();
  });
});
