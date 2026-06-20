# Path & purpose

`packages/client/src/ui/coachmarks.ts` -- the first-match coachmark overlay: a step-by-step sequence of highlight rings + info cards pointing at specific match-scene regions (shop, reroll, bench, etc.), rendered as DOM elements positioned over the Pixi canvas. Pure presentation; the gating logic (whether to show it at all) lives in `onboarding.ts`, not here.

# Responsibility

Owns: the height-aware design-space-to-screen-space ring placement math (`coachRingRect`), and the `Coachmarks` class that walks a fixed step list (`CoachmarkStep[]` from `onboarding.ts`) showing one ring+card at a time with Skip/Next/Done controls, tearing itself down when finished or skipped.

# Exports

- `const DESIGN_W = 390` -- the fixed design width (matches the canonical portrait design width used throughout the client).
- `const COACH_DEFAULT_DESIGN_H = 844` -- the canonical/fallback portrait design height (the ORIGINAL hardcoded value, used as the default when no live height supplier is provided).
- `interface CanvasRect { left, top, width, height }` -- a minimal subset of `DOMRect`'s shape, used so the pure math function doesn't need a real `DOMRect` (testable with plain objects).
- `function coachRingRect(designRect: {x,y,w,h}, canvas: CanvasRect, designH: number): {x,y,w,h}` -- the pure placement function: computes `sx = canvas.width / DESIGN_W` and `sy = canvas.height / designH` (the canvas's actual on-screen CSS size divided by the design-space dimensions it represents), then maps the design-space rect into screen-space: `x = canvas.left + designRect.x*sx`, `y = canvas.top + designRect.y*sy`, `w = designRect.w*sx`, `h = designRect.h*sy`. At `designH=844` this reproduces the historical hardcoded behavior exactly (explicit regression guard, confirmed by the file's own comment and presumably a unit test).
- `class Coachmarks` -- the overlay controller.
  - `constructor(parent: HTMLElement, canvas: HTMLCanvasElement, steps: CoachmarkStep[], onDone: () => void, getDesignH: () => number = () => COACH_DEFAULT_DESIGN_H)` -- builds (but doesn't yet mount) a `#coach-overlay` root div; `getDesignH` defaults to a closure returning the canonical `844` if the caller doesn't supply a live height function.
  - `start(): void` -- if `steps` is empty, immediately calls `onDone()` and does nothing else (no overlay shown); otherwise appends `root` into `parent` and renders the first step.
  - `next(): void` -- PRIVATE in source but effectively the step-advance entry point (called by the card's "Next"/"Done" button): increments `idx`; if past the end, calls `finish()`; else re-renders.
  - `finish(): void` -- (private) removes `root` from its parent (if attached) and calls `onDone()`.

# Key behavior

`render()` (private) is called once per step: reads `canvas.getBoundingClientRect()` for the canvas's CURRENT on-screen position/size (re-read every render, so it stays correct across any resize between steps), computes the ring's screen rect via `coachRingRect(step.rect, rect, this.getDesignH())`, positions a `.coach-ring` div there, then builds a `.coach-card` (title with a `(N/Total)` counter, body text, Skip + Next/Done buttons) and positions it either BELOW the ring (`y + h + 12`) or ABOVE it (`Math.max(rect.top+8, y-140)`) depending on whether the below-placement would overflow the canvas's bottom edge (checked via `below + 130 > rect.top + rect.height`, i.e. assuming the card is roughly 130px tall). The card's horizontal position is clamped to stay within the canvas bounds (`Math.min(Math.max(rect.left+8, x), rect.left+rect.width-250)`, assuming a roughly 250px card width). "Skip" calls `finish()` directly (ends the whole tour early); "Next"/"Done" calls `next()`.

# Invariants & constraints

- **Height-awareness is the core fix this file embodies**: the portrait design HEIGHT is no longer a fixed constant in the rest of the layout system (`layout.ts`'s `portraitRegions` is height-driven, varying with the actual viewport down to a 360×640 floor) -- so ring placement MUST read the live design height via `getDesignH()` rather than assuming `844`, or rings would mis-align on any viewport shorter than the canonical one. The design WIDTH (`390`) remains fixed and is never parameterized, since `layout.ts`'s portrait mode is explicitly "width-only scale" with a height-driven region budget (only the height varies).
- `coachRingRect`'s scale factors `sx`/`sy` are computed INDEPENDENTLY (separate X and Y scale) -- this is correct specifically because portrait scaling in this codebase is NOT uniform (width scale and height scale can differ, since height is budget-driven rather than scaled), unlike a typical uniform letterbox-fit scale.
- The card's overflow-avoidance math hardcodes assumed card dimensions (`130` height, `250` width) rather than measuring the actual rendered card -- if the card's CSS (via `styles.ts`) is changed to be significantly taller/wider, this placement heuristic could start misjudging overflow and visually clip a card without the code itself failing in any way (a silent visual regression, not a crash).
- `start()`'s empty-steps short-circuit means a caller can safely call this with a zero-length `steps` array (defensive, though `onboarding.ts`'s `COACHMARK_STEPS` is currently a fixed non-empty 5-step array, so this path isn't exercised in practice today).
- The overlay is entirely DOM (not Pixi) -- it is mounted into `matchOverlay` (the same DOM container the in-match pause modal uses, per `ui/app.ts`), positioned with raw `style.left/top/width/height` pixel values computed from `getBoundingClientRect()`, NOT CSS transforms or flex/grid -- so it depends on `parent`/`canvas` being normal in-flow DOM elements with stable `getBoundingClientRect()` semantics.

# Depends on

- `./dom.js` (`el`, `button`, `clear`) -- DOM construction helpers.
- `../onboarding.js` (`CoachmarkStep` type only) -- the step data shape (`{title, body, rect}` per the earlier-documented `onboarding.ts`); does NOT import the step DATA (`COACHMARK_STEPS`) itself or the gating functions -- those are the caller's (`ui/app.ts`) responsibility, keeping this file purely a rendering/sequencing mechanism over whatever steps it's given.

# Used by

`packages/client/src/ui/app.ts` -- `maybeShowCoachmarks(getDesignH?)` constructs `new Coachmarks(this.matchOverlay, this.opts.canvas, COACHMARK_STEPS, () => {}, getDesignH)` and calls `.start()`, after confirming via `onboarding.ts`'s `shouldShowCoachmarks` that the tour hasn't been seen yet (and immediately marking it seen).

# Notes

- The regression-guard framing ("At designH=844 this is identical to the prior hardcoded behavior") strongly suggests this file was refactored FROM an earlier version that hardcoded `844` directly in the ring math, and the `getDesignH` parameterization (with `COACH_DEFAULT_DESIGN_H` as the safety-net default) was added later specifically to support `layout.ts`'s height-driven portrait budget system -- a reader investigating why coachmark rings might be misaligned on a particular device should first verify the correct LIVE design height is actually being threaded through from `main.ts` → `ui/app.ts` → here, rather than assuming a `Coachmarks`-internal bug.
- `onDone` is currently always called with a no-op (`() => {}`) from `ui/app.ts` -- there is no current consumer of "the tour finished/was skipped" as an actual event; this is a hook for a future use (e.g. analytics, or chaining into another onboarding step) rather than dead code, but as of this reading nothing acts on it.
- Skip and finishing-the-last-step both funnel through the SAME `finish()` method with no way to distinguish "user skipped early" from "user completed the full tour" from the `onDone` callback's perspective -- if that distinction ever matters (e.g. different analytics events), `finish` would need a reason parameter.
