import { describe, it, expect, vi, beforeEach } from "vitest";

// Integration test: drive the REAL renderControls* methods of MatchScene and
// assert the new circular Buy XP button (ornate rim + blue disc + a quarter-
// circle xp progress arc + an overlapping level badge) is actually drawn from
// the wired render path — not merely that the pure buyXpGeom helper returns
// correct numbers in isolation. This is the regression guard for the "helper
// defined but never called" bug class: a unit test on buyXpGeom alone passed
// while the scene still drew the old chip/bar.

// ── Recording Pixi double ────────────────────────────────────────────────────
// Captures every Graphics path op so we can assert arc() (the xp arc) ran and
// the old straight rect xp bar / "L#" text no longer act as the indicator.
interface GfxOp { fn: string; args: unknown[] }

class RecGraphics {
  ops: GfxOp[] = [];
  eventMode = "auto";
  hitArea: unknown = null;
  cursor = "auto";
  private rec(fn: string, args: unknown[]) { this.ops.push({ fn, args }); return this; }
  circle(...a: unknown[]) { return this.rec("circle", a); }
  arc(...a: unknown[]) { return this.rec("arc", a); }
  rect(...a: unknown[]) { return this.rec("rect", a); }
  roundRect(...a: unknown[]) { return this.rec("roundRect", a); }
  poly(...a: unknown[]) { return this.rec("poly", a); }
  moveTo(...a: unknown[]) { return this.rec("moveTo", a); }
  lineTo(...a: unknown[]) { return this.rec("lineTo", a); }
  arcTo(...a: unknown[]) { return this.rec("arcTo", a); }
  closePath(...a: unknown[]) { return this.rec("closePath", a); }
  fill(...a: unknown[]) { return this.rec("fill", a); }
  stroke(...a: unknown[]) { return this.rec("stroke", a); }
  clear(...a: unknown[]) { return this.rec("clear", a); }
  on() { return this; }
}

class RecText {
  text: string;
  x = 0; y = 0;
  anchor = { set: (_x: number, _y: number) => {} };
  eventMode = "auto";
  constructor(text: string) { this.text = String(text); }
}

class RecContainer {
  children: unknown[] = [];
  addChild(c: unknown) { this.children.push(c); return c; }
  removeChildren() { this.children = []; }
}

class RecRectangle { constructor(..._a: unknown[]) {} }
class RecCircle { constructor(..._a: unknown[]) {} }

vi.mock("pixi.js", () => ({
  Graphics: RecGraphics,
  Text: RecText,
  Container: RecContainer,
  Rectangle: RecRectangle,
  Circle: RecCircle,
}));

// Import AFTER the mock is registered.
const { MatchScene } = await import("../src/scenes/match.js");
const { resolveLayout } = await import("../src/layout.js");
const { buyXpGeom } = await import("../src/hudModel.js");
const { gameData } = await import("@autobattler/data");

// A PlayerState shaped enough for renderControls*: mid-level so xp.frac ∈ (0,1),
// and enough gold to afford xp (so the button is enabled).
function mePlayer() {
  return {
    level: 4,
    xp: 14, // economy thresholds [0,2,6,12,20,...]; level 4 base 12 → inLevel 2 / needed 8
    gold: 33,
    winStreak: 2,
    loseStreak: 0,
    board: [],
    bench: [],
  } as any;
}

/** Build a scene shell that runs the REAL renderControls* without a real Pixi app. */
function makeScene(orientation: "portrait" | "landscape") {
  const layout =
    orientation === "portrait"
      ? resolveLayout({ viewportW: 390, viewportH: 844 })
      : resolveLayout({ viewportW: 844, viewportH: 390 });

  const scene: any = Object.create(MatchScene.prototype);
  scene.layout = layout;
  scene.shopLayer = new RecContainer();
  // Stub the press-feedback wiring (it pokes pointer events / tweens we don't need).
  scene.pressFeedback = () => {};
  scene.onReroll = () => {};
  scene.onBuyXp = () => {};
  return scene;
}

describe("circular Buy XP button is wired into the real renderControls path", () => {
  for (const orientation of ["portrait", "landscape"] as const) {
    describe(orientation, () => {
      let scene: any;
      let me: ReturnType<typeof mePlayer>;

      beforeEach(() => {
        scene = makeScene(orientation);
        me = mePlayer();
        // Call the ACTUAL public dispatcher, which routes to the wired method.
        scene.renderControls(me);
      });

      function allOps(): GfxOp[] {
        return scene.shopLayer.children
          .filter((c: unknown): c is RecGraphics => c instanceof RecGraphics)
          .flatMap((g: RecGraphics) => g.ops);
      }
      function texts(): string[] {
        return scene.shopLayer.children
          .filter((c: unknown): c is RecText => c instanceof RecText)
          .map((t: RecText) => t.text);
      }

      it("draws the circular body (rim + disc) and the quarter-circle xp arc", () => {
        const ops = allOps();
        // Disc + rim are circles; the progress indicator is an arc (track + fill).
        expect(ops.filter((o) => o.fn === "circle").length).toBeGreaterThanOrEqual(2);
        expect(ops.filter((o) => o.fn === "arc").length).toBeGreaterThanOrEqual(2);
      });

      it("anchors the button bottom-left of the econ cluster (matches buyXpGeom)", () => {
        const reg =
          orientation === "portrait"
            ? scene.layout.regions.hud
            : (() => {
                const h = scene.layout.regions.hud;
                return { x: h.x + h.w - 96, y: h.y, w: 96, h: h.h };
              })();
        const g = buyXpGeom(reg);
        // The button body is a circle of radius g.r centered at g.cx/g.cy
        // (other circles exist — coin glyphs, badge — so match by geometry).
        const bodyCircle = allOps().find(
          (o) =>
            o.fn === "circle" &&
            Math.abs((o.args[0] as number) - g.cx) < 0.5 &&
            Math.abs((o.args[1] as number) - g.cy) < 0.5 &&
            Math.abs((o.args[2] as number) - g.r) < 0.5
        );
        expect(bodyCircle).toBeDefined();
      });

      it("renders the 'Buy XP' label, the level number, and a current/needed xp text", () => {
        const t = texts();
        expect(t.some((s) => /Buy XP/i.test(s))).toBe(true);  // center label
        expect(t).toContain(String(me.level));                 // level badge
        expect(t.some((s) => /^\d+\/\d+$/.test(s))).toBe(true); // floating inLevel/needed
      });

      it("does NOT render the old standalone 'L#' level text", () => {
        expect(texts().some((s) => /^L\d+$/.test(s))).toBe(false);
      });

      it("keeps the buy-XP cost reachable (cost label rendered)", () => {
        expect(texts().some((s) => s === String(gameData.economy.xpBuyCost))).toBe(true);
      });
    });
  }
});
