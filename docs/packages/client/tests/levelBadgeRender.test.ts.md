# Path & purpose

`packages/client/tests/levelBadgeRender.test.ts` -- an integration-style regression test driving the REAL `MatchScene.renderControls` method (via a hand-built scene shell + a recording Pixi mock) to confirm the circular Buy-XP button (rim + disc + quarter-circle xp progress arc + overlapping level badge) is actually drawn by the wired render path, not merely that the pure `buyXpGeom` helper computes correct numbers in isolation.

# Responsibility

Owns: the "helper defined but never called" regression class -- proving the production `renderControls`/`renderBuyXpButton` code path genuinely uses `buyXpGeom`'s geometry and draws circular/arc primitives (not the OLD straight rect xp bar + standalone "L#" text), in BOTH portrait and landscape orientations, by intercepting every Pixi `Graphics` draw call through a recording double and asserting on the recorded op stream.

# Exports

None (a Vitest test file). Internal helpers: `RecGraphics` (records every `Graphics` path-builder call -- `circle/arc/rect/roundRect/poly/moveTo/lineTo/arcTo/closePath/fill/stroke/clear`, plus stubs for `eventMode/hitArea/cursor/on()` -- into an `ops: GfxOp[]` array of `{fn, args}`), `RecText` (minimal `Text` stand-in exposing `.text`/`.x`/`.y`/`.anchor.set()`), `RecContainer` (minimal `Container` stand-in with `addChild`/`removeChildren`), `RecRectangle`/`RecCircle` (no-op `Rectangle`/`Circle` constructor stand-ins); `mePlayer()` (a minimal `PlayerState`-shaped fixture: level 4, xp 14 against thresholds `[0,2,6,12,20,...]` so `inLevel=2, needed=8`, gold 33, win streak 2, empty board/bench); `makeScene(orientation)` (builds a real `MatchScene` instance via `Object.create(MatchScene.prototype)` -- bypassing the constructor entirely -- then manually sets `.layout` (a real `resolveLayout` result for 390x844 portrait or 844x390 landscape), `.shopLayer` (a `RecContainer`), and no-op stubs for `pressFeedback`/`onReroll`/`onBuyXp`).

# Key behavior

`vi.mock("pixi.js", ...)` replaces the ENTIRE `pixi.js` module with the four recording doubles BEFORE `../src/scenes/match.js` is dynamically imported (`await import(...)` after the mock registration, required so the mock takes effect) -- meaning every `new Graphics()`/`new Text()`/`new Container()` call anywhere inside `MatchScene`'s real source code during this test run produces a recording double instead of a real Pixi object, with zero real WebGL/Canvas context needed.

Each test calls `scene.renderControls(me)` (the REAL, unmodified method on `MatchScene.prototype`) inside a `beforeEach`, for both `"portrait"` and `"landscape"` orientations (the entire describe block is wrapped in a `for` loop over both). Two reader helpers then inspect what got drawn: `allOps()` flattens every `RecGraphics` child's recorded ops across all of `scene.shopLayer.children`; `texts()` collects every `RecText` child's `.text` string.

Five assertions per orientation:
1. **"draws the circular body (rim + disc) and the quarter-circle xp arc"**: at least 2 `circle` ops (disc + rim) and at least 2 `arc` ops (the arc track + the arc fill) appear somewhere in the recorded stream.
2. **"anchors the button bottom-left of the econ cluster (matches buyXpGeom)"**: computes the SAME region the real code uses (`scene.layout.regions.hud` in portrait, or `scene.buyXpRegionLandscape()` in landscape -- calling the actual private method on the real prototype), feeds it through the real pure `buyXpGeom(reg)` to get `{cx,cy,r,...}`, then searches the recorded `circle` ops for one whose first three args (`x,y,radius`) match `g.cx`/`g.cy`/`g.r` within 0.5px tolerance -- proving the BODY circle's actual draw position/size matches the geometry helper's output exactly (disambiguated from other circles like coin glyphs/the level badge by matching on geometry, not draw order).
3. **"renders the 'Buy XP' label, the level number, and a current/needed xp text"**: the text stream contains a case-insensitive `/Buy XP/i` match (center label), the literal level number as a string (`"4"`, the badge), and a `/^\d+\/\d+$/`-shaped string (the floating "2/8" inLevel/needed text).
4. **"does NOT render the old standalone 'L#' level text"**: confirms NO text matches `/^L\d+$/` (e.g. `"L4"`) -- the OLD pre-redesign level indicator format must be fully gone.
5. **"keeps the buy-XP cost reachable (cost label rendered)"**: the literal `gameData.economy.xpBuyCost` value (read from real data) appears as a text string somewhere.

