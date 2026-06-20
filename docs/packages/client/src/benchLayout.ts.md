# Path & purpose

`packages/client/src/benchLayout.ts` -- pure layout math for the 9-slot bench rail and its adjacent sell control, extracted so hit-target geometry is unit-testable without Pixi.

# Responsibility

Owns the geometric formulas for positioning the 9 bench slots and the sell-control button across the two layout modes (landscape's full-width-minus-margins layout, and portrait's region-based layout), plus the pointer-to-slot-index hit-test used by drag-and-drop.

# Exports

- `interface Rect { x, y, w, h }` -- generic design-space rectangle (also used by other layout helpers in the client).
- `interface BenchGeom { slotH, sellW, slotW, startCx, sellX, top }` -- the landscape/legacy geometry result: `slotH` (slot height, taller than wide for thumb comfort), `sellW` (sell control width, fixed 44), `slotW` (computed per-slot width), `startCx` (x-center of slot 0), `sellX` (left x of the sell control), `top` (top y of the whole rail).
- `function benchGeom(designW: number, benchY: number, regionH = 34): BenchGeom` -- computes the landscape-style geometry from a full design width and the bench row's vertical center: applies 8px side margins and a 6px gap before the sell control, splits the remaining width across exactly 9 equal slots, sell control is a fixed 44px wide on the right. `regionH` (default 34) sets `slotH` directly so the slot height tracks the actual layout region's height rather than a hardcoded literal -- callers should always pass the live region height.
- `function portraitBenchGeom(bench: Rect): { slotW, slotH, startCx, centerY }` -- the region-based variant (marked "NH3" in a comment): derives slot geometry directly from a bench `Rect` rather than from `designW` minus margins, used where the bench's actual width differs from `designW - margins` (e.g. portrait's "sell-beside" arrangement). `slotW = bench.w / 9`, `slotH = bench.h` (the bench region's full height, not a separate constant), `startCx = bench.x + slotW/2`, `centerY = bench.y + bench.h/2`.
- `function benchSlotAtX(x: number, geom: BenchGeom): number | null` -- pointer-to-slot hit test: computes the 9-slot band's left/right edges from `geom.startCx`/`geom.slotW`, returns `null` if `x` falls outside the band, otherwise clamps and floors to a slot index 0..8.

# Key behavior

Both geometry functions are pure arithmetic with no side effects, callable from tests with plain numbers/Rects. `benchGeom` always reserves exactly `sellW + gap` (44+6=50px) off the right side of the available rail width before dividing the rest into 9 equal slots -- the bench and sell control are coupled by construction; widening the rail widens slots, not the sell control. `portraitBenchGeom` doesn't compute a sell control at all (portrait's sell control is laid out separately as its own named region, per `CLAUDE.md`'s `sellControl` region) -- it's a narrower "9 equal slots within this rect" helper.

# Invariants & constraints

- Always exactly 9 bench slots -- hardcoded throughout (`/9`, `8` as max index in `benchSlotAtX`'s clamp). Must match `MatchState`'s actual bench slot count (`packages/rules/src/state.ts`) if that ever changes.
- `benchSlotAtX` is the authoritative hit-test for "which bench slot is under this pointer x" -- any drag-drop code placing a unit onto the bench should route through this (or `portraitBenchGeom`'s equivalent math inline) rather than re-deriving slot bounds ad hoc, to keep hit-testing consistent with rendering.
- `regionH` defaulting to 34 in `benchGeom` is a fallback only -- per the inline comment, callers should pass the live region height "rather than a stale literal"; relying on the default in new code is a footgun if the actual bench region height differs (e.g. after a `layout.ts` portrait-region budget change).
- `portraitBenchGeom`'s `centerY` (single y-center for all slots) implies bench tokens are vertically centered within the row, not top-aligned -- consistent with `slotH = bench.h` (the slot fills the whole region height).

# Depends on

Nothing -- self-contained pure math, no imports.

# Used by

`packages/client/src/scenes/match.ts` (renders the bench rail and routes drag/drop/tap hit-testing through these functions -- per `CLAUDE.md`: "bench (9 full-cell slots with clear occupied/empty states + forgiving hit areas, via `benchGeom`)"). `packages/client/src/layout.ts` (the portrait region budgeting that determines the `Rect` passed into `portraitBenchGeom`). Likely covered by a dedicated layout test (`packages/client/tests/`) given the "pure + unit-tested" pattern used throughout this codebase's layout helpers.

# Notes

- The file is explicitly scoped as "pure layout math... extracted so hit-target geometry is testable without Pixi" -- this is a recurring architectural pattern across the client (see also `combatLayout.ts`, `hudModel.ts`, `inspectModel.ts`): geometry/derivation logic is pulled out of the Pixi rendering files into pure, independently testable modules.
- `Rect` defined here is likely the same shape used elsewhere in the client (e.g. `layout.ts`'s `MatchRegions`); if another file defines its own `Rect`, check whether they're meant to be structurally interchangeable (TypeScript would allow it structurally regardless).
