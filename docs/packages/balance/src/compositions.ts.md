# Path & purpose

`/Users/azat/Desktop/autobattler/packages/balance/src/compositions.ts` — defines the fixed set of representative team-composition archetypes (`COMPOSITIONS`) used by the balance sweep, plus the pure helpers to turn a `Composition` into a sim-ready `BoardState` (`buildBoard`) and to compute which traits/gold a comp represents.

# Responsibility

Owns: (1) the data-only `Composition`/`CompUnit` shape, (2) the curated list of 24 hand-picked archetype comps (`SLATES` -> `COMPOSITIONS`) covering pure-frontline, pure-backline-carry, and mixed-trait comps, each gold-budget-normalized to the same total spend, (3) deterministic placement of a comp's units onto a `BoardState`'s hex positions (melee front row, ranged back row), (4) deterministic item assignment for the "itemized" sweep mode, (5) gold-cost and active-trait accounting used by `sweep.ts` for reporting.

# Exports

- `interface CompUnit { defId: string; star: 1|2|3 }` — one unit slot in a composition.
- `interface Composition { id: string; name: string; targets: string[]; units: CompUnit[] }` — a named archetype; `targets` lists the trait(s) it's built to activate (used for grouping/labeling in reports, not enforced).
- `const LEVEL = 8` — board slot count every comp fills (mirrors player level 8).
- `const BUDGET = 30` — total gold every comp is normalized to spend on units.
- `const BUDGET_TOLERANCE = 2` — max allowed `|compGold - BUDGET|`.
- `function unitGoldCost(def: UnitDef, star: 1|2|3): number` — `def.tier * STAR_COPIES[star]` where `STAR_COPIES = {1:1, 2:3, 3:9}` (gold cost is modeled as tier times the number of base copies a star level represents — mirrors `packages/rules/src/commands.ts`'s sell-value logic, not the actual shop cost mechanic). Reach for this when computing a comp's "effective gold spend" for any future composition tooling.
- `function compGold(comp: Composition, data: GameData): number` — sums `unitGoldCost` over all of a comp's units (looks up each unit's tier from `data.units`).
- `const COMPOSITIONS: Composition[]` — the 24 ready-built, budget-normalized comps (computed eagerly at module load via `makeComp` over the `SLATES` table and the real `gameData`). This is the default `comps` argument `sweep.ts`'s `runSweep` uses.
- `function buildBoard(comp: Composition, team: 0|1, data: GameData, itemsPerComp?: number): BoardState` — turns a `Composition` into a full `BoardState` (sim-ready `UnitInstance[]`) for one team: builds each `UnitInstance` from its unit def (full stat snapshot, no traits/items applied yet — that's the engine's job at combat start), places melee (range ≤ 1) on a team-relative front row and ranged on a team-relative back row (spilling to the other row if one fills), assigns uid as `team*1000 + i`, then (if `itemsPerComp > 0`) calls `assignItems`. Team 0's front row is hex row 1 / back row 0; team 1's front row is hex row 6 / back row 7 (mirrored placement). This is THE function other balance code (and the sweep) uses to get a board to feed `simulateCombat`/`runMatchup`.
- `function activeTraits(comp: Composition, data: GameData): string[]` — returns the trait ids a comp actually activates by the engine's own rule (>=2 distinct unit defIds carrying the trait, matching `engine.ts`'s unique-defId breakpoint counting) — used purely for report grouping, not enforced during board build.

# Key behavior

