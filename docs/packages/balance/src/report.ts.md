# Path & purpose

`packages/balance/src/report.ts` -- the pure markdown renderer that turns one or two SweepReport objects (from sweep.ts) into the balance-report.md body text. No I/O -- cli.ts is the only thing that writes the result to disk.

# Responsibility

Owns all markdown formatting/layout logic for the balance report: percentage formatting, table generation for the comp win matrix, comp overall win rates, per-tier win rates, per-trait win rates, outlier units, and (when both an itemless and itemized report are supplied) a cross-mode "flip" table highlighting traits/units whose win rate crosses 50% or moves more than 8 points between the two item modes.

# Exports

- function renderMarkdown(report: SweepReport, itemized?: SweepReport): string -- the only exported function. Builds the full report body for `report` (always), and if `itemized` is provided, appends a divider, the itemized report's body, and a flip-analysis section comparing the two. Returns the joined markdown string (no trailing newline -- cli.ts appends one when writing to disk).

# Key behavior

- pct(x) -- formats a 0..1 fraction as a percentage string with 1 decimal ("54.3%").
- modeLabel(r) -- "itemized (N items/comp)" when r.itemsPerComp > 0, else "itemless".
- matrixSection -- renders the full comp-vs-comp win-rate matrix as a markdown table (r.matrix[i][j] = comp i as team 0 vs comp j as team 1 win rate), diagonal cells (self-vs-self, which sweep.ts never computes) shown as an em-dash.
- compSection -- comps sorted descending by overall win rate, with win rate and total games played.
- tierSection -- per-tier (1-5) mean unit win rate and unit count, in tier order.
- traitSection -- per-trait average win rate across all comps that activate it, sorted descending by win rate (label includes the mode via modeLabel).
- unitSection -- lists only "outlier" units (win rate >55% or <45%), with win rate, appearance count, variance, and a "disagree" flag (yes/blank) carried straight from UnitStat.disagree; if no outliers, prints a placeholder line stating all units are within range.
- flipSection(a, b, lines) -- internal helper used only when both reports are present. crosses(x,y) is true if x and y are on opposite sides of 50% OR differ by more than 8 percentage points (0.08). Produces two tables: trait flips (joined by trait id) and unit flips (joined by defId, sorted descending by the itemized-mode win rate) between report a (itemless) and b (itemized). Prints an italic placeholder line when the corresponding list is empty.
- reportBody(r, lines) -- assembles one full report section: a mode heading, seeds/total-combats line, avg combat length + overtime rate line, then the matrix/comp/tier/trait/unit sections in that order.
- renderMarkdown itself: pushes the top-level title, calls reportBody(report, ...), and if itemized is given, divider + reportBody(itemized, ...) + flipSection(report, itemized, ...).

# Invariants & constraints

- 100% pure function of its inputs -- given the same SweepReport(s), produces byte-identical markdown every time (no Date.now(), no randomness, no I/O). This determinism matters because cli.ts's whole job is to make the report reproducible from a (seeds, data) pair.
- Table generation assumes r.compOrder/r.matrix are aligned (matrix row/col index i corresponds to compOrder[i]) -- any caller passing a SweepReport with mismatched array lengths between matrix and compOrder would silently produce a malformed table (no validation here).
- All numeric formatting goes through pct/toFixed -- there is no other place in this package that formats balance numbers, so any change to report number formatting (decimal places, percent symbol, etc.) belongs here.

# Depends on

./sweep.js (type-only: SweepReport, TraitStat, UnitStat from packages/balance/src/sweep.ts) -- no runtime dependency, purely consumes the shape of the report objects passed in.

# Used by

packages/balance/src/cli.ts (renderMarkdown(itemless, itemized) -> written to balance-report.md). Re-exported by packages/balance/src/index.ts for any other consumer.

# Notes

- The flip-detection threshold (crosses: sign-flip OR delta > 0.08) is a fixed, hardcoded heuristic -- there's no config knob to tune sensitivity; changing balance-flip detection requires editing this function directly.
- unitSection's outlier threshold (55%/45%) and flipSection's delta threshold (8 points) are independent constants defined inline, not shared/configurable -- worth noting if asked to make these consistent or tunable.
