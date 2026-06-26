# Mechanics Audit

Audit date: 2026-06-27.
Method: read every test file in `packages/rules/tests/`, `packages/sim/tests/`, `packages/data/tests/`, `packages/server/tests/`, `packages/balance/tests/`, and `packages/client/tests/`. For each mechanic, an assertion is counted as coverage only when it explicitly pins the behavior described (not merely imports or exercises the path incidentally).

---

## packages/rules — economy

- Income: base 5 → covered (`packages/rules/tests/economy.test.ts` › "base income with no gold no streak = 5")
- Income: interest per-10 gold, capped at 5 → covered (`packages/rules/tests/economy.test.ts` › "interest capped at 5: 50g gives +5 interest", "interest capped: 100g still gives +5", "partial interest: 23g gives +2")
- Income: win-streak bonus → covered (`packages/rules/tests/economy.test.ts` › "win streak 2 gives +1 bonus", "win streak 3 gives +2 bonus", "win streak 5+ gives +3 bonus")
- Income: lose-streak bonus → covered (`packages/rules/tests/economy.test.ts` › "lose streak 3 gives +2 bonus")
- Income: combined gold + streak → covered (`packages/rules/tests/economy.test.ts` › "combined: 30g + 3 streak = 5+3+2 = 10")
- Streak mutation: win increments winStreak, resets loseStreak; loss increments loseStreak, resets winStreak → **GAP** — `rounds.ts` lines 470–493 mutate streaks, but no test asserts the post-round streak values directly; `economy.test.ts` only tests `calcIncome` given already-set streak values.
- PvE round: no streak change → **GAP** — `roundStats.test.ts` confirms no W/L counted and roundWins/roundLosses stay zero, but streak fields (winStreak/loseStreak) are never asserted to be unchanged after a PvE round.

## packages/rules — shop odds

- Reroll shop odds by level: level 1 → tier 1 only → covered (`packages/rules/tests/shop.test.ts` › "level 1 shop only rolls tier-1 units")
- Reroll shop odds by level: level 9 can produce tier 3+ → covered (`packages/rules/tests/shop.test.ts` › "level 9 shop can roll tier 3+ units")
- Shop slot count matches economy.json → covered (`packages/rules/tests/shop.test.ts` › "shop has correct number of slots")
- Exact shopOdds tier-probability weights per level → **GAP** — tests verify floor/ceiling tier availability but never pin the numeric weights in `economy.json`'s `shopOdds` table against measured roll frequencies; only a sanity bound is checked.

## packages/rules — pool

- Initial pool total matches data counts → covered (`packages/rules/tests/pool.test.ts` › "initial total matches data counts")
- draw+return is conservative → covered (`packages/rules/tests/pool.test.ts` › "draw+return is conservative")
- Shop rolls draw from pool, total stays constant → covered (`packages/rules/tests/pool.test.ts` › "initial shop rolls and starting bench units draw from the pool, total stays constant")
- buy/sell conservation → covered (`packages/rules/tests/pool.test.ts` › "buy/sell preserves total unit count across pool + player inventories")
- REROLL conservation → covered (`packages/rules/tests/pool.test.ts` › "REROLL preserves the total")
- Per-round shop refresh conservation → covered (`packages/rules/tests/pool.test.ts` › "per-round shop refresh preserves the total")
- Elimination returns all units to pool → covered (`packages/rules/tests/pool.test.ts` › "elimination returns bench, board, and undrafted shop to the pool")
- Conservation across a full AI-driven match → covered (`packages/rules/tests/pool.test.ts` › "invariant holds across a full AI-driven match")

## packages/rules — XP / leveling

- levelForXp(0) = 1 → covered (`packages/rules/tests/economy.test.ts` › "0 xp = level 1")
- levelForXp at first threshold = 2 → covered (`packages/rules/tests/economy.test.ts` › "at first threshold = level 2")
- levelForXp max → covered (`packages/rules/tests/economy.test.ts` › "max level from max xp")
- XP thresholds derived from live economy.json (not hardcoded) → covered (test reads `gameData.economy.levelXpThresholds[1]`)

