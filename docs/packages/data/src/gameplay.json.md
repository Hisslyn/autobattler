# Path & purpose

`packages/data/src/gameplay.json` — core match/combat structural constants: player count, starting resources, board/bench sizing, star-merge mechanics, mana/combat-tick constants, and AI bot policy tuning. Loaded and typed as `GameplayData` by `packages/data/src/loader.ts`, exposed as `gameData.gameplay`.

# Responsibility

Owns the foundational numeric constants that shape match structure (8 players, 28 board slots, 9 bench slots), the unit star-up mechanic (copies-per-star, star stat multipliers), the per-tick combat constants shared between sim and rules (mana gain rates, ticks/sec, overtime trigger tick, damage mitigation base), and the seeded AI bot's decision thresholds. Distinct from `economy.json` (money/shop/income) — this file is "how the match itself is shaped and paced."

# Exports

Not code — JSON data, typed via the `GameplayData` interface in `loader.ts`. Field-by-field:

- `playerCount: 8` — fixed lobby size (matches CLAUDE.md's "8-player PvP auto-battler").
- `startingHp: 100` — every player's starting HP pool (lost via `calcPlayerDamage` on combat-round losses).
- `startingGold: 0` — gold every player begins the match with (before round-1 income).
- `benchMax: 9` — bench slot count (matches CLAUDE.md's "9 full-cell slots" bench UI).
- `boardSlots: 28` — total placeable hex slots (matches the sim's "axial hex grid 7×8" = 56 total cells, but only 28 are PLAYER-placeable — half the grid, since each side's board is its own half of the full combat grid; consistent with CLAUDE.md's "player 4 rows + opponent 4 rows" in the client board rendering, 4 rows × 7 cols = 28).
- `copiesPerStar: {"1":1,"2":3,"3":9}` — how many BASE (1-star) copies are consumed to represent one star level: star 1 = 1 copy, star 2 = 3 copies (auto-merged), star 3 = 9 copies (3×3 cascade-merged). Read by `commands.ts`'s auto-merge logic AND by the client's `sellValue.ts` (sell refund = `tier × copiesPerStar[star] × sellValueMultiplier`) and `reforger`'s same-tier math is unrelated (that's item tier, not unit star).
- `sellValueMultiplier: 1` — the multiplier in the sell-refund formula; currently a no-op multiplier (×1), present as a tuning lever.
- `startingUnitId: "warrior"` — the unit id placed in every player's bench slot 0 at match creation (drawn from the real pool, per design-notes.md — NOT hardcoded in `match.ts`).
- `manaPerAttack: 10` — mana gained by a unit per basic attack landed.
- `manaPerDamageTaken: 7` — mana gained by a unit per point of damage taken (the standard "mana from damage" mechanic).
- `starMultipliers: {"1":1000,"2":1800,"3":3240}` — fixed-point (scale 1000) per-star stat multipliers applied at combat start: 1-star = 1.0×, 2-star = 1.8×, 3-star = 3.24× (1.8²) — matches CLAUDE.md's sim section exactly ("1.8x at 2-star, 3.24x at 3-star").
- `ticksPerSec: 20` — the sim's fixed combat timestep (matches CLAUDE.md: "Fixed timestep 20 ticks/s").
- `overtimeStartTick: 1200` — the tick count at which the engine triggers overtime/ramping true damage (matches CLAUDE.md: "max 1200 ticks then overtime"). This is DISTINCT from `economy.json`'s `overtimeHardCapTicks: 1800` and `overtimeBaseDamage`/`overtimeRampPerTick` (this file says WHEN overtime starts; economy.json says HOW MUCH damage ramps and the absolute hard cap).
- `mitigationBase: 100` — the base value in the damage mitigation formula (likely the armor/MR percentage-reduction denominator, e.g. `mitigation = armor / (armor + mitigationBase)` — a standard diminishing-returns defense formula; exact usage lives in `packages/sim/src/engine.ts`'s damage calculation, not directly inspectable from this file alone).
- `aiXpGoldThreshold: 30`, `aiInterestReserve: 10`, `aiTraitOverlapWeight: 10` — seeded bot AI policy tuning (consumed by `packages/rules/src/ai.ts`'s `applyAiCommands`): likely "buy XP once gold exceeds 30 (after other spending)," "keep at least 10 gold banked for interest," and "weight existing-trait-overlap by 10 when deciding which unit to buy/keep" respectively — exact semantics live in `ai.ts`'s implementation.

# Key behavior

Pure static data, no logic. Consumed across `packages/sim/src/engine.ts` (starMultipliers, ticksPerSec, overtimeStartTick, mitigationBase, manaPerAttack, manaPerDamageTaken — all per-tick/per-combat constants the pure sim needs via its `GameData` parameter), `packages/rules/src/{match,commands,economy}.ts` (playerCount, startingHp, startingGold, benchMax, boardSlots, copiesPerStar, sellValueMultiplier, startingUnitId), and `packages/rules/src/ai.ts` (the three `ai*` constants).

# Invariants & constraints

- `starMultipliers` values MUST stay in sync with the sim engine's hardcoded-in-prose description in CLAUDE.md (1.8x/3.24x) — they are read from here, not hardcoded in `engine.ts`, per the "all tuning numbers live in packages/data" hard invariant.
- `copiesPerStar` keys are strings ("1"/"2"/"3") per `Record<string, number>` — same JSON-stringified-key convention as `economy.json`'s `damageTierWeights`.
- `boardSlots: 28` must stay consistent with the sim's hex grid dimensions (7×8 = 56 total cells, half allocated per side) — changing this without updating `packages/sim/src/hex.ts`'s grid dimensions would desync the data-declared board size from the engine's actual placeable cells.
- `overtimeStartTick` (here, 1200) and `economy.json`'s overtime fields (`overtimeBaseDamage`, `overtimeRampPerTick`, `overtimeHardCapTicks`) are split across TWO files — a reader looking only at `economy.json` would miss the actual trigger tick, and vice versa. Both files must be read together to fully understand the overtime mechanic.

# Depends on

Nothing — a leaf JSON file with no imports.

# Used by

- `packages/data/src/loader.ts` — loads + types this file as `GameplayData`, exposes as `gameData.gameplay`.
- `packages/sim/src/engine.ts` (via the `GameData` parameter) — starMultipliers/ticksPerSec/overtimeStartTick/mitigationBase/manaPerAttack/manaPerDamageTaken.
- `packages/rules/src/{match,commands,economy,ai}.ts` — playerCount/startingHp/startingGold/benchMax/boardSlots/copiesPerStar/sellValueMultiplier/startingUnitId and the three AI tuning constants.
- `packages/client/src/sellValue.ts` — copiesPerStar + sellValueMultiplier (pure display mirror of the rules SELL formula).
- `packages/balance/*` — comp-sweep boards read playerCount/boardSlots-adjacent constants via the same `GameData` object.

# Notes

- This file is the natural complement to `economy.json`: `gameplay.json` is "match shape and combat pacing," `economy.json` is "money and odds." A reader needing the FULL overtime/combat-pacing picture must consult both files together (see the invariant above).
- The AI tuning constants (`aiXpGoldThreshold`/`aiInterestReserve`/`aiTraitOverlapWeight`) are sparsely documented here because their exact formula usage lives in `packages/rules/src/ai.ts` — this doc describes the LIKELY intent from the field names but the authoritative semantics are in that file's implementation (to be confirmed when `ai.ts` is documented).
