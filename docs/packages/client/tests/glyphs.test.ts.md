# Path & purpose

`packages/client/tests/glyphs.test.ts` -- unit tests for `glyphs.ts`'s trait-to-glyph mapping: confirms every origin/class trait in `traits.json` has a corresponding entry in `TRAIT_GLYPH` (completeness enforcement), and confirms `glyphForTraits` correctly prefers a unit's class glyph over its origin glyph, with a safe `"orb"` default when no traits are given.

# Responsibility

Owns: the completeness contract between `@autobattler/data`'s `traits.json` content and `glyphs.ts`'s `TRAIT_GLYPH` lookup table -- guaranteeing that adding a new trait to the data WITHOUT also adding its glyph mapping is caught by a test failure (rather than silently falling back to the default `"orb"` glyph for every unit carrying that trait) -- plus correctness of the class-preferred-over-origin glyph-selection priority used when rendering a unit's primary glyph.

# Exports

None (a Vitest test file).

# Key behavior

Two tests:
- "every origin and class in traits.json has a glyph": filters `gameData.traits` down to any trait whose `id` is NOT a key in `TRAIT_GLYPH`, and asserts that filtered list is empty (`toEqual([])`). This is a completeness sweep over ALL 22 traits (12 origins + 10 classes per CLAUDE.md), not a spot-check of a few -- any trait added to `traits.json` without a corresponding `TRAIT_GLYPH` entry fails this test immediately.
- "prefers the unit's first class for the rendered glyph": three `glyphForTraits` calls. (1) `glyphForTraits(["frost","knight"], ["knight"])` returns `"shield"` -- confirms that when a `classes` array is supplied, its FIRST entry (`"knight"`) is preferred over the first entry of the broader `traits` array (`"frost"`), even though `traits` is passed first positionally. (2) `glyphForTraits(["holy"], [])` returns `"sun"` -- confirms that with an EMPTY `classes` array, the function falls back to the first entry of `traits` (the holy origin's glyph), i.e. "no class -> origin." (3) `glyphForTraits([], [])` returns `"orb"` -- confirms the safe default when NEITHER array has any entries at all.

# Invariants & constraints

- This test enforces a structural invariant called out explicitly in CLAUDE.md ("every origin + class trait maps to a procedural vector glyph in `TRAIT_GLYPH` (completeness is test-enforced)") -- THIS is that test. Any future trait added to `packages/data/traits.json` MUST have a corresponding `GlyphKind` entry added to `TRAIT_GLYPH` in the same change, or this test fails on the next run.
- `glyphForTraits`'s priority logic (per its source: `const preferred = classes?.[0] ?? traits[0]`) is a simple nullish-coalescing fallback, NOT a "prefer non-empty array" check -- the test's case 2 (`classes: []`) relies on the fact that `[].[0]` is `undefined` (not throwing, not `null`), which nullish-coalesces correctly to `traits[0]`. A reader modifying this function to use a different "is this array usable" check (e.g. `classes?.length ? classes[0] : ...`) should re-verify this exact empty-array fallback behavior still holds.
- The final fallback to `"orb"` happens via the `||` operator on the WHOLE expression (`(preferred && TRAIT_GLYPH[preferred]) || "orb"`), not via a separate explicit check -- this means `"orb"` is returned both when `preferred` itself is falsy (e.g. empty arrays, case 3) AND when `preferred` is a non-empty string that simply isn't a key in `TRAIT_GLYPH` (a defensive guard against a typo'd/missing trait id, distinct from the completeness sweep in test 1 which checks the OPPOSITE direction -- every real trait id maps to something).

# Depends on

- `vitest` (`describe`, `it`, `expect`).
- `@autobattler/data` (`gameData`, specifically `gameData.traits`).
- `../src/glyphs.js` (`TRAIT_GLYPH`, `glyphForTraits`).

# Used by

Not imported by any other file (a leaf test file); run as part of the client package's `npm test`/vitest suite. Indirectly validates the lookup table consumed throughout the renderer wherever a unit's class/origin glyph is drawn (`unitToken.ts`'s glyph fallback path, the inspect panel's trait chips, the trait-strip chips, etc. -- everywhere `glyphForTraits`/`TRAIT_GLYPH`/`drawGlyph` from `glyphs.ts` are consumed).

# Notes

- `glyphs.ts`'s `GlyphKind` type also includes several non-trait glyph kinds (`coin`/`refresh`/`levelUp`/`helmet`/`clock`/`monster`/`banner` for stage-2 HUD icons, and `gem`/`component`/`bag` for phase-10b item icons) that are deliberately NOT covered by `TRAIT_GLYPH` or this test -- per the source's own comments ("non-trait HUD icons... not in TRAIT_GLYPH", "non-trait item icons... not in TRAIT_GLYPH"), those are drawn via `drawGlyph` directly with an explicit kind, never resolved through the trait-lookup path this test exercises.
- This file is intentionally small (18 lines) and narrowly scoped to the DATA-MAPPING correctness of `glyphs.ts`, not the actual Pixi drawing logic (`drawGlyph`) -- the visual rendering of each glyph shape is not exercised by any automated test (consistent with the project's general pattern of testing pure logic/data layers headlessly while leaving Pixi-drawing code visually un-asserted).