## packages/rules — buy cost / sell refund

- BUY deducts tier cost, rejects insufficient gold → covered (`packages/rules/tests/commands.test.ts` › "BUY rejects insufficient gold")
- SELL removes unit and increases gold → covered (`packages/rules/tests/commands.test.ts` › "SELL returns gold and unit goes away") — asserts `player.gold > goldBefore` but NOT the exact formula `tier * copiesPerStar * sellValueMultiplier`
- SELL exact refund amount (tier × copiesPerStar × sellValueMultiplier) — client `sellValue.ts` mirror → covered (`packages/client/tests/sellValue.test.ts` › "mirrors the rules SELL formula: tier × copies-per-star × multiplier") using real `gameplay.json` constants. The rules `commands.ts` SELL path applies the same formula but the rules-layer test (`commands.test.ts` line 251) only asserts `gold > goldBefore`, not the exact amount.
- Exact SELL refund per-star (copies-per-star multiplier) asserted at rules layer → **GAP** — `sellValue.test.ts` in the client package pins the exact amounts, but the rules `applyCommand` SELL path itself has no known-answer assertion tying the actual gold credited to the `tier * cps[star] * mult` formula.
- BUY deducts gold by tier cost (exact amount) → **GAP** — commands.test.ts only verifies rejection when gold = 0; no test asserts that buying a tier-3 unit deducts exactly 3 gold.

## packages/rules — 3-copy auto-merge

- 3× 1-star → 2-star on bench → covered (`packages/rules/tests/pool.test.ts` › "3x 1-star -> 2-star on bench")
- 3× 2-star → 3-star cascade (bench+board mix) → covered (`packages/rules/tests/pool.test.ts` › "3x 2-star -> 3-star (cascade from bench+board mix)")
- Merge preserves items (3 sources with 2 items each → merged has 3, inventory has 3) → covered (`packages/rules/tests/pool.test.ts` › "merge preserves items: 3 sources with 2 items each -> merged has 3, inventory has 3")
- BUY with full bench succeeds when it completes a merge → covered (`packages/rules/tests/commands.test.ts` › "BUY with full bench succeeds when it immediately completes a merge")

## packages/rules — items (EQUIP / UNEQUIP / COMBINE_ITEMS)

- COMBINE_ITEMS fuses two loose components → covered (`packages/rules/tests/combine.test.ts` › "combines two loose components in the inventory into the completed item")
- COMBINE_ITEMS rejects non-combinable pair (NO_RECIPE) → covered (`packages/rules/tests/combine.test.ts` › "rejects a non-combinable pair with NO_RECIPE")
- COMBINE_ITEMS rejects missing component (ITEM_NOT_FOUND) → covered (`packages/rules/tests/combine.test.ts` › "rejects when a component is not present (ITEM_NOT_FOUND)")
- EQUIP auto-combine in place (component + matching component on unit = fuse in one slot) → covered (`packages/rules/tests/combine.test.ts` › "equipping a component onto a unit holding a matching component fuses in place")
- EQUIP auto-combine works at 3-item cap → covered (`packages/rules/tests/combine.test.ts` › "auto-combine works even when the unit is at the 3-item cap")
- EQUIP rejects non-combining equip onto full unit (ITEM_SLOTS_FULL) → covered (`packages/rules/tests/combine.test.ts` › "rejects a non-combining equip onto a full unit with ITEM_SLOTS_FULL")
- UNEQUIP moves item from unit to inventory → covered (`packages/rules/tests/combine.test.ts` › "moves an item from a unit back to the inventory")
- UNEQUIP rejects when item not held (ITEM_NOT_FOUND) → covered (`packages/rules/tests/combine.test.ts` › "rejects unequipping an item the unit does not hold")
- EQUIP rejects missing item in inventory (ITEM_NOT_FOUND) → covered (`packages/rules/tests/commands.test.ts` › "EQUIP rejects missing item")
- SELL returns equipped items to inventory → covered (`packages/rules/tests/consumables.test.ts` › "removes the unit and pushes its items back into the inventory")

