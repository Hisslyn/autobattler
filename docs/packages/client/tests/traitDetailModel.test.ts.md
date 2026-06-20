# Path & purpose

`packages/client/tests/traitDetailModel.test.ts` — unit tests for `traitDetailModel`/`breakpointEffect` (`packages/client/src/traitDetailModel.ts`), covering unknown-trait fallback, per-breakpoint `reached`/`active` flag correctness against real `traits.json` data (the `knight` trait's 2/4/6 breakpoints), and the stat-effect line formatter including the attack-speed fixed-point conversion.

# Responsibility

Verifies the trait-detail-panel model (used when a player taps a trait-strip chip to see per-breakpoint progress) correctly identifies which breakpoints are cumulatively `reached` vs the single highest one that's currently `active`, and that `breakpointEffect` renders a human-readable stat-grant line using the correct display label and (for `as`) the fixed-point-aware formatter.

# Exports

None — Vitest test file.

# Key behavior

- "returns null for an unknown trait": `traitDetailModel("__nope__", 0, gameData)` → `null` (no `data.traits` entry matches).
- "lists breakpoints in order with reached + single active flag": uses the real `knight` trait (breakpoints at counts 2/4/6 per traits.json) with `count=4`. Asserts `m.name` matches the real trait's display name (cross-checked via `gameData.traits.find(...)`), `m.count === 4`, `m.rows` map to counts `[2,4,6]` in ascending order (sorted regardless of traits.json's stored order), `reached` flags `[true,true,false]` (4 ≥ 2, 4 ≥ 4, 4 < 6 — cumulative), and exactly ONE row has `active: true` — the count-4 breakpoint (the highest breakpoint count ≤ the player's count), not both reached breakpoints.
- "marks no breakpoint active below the first": with `count=1` (below knight's lowest breakpoint of 2), every row has both `active: false` and `reached: false` — confirms `activeCount` stays `null` when no breakpoint qualifies, and no row spuriously matches `bp.count === null`.
- "renders a stat effect line": four `breakpointEffect` cases — `{stat:"ad", value:25}` → `"+25 AD"`, `{stat:"abilityDamage", value:150}` → `"+150 Ability Power"`, `{stat:"mr", value:600}` → `"+600 Magic Resist"`, and critically `{stat:"as", value:280}` → `"+0.28 Attack Speed"` (NOT `"+280 Attack Speed"`) — confirms `breakpointEffect` delegates to `formatStatDelta` for the magnitude (which applies the scale-1000 conversion for `as`) while supplying its OWN `STAT_LABEL` lookup for the trailing label, decoupled from `statFormat.ts`'s own labeling (which has none — `statFormat` only formats numbers, not English labels).

# Invariants & constraints

- The "single active flag" behavior is the crux of the model: `traitDetailModel`'s `activeCount` reduction picks the HIGHEST breakpoint count `<= count` (a `reduce` that keeps overwriting `acc` as it walks ascending-sorted breakpoints, so the last qualifying one wins) — only that one row gets `active: true`, while all qualifying rows (including lower ones) get `reached: true`. This test is the only place that distinguishes the two flags' different semantics (reached = cumulative threshold met; active = the SINGLE currently-in-effect tier, since trait bonuses in this game are typically the highest-tier-only grant, not stacking).
- `breakpointEffect`'s `STAT_LABEL` map covers `hp`/`ad`/`as`/`armor`/`mr`/`abilityDamage` — any stat not in that map falls back to the raw stat key as the label (untested here but documented in the source as `STAT_LABEL[effect.stat] ?? effect.stat`).
- Relies on `knight`'s breakpoints being exactly `[2,4,6]` in real `traits.json` — if that trait's tuning changes, this test's literal arrays (`[2,4,6]`, `[true,true,false]`) must be updated; it is NOT computed independently from the same source the way `sellValue.test.ts` recomputes its expected formula.

# Depends on

- `@autobattler/data` (`gameData`) — real loaded traits.json content, specifically the `knight` trait's breakpoint structure.
- `../src/traitDetailModel.js` (`traitDetailModel`, `breakpointEffect`) — the two functions under test.
- `vitest` (`describe`, `it`, `expect`).

# Used by

Not imported elsewhere — standalone Vitest test file.

# Notes

- The test comment "attack-speed deltas are fixed-point (scale 1000) → +0.28, not +280" calls out the exact bug class this assertion guards against — a regression where `breakpointEffect` stopped routing through `formatStatDelta` and printed the raw fixed-point integer would silently show players "+280 Attack Speed" instead of the correct "+0.28 Attack Speed."
