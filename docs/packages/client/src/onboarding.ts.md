# Path & purpose

`packages/client/src/onboarding.ts` -- first-Practice-match coachmark gating data + persistence: a localStorage flag that ensures the coachmark tour shows exactly once per device, plus the static step data (target rect + title + body) the `Coachmarks` overlay renders against.

# Responsibility

Owns: (1) the "have coachmarks been seen" persistence check/write (`shouldShowCoachmarks`/`markCoachmarksSeen`), storage-failure-tolerant; (2) the ordered list of coachmark steps and their approximate design-space target rectangles. Does NOT own the actual overlay rendering (that's `ui/coachmarks.ts`'s `Coachmarks` class) or the decision of WHEN to trigger the check (that's `ui/app.ts`'s `maybeShowCoachmarks`).

# Exports

- `type StorageLike = Pick<Storage, "getItem"|"setItem">` -- a minimal storage interface (just the two methods used), letting callers/tests inject a mock instead of the real `localStorage`.
- `function shouldShowCoachmarks(storage: StorageLike): boolean` -- returns `true` unless the persisted flag (`localStorage["ab.coachmarksSeen"]`) is exactly the string `"1"`. Wrapped in try/catch: if `storage.getItem` throws (e.g. storage disabled/unavailable in some browser contexts), returns `false` (fails CLOSED -- coachmarks are skipped rather than risking a crash or repeat-shows).
- `function markCoachmarksSeen(storage: StorageLike): void` -- writes `"1"` to the same key. Wrapped in try/catch: a write failure is silently ignored (no error surfaced) -- "storage unavailable; ignore."
- `interface CoachmarkStep { id, title, body, rect: {x,y,w,h} }` -- one coachmark's content + its highlight target rectangle in DESIGN space (the 390×844 portrait reference per the file's comment, though see Notes on height-awareness).
- `const COACHMARK_STEPS: CoachmarkStep[]` -- the fixed 5-step tour, in display order: `shop` (rect ~520,72 tall near the bottom), `reroll`, `buyxp` (both small button-sized rects beside the shop), `bench` (a wide thin strip), `board` (the large top board area). Each rect is hand-tuned to APPROXIMATE the corresponding region in `scenes/match.ts`'s portrait layout, not computed from `layout.ts`'s actual region rects.

# Key behavior

There is no dynamic logic beyond the two gating functions -- this is mostly static data. The gating flow (driven externally): a caller (`ui/app.ts`'s `maybeShowCoachmarks`) checks `shouldShowCoachmarks(localStorage)`; if true, immediately calls `markCoachmarksSeen(localStorage)` (marking it seen BEFORE the tour even finishes displaying -- a footgun-adjacent design: if the player closes the app mid-tour, it will never show again, by design) and then constructs a `Coachmarks` overlay seeded with `COACHMARK_STEPS`.

# Invariants & constraints

- The flag is binary and irreversible from the player's perspective via this API -- there's no "reset coachmarks" exposed here (a developer wanting to re-test would need to manually clear the `ab.coachmarksSeen` localStorage key in devtools).
- Both storage functions are defensively wrapped against storage exceptions (private browsing modes, storage quota, disabled storage) -- this file will never throw regardless of `localStorage` availability.
- `shouldShowCoachmarks` fails CLOSED (returns `false`, suppressing the tour) on storage error, rather than failing OPEN (which would show the tour every time storage is broken) -- a deliberate choice favoring "don't annoy with repeated coachmarks" over "always succeed at onboarding."
- The rects in `COACHMARK_STEPS` are STATIC, hand-placed approximations in the nominal 390×844 portrait design space -- they are NOT derived from `layout.ts`'s `portraitRegions` output, so if the portrait layout's actual region positions/sizes drift (e.g. via the height-driven budget algorithm on a non-844 viewport), these rects could visually misalign with the real UI. This is the exact problem CLAUDE.md's "Coachmarks are height-aware" note addresses at the CONSUMER side (`ui/coachmarks.ts`'s `coachRingRect` rescales using `sx = width/390, sy = height/designH`), not by changing these rects themselves -- the steps stay defined against the nominal 844 baseline and get scaled at render time.
- "A full scripted tutorial match is out of scope" per the file's own header comment, with a pointer to `design-notes.md` for the deferred-feature rationale -- this is intentionally a lightweight one-shot highlight tour, not an interactive tutorial.

# Depends on

Nothing -- no imports. Pure TypeScript/data module relying only on the ambient `Storage`-shaped interface passed in by the caller.

# Used by

- `packages/client/src/ui/app.ts` -- imports `shouldShowCoachmarks`, `markCoachmarksSeen`, `COACHMARK_STEPS`; `UiApp.maybeShowCoachmarks(getDesignH?)` gates+marks the flag using real `localStorage`, then constructs `new Coachmarks(this.matchOverlay, this.opts.canvas, COACHMARK_STEPS, () => {}, getDesignH).start()`.
- `packages/client/src/ui/coachmarks.ts` -- imports the `CoachmarkStep` type (only the type, not the gating functions or step data directly per the grep) to type its own step-rendering logic.
- `packages/client/src/main.ts` -- triggers the whole chain indirectly: `startMatch("local")` calls `ui.maybeShowCoachmarks(() => activeLayout.portraitDesignH ?? activeLayout.designH)`, supplying the live design-height getter that lets the consumer's height-aware scaling work.

# Notes

- The mark-as-seen-before-tour-completes ordering (seen in `ui/app.ts`'s `maybeShowCoachmarks`, not this file) means a player who force-quits mid-tour permanently loses the coachmarks -- worth flagging to a UX reviewer if "show again until actually dismissed" is ever desired; this file's API doesn't preclude that (the caller controls timing), but the current call site marks-then-shows rather than show-then-mark-on-dismiss.
- `COACHMARK_STEPS`'s rects being hand-tuned constants (rather than derived from `layout.ts` regions) is a maintenance footgun: any portrait layout region resize in `layout.ts`/`scenes/match.ts` requires a human to manually re-tune these 5 rects to match, with no compiler or test enforcing the correspondence (only the runtime height-rescale in `coachRingRect` keeps them roughly proportionally correct across viewport heights, not across LAYOUT changes).
