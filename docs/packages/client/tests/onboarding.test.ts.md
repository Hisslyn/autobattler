# Path & purpose

`packages/client/tests/onboarding.test.ts` -- unit tests for `onboarding.ts`'s coachmark-gating persistence: `shouldShowCoachmarks(storage)` and `markCoachmarksSeen(storage)`, confirming the "shown once, on the first Practice match only" behavior and that the seen-flag is fully scoped per storage instance.

# Responsibility

Owns: regression coverage that the first-match coachmark overlay is gated correctly across the localStorage-backed `ab.coachmarksSeen` flag -- shows on a fresh/never-seen storage, suppresses immediately after `markCoachmarksSeen` is called, and never leaks state between two independent storage instances (proxy for "two different browsers/devices never share the seen flag").

# Exports

None (a Vitest test file). `mockStorage()` -- a minimal in-memory `Pick<Storage,"getItem"|"setItem">` stand-in (a `Map<string,string>` backing store) used in place of a real `localStorage`, so the test runs storage-implementation-agnostic and without any browser environment.

# Key behavior

- "shows on first match, suppresses on the second": against a fresh `mockStorage()`, `shouldShowCoachmarks(storage)` is `true` (nothing has been marked seen yet); after calling `markCoachmarksSeen(storage)`, a SECOND call to `shouldShowCoachmarks(storage)` on the SAME storage instance returns `false`.
- "independent storages do not share the seen flag": two separate `mockStorage()` instances `a`/`b`; marking `a` seen makes `shouldShowCoachmarks(a)` `false`, but `shouldShowCoachmarks(b)` (an entirely separate, untouched storage) remains `true` -- confirms there is no hidden module-level/global state backing the gate; everything routes through the passed-in `storage` parameter.

# Invariants & constraints

- `shouldShowCoachmarks`'s real implementation (visible in `onboarding.ts`, not directly exercised by name in this test file but load-bearing context) checks `storage.getItem(KEY) !== "1"` wrapped in a `try/catch` that returns `false` on ANY thrown error (e.g. storage unavailable/throwing in a locked-down browser context) -- meaning a storage failure FAILS CLOSED (coachmarks suppressed) rather than failing open (coachmarks always shown); this test file does NOT exercise the throw/catch path directly (its `mockStorage` never throws), so that fail-closed guarantee is currently UNVERIFIED by any automated test -- a reader relying on this behavior should treat it as documented-by-source-comment only, not test-enforced.
- `markCoachmarksSeen`'s real implementation similarly wraps `storage.setItem` in a try/catch that silently swallows any error ("storage unavailable; ignore") -- also not directly exercised by a throwing-storage test here.
- The persisted key is the literal string `"ab.coachmarksSeen"`, and the "seen" sentinel value is the literal string `"1"` (not a boolean, since `localStorage` only stores strings) -- any code reading/writing this key directly (bypassing `onboarding.ts`'s functions) must match this exact key/value convention or the gate will desync.
- Per CLAUDE.md: a full scripted tutorial match is explicitly OUT OF SCOPE for this onboarding system (see `design-notes.md`) -- this module only gates a one-time coachmark OVERLAY (not a guided/blocking tutorial flow), shown once and skippable.

# Depends on

- `vitest` (`describe`, `it`, `expect`, `toBe`).
- `../src/onboarding.js` (`shouldShowCoachmarks`, `markCoachmarksSeen`).

# Used by

Not imported by any other file (a leaf test file); run as part of the client package's `npm test`/vitest suite. Indirectly validates the gating consumed by `main.ts`'s `maybeShowCoachmarks` call (per CLAUDE.md, height-aware ring placement plumbed through `getDesignH`) which fires after a first Practice match.

# Notes

- `onboarding.ts` also exports `CoachmarkStep` (an interface: `{id, title, body, rect}`, where `rect` is a design-space `{x,y,w,h}` rectangle approximating regions from `scenes/match.ts`'s layout) and a fixed `COACHMARK_STEPS` array of 5 steps (`shop`, `reroll`, `buyxp`, `bench`, `board`) with hand-authored rects hardcoded against the CANONICAL 390x844 portrait design -- NEITHER of these is exercised by this test file at all. This means the actual coachmark CONTENT/POSITIONING (the rects, titles, body copy) has ZERO automated test coverage here; only the SHOW/SUPPRESS gating logic is tested. Given CLAUDE.md's note that coachmark ring placement is height-aware (reading the live `portraitDesignH` via `coachRingRect`, unit-tested elsewhere per this documentation pass's earlier findings), the STATIC rects in `COACHMARK_STEPS` are presumably scaled at render time by that separate height-aware math rather than used as literal absolute pixel positions on every device -- a reader modifying `COACHMARK_STEPS`'s rects should cross-reference `coachRingRect`'s scale math (sx = width/390, sy = height/designH) to understand how these hardcoded-at-844 rects translate to other viewport heights.
- The hardcoded rects in `COACHMARK_STEPS` (e.g. `board: {x:20,y:265,w:350,h:200}`) are described in-source as merely "approximate" the real `scenes/match.ts` regions -- they are NOT derived from `layout.ts`'s actual region-resolution functions, so any future layout change to the portrait design (e.g. via `portraitRegions`) carries a manual-sync risk of these coachmark target rects drifting out of alignment with the real rendered UI, since there is no shared source of truth between them.
