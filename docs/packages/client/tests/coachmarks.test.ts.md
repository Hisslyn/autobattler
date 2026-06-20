# Path & purpose

`packages/client/tests/coachmarks.test.ts` -- unit tests for `ui/coachmarks.ts`'s `coachRingRect(designRect, canvas, designH)`: the pure function that scales a coachmark step's design-space target rect onto the live on-screen canvas. The file's express purpose (per its own header comment) is a REGRESSION GUARD proving the height-aware scaling fix reproduces the prior hardcoded-844 behavior exactly at the canonical design height, while correctly diverging (and NOT mis-scaling) at the short 360×640 viewport floor.

# Responsibility

Owns: regression coverage for the height-awareness fix described in CLAUDE.md ("Coachmarks are height-aware: ring placement reads the LIVE portrait design height... instead of a hardcoded 844"). Proves three things: (1) at the historical 844 design height, the new general formula is byte-identical to the old hardcoded-844 formula; (2) at a non-1 uniform scale with 844 still as the design height, both axes scale identically; (3) at the 360×640 floor (where the live portrait `portraitDesignH` is 640, NOT 844), the function correctly uses the LIVE height rather than the stale 844 constant, and a synthetic "buggy" computation using 844 would diverge significantly (proving the test would have caught the bug it's guarding against).

# Exports

None (a Vitest test file). Defines one local helper, `canvasRectFor(designW, designH, scale)`, returning a `CanvasRect` (`{left:0, top:0, width: designW*scale, height: designH*scale}`) simulating a zero-scroll-offset on-screen canvas at a given design size and uniform scale.

# Key behavior

All tests operate on the SAME representative step rect: `COACHMARK_STEPS.find(s => s.id === "shop")!.rect` (`{x:6, y:520, w:320, h:72}` per `onboarding.ts`) -- chosen, per the test's own comment, because it's "the region most affected by a short, re-budgeted layout" (the lower portrait stack near the bottom of the design space, where a height squeeze most changes the y-scale).

**"at the canonical 844 it matches the prior hardcoded math exactly"**: builds a canvas at `(390, 844, scale=1)`, computes the OLD hardcoded formula by hand (`sxOld = canvas.width/390`, `syOld = canvas.height/844`, applied independently to x/w vs y/h), and confirms `coachRingRect(step, canvas, COACH_DEFAULT_DESIGN_H)` returns EXACTLY that same object (`toEqual`, not `toBeCloseTo` -- an exact structural match). This is the literal regression guard: the new general implementation, when fed the canonical `844` as its `designH` argument, must compute IDENTICALLY to the formula it replaced.

**"at 390×844 a design coord maps by the layout scale (sx === sy === scale)"**: builds a canvas at scale `1.5` (still 844 design height) and confirms the result scales BOTH x/y/w/h uniformly by `1.5` -- i.e. when `designW`/`designH` and `canvas.width`/`canvas.height` are in true proportion (no aspect distortion), `sx` and `sy` collapse to the same single `scale` factor, preserving the ring's design-space aspect ratio on screen.

**"at the 360×640 floor the ring uses the live portraitDesignH (not 844)"**: calls the REAL `resolveLayout({viewportW:360, viewportH:640})` (from `layout.ts`) to get an authentic short-viewport layout, confirms it resolves to `"portrait"` orientation with `portraitDesignH === 640` (height-driven: the design height literally equals the usable viewport height at this floor, per `layout.ts`'s documented portrait budget algorithm), then builds a canvas from THAT live `designH`/`scale` and confirms `coachRingRect`'s output scales x/y/h by the live uniform `scale` on both axes. Crucially, it then computes a SEPARATE "buggy" y-value using the OLD hardcoded `COACH_DEFAULT_DESIGN_H` (844) divisor instead of the live `640`, and asserts the real result and the buggy result DIFFER by more than `20` (design/screen px) -- i.e. this test doesn't just confirm the fix is correct in isolation, it actively demonstrates the magnitude of the bug it replaced (the old code would have placed the ring over 20px away from where it should be on this short viewport). Finally confirms the ring's bottom edge (`y+h`) doesn't exceed the canvas height (no clipping past the bottom on this constrained viewport).

**"every step rect stays inside the 360×640 canvas with the live height"**: iterates ALL FIVE `COACHMARK_STEPS` (shop, reroll, buyxp, bench, board) at the 360×640 floor and confirms each one's projected rect stays fully within the canvas bounds on all four edges (left/top/right/bottom, with a `0.001` float-tolerance margin) -- a completeness check that EVERY coachmark step (not just the "shop" representative used elsewhere) is correctly contained at the worst-case (shortest supported) viewport.

**"defaults to the canonical 844 when no design height is supplied"**: confirms that at `scale=1` with the canonical 844 height, `coachRingRect`'s y-output equals the step's raw design-space y unchanged (`toBeCloseTo(step.y, 6)`) -- i.e. scale-1 design-space coordinates are an identity mapping, and the test comment clarifies this indirectly verifies the `Coachmarks` CLASS's constructor default (which the test doesn't construct directly, instead relying on the pure helper fed the same default constant) reproduces the legacy mapping.

# Invariants & constraints

- This test file is the CONCRETE proof that the live-height fix doesn't regress the legacy/common case (844, the original full-size portrait design height) while fixing the short-viewport case -- a reviewer should treat ANY future change to `coachRingRect`'s scaling formula as required to keep BOTH the first test (exact 844 match) and the fourth test (360×640 containment) passing simultaneously.
- The "buggy math" comparison in test 3 is a deliberately-constructed NEGATIVE check (asserting the WRONG formula's output diverges from the correct one by a meaningful margin) -- this is a stronger regression guard than simply asserting the correct output's properties, since it would also catch a future "fix" that accidentally reverts to using a hardcoded constant under a different guise.
- This test depends on `onboarding.ts`'s `COACHMARK_STEPS` exact rect VALUES (e.g. `{x:6,y:520,w:320,h:72}` for "shop") -- if those design-space rects are ever retuned (e.g. because `scenes/match.ts`'s actual shop region moves), this test's numeric expectations are still VALID (it tests the scaling math generically against whatever rect exists), but a maintainer should know the "most affected by a short layout" framing in the test comment was chosen based on the CURRENT y=520 value being deep in the lower portrait stack; if the steps were restructured, that specific framing/comment could become stale even though the assertions themselves would still pass correctly.
- This file also indirectly exercises `layout.ts`'s `resolveLayout` (a REAL call, not mocked) -- meaning a regression in the portrait height-budget algorithm itself (e.g. `portraitDesignH` no longer resolving to exactly `640` at the 360×640 floor) would ALSO fail this test, even though the test's stated purpose is about coachmarks; this is a useful but easily-overlooked cross-file coupling.

# Depends on

- `vitest` (`describe`, `it`, `expect`, `toEqual`, `toBeCloseTo`, `toBeGreaterThan`, `toBeLessThanOrEqual`).
- `../src/ui/coachmarks.js` (`coachRingRect`, `COACH_DEFAULT_DESIGN_H`, `CanvasRect` type).
- `../src/layout.js` (`resolveLayout`) -- a REAL (not mocked) call to get an authentic short-viewport layout.
- `../src/onboarding.js` (`COACHMARK_STEPS`) -- the real coachmark step data, used as realistic test fixtures rather than synthetic rects.

# Used by

Not imported by any other file (a leaf test file); run as part of the client package's `npm test`/vitest suite.

# Notes

- The file's own header comment doubles as a mini-design-doc explaining WHY the fix matters ("rings align on short viewports down to the 360×640 floor") -- a reader investigating any future coachmark positioning bug should start by re-running this exact suite, since it's explicitly built to catch the class of bug (hardcoded design-height assumptions) most likely to recur if a future refactor reintroduces a literal `844` somewhere in the ring-placement path.
- The choice to test against the REAL `resolveLayout` rather than a synthetic/mocked layout object is notable -- it means this test doubles as an (incomplete) integration check between `layout.ts` and `coachmarks.ts`, not a fully isolated unit test of `coachRingRect` alone.