## packages/rules — recipe lookup

- Known component pair resolves correctly, both orders → covered (`packages/rules/tests/combine.test.ts` › "resolves known component pairs to the correct completed item, both orders")
- Non-recipe / same-component / completed-item-as-input returns null → covered (`packages/rules/tests/combine.test.ts` › "returns null for non-recipe pairs")
- Every completed item is reachable from its component pair → covered (`packages/rules/tests/combine.test.ts` › "every completed item is reachable from its component pair")
- Artifacts and mythicals carry no recipe → covered (`packages/data/tests/integrity.test.ts` › "artifacts and mythicals carry no recipe and no component flag")
- `recipeResult` never returns an artifact/mythical id → **GAP** — `integrity.test.ts` confirms artifacts/mythicals have no `recipe` field, and `combine.test.ts` confirms completed items are reachable; but no test passes artifact/mythical ids into `recipeResult` and asserts the return is null.

## packages/rules — loot (PvE)

- Loot seeded-determinism (same seed+config → identical orbs) → covered (`packages/rules/tests/pve.test.ts` › "is deterministic: same seed + round → identical orbs and contents")
- Orb count and rarities match round's drop config → covered (`packages/rules/tests/pve.test.ts` › "orb count and rarities match the round's drop config")
- Every resolved reward references a real item id or positive gold → covered (`packages/rules/tests/pve.test.ts` › "every resolved reward references a real item id or positive gold")
- applyLootOrb: gold folds into gold → covered (`packages/rules/tests/pve.test.ts` › "applyLootOrb folds gold into gold and item ids into the inventory")
- applyLootOrb: item/component → inventory → covered (`packages/rules/tests/pve.test.ts` › same)
- Loot drops defined for all PvE rounds (stages 1-4) → covered (`packages/rules/tests/pve.test.ts` › "loot drops exist for all defined PvE rounds (stages 1-4)")
- Rarity weighting is sane (heaviest entry dominates) → covered (`packages/rules/tests/pve.test.ts` › "rarity weighting is sane")

## packages/rules — PvE round

- Mobs not in unit pool, carry no traits → covered (`packages/rules/tests/pve.test.ts` › "mobs are not unit-pool defs and carry no traits")
- Mob board does not touch unit pool → covered (`packages/rules/tests/pve.test.ts` › "builds the mob board on the enemy side without touching the unit pool")
- PvE runs combat for every alive player, awards pveBaseGold + loot, deals no HP damage → covered (`packages/rules/tests/pve.test.ts` › "runs mob combat for every alive player, awards base gold + loot, and deals no HP damage")
- PvE is fully deterministic (same seed → same gold, inventory, combat) → covered (`packages/rules/tests/pve.test.ts` › "is fully deterministic: same seed reproduces gold, inventory, and combat")
- PvE no streak change → **GAP** — `roundStats.test.ts` confirms roundWins/roundLosses stay zero and status is "pve", but the actual `winStreak`/`loseStreak` fields are not asserted after a `runPveRound` call.
- pveBaseGold exact amount awarded → **GAP** — test asserts `player.gold >= pveBaseGold` (i.e. `>= 5`) but does not isolate loot gold from base gold; if pveBaseGold were accidentally doubled the test would still pass.

## packages/rules — per-round / match stats

