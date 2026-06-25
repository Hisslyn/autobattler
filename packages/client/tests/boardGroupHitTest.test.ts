import { describe, it, expect, vi } from "vitest";

// Regression guard for the board-assembly reparent: `boardLayer`/`benchLayer`
// (board ground + hex grid + both benches + candle gold-meters) now live under
// a single `boardGroup` container, and the pointer hit-test paths
// (`boardSlotAt`/`benchSlotAt`) route every screen point through
// `boardGroup.toLocal(...)` BEFORE the existing projection/geometry math.
//
// No existing test constructs a `MatchScene` instance and actually calls
// `boardSlotAt`/`benchSlotAt`/`toBoardLocal` — `sceneLayerStack.test.ts` only
// asserts zIndex bindings on `buildSceneLayers()` output, and
// `levelBadgeRender.test.ts` only drives `renderControls`. This test closes
// that gap: it proves (1) the reparent actually happened (boardLayer/benchLayer
// are children of boardAssembly, which is itself in the scene's child list),
// and (2) drag-to-hex / bench-slot hit-testing still resolves to the exact
// expected slot THROUGH the new `toLocal` indirection — including under a
// non-identity transform, so the routing isn't silently bypassed.

// ── Recording Pixi double with a REAL toLocal (affine), mirroring
//    sceneLayerStack.test.ts's RecContainer but adding the transform Pixi
//    containers actually provide. ───────────────────────────────────────────
class RecGraphics {
  eventMode = "auto";
  zIndex = 0;
  on() { return this; }
  rect() { return this; }
  poly() { return this; }
  roundRect() { return this; }
  circle() { return this; }
  fill() { return this; }
  stroke() { return this; }
  clear() { return this; }
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
  // Affine offset this node applies to its children (identity by default —
  // matches the coder's claim that boardGroup carries an identity transform
  // today). Settable per-test to prove the indirection isn't bypassed.
  offsetX = 0;
  offsetY = 0;
  addChild(c: RecContainer) { this.children.push(c); return c; }
  removeChildren() { this.children = []; }
  sortChildren() {}
  // Real Pixi Container#toLocal maps a point from GLOBAL/parent space into this
  // node's local space by subtracting its own position. We model the same
  // global->local subtraction (identity when offsetX/offsetY are 0).
  toLocal(p: { x: number; y: number }): { x: number; y: number } {
    return { x: p.x - this.offsetX, y: p.y - this.offsetY };
  }
}
class RecRectangle { constructor(..._a: unknown[]) {} }

vi.mock("pixi.js", () => ({
  Graphics: RecGraphics,
  Text: RecText,
  Container: RecContainer,
  Rectangle: RecRectangle,
}));

// Import AFTER the mock + the real pure geometry helpers it composes with.
const { MatchScene } = await import("../src/scenes/match.js");
const { resolveLayout } = await import("../src/layout.js");
const { hexToPixel, BOARD_COLS, BOARD_ROWS, BOARD_SLOTS } =
  await import("../src/hexUtils.js");
const { benchGeom } = await import("../src/benchLayout.js");

/** Build a scene shell that runs the REAL buildSceneLayers + has a real layout. */
function makeScene(orientation: "portrait" | "landscape") {
  const layout =
    orientation === "portrait"
      ? resolveLayout({ viewportW: 390, viewportH: 844 })
      : resolveLayout({ viewportW: 844, viewportH: 390 });
  const scene: any = Object.create(MatchScene.prototype);
  scene.layout = layout;
  scene.container = new RecContainer();
  scene.buildSceneLayers();
  return scene;
}

describe("board assembly reparent", () => {
  it("boardLayer and benchLayer are children of boardAssembly (the new boardGroup)", () => {
    const scene = makeScene("portrait");
    const group = scene.boardAssembly;
    expect(group.children).toContain(scene.boardLayer);
    expect(group.children).toContain(scene.benchLayer);
  });

  it("boardAssembly itself is parented into the scene's child list (not orphaned)", () => {
    const scene = makeScene("portrait");
    expect(scene.container.children).toContain(scene.boardAssembly);
  });

  it("boardLayer no longer sits directly under the scene container (it moved under the group)", () => {
    const scene = makeScene("portrait");
    expect(scene.container.children).not.toContain(scene.boardLayer);
    expect(scene.container.children).not.toContain(scene.benchLayer);
  });
});

