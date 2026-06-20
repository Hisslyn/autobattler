# Path & purpose

`packages/client/tests/sceneLayerStack.test.ts` — integration regression test asserting that `MatchScene`'s real `buildSceneLayers()` method binds every scene-level Pixi container's `zIndex` to its `L*_*` constant from `combatLayout.ts`, and that the root container is sortable so rendering order derives from `zIndex` (not `addChild` insertion order).

# Responsibility

Owns the guarantee that the match scene's z-stack cannot silently regress to "whatever order `addChild` was called in" — a documented historical bug (the HUD layer used to be inserted near the back). It exercises the actual production method (`MatchScene.prototype.buildSceneLayers`), not a reimplementation, by constructing a bare scene object via `Object.create` and calling the method directly against recording Pixi doubles.

# Exports

None — this is a Vitest test file (`describe`/`it` blocks only), no exports consumed elsewhere.

# Key behavior

- Mocks the `"pixi.js"` module (via `vi.mock`) with minimal recording doubles: `RecGraphics` (no-op `on`/`rect`/`fill`, tracks `zIndex`), `RecText` (tracks `.text`, no-op `anchor.set`), `RecContainer` (tracks `children[]` via `addChild`, `zIndex`, `sortableChildren`; `sortChildren()` is a no-op since assertions read `zIndex` directly rather than relying on Pixi's real sort), `RecRectangle` (no-op constructor). This mirrors the double pattern used in `levelBadgeRender.test.ts`.
- Imports `MatchScene` from `../src/scenes/match.js` **after** the mock is registered (top-level `await import`), so the module under test sees the faked Pixi.
- `buildLayers()` helper: creates a scene via `Object.create(MatchScene.prototype)` (skips the real constructor entirely — no driver, no DOM, no full init), sets `scene.container = new RecContainer()`, then calls the real `scene.buildSceneLayers()`. Returns the partially-built scene object so tests can inspect the layer container properties it set.
- Test 1: asserts `container.sortableChildren === true` — the precondition for zIndex-based stacking to work at all in real Pixi.
- Test 2: asserts a 1:1 binding table — every named layer property on the scene (`boardLayer`, `benchLayer`, `planningFxLayer`, `watermarkLayer`, `frameLayer`, `hudLayer`, `shopLayer`, `traitLayer`, `combatLayer`, `lootLayer`, `toastLayer`, `scoutLayer`, `inspectLayer`) has its `.zIndex` equal to the corresponding `L*_*` constant imported from `combatLayout.ts`. `benchLayer`/`planningFxLayer` both bind to `L2_UNITS`; `hudLayer`/`shopLayer`/`traitLayer`/`combatLayer`/`lootLayer` all bind to `L5_HUD`; `scoutLayer`/`inspectLayer` both bind to `L6_INSPECT`.
- Test 3: asserts `hudLayer.zIndex > boardLayer.zIndex`, `> benchLayer.zIndex`, `> planningFxLayer.zIndex` — the HUD must render above board/unit content (regression guard for the historical "back-inserted-hud" bug).
- Test 4: asserts `toastLayer.zIndex > hudLayer.zIndex` and `< inspectLayer.zIndex` and `< scoutLayer.zIndex` — toast sits above HUD chrome but below modal/inspect layers. Also asserts the unenforceable-by-Pixi ordering `L7_DOM_META > L8_TOAST` directly on the constants (DOM compositing layer is documented, not runtime-checked).
- Test 5: for pairs of containers that share the SAME zIndex (`combatLayer`/`hudLayer` both `L5_HUD`; `lootLayer` above `combatLayer`; `planningFxLayer`/`benchLayer` both `L2_UNITS`; `inspectLayer`/`scoutLayer` both `L6_INSPECT`), asserts the equal-zIndex tie-break is the actual `addChild` insertion index into `container.children` — i.e. combat overlay outranks HUD chrome, loot outranks combat, planning VFX outranks bench tokens, and inspect outranks scout, all via insertion order since Pixi's sort is stable for equal zIndex.
- Test 6: asserts the full `container.children` array, mapped to `.zIndex`, is non-decreasing in insertion order — i.e. `buildSceneLayers` literally calls `addChild` in back-to-front zIndex order (a property the production code maintains by convention, verified here mechanically).
- Test 7: asserts `SCENE_LAYER_ORDER` (the exported constant array from `combatLayout.ts`) is strictly ascending and `SCENE_LAYER_ORDER.length === SCENE_LAYER_NAMES.length` — a static sanity check on the constants module itself, independent of `MatchScene`.

# Invariants & constraints

- This test calls the REAL `buildSceneLayers` method — if that method is renamed, restructured, or stops being callable via prototype + a bare `container` field, this test breaks loudly (which is its purpose: it is the one place that would catch a silent z-stack regression).
- Relies on `MatchScene`'s constructor doing NOTHING that `buildSceneLayers` depends on beyond `this.container` — `Object.create(MatchScene.prototype)` bypasses the constructor entirely, so if `buildSceneLayers` is ever changed to read other instance fields set in the constructor, this test must be updated to set them too (currently it only needs `container`).
- The mock only stubs the 4 Pixi exports `buildSceneLayers` and the layers it touches actually need (`Graphics`, `Text`, `Container`, `Rectangle`); if `scenes/match.ts` module-level code (outside the method) references other Pixi exports at import time, the mock would need extending — currently it does not, since the import succeeds with just these four.
- Equal-zIndex ordering assertions (test 5) are insertion-order-dependent — reordering the `addChild` calls in `buildSceneLayers` for same-layer containers changes which one renders on top, and this test would catch that.

# Depends on

- `../src/combatLayout.js` — imports `L0_BOARD_ENV`, `L2_UNITS`, `L3_WATERMARK`, `L4_FRAME`, `L5_HUD`, `L6_INSPECT`, `L7_DOM_META`, `L8_TOAST`, `SCENE_LAYER_ORDER`, `SCENE_LAYER_NAMES` — the source of truth for every zIndex value asserted.
- `../src/scenes/match.js` (`MatchScene`) — the production class under test, imported dynamically after `vi.mock("pixi.js", ...)` is registered so its internal `import * as PIXI from "pixi.js"` resolves to the recording doubles.
- `pixi.js` — mocked entirely; the real library is never loaded by this test.
- `vitest` (`describe`, `it`, `expect`, `vi`).

# Used by

Not imported by any other file — it is a standalone Vitest test, picked up by the test runner glob.

# Notes

- The comment block at the top explicitly documents the regression this test prevents: "the match scene used to rely on addChild insertion order (with hudLayer at the very back)." This file exists specifically to make that historical bug unable to silently return.
- The double classes (`RecGraphics`/`RecText`/`RecContainer`/`RecRectangle`) intentionally mirror the ones in `levelBadgeRender.test.ts` for consistency across Pixi-mocking tests, but are NOT shared/imported from a common module — each test file defines its own copy.
- `dragCatcher` and `skipLayer`/`shopPanelLayer`/`shopToggleLayer`/`shopBackdropLayer` (magic-number zIndexes 850/870/871/900/999 in the real `buildSceneLayers`) are NOT asserted by this test — it only covers the 9 named `L*_*` scene layers, not the ad hoc high-zIndex overlays (Skip pill, drag sprite, shop dropdown panel) that sit above all of them by convention.