# Invariants & constraints

- This test bypasses `MatchScene`'s constructor entirely via `Object.create(MatchScene.prototype)` -- it is exercising ONLY the `renderControls`/`renderBuyXpButton`/`buyXpRegionLandscape` methods in isolation, with everything else on the scene left undefined. Any future change to `renderControls` that reads additional instance state beyond `layout`/`shopLayer`/`pressFeedback`/`onReroll`/`onBuyXp` will make this test's scene shell incomplete and likely throw -- the shell must be extended in lockstep with `renderControls`'s real dependencies.
- The mock REPLACES the entire `pixi.js` module for this test file's process -- meaning every Pixi class used ANYWHERE inside `match.ts`'s module-level code (not just inside `renderControls`) must be one of the 5 mocked exports (`Graphics/Text/Container/Rectangle/Circle`) or the dynamic import itself will throw at load time; this implicitly also documents which Pixi primitives `match.ts` depends on for its render-time object construction.
- Geometry assertions deliberately match by VALUE (cx/cy/r) rather than by draw ORDER or INDEX, since other circles (coin glyphs, the level badge) are drawn in the same op stream and a positional match would be fragile to incidental reordering.
- `buyXpRegionLandscape()` is a PRIVATE method on `MatchScene`, called directly here via the `scene.buyXpRegionLandscape()` cast-to-`any` escape hatch -- this test is tightly coupled to that method's existence and its exact name; renaming it without updating this test will break the build (TypeScript would catch it given the `any` cast still requires the method to exist at runtime, but a rename breaks silently if the cast hides a typo until the call throws).

# Depends on

- `vitest` (`describe`, `it`, `expect`, `vi`, `beforeEach`; `vi.mock` for the `pixi.js` module replacement).
- `../src/scenes/match.js` (`MatchScene` -- specifically its `renderControls`, `renderBuyXpButton` (indirectly), and `buyXpRegionLandscape` methods/prototype), imported dynamically AFTER `vi.mock` registration.
- `../src/layout.js` (`resolveLayout`, to build a real `MatchLayout` for both orientations).
- `../src/hudModel.js` (`buyXpGeom`, the pure geometry helper under regression-guard here).
- `@autobattler/data` (`gameData`, specifically `gameData.economy.xpBuyCost` and the xp thresholds implicit in the `mePlayer` fixture's level/xp values).

# Used by

Not imported by any other file (a leaf test file); run as part of the client package's `npm test`/vitest suite. Serves as the wiring-regression complement to `hudModel.test.ts`'s pure `buyXpGeom` unit tests (documented earlier in this pass) -- together the two files cover both "the geometry math is correct" and "the geometry math is actually drawn."

# Notes

- The "helper defined but never called" framing in this file's header comment is itself a documented historical bug class for this codebase: a pure geometry/model helper can have perfect unit-test coverage while the actual Pixi render path still calls old/dead code, silently NOT using the new helper. This test file is a direct response to that failure mode and is a useful template for verifying any future Pixi-rendered redesign (mock `pixi.js`, drive the real scene method via `Object.create(prototype)`, assert on the recorded op/text stream).
- The xp fixture's comment (`xp:14` against thresholds `[0,2,6,12,20,...]` giving level 4 base 12, `inLevel=2`, `needed=8`) hardcodes a specific shape of `economy.json`'s `xpThresholds` array; if that data ever changes, this fixture's derived level/inLevel/needed values would silently drift out of sync with the comment (though the test itself only asserts on the RENDERED `"2/8"`-shaped string pattern via regex, not the literal value, so a thresholds change wouldn't necessarily break this specific test -- but the comment would become inaccurate documentation).
