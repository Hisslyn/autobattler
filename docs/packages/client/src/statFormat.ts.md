# Path & purpose

`packages/client/src/statFormat.ts` -- the single source for converting a stored (raw integer / fixed-point) stat value into its human-readable display string. Used by every UI surface that prints a unit stat or a buff/breakpoint delta.

# Responsibility

Owns: knowledge of WHICH stat keys are fixed-point (currently only attack speed, `as`, at scale 1000) vs. real-valued integers (hp/ad/armor/mr/range/mana/abilityDamage), and the exact textual format for both an absolute stat value and a signed delta (trait breakpoint grant or buff). This is the ONLY place in the client that should divide a raw `as` value by 1000 for display -- nowhere else should raw fixed-point sim values leak directly to the UI.

# Exports

- `type StatKey = "hp" | "ad" | "as" | "armor" | "mr" | "range" | "mana" | "abilityDamage"` -- the canonical stat keys the formatter understands.
- `function formatStat(stat: StatKey | string, value: number): string` -- formats an ABSOLUTE stat value. If `stat === "as"`, returns `(value/1000).toFixed(2)` (e.g. `750` → `"0.75"`); for any other key (or any unrecognized string, since the parameter also accepts plain `string`), returns the raw integer as a template-literal string (e.g. `${value}`, so `300` → `"300"`).
- `function formatStatDelta(stat: StatKey | string, value: number): string` -- formats a SIGNED stat grant (trait breakpoint bonus or buff). Computes `sign = value < 0 ? "-" : "+"` and `mag = Math.abs(value)`; for `as` returns `${sign}${(mag/1000).toFixed(2)}` (e.g. `+280` → `"+0.28"`); otherwise returns `${sign}${mag}` (e.g. `-50` → `"-50"`).

# Key behavior

Both functions are simple, total, pure string formatters with no branching beyond the single `as`-vs-everything-else check. `formatStat` does NOT add a sign for non-`as`/positive values (used for absolute display, e.g. "Armor: 300"). `formatStatDelta` ALWAYS prepends an explicit `+` or `-` (used for delta display, e.g. "+0.28 AS" on a buff tooltip) -- even a `value` of exactly `0` would format as `"+0"` (the `<` comparison means zero takes the `+` branch).

# Invariants & constraints

- **The `SCALE = 1000` constant is a deliberately duplicated mirror of `packages/sim/src/fixed.ts`'s scale**, NOT an import -- the file's header comment explains this is intentional: `sim` is a pure package with a deliberately narrow public surface, and widening its exports just to share a display-layer constant was judged not worth it. A reader must know this means if `sim/src/fixed.ts`'s scale constant ever changes, THIS file's `SCALE` must be manually updated too, with no compiler-enforced link between them.
- **`as` is the only fixed-point stat in the current data set** -- hp/ad/armor/mr/range/mana/abilityDamage are all stored as their real value directly in the sim (per CLAUDE.md: "the sim stores most stats as their real value... but attack speed is fixed-point"). If a future stat is added to the sim as fixed-point, this file's `StatKey` union and both functions' branch conditions need updating or the raw scaled integer will display as if it were the real value (e.g. a fixed-point `750` showing as `"750"` instead of `"0.75"`).
- The `stat: StatKey | string` parameter type is deliberately loose (accepts any string, not just the literal union) -- this lets callers pass a dynamically-keyed stat name (e.g. iterating over a stat-bundle object) without a TypeScript narrowing dance, at the cost of no compile-time guarantee the key is one of the known ones; an unrecognized key silently falls into the "raw integer" branch rather than erroring.
- No rounding/truncation beyond `.toFixed(2)` for `as` -- a value like `753` would format as `"0.75"` (truncated/rounded by `toFixed`, standard JS rounding rules), not `"0.753"`.

# Depends on

Nothing -- zero imports. Pure, standalone, fully unit-testable.

# Used by

- `packages/client/src/inspectModel.ts` -- per CLAUDE.md, uses `formatStat` for the stat block and `formatStatDelta` for buff-ability descriptions in `abilityDescription`.
- `packages/client/src/traitDetailModel.ts` -- `breakpointEffect`'s stat-line formatter uses `formatStatDelta` to render each trait breakpoint's stat grant.
- Likely also consumed indirectly by `packages/client/src/inspectPanel.ts` (renders the stat grid built by `inspectModel`) and `packages/client/src/scenes/match.ts` (trait-strip / inspect rendering), though those files consume the already-formatted strings from the model layer rather than calling this file directly in most cases.

# Notes

- This file is explicitly called out in CLAUDE.md as "Stat display formatter (`statFormat.ts`, pure + unit-tested)... single source for turning a stored stat value into its display string, so raw fixed-point never leaks to the UI" -- it is a hard architectural boundary, not just a convenience helper; any new UI surface displaying a stat should route through this file rather than hand-rolling its own `/1000` math.
- The decision to mirror `SCALE` rather than import it from `sim` is a notable, deliberate design choice documented in-file -- worth flagging to anyone proposing to "clean up" the duplication by exporting `fixed.ts`'s scale more broadly, since that would conflict with `sim`'s intentionally narrow public API.
