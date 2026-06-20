# Path & purpose

`packages/client/tests/metaTheme.test.ts` -- a small regression test enforcing the "theme.ts as the single source of color" invariant specifically for DOM meta-screen consumers: confirms `tierColor(tier)` and `rankColor(rankId)` always resolve to a color VALUE that actually exists in the theme's `C` palette object, for every real tier (1-5) and every real rank band from `ranks.json`.

# Responsibility

Owns: the guarantee that the DOM-facing color helpers (`tierColor`, `rankColor`, the `RANK_COLOR` lookup table) never silently fall through to an undefined/garbage value -- every tier and every rank band currently defined in real data (`RANK_BANDS` from `@autobattler/data`) must map to a genuine, named entry in `theme.ts`'s `C` palette, not an orphaned or stale color reference.

# Exports

None (a Vitest test file). Module-scope fixture: `definedColors` -- a `Set<number>` of every numeric value currently present in `C` (built via `new Set(Object.values(C))`), used as the "is this a real theme color" membership check throughout.

# Key behavior

- "every tier color the DOM uses resolves to a defined theme value": for `tier` 1 through 5, `definedColors.has(tierColor(tier))` is `true` -- i.e. `tierColor`'s returned numeric value for every real tier must be a value actually present somewhere in `C` (not just "truthy" or "a plausible-looking number" -- a literal value match against the live palette).
- "every rank band maps to a defined theme color": for every band in the real `RANK_BANDS` array (Bronze/Silver/Gold/Platinum/Diamond/Master per CLAUDE.md), TWO checks: `RANK_COLOR[band.id]` is defined (the lookup table has an entry for this band id at all, rather than silently falling through to the `"textMuted"` fallback baked into `rankColor`'s implementation), AND `definedColors.has(rankColor(band.id))` (the resolved numeric color is itself a real `C` entry).

# Invariants & constraints

- This test would catch TWO distinct failure modes for ranks specifically: (1) a new rank band added to `ranks.json` without a corresponding `RANK_COLOR` entry (the rank would silently render in the generic muted fallback color rather than its own tier color -- visually wrong but not a crash); (2) a `RANK_COLOR` entry pointing at a `C` KEY that doesn't actually exist (a TypeScript compile error in practice, since `RANK_COLOR`'s type is `Record<string, keyof typeof C>`, but this runtime test independently re-confirms the same property without relying on the type system catching it).
- `tierColor`/`rankColor` both have built-in fallbacks (`?? C.tier1` for an out-of-range tier; `?? "textMuted"` for an unmapped rank id) -- this test does NOT exercise those fallback paths (it only feeds REAL tiers 1-5 and REAL rank band ids), so it is purely a "the happy path resolves to a real color" guarantee, not a fallback-behavior test.
- This is explicitly framed (via the describe block's name) as protecting the "DOM meta screens reuse theme.ts as the single color source" architecture invariant from CLAUDE.md -- the broader project rule that NO hex color literal may appear outside `theme.ts` (enforced by a separate, more general theme test elsewhere checking for `0x` literals outside this file) is a SEPARATE, stricter check; this file is narrower -- it only confirms tier/rank resolution correctness, not the absence of hex literals project-wide.

# Depends on

- `vitest` (`describe`, `it`, `expect`, `toBe`, `toBeDefined`).
- `@autobattler/data` (`RANK_BANDS`).
- `../src/theme.js` (`C`, `RANK_COLOR`, `rankColor`, `tierColor`).

# Used by

Not imported by any other file (a leaf test file); run as part of the client package's `npm test`/vitest suite. Indirectly validates the color resolution consumed by Profile/Leaderboard's `ui-rank-badge` (rank-tier-colored badges per CLAUDE.md, via `rankCssVar`/`rankColor`) and any UI component reading `tierColor` (shop cards, `UnitToken`'s tier ring, etc.).

# Notes

- The literal `C` values referenced for ranks in `theme.ts` are `rankBronze` (0xb87a4a), `rankSilver`, `rankGold`, `rankPlatinum`, `rankDiamond`, `rankMaster` (0xe0668a) -- a fixed six-entry palette mirroring the six rank bands (Bronze/Silver/Gold/Platinum/Diamond/Master) from `ranks.json`; this test does not assert on the exact hex VALUES, only that they resolve and exist in `C`.
- `theme.ts` also exposes `rankCssVar(rankId)` (CSS-variable form of the same lookup, via `cssVar(RANK_COLOR[rankId] ?? "textMuted")`) for DOM/CSS consumers -- this test file does not exercise that function directly, only the numeric `rankColor`/`tierColor` forms; a DOM-CSS-specific variant of this same guarantee would need a separate check if `rankCssVar`'s own fallback/lookup logic were to diverge from `rankColor`'s.
