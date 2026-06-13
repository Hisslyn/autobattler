// First-match coachmark overlay: a sequence of highlight rings + cards pointing
// at match-scene regions. Positions map design-space rects (390×844) onto the
// scaled canvas. Pure presentation — no game logic. Gating lives in onboarding.ts.
import { el, button, clear } from "./dom.js";
import type { CoachmarkStep } from "../onboarding.js";

const DESIGN_W = 390;
const DESIGN_H = 844;

export class Coachmarks {
  private root: HTMLElement;
  private idx = 0;

  constructor(
    private parent: HTMLElement,
    private canvas: HTMLCanvasElement,
    private steps: CoachmarkStep[],
    private onDone: () => void
  ) {
    this.root = el("div", { attrs: { id: "coach-overlay" } });
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
    const sx = rect.width / DESIGN_W;
    const sy = rect.height / DESIGN_H;
    const x = rect.left + step.rect.x * sx;
    const y = rect.top + step.rect.y * sy;
    const w = step.rect.w * sx;
    const h = step.rect.h * sy;

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
