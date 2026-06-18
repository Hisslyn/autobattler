import { describe, it, expect, vi, beforeEach } from "vitest";

// Integration test: drive the REAL renderControls* methods of MatchScene and
// assert the new circular level badge (arced xp progress + numeric label) is
// actually drawn from the wired render path — not merely that the pure
// levelBadgeGeom helper returns correct numbers in isolation. This is the
// regression guard for the "helper defined but never called" bug class: a unit
// test on levelBadgeGeom alone passed while the scene still drew the old chip.

// ── Recording Pixi double ────────────────────────────────────────────────────
// Captures every Graphics path op so we can assert arc() (the xp arc) ran and
// the old straight rect xp bar did not appear as the level indicator.
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

vi.mock("pixi.js", () => ({
  Graphics: RecGraphics,
  Text: RecText,
  Container: RecContainer,
  Rectangle: RecRectangle,
}));

// Import AFTER the mock is registered.
const { MatchScene } = await import("../src/scenes/match.js");
const { resolveLayout } = await import("../src/layout.js");
const { levelBadgeGeom } = await import("../src/hudModel.js");
const { gameData } = await import("@autobattler/data");

// A PlayerState shaped enough for renderControls*: mid-level so xp.frac ∈ (0,1).
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

describe("level badge is wired into the real renderControls path", () => {
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

      it("draws the xp progress indicator (portrait = arced badge; landscape = xp bar)", () => {
        const gfxChildren = scene.shopLayer.children.filter(
          (c: unknown): c is RecGraphics => c instanceof RecGraphics
        );
        const allOps = gfxChildren.flatMap((g: RecGraphics) => g.ops);
        const arcs = allOps.filter((o: GfxOp) => o.fn === "arc");

        if (orientation === "portrait") {
          const circles = allOps.filter((o: GfxOp) => o.fn === "circle");
          expect(circles.length).toBeGreaterThanOrEqual(1); // badge disc
          expect(arcs.length).toBeGreaterThanOrEqual(2);     // track + fill arc
        } else {
          // Landscape econ cluster uses an XP progress BAR (roundRect track +
          // fill) directly below the Buy-XP button — no arced badge.
          const roundRects = allOps.filter((o: GfxOp) => o.fn === "roundRect");
          expect(roundRects.length).toBeGreaterThanOrEqual(1);
        }
      });

      it("portrait places the badge at the hud bottom-left (matches levelBadgeGeom)", () => {
        if (orientation !== "portrait") return; // landscape has no arced badge
        const g = levelBadgeGeom(scene.layout.regions.hud);

        const badgeCircle = scene.shopLayer.children
          .filter((c: unknown): c is RecGraphics => c instanceof RecGraphics)
          .flatMap((gfx: RecGraphics) => gfx.ops)
          .find((o: GfxOp) => o.fn === "circle");
        expect(badgeCircle).toBeDefined();
        const [cx, cy] = badgeCircle!.args as number[];
        expect(cx).toBeCloseTo(g.cx, 0);
        expect(cy).toBeCloseTo(g.cy, 0);

        const hud = scene.layout.regions.hud;
        expect(cx!).toBeLessThan(hud.x + hud.w / 3);
      });

      it("renders the level number and a current/threshold xp label", () => {
        const texts = scene.shopLayer.children
          .filter((c: unknown): c is RecText => c instanceof RecText)
          .map((t: RecText) => t.text);
        // Level number inside the disc.
        expect(texts).toContain(String(me.level));
        // Numeric current/threshold label under the arc (inLevel/needed).
        expect(texts.some((t: string) => /^\d+\/\d+$/.test(t))).toBe(true);
      });

      it("does NOT render the old 'Lv N' chip label", () => {
        const texts = scene.shopLayer.children
          .filter((c: unknown): c is RecText => c instanceof RecText)
          .map((t: RecText) => t.text);
        expect(texts.some((t: string) => /^Lv\s/.test(t))).toBe(false);
      });

      it("keeps the buy-XP button present and reachable (cost label rendered)", () => {
        const texts = scene.shopLayer.children
          .filter((c: unknown): c is RecText => c instanceof RecText)
          .map((t: RecText) => t.text);
        // The XP button label (portrait "XP" / landscape "Buy XP") and its gold
        // cost both render.
        expect(texts.some((t: string) => t.includes("XP"))).toBe(true);
        const xpCost = String(gameData.economy.xpBuyCost);
        expect(texts.some((t: string) => t === xpCost || t === `${xpCost}g`)).toBe(true);
      });
    });
  }
});
