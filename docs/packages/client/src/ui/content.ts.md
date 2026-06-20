# Path & purpose

`packages/client/src/ui/content.ts` -- static How-to-Play page copy: 4 pages of player-facing explanatory text (Economy, Combat & Traits, Items, Leveling & Shop Odds) rendered by the How-to-Play screen.

# Responsibility

Owns the WORDING of the in-app help content. Deliberately lives in the UI layer rather than `packages/data` because it's presentation copy, not gameplay tuning data -- a distinction the file's header comment makes explicit (this is NOT consulted by any game logic, and changing it has zero gameplay effect).

# Exports

- `interface HelpPage { title: string; paragraphs: string[] }` -- one page's shape: a title and an ordered list of paragraph strings.
- `const HELP_PAGES: HelpPage[]` -- the 4 pages, in display order:
  1. **"Economy"** -- income/interest/streak mechanics, spending options, the greed-vs-spend tension.
  2. **"Combat & Traits"** -- automatic combat basics (move to nearest enemy, attack to build mana, cast at full mana), trait breakpoints (2/4/6 unit-count thresholds), positioning (front-line tank vs back-line carry), and the 60s overtime/ramping-true-damage rule.
  3. **"Items"** -- items as stat bundles + optional passive (on-hit burn / start-of-combat shield), equipping strategy, and the shield-absorbs-before-HP damage routing rule.
  4. **"Leveling & Shop Odds"** -- XP/leveling unlocking board slots + shifting shop odds toward higher tiers, the tier availability curve by level, and the 3-copies-merge-to-2-star / 3×2-star-cascade-to-3-star upgrade mechanic.

# Key behavior

Pure static data -- no functions, no logic, just the exported array literal.

# Invariants & constraints

- **Content here must stay accurate to actual game mechanics but is NOT itself a source of truth for them** -- e.g. the "2/4/6" breakpoint claim, the "60s" overtime threshold, and the "3 copies merge" mechanic are all facts that are ALSO independently encoded in `packages/data` (traits.json breakpoints, economy.json/sim constants, gameplay.json `copiesPerStar`) and `packages/rules`/`packages/sim` logic -- if any of those underlying values change, a maintainer must remember to update this file's prose too, since there's no automated link or test cross-checking this copy against the actual data/constants.
- `ui/app.ts`'s `howToMotif(title)` matches on these pages' exact TITLE STRINGS ("Combat & Traits", "Leveling & Shop Odds") to decide which visual motif (trait diamonds vs tier diamonds) to render alongside a page -- renaming a title here without updating that matching logic in `app.ts` would silently drop the motif for that page (no error, just a quietly missing visual, as already flagged in `ui/app.ts`'s own doc).
- Pages are rendered strictly in array order with Prev/Next navigation in `ui/app.ts`'s `howToScreen` -- reordering this array reorders the tour.

# Depends on

Nothing -- zero imports. Pure static data.

# Used by

`packages/client/src/ui/app.ts` -- `howToScreen()` iterates `HELP_PAGES` by index (`page` counter), rendering the current page's title + paragraphs + optional motif, with Prev/Next buttons bounded by `HELP_PAGES.length`.

# Notes

- This file is the appropriate place to add/edit any future help-page copy; no code changes are needed elsewhere unless the new page's title needs a corresponding visual motif hook in `ui/app.ts`'s `howToMotif`.
- Worth flagging to a future content editor: the "2 / 4 / 6" breakpoint description in the "Combat & Traits" page is a SIMPLIFICATION -- per CLAUDE.md, traits.json's actual breakpoints vary per trait ("breakpoints at 2/4/6 (or 2/4, or 2) derived so every top breakpoint is reachable by unit count"), so not every trait literally has all three of 2/4/6. This copy is giving the general/common case, not a universally exact rule, which is fine as player-facing simplification but worth knowing if a player ever reports "my trait doesn't have a 6 breakpoint" as a discrepancy against this help text.
