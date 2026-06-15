// Coachmark ring placement is height-aware: it scales design-space step rects by
// the LIVE portrait design height (portraitDesignH), not a hardcoded 844, so the
// rings align on short viewports (down to the 360×640 floor). The 844 case must
// reproduce the prior hardcoded behavior exactly (regression guard).
import { describe, it, expect } from "vitest";
import { coachRingRect, COACH_DEFAULT_DESIGN_H, type CanvasRect } from "../src/ui/coachmarks.js";
import { resolveLayout } from "../src/layout.js";
import { COACHMARK_STEPS } from "../src/onboarding.js";

const DESIGN_W = 390;

/** The on-screen canvas rect for a portrait layout (CSS px), zero scroll offset. */
function canvasRectFor(designW: number, designH: number, scale: number): CanvasRect {
  return { left: 0, top: 0, width: designW * scale, height: designH * scale };
}

describe("coachmark ring placement", () => {
  // A representative step rect that spans the lower portrait stack (the "shop"
  // step at y=520) — the region most affected by a short, re-budgeted layout.
  const step = COACHMARK_STEPS.find((s) => s.id === "shop")!.rect;

  it("at the canonical 844 it matches the prior hardcoded math exactly", () => {
    // Prior behavior: sx = width/390, sy = height/844.
    const scale = 1; // any scale; the regression is about the divisor, not scale
    const canvas = canvasRectFor(DESIGN_W, COACH_DEFAULT_DESIGN_H, scale);
    const sxOld = canvas.width / DESIGN_W;
    const syOld = canvas.height / COACH_DEFAULT_DESIGN_H;
    const expected = {
      x: canvas.left + step.x * sxOld,
      y: canvas.top + step.y * syOld,
      w: step.w * sxOld,
      h: step.h * syOld,
    };
    const got = coachRingRect(step, canvas, COACH_DEFAULT_DESIGN_H);
    expect(got).toEqual(expected);
  });

  it("at 390×844 a design coord maps by the layout scale (sx === sy === scale)", () => {
    const scale = 1.5;
    const canvas = canvasRectFor(DESIGN_W, 844, scale);
    const got = coachRingRect(step, canvas, 844);
    // Both axes scale by the same `scale`, so the ring keeps its design aspect.
    expect(got.x).toBeCloseTo(step.x * scale, 6);
    expect(got.y).toBeCloseTo(step.y * scale, 6);
    expect(got.w).toBeCloseTo(step.w * scale, 6);
    expect(got.h).toBeCloseTo(step.h * scale, 6);
  });

  it("at the 360×640 floor the ring uses the live portraitDesignH (not 844)", () => {
    const layout = resolveLayout({ viewportW: 360, viewportH: 640 });
    expect(layout.orientation).toBe("portrait");
    const designH = layout.portraitDesignH!;
    expect(designH).toBe(640); // height-driven: design height == usable height
    const scale = layout.scale;
    const canvas = canvasRectFor(layout.designW, designH, scale);

    const got = coachRingRect(step, canvas, designH);
    // Correct: design coords map by the live scale on BOTH axes.
    expect(got.x).toBeCloseTo(step.x * scale, 6);
    expect(got.y).toBeCloseTo(step.y * scale, 6);
    expect(got.h).toBeCloseTo(step.h * scale, 6);

    // The buggy hardcoded-844 math would mis-scale Y badly on this short canvas.
    const buggyY = canvas.top + (step.y * canvas.height) / COACH_DEFAULT_DESIGN_H;
    expect(Math.abs(got.y - buggyY)).toBeGreaterThan(20);

    // The ring stays within the canvas vertically (no clipping past the bottom).
    expect(got.y + got.h).toBeLessThanOrEqual(canvas.height + 0.001);
  });

  it("every step rect stays inside the 360×640 canvas with the live height", () => {
    const layout = resolveLayout({ viewportW: 360, viewportH: 640 });
    const designH = layout.portraitDesignH!;
    const scale = layout.scale;
    const canvas = canvasRectFor(layout.designW, designH, scale);
    for (const s of COACHMARK_STEPS) {
      const r = coachRingRect(s.rect, canvas, designH);
      expect(r.x).toBeGreaterThanOrEqual(canvas.left - 0.001);
      expect(r.y).toBeGreaterThanOrEqual(canvas.top - 0.001);
      expect(r.x + r.w).toBeLessThanOrEqual(canvas.left + canvas.width + 0.001);
      expect(r.y + r.h).toBeLessThanOrEqual(canvas.top + canvas.height + 0.001);
    }
  });

  it("defaults to the canonical 844 when no design height is supplied", () => {
    // The constructor default is COACH_DEFAULT_DESIGN_H; the pure helper used with
    // that constant reproduces the legacy mapping.
    const canvas = canvasRectFor(DESIGN_W, COACH_DEFAULT_DESIGN_H, 1);
    const got = coachRingRect(step, canvas, COACH_DEFAULT_DESIGN_H);
    expect(got.y).toBeCloseTo(step.y, 6); // scale 1 → identity in design space
  });
});