- Win records "won" status with damageDealt > 0 → covered (`packages/rules/tests/roundStats.test.ts` › "records a win for the winner and a loss for the loser with matching damage")
- Loss records "lost" status with damageTaken > 0 → covered (same)
- winner.damageDealt === loser.damageTaken → covered (`packages/rules/tests/roundStats.test.ts` › same + "works regardless of which side (A or B) wins")
- loser HP decremented by damageTaken → covered (`packages/rules/tests/roundStats.test.ts` › "applies the loser's damageTaken to their HP (same term as damageDealt)")
- Unpaired alive player gets bye 0/0 → covered (`packages/rules/tests/roundStats.test.ts` › "marks an unpaired alive player (ghost-side real player) as a bye, 0/0")
- Draw → bye-equivalent 0/0, no W/L → covered (`packages/rules/tests/roundStats.test.ts` › "a draw leaves both players at the bye-equivalent 0/0")
- PvE → status "pve" 0/0, no W/L → covered (`packages/rules/tests/roundStats.test.ts` › "PvE marks every alive player as pve with 0/0 and no W/L")
- lastRoundResult rebuilt fresh each round → covered (`packages/rules/tests/roundStats.test.ts` › "lastRoundResult is rebuilt fresh each round (no stale entries)")
- Accumulators roundWins/roundLosses/totalDamageDealt/totalDamageTaken increment across rounds → covered (`packages/rules/tests/roundStats.test.ts` › "accumulates roundWins/roundLosses and total damage across rounds")
- Accumulators start at zero → covered (`packages/rules/tests/roundStats.test.ts` › "starts every player at zeroed accumulators")

## packages/server/src/mmr.ts — MMR Elo delta

- Equal-MMR lobby deltas: known answer [20,14,9,3,-3,-9,-14,-20] → covered (`packages/server/tests/mmr.test.ts` › "equal-MMR lobby, placements 1..8: known answers, symmetric around 0")
- Sum is zero in equal lobby → covered (`packages/server/tests/mmr.test.ts` › same)
- Winner gains, last place loses → covered (`packages/server/tests/mmr.test.ts` › "winner gains, last place loses in an equal lobby")
- High-MMR player placing last loses more than low-MMR player → covered (`packages/server/tests/mmr.test.ts` › "higher-MMR player placing 8th loses more than lower-MMR player placing 8th")
- Exact formula tested against live economy.json K/divisor/start values → **GAP** — `mmr.test.ts` pins known answers and reads K from `gameData.economy.mmrK`, but does not assert against the `mmrStart` and `mmrEloDivisor` constants; the expected formula is `E = 1/(1+10^((avg-self)/400))` using `mmrEloDivisor=400` and the test would pass even if divisor changed as long as it still ranked the same direction.

## packages/data/src/loader.ts — rank bands

- Known-answer boundaries for every band (Bronze/Silver/Gold/Platinum/Diamond/Master) → covered (`packages/data/tests/rank.test.ts` › "mmr {mmr} -> {id}" for all 13 boundary cases)
- Boundary inclusive on minMmr → covered (`packages/data/tests/rank.test.ts` › "mmr 1000 -> silver")
- Below-lowest-band clamps to lowest → covered (`packages/data/tests/rank.test.ts` › "clamps below the lowest band to the lowest band")
- Bands sorted by ascending minMmr → covered (`packages/data/tests/rank.test.ts` › "bands are sorted by ascending minMmr")

## packages/sim — combat invariants (via trace harness)

All seven invariants documented in `docs/combat-testing.md` are asserted in `packages/sim/tests/combatInvariants.test.ts` over all six scenarios:

- (a) No attack out of range → covered (`combatInvariants.test.ts` › "invariant (a): no unit attacks a target outside its range — {scenario}")
- (b) Target stickiness (no switch off still-valid target; forbidden reasons never emitted) → covered (`combatInvariants.test.ts` › "invariant (b): no target switch off a still-valid (alive+targetable+in-range) target")
- (c) Damage conservation → covered (`combatInvariants.test.ts` › "invariant (c): damage conservation (hp lost == damage applied) — {scenario}")
- (d) No two units share a hex → covered (`combatInvariants.test.ts` › "invariant (d): no two alive units occupy the same hex on any tick — {scenario}")
- (e) Attack interval matches attack speed → covered (`combatInvariants.test.ts` › "invariant (e): melee_1v1: paladin's attack-tick gaps equal trunc(ticksPerSec*SCALE/as)+1 within ±1 tick")
- (f) Bounded termination → covered (`combatInvariants.test.ts` › "invariant (f): combat terminates within the bounded tick cap — {scenario}")
- (g) Determinism across two runs → covered (`combatInvariants.test.ts` › "invariant (g): determinism — identical trace + events across two runs — {scenario}")