- `makeComp(id, name, targets, defIds, data)` (internal, not exported): given exactly `LEVEL` (8) defIds, starts every unit at 1-star, then greedily promotes the single unit whose next star level brings total gold closest to `BUDGET`, repeating until no further promotion improves the gap (or no unit can be promoted further — `maxStar(tier)` caps tier ≥4 units at 2-star, i.e. "a tier-4/5 unit can only reach 2-star within a realistic budget"). Throws if a comp's 1-star floor already exceeds `BUDGET + BUDGET_TOLERANCE` (un-buildable to budget) or if any defId is unknown or the slate length isn't exactly `LEVEL`.
- The `SLATES` table is the actual roster data: 24 `[id, name, targets, defIds[8]]` tuples spanning 4 "pure frontline" archetypes (one per a melee-trait family: knight/warden/berserker/duelist), 4 "pure backline carry" archetypes (sorcerer/gunner/mystic/ranger), and 16 "mixed" comps (one per major origin/class trait plus a couple of cross-trait comps like `holy_knights`, `melee_carry`). The header comment states the design intent: "Every unit appears in >=3 distinct comps so its per-unit signal is real" — this guarantees `sweep.ts`'s per-unit win-rate aggregation has enough data points per unit.
- `assignItems(units, itemsPerComp)` (internal): only runs when `itemsPerComp > 0`; greedily picks (without replacement, tie-broken by lowest uid) the unit with highest `abilityDamage` to receive `AP_ITEMS` (`mana_crystal__sorcerer_rod`, `mana_crystal__giants_belt`, `sorcerer_rod__tear_flask`), the unit with highest `ad` to receive `AD_ITEMS` (`iron_sword__sparring_gloves`, `recurve_bow__sparring_gloves`), and the unit with highest `maxHp + armor*10` to receive `TANK_ITEMS` (`chain_vest__giants_belt`). Note: `itemsPerComp` is actually just a binary on/off gate here (`<=0` -> no items, `>0` -> always exactly these 3 fixed item sets assigned to 3 units) — it does NOT scale the number of items per the numeric value beyond zero-vs-nonzero (the cli.ts `--items` default of 6 is effectively just "nonzero -> apply the fixed assignment").

# Invariants & constraints

- All comps MUST field exactly `LEVEL` (8) units — `makeComp` throws otherwise; this keeps cross-comp comparisons apples-to-apples (same board size as a level-8 player).
- All comps are gold-budget-normalized to `BUDGET ± BUDGET_TOLERANCE` (30 ± 2) — comps with very different unit costs are NOT directly comparable elsewhere in this codebase, this normalization exists specifically so the balance sweep's win-rate comparisons isolate unit/trait power rather than raw gold spend.
- `buildBoard` does NOT apply trait or item STAT bonuses — it only sets `items: [...]` ids on `UnitInstance`s (when itemized) and leaves base stats as the unit def's raw values; the actual item-stat-bundle and trait-breakpoint application happens inside `simulateCombat` (`packages/sim/src/engine.ts`) at combat start, consistent with the engine's documented "applies item stat bundles per unit at combat start" behavior.
- Hex placement assumes a 7-wide row (`q` 0..6) and is deterministic — first free slot at `q=0` upward, first preferred row then the alternate row; throws `"no free hex"` if a row pair is full (cannot happen given LEVEL=8 ≤ 7*2=14 slots per side, but the guard exists).
- Item ids referenced (`AP_ITEMS`, `AD_ITEMS`, `TANK_ITEMS`) are HARDCODED to specific completed-item ids from `packages/data/src/items.json`'s recipe-derived id scheme (`component__component`) — if those item ids are ever renamed/removed in data, this file would silently produce invalid item ids (no validation here).
- `COMPOSITIONS` is computed eagerly at module import time using the real `gameData` from `@autobattler/data` — any invalid defId in `SLATES` throws immediately on import, not lazily.

# Depends on

`@autobattler/sim/src/types.js` (`BoardState`, `UnitInstance`, `UnitDef` — sim's data shapes; imports type-only). `@autobattler/data` (`gameData`, `GameData` — the loaded JSON content + its type), used both for resolving unit defs and as `COMPOSITIONS`'s build-time data source.

# Used by

`packages/balance/src/sweep.ts` (`runSweep` imports `COMPOSITIONS`, `buildBoard`, `activeTraits`, `compGold`, `unitGoldCost`, `type Composition` — uses `COMPOSITIONS` as the default comp list and `buildBoard` to materialize boards for every matchup). `packages/balance/tests/balance.test.ts` likely exercises this indirectly through `runSweep`.

# Notes

- The melee/ranged split for board placement uses `range <= 1` as the melee threshold — this is a balance-tooling convention, not necessarily identical to how `packages/client` or `packages/rules` classify "melee" elsewhere; verify against `units.json` if precise alignment matters.
- `assignItems`'s "itemsPerComp" parameter name suggests a scalar item count but its real behavior is just a 0-vs-nonzero gate onto a hardcoded 3-item assignment — a reader expecting `itemsPerComp=6` to mean "6 items distributed" would be wrong; this is a footgun for anyone modifying the CLI's `--items` flag expecting graduated behavior.
