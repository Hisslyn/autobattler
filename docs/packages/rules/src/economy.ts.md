# packages/rules/src/economy.ts

**Path & purpose** — `packages/rules/src/economy.ts`. Pure economic math: per-round gold income calculation (base + interest + win/lose streak bonus) and XP-to-level resolution. Two small, focused pure functions — no state mutation, no I/O.

**Responsibility** — Owns the formula for "how much gold does a player get this round" and "what level corresponds to this XP total." Both are pure derivations from `PlayerState` fields + `economy.json` tuning constants; neither mutates anything (callers apply the returned values to state themselves).

**Exports**
- `calcIncome(player: PlayerState, data: GameData): number` — computes one round's total gold income for a player: `baseIncome + interest + streakBonus`.
  - `interest = min(econ.interestCap, trunc(player.gold / econ.interestPer))` — integer-truncated gold-per-`interestPer`-threshold, capped at `interestCap` (e.g. if `interestPer=10` and `interestCap=5`, a player with 47 gold earns `min(5, trunc(47/10)) = min(5,4) = 4` interest).
  - `streak`: picks whichever of `winStreak`/`loseStreak` has the LARGER absolute value (`Math.abs(player.winStreak) >= Math.abs(player.loseStreak) ? player.winStreak : -player.loseStreak`) — ties favor the win streak (uses `winStreak` directly, sign-preserved, when equal). The result is then `Math.abs`'d into `streakLen` for table lookup, so the sign only matters for the tie-break selection, not the bonus magnitude itself (lookup happens on length only, the table presumably has separate or symmetric entries — actually NOTE: the table lookup doesn't distinguish win vs lose streak at all once `streakLen` is computed, so a 3-loss-streak and a 3-win-streak get the IDENTICAL bonus from `econ.streakTable` — there's no separate win/lose bonus table here).
  - `streakBonus`: linear scan of `econ.streakTable` (array of `{min, max, bonus}`), takes the first entry where `streakLen` falls within `[min, max]` inclusive, defaults to 0 if no entry matches (e.g. streak length 0, or a length outside all configured ranges).
- `levelForXp(xp: number, data: GameData): number` — resolves a player's level from accumulated XP: walks `data.economy.levelXpThresholds` (an array indexed by level-1, i.e. `thresholds[0]` is the XP needed for level 2, since starting level is 1 with 0 XP) and returns the HIGHEST level (1-indexed: `i+1`) whose threshold `xp` meets or exceeds, clamped to `thresholds.length` (the max representable level — XP beyond the last threshold doesn't level further).

**Key behavior**
- `calcIncome`'s streak-tiebreak logic means a player who is simultaneously tracked with both a nonzero `winStreak` and `loseStreak` (shouldn't normally happen if streaks are mutually exclusive counters reset on the opposite outcome, but the function doesn't assume that) picks the win streak on a tie of magnitudes.
- `levelForXp`'s loop is a simple linear forward-scan (`for i in thresholds`, keep raising `level` while `xp >= thresholds[i]`) — NOT a binary search, fine given `levelXpThresholds` is small (matches the player's max level, a handful of entries).
- Both functions are read-only: `calcIncome` returns the income amount to be ADDED to gold by the CALLER (e.g. `rounds.ts`'s `distributeIncome`); `levelForXp` returns the level to be ASSIGNED by the caller (e.g. `commands.ts`'s BUY_XP handler does `player.level = levelForXp(player.xp, data)` after bumping `xp`).

**Invariants & constraints**
- Pure: no I/O, no randomness, no mutation — safe to call repeatedly/speculatively without side effects, and fully deterministic given identical inputs (required by the project's determinism invariant).
- All tuning constants (`baseIncome`, `interestCap`, `interestPer`, `streakTable`, `levelXpThresholds`) live in `economy.json`, none hardcoded here.
- `Math.trunc` (not `Math.floor`) is used for the interest calculation — matters only for negative gold, which shouldn't occur in practice (gold is clamped non-negative elsewhere), so the choice is largely moot but technically correct either way for non-negative inputs.
- The streak bonus table lookup does NOT differentiate win-streak bonus from lose-streak bonus structurally — if the design intent is "lose streaks should give a smaller/different bonus than equivalent-length win streaks," that would require either a richer `streakTable` shape or additional logic here; as written, both directions share one bonus curve keyed purely on streak length.
- `levelForXp` never returns a level less than 1 (the loop starts `level = 1` and only ever raises it) and never exceeds `thresholds.length` (explicit `Math.min` clamp) — both ends are safe regardless of `xp` being 0, negative (shouldn't happen), or far beyond the top threshold.

**Depends on** — `@autobattler/data`'s `GameData` type (reads `data.economy.*`); `./state.js`'s `PlayerState` type (reads `gold`, `winStreak`, `loseStreak`).

**Used by**
- `packages/rules/src/rounds.ts` — `distributeIncome` calls `calcIncome` once per alive player at round-end to add gold.
- `packages/rules/src/commands.ts` — `BUY_XP` command handler calls `levelForXp` after incrementing `xp`.
- `packages/rules/tests/economy.test.ts` — direct unit coverage of both functions across threshold/cap/streak edge cases.

**Notes** — None beyond the streak-bonus-symmetry observation above; this is a small, stable, fully-tested utility file with no surprising control flow.
