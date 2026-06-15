// First-match coachmark overlay: a sequence of highlight rings + cards pointing
// at match-scene regions. Positions map design-space rects onto the scaled canvas.
// The design WIDTH is fixed (390) but the portrait design HEIGHT is now
// height-driven (= usable viewport height, exposed as MatchLayout.portraitDesignH),
// so the ring math reads the LIVE design height from `getDesignH` instead of a
// hardcoded 844 — otherwise rings mis-scale on short viewports (down to 360×640).
// Pure presentation — no game logic. Gating lives in onboarding.ts.
import { el, button, clear } from "./dom.js";
import type { CoachmarkStep } from "../onboarding.js";

const DESIGN_W = 390;
/** Canonical portrait design height (the original hardcoded value, fallback). */
export const COACH_DEFAULT_DESIGN_H = 844;

/** Minimal rect shape (a subset of DOMRect) for the pure ring-placement math. */
export interface CanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Pure ring-placement math: map a design-space rect onto the on-screen canvas.
 * Width scales by the fixed 390 design width; height scales by the LIVE portrait
 * design height (`designH`), so the canvas's CSS height ÷ designH recovers the
 * true scale on any viewport. At designH=844 this is identical to the prior
 * hardcoded behavior (regression guard).
 */
export function coachRingRect(
  designRect: { x: number; y: number; w: number; h: number },
  canvas: CanvasRect,
  designH: number
): { x: number; y: number; w: number; h: number } {
  const sx = canvas.width / DESIGN_W;
  const sy = canvas.height / designH;
  return {
    x: canvas.left + designRect.x * sx,
    y: canvas.top + designRect.y * sy,
    w: designRect.w * sx,
    h: designRect.h * sy,
  };
}

export class Coachmarks {
  private root: HTMLElement;
  private idx = 0;
  /** Live portrait design height supplier (defaults to the canonical 844). */
  private getDesignH: () => number;

  constructor(
    private parent: HTMLElement,
    private canvas: HTMLCanvasElement,
    private steps: CoachmarkStep[],
    private onDone: () => void,
    getDesignH: () => number = () => COACH_DEFAULT_DESIGN_H
  ) {
    this.root = el("div", { attrs: { id: "coach-overlay" } });
    this.getDesignH = getDesignH;
  }

  start(): void {
    if (this.steps.length === 0) {
      this.onDone();
      return;
    }
    this.parent.appendChild(this.root);
    this.render();
  }

  private finish(): void {
    if (this.root.parentNode) this.root.parentNode.removeChild(this.root);
    this.onDone();
  }

  private render(): void {
    clear(this.root);
    const step = this.steps[this.idx]!;
    const rect = this.canvas.getBoundingClientRect();
    const { x, y, w, h } = coachRingRect(step.rect, rect, this.getDesignH());

    const ring = el("div", { class: "coach-ring" });
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    ring.style.width = `${w}px`;
    ring.style.height = `${h}px`;
    this.root.appendChild(ring);

    const last = this.idx === this.steps.length - 1;
    const card = el("div", { class: "coach-card" }, [
      el("h4", { text: `${step.title}  (${this.idx + 1}/${this.steps.length})` }),
      el("p", { text: step.body }),
      el("div", { class: "coach-actions" }, [
        button("Skip", () => this.finish(), "ui-btn-back"),
        button(last ? "Done" : "Next", () => this.next(), "ui-btn ui-btn-primary"),
      ]),
    ]);
    // Place the card above the ring if it would overflow the bottom, else below.
    const below = y + h + 12;
    const cardTop = below + 130 > rect.top + rect.height ? Math.max(rect.top + 8, y - 140) : below;
    card.style.left = `${Math.min(Math.max(rect.left + 8, x), rect.left + rect.width - 250)}px`;
    card.style.top = `${cardTop}px`;
    this.root.appendChild(card);
  }

  private next(): void {
    this.idx++;
    if (this.idx >= this.steps.length) this.finish();
    else this.render();
  }
}