Golden snapshot regression: covered (`packages/sim/tests/combatTrace.golden.test.ts` › "{scenario}: trace matches the committed golden snapshot")

## packages/sim — purity (no float/random/date)

- No Math.random in sim/src → covered (`packages/sim/tests/purity.test.ts` › "no Math.random usage")
- No Date.now in sim/src → covered (`packages/sim/tests/purity.test.ts` › "no Date.now usage")
- No parseFloat in sim/src → covered (`packages/sim/tests/purity.test.ts` › "no parseFloat usage")

## packages/sim — determinism (full match)

- 100 runs produce identical JSON output → covered (`packages/sim/tests/determinism.test.ts` › "100 runs produce identical JSON output")
- Event log hash stable for fixed seed (snapshot) → covered (`packages/sim/tests/determinism.test.ts` › "event log hash is stable for fixed seed")
- Different seeds → different hashes; same seed → same hash → covered (`packages/sim/tests/determinism.test.ts` › "different seeds produce different event-log hashes; same seed identical")

## packages/rules — full-match determinism

- Same seed → identical placement order, 50 runs → covered (`packages/rules/tests/match.test.ts` › "same seed -> identical placement order, 50 runs")
- Two same-seed AI-driven matches byte-identical → covered (`packages/rules/tests/match.test.ts` › "two same-seed AI-driven matches in one process are byte-identical")
- Match ends with exactly 1 alive player → covered (`packages/rules/tests/match.test.ts` › "match ends with exactly 1 alive player")

## packages/rules — no magic tuning numbers

- No unlisted numeric literals in sim/rules src → covered (`packages/rules/tests/magicNumbers.test.ts` › "{name} is free of unlisted numeric literals" for every file)

---

## Ranked GAP list (highest risk first)

1. **Streak mutation logic** (`packages/rules/src/rounds.ts` lines 470-493) — win increments `winStreak`/resets `loseStreak`, loss does the reverse, PvE leaves both unchanged. No test asserts the post-round streak field values directly. Streak directly gates income bonus (up to +3 gold/round) and loss-streak does the same. A sign error or wrong reset target would silently corrupt multi-round income without any failing test.

2. **SELL exact gold refund at rules layer** — `applyCommand` SELL credits `tier * copiesPerStar * sellValueMultiplier`. The rules test only asserts `gold > goldBefore`, not the exact amount. If the formula were accidentally applied without the `copiesPerStar` multiplier (e.g. always treating the unit as 1-star), a 3-star sell would refund 1/9 the correct amount — no test would catch it.

3. **BUY cost exact deduction** — commands.test.ts verifies rejection at 0 gold but never pins that buying a tier-N unit deducts exactly N gold. An off-by-one or wrong tier read would not be caught.

4. **pveBaseGold exact award isolation** — the PvE test asserts `player.gold >= pveBaseGold` but does not separate base gold from loot gold. If `pveBaseGold` were accidentally multiplied or applied twice, the test would still pass (gold would be higher, still `>= 5`).

5. **shopOdds exact tier-probability weights** — tests only confirm tier floor (level 1 → tier 1 only) and tier ceiling (level 9 can produce tier 3+). The specific percentage odds in `economy.json`'s `shopOdds` table are never verified as probability distributions, so an incorrect weight for a middle tier would go undetected.

6. **recipeResult never returns artifact/mythical ids** — confirmed structurally by the integrity test (artifacts/mythicals have no `recipe`), but no test passes their ids directly into `recipeResult` and asserts `null`. A future data error adding a spurious recipe field would not be caught until runtime.

7. **Exact MMR Elo divisor** — `mmr.test.ts` reads K from `gameData.economy.mmrK` but does not pin `mmrEloDivisor=400` in the expectation formula. If the divisor changed, the known-answer assertions would still pass for the symmetric equal-lobby case (where expected = 0.5 regardless of divisor) and the directional tests only assert sign, not magnitude.
