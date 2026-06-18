import { describe, it, expect, vi } from "vitest";
import {
  L0_BOARD_ENV,
  L2_UNITS,
  L3_WATERMARK,
  L4_FRAME,
  L5_HUD,
  L6_INSPECT,
  L7_DOM_META,
  L8_TOAST,
  SCENE_LAYER_ORDER,
  SCENE_LAYER_NAMES,
} from "../src/combatLayout.js";

// Integration guard for the enforced scene z-stack: the match scene used to rely
// on addChild insertion order (with hudLayer at the very back). Now the root is
// sortable and every layer's zIndex IS its L*_* constant. This drives the REAL
// `buildSceneLayers` method on real (recorded) containers and asserts the binding
// + back-to-front order, so the stack can't silently regress to insertion order.

// ── Recording Pixi doubles (mirror levelBadgeRender.test.ts; Container tracks
//    the z-stack fields buildSceneLayers writes) ──────────────────────────────
class RecGraphics {
  eventMode = "auto";
  zIndex = 0;
  on() { return this; }
  rect() { return this; }
  fill() { return this; }
}
class RecText {
  text: string;
  anchor = { set: (_x: number, _y: number) => {} };
  constructor(text: string) { this.text = String(text); }
}
class RecContainer {
  children: RecContainer[] = [];
  zIndex = 0;
  sortableChildren = false;
  eventMode = "auto";
  addChild(c: RecContainer) { this.children.push(c); return c; }
  sortChildren() { /* no-op: assertions read zIndex directly */ }
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

/** Run the REAL buildSceneLayers on a bare scene shell (no full constructor). */
function buildLayers(): any {
  const scene: any = Object.create(MatchScene.prototype);
  scene.container = new RecContainer();
  scene.buildSceneLayers();
  return scene;
}

describe("enforced scene layer z-stack", () => {
  it("makes the scene root sortable so stacking derives from zIndex, not insertion", () => {
    expect(buildLayers().container.sortableChildren).toBe(true);
  });

  it("binds each scene layer's zIndex to its L*_* constant (1:1)", () => {
    const s = buildLayers();
    const bindings: Array<[number, number]> = [
      [s.boardLayer.zIndex, L0_BOARD_ENV],
      [s.benchLayer.zIndex, L2_UNITS],
      [s.planningFxLayer.zIndex, L2_UNITS],
      [s.watermarkLayer.zIndex, L3_WATERMARK],
      [s.frameLayer.zIndex, L4_FRAME],
      [s.hudLayer.zIndex, L5_HUD],
      [s.shopLayer.zIndex, L5_HUD],
      [s.traitLayer.zIndex, L5_HUD],
      [s.combatLayer.zIndex, L5_HUD],
      [s.lootLayer.zIndex, L5_HUD],
      [s.toastLayer.zIndex, L8_TOAST],
      [s.scoutLayer.zIndex, L6_INSPECT],
      [s.inspectLayer.zIndex, L6_INSPECT],
    ];
    for (const [actual, expected] of bindings) expect(actual).toBe(expected);
  });

  it("puts the HUD above board/unit content (fixes the back-inserted-hud deviation)", () => {
    const s = buildLayers();
    expect(s.hudLayer.zIndex).toBeGreaterThan(s.boardLayer.zIndex);
    expect(s.hudLayer.zIndex).toBeGreaterThan(s.benchLayer.zIndex);
    expect(s.hudLayer.zIndex).toBeGreaterThan(s.planningFxLayer.zIndex);
  });

  it("lands toast above the HUD but below inspect/scout (and DOM-meta above toast)", () => {
    const s = buildLayers();
    expect(s.toastLayer.zIndex).toBeGreaterThan(s.hudLayer.zIndex);
    expect(s.toastLayer.zIndex).toBeLessThan(s.inspectLayer.zIndex);
    expect(s.toastLayer.zIndex).toBeLessThan(s.scoutLayer.zIndex);
    // DOM meta (#ui-root/#match-overlay) sits above the toast layer; the canvas
    // can't enforce this (separate compositing layer) but the constant encodes it.
    expect(L7_DOM_META).toBeGreaterThan(L8_TOAST);
  });

  it("combat + loot overlays outrank the HUD chrome so a resolution scrim covers the rail", () => {
    const s = buildLayers();
    const layers: RecContainer[] = s.container.children;
    const idx = (c: RecContainer) => layers.indexOf(c);
    // Equal zIndex (L5_HUD) — stable insertion order is the tie-break.
    expect(s.combatLayer.zIndex).toBe(s.hudLayer.zIndex);
    expect(idx(s.combatLayer)).toBeGreaterThan(idx(s.hudLayer));
    expect(idx(s.lootLayer)).toBeGreaterThan(idx(s.combatLayer));
    // Planning VFX over the bench unit tokens (same L2_UNITS layer).
    expect(s.planningFxLayer.zIndex).toBe(s.benchLayer.zIndex);
    expect(idx(s.planningFxLayer)).toBeGreaterThan(idx(s.benchLayer));
    // Inspect panel over the scout overlay (same L6_INSPECT layer).
    expect(s.inspectLayer.zIndex).toBe(s.scoutLayer.zIndex);
    expect(idx(s.inspectLayer)).toBeGreaterThan(idx(s.scoutLayer));
  });

  it("adds layers back-to-front so the sortable stack renders in zIndex order", () => {
    const z = (buildLayers().container.children as RecContainer[]).map((c) => c.zIndex);
    for (let i = 1; i < z.length; i++) expect(z[i]).toBeGreaterThanOrEqual(z[i - 1]!);
  });

  it("SCENE_LAYER_ORDER lists the layers strictly back-to-front (ascending zIndex)", () => {
    expect(SCENE_LAYER_ORDER.length).toBe(SCENE_LAYER_NAMES.length);
    for (let i = 1; i < SCENE_LAYER_ORDER.length; i++) {
      expect(SCENE_LAYER_ORDER[i]).toBeGreaterThan(SCENE_LAYER_ORDER[i - 1]!);
    }
  });
});