describe("boardSlotAt routes through boardGroup.toLocal (drag-to-hex placement)", () => {
  it("identity transform: every one of the 28 board slots resolves from its own screen-projected center", () => {
    const scene = makeScene("portrait");
    // boardGroup carries identity transform today (offsetX/offsetY default 0).
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let q = 0; q < BOARD_COLS; q++) {
        const boardPt = hexToPixel(q, r, scene.boardOffsetX, scene.boardOffsetY, scene.boardScale);
        const screenPt = scene.fwd(boardPt);
        const slot = scene.boardSlotAt(screenPt.x, screenPt.y);
        expect(slot).toBe(r * BOARD_COLS + q);
      }
    }
  });

  it("off-board pointer still returns -1 through the new routing", () => {
    const scene = makeScene("portrait");
    const slot = scene.boardSlotAt(-9999, -9999);
    expect(slot).toBe(-1);
  });

  it("a non-identity boardGroup transform is NOT silently bypassed: shifting the group shifts the screen point that hits a given hex by the same amount", () => {
    const scene = makeScene("portrait");
    const q = 2, r = 1; // arbitrary interior slot
    const boardPt = hexToPixel(q, r, scene.boardOffsetX, scene.boardOffsetY, scene.boardScale);
    const screenPt = scene.fwd(boardPt);

    // Baseline: identity transform hits the expected slot.
    expect(scene.boardSlotAt(screenPt.x, screenPt.y)).toBe(r * BOARD_COLS + q);

    // Translate the board group by (dx, dy) in local space (as if it were later
    // given a non-identity transform). toLocal now subtracts the offset, so the
    // ORIGINAL screen point no longer lands on the hex...
    const dx = 50, dy = 50;
    scene.boardAssembly.offsetX = dx;
    scene.boardAssembly.offsetY = dy;
    expect(scene.boardSlotAt(screenPt.x, screenPt.y)).not.toBe(r * BOARD_COLS + q);

    // ...but the point shifted by the SAME offset (i.e. "where the hex now
    // visually is on screen") resolves correctly again — proving boardSlotAt
    // truly consults boardGroup.toLocal rather than hardcoding identity.
    expect(scene.boardSlotAt(screenPt.x + dx, screenPt.y + dy)).toBe(r * BOARD_COLS + q);
  });
});

describe("benchSlotAt routes through boardGroup.toLocal (portrait bench placement)", () => {
  it("identity transform: every one of the 9 bench slots resolves from its own center", () => {
    const scene = makeScene("portrait");
    const g = benchGeom(scene.designW, scene.benchCenterY, scene.layout.regions.bench.h);
    for (let i = 0; i < 9; i++) {
      const cx = g.startCx + i * g.slotW;
      const cy = scene.benchCenterY;
      expect(scene.benchSlotAt(cx, cy)).toBe(i);
    }
  });

  it("a non-identity boardGroup transform shifts the hit bench slot consistently (not bypassed)", () => {
    const scene = makeScene("portrait");
    const g = benchGeom(scene.designW, scene.benchCenterY, scene.layout.regions.bench.h);
    const cx = g.startCx + 4 * g.slotW;
    const cy = scene.benchCenterY;
    expect(scene.benchSlotAt(cx, cy)).toBe(4);

    const dx = 20, dy = 20;
    scene.boardAssembly.offsetX = dx;
    scene.boardAssembly.offsetY = dy;
    // Same raw screen point now maps elsewhere in local space...
    expect(scene.benchSlotAt(cx, cy)).not.toBe(4);
    // ...but compensating by the group's offset lands on slot 4 again.
    expect(scene.benchSlotAt(cx + dx, cy + dy)).toBe(4);
  });

  it("returns null well outside the bench vertical band", () => {
    const scene = makeScene("portrait");
    expect(scene.benchSlotAt(scene.designW / 2, -500)).toBeNull();
  });
});

describe("BOARD_SLOTS sanity (guards the round-trip loop bound above)", () => {
  it("28 slots = 7 cols x 4 rows", () => {
    expect(BOARD_SLOTS).toBe(BOARD_COLS * BOARD_ROWS);
    expect(BOARD_SLOTS).toBe(28);
  });
});

describe("renderTopBench (the new second-player top bench)", () => {
  it("draws 9 non-interactive empty cells into benchLayer, alongside the bottom bench", () => {
    const scene = makeScene("portrait");
    scene.renderTopBench();
    const cells = scene.benchLayer.children.filter(
      (c: unknown): c is RecGraphics => c instanceof RecGraphics
    );
    expect(cells.length).toBe(9);
    // Non-interactive: the spec says the top bench has no second-player state to
    // interact with, so every cell must opt out of hit-testing.
    for (const cell of cells) expect(cell.eventMode).toBe("none");
  });

  it("is idempotent-additive per call (re-rendering adds another 9, since callers clear benchLayer first via renderBench)", () => {
    const scene = makeScene("portrait");
    scene.renderTopBench();
    const before = scene.benchLayer.children.length;
    scene.renderTopBench();
    expect(scene.benchLayer.children.length).toBe(before + 9);
  });

  it("does not throw and does not touch boardLayer", () => {
    const scene = makeScene("portrait");
    expect(() => scene.renderTopBench()).not.toThrow();
    expect(scene.boardLayer.children.length).toBe(0);
  });
});
