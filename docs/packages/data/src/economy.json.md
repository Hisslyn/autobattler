# Path & purpose

`packages/data/src/economy.json` — the economy/combat-math tuning table for the entire game: pool sizes, shop odds, reroll/XP costs, leveling thresholds, income/interest/streak constants, PvE flat gold, combat damage formula constants, overtime ramp, crit, resolution timing, MMR constants, and item-tier classification numbers. Loaded and typed as `EconomyData` by `packages/data/src/loader.ts`, exposed as `gameData.economy`.

# Responsibility

Owns every numeric constant that isn't unit/trait/item/mob/loot CONTENT (those live in their own JSON files) — this file is the single source for "how much," "how often," and "what odds" across shop, leveling, income, combat damage-from-survivors, overtime, crits, and MMR. Per the CLAUDE.md hard invariant, all tuning numbers live in `packages/data`, never hardcoded in `rules`/`sim`/`server` logic.

# Exports

Not code — a JSON data file. Its shape is typed by the `EconomyData` interface in `loader.ts` (re-exported there, consumed as `gameData.economy` everywhere). Field-by-field:

- `poolCounts: {"1":29,"2":22,"3":18,"4":12,"5":10}` — total pool copies available per tier (1-5) at match start, before any draws. Consumed by `packages/rules/src/pool.ts`'s pool init.
- `shopOdds: number[][]` — a 9-row table (one row per player LEVEL, levels 1-9 by array index) of 5 percentages (tier-1..tier-5 odds, summing to 100 per row) used by `packages/rules/src/shop.ts` to roll each shop slot's tier. Row 0 (level 1) is 100% tier-1; by row 8 (level 9) odds shift toward 10/18/40/22/10 (tier-3/4 dominant, tier-5 reachable). Matches CLAUDE.md's "tiers 4-5 nonzero from mid levels" description (tier-4 first appears at row index 3 / level 4 with weight 2; tier-5 first appears at row index 5 / level 6 with weight 1).
- `shopSlots: 6` — number of shop slots rolled each refresh. **Note**: this is 6, not 5 — `packages/rules/src/match.ts`/`shop.ts`/`rounds.ts` all read `data.economy.shopSlots` directly to size the `player.shop` array and the reroll, so the AUTHORITATIVE shop width is 6. CLAUDE.md's client section describes "shop cards (5: tier-top-border + portrait disc + ...)" and "5 wide cards" — this is a discrepancy between the data-driven count (6) and that prose description; if the client only renders 5 cards while 6 are rolled, the 6th slot's content would be inaccessible to the player (worth verifying against the live `scenes/match.ts` shop rendering when working on shop UI).
- `rerollCost: 2` — gold cost of a manual shop reroll.
- `xpBuyCost: 4`, `xpBuyAmount: 4` — gold cost and XP granted per "Buy XP" action.
- `levelXpThresholds: [0,2,6,12,20,32,50,76,110]` — cumulative XP required to reach each level (index 0 = level 1 threshold 0, up through level 9 threshold 110); consumed by `economy.ts`'s `levelForXp` and the client's `xpProgress` HUD model.
- `interestCap: 5`, `interestPer: 10` — income interest: 1 gold per `interestPer` (10) gold banked, capped at `interestCap` (5) bonus gold from interest.
- `baseIncome: 5` — flat gold every player gets per round before interest/streak.
- `pveBaseGold: 5` — flat gold every ALIVE player gets on a PvE round (separate from `baseIncome`; per CLAUDE.md, "flat gold every alive player gets on a PvE round").
- `streakTable: [{min,max,bonus}]` — win/loss-streak gold bonus bands: streak 0-1 → +0, streak 2 → +1, streak 3-4 → +2, streak 5-99 → +3. Consumed by `economy.ts`'s `calcIncome`.
- `damageBase: 2`, `damageRoundDivisor: 3`, `damageTierWeights: {"1":1,...,"5":5}` — the formula constants for converting a combat loser's surviving-enemy-unit damage into player HP loss (`calcPlayerDamage` in rounds.ts, per-tier weighted by survivor tier, scaled by round number ÷ `damageRoundDivisor`, plus the flat `damageBase`).
- `overtimeBaseDamage: 50`, `overtimeRampPerTick: 10`, `overtimeHardCapTicks: 1800` — combat overtime constants: once a fight exceeds the engine's max tick count, true damage ramps from `overtimeBaseDamage` by `overtimeRampPerTick` per tick, with a hard cap at `overtimeHardCapTicks` ticks total (separate from the engine's own 1200-tick overtime-trigger threshold per CLAUDE.md's sim section — `overtimeHardCapTicks` 1800 is presumably the absolute combat length ceiling, beyond the 1200-tick point where ramping starts).
- `critChance: 150`, `critMultiplier: 1500` — fixed-point (scale 1000) crit chance (15%) and crit damage multiplier (1.5×) used by the combat engine's attack resolution.
- `resolutionSeconds: 5` — how long the resolution-phase auto-advance countdown runs (consumed by the client's resolution overlay countdown bar/label).
- `mmrStart: 1000`, `mmrK: 40`, `mmrEloDivisor: 400` — Elo-style MMR constants for the 8-player-FFA MMR system in `packages/server/src/mmr.ts` (start rating, K-factor, Elo expectation divisor).
- `radiantStatMultiplier: 1750` — fixed-point (scale 1000 = ×1.75) stat scale-up applied when `radiant_enhancer` upgrades a tier-2 completed item to its tier-4 radiant variant (per design-notes.md's rounding-rule section, this multiply uses NEAREST rounding, not the sim's truncating fixed-point math).
- `itemTierComponent: 1`, `itemTierCompleted: 2`, `itemTierArtifact: 3`, `itemTierRadiant: 4`, `itemTierMythical: 5` — the canonical tier number assigned to each item KIND (distinct from unit tiers 1-5, which are a different numbering space) — used by the `reforger` consumable's same-tier-replacement logic and any UI that classifies an item by tier.

# Key behavior

This file is pure static data — no logic. Its numbers are read by: `packages/rules/src/pool.ts` (poolCounts), `shop.ts`/`match.ts`/`rounds.ts` (shopOdds/shopSlots/rerollCost), `economy.ts` (xpBuyCost/xpBuyAmount/levelXpThresholds/interestCap/interestPer/baseIncome/streakTable), `rounds.ts` (pveBaseGold, damageBase/damageRoundDivisor/damageTierWeights for `calcPlayerDamage`), the sim engine (overtime*, critChance/critMultiplier — though CLAUDE.md attributes overtime/crit math to `packages/sim/src/engine.ts`, which must read these constants via the `GameData` parameter passed into `simulateCombat`), `packages/server/src/mmr.ts` (mmrStart/mmrK/mmrEloDivisor), and the rules' item commands (radiantStatMultiplier, itemTier*).

# Invariants & constraints

- Every `shopOdds` row MUST sum to 100 (a probability distribution across 5 tiers) — not enforced by a runtime check visible in this file, but implicitly required by `shop.ts`'s roll logic; a malformed row would silently skew odds rather than error.
- `shopSlots: 6` is the actual authoritative shop width — discrepant with CLAUDE.md's "5 shop cards" client description (see above). This is the kind of drift this documentation pass exists to surface.
- `poolCounts` totals (29+22+18+12+10 = 91 distinct base copies per unit... actually these are PER-TIER pool counts, i.e. total copies across ALL units of that tier, not per-unit) must stay consistent with `packages/rules/tests/pool.test.ts`'s conservation invariant (pool + all benches/boards constant) — changing these numbers changes how many total unit copies exist in a match.
- `damageTierWeights` keys are STRINGS ("1".."5") matching `Record<string, number>` — JSON object keys are always strings; code must use `String(tier)` to index, not the raw number (same pattern as `copiesPerStar` in gameplay.json).
- `radiantStatMultiplier`/`itemTier*` fields are recent additions (item-system phase 2-3 per design-notes.md) — they sit at the END of the file, suggesting they were appended after the original economy tuning was finalized.

# Depends on

Nothing — a leaf JSON file with no imports (JSON can't import).

# Used by

- `packages/data/src/loader.ts` — loads this file, types it as `EconomyData`, exposes as `gameData.economy`.
- `packages/rules/src/{pool,shop,match,rounds,economy}.ts` — primary consumers of nearly every field.
- `packages/sim/src/engine.ts` (via the `GameData` parameter) — overtime/crit constants.
- `packages/server/src/mmr.ts` — mmrStart/mmrK/mmrEloDivisor.
- `packages/client/src/*` — `xpProgress` (levelXpThresholds), resolution overlay (resolutionSeconds), `sellValue.ts`/`itemModel.ts` indirectly via `gameplay.json` (NOT this file) for sell math — economy.json itself feeds shop/HUD displays of cost/odds where relevant.
- `packages/balance/*` — sweep/runner read economy constants via the same `GameData` object passed into `simulateCombat`.

# Notes

- The `shopSlots: 6` vs CLAUDE.md's described "5 shop cards" is the most actionable discrepancy surfaced while documenting this file — worth a quick check of `packages/client/src/scenes/match.ts`'s shop-rendering code to see whether it actually renders 6 cards (and CLAUDE.md is just stale) or genuinely only renders 5 (a real bug hiding the 6th rolled slot from the player).
- `overtimeHardCapTicks: 1800` vs the sim engine's documented "max 1200 ticks then overtime" (CLAUDE.md) suggests two distinct overtime concepts: 1200 ticks is when ramping/overtime STARTS (in the engine itself), and 1800 here may be where overtime damage ramping itself is capped/maxed out — not fully disambiguated without reading `engine.ts`'s overtime implementation directly.
