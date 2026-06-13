# Repo Audit — 2026-06-13

## 1. Build & tests

| Item | Grade | Evidence |
|---|---|---|
| npm install clean (Node ≥ 20) | PASS | exit=0, "up to date, audited 124 packages" on Node v22.18.0 (engines `>=20`); 4 npm-audit vulns (1 critical) in dev deps, install itself clean |
| npm test all green | PASS | 137/137 tests, 20 files passed (`vitest run` 23.05s), pretest typecheck included |
| npm run dev builds | PASS | `vite` dev ready in 85ms on :5173; `vite build` succeeds (index-C3_tEKce.js 335.29 kB) |
| tsc strict in every workspace | PASS | root tsconfig.json: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`; includes `packages/*/src` + `packages/*/tests`; `tsc --build` exit 0; client tsconfig also `"strict":true` |
| no skipped / it.only tests | PASS | grep for `.only(/.skip(/it.todo/xit/xdescribe` across packages/*/src+tests → no matches |

## 2. Determinism & purity

| Item | Grade | Evidence |
|---|---|---|
| sim/rules free of Math.random, Date, performance.now, parseFloat, I/O, float literals, client imports | PASS | greps over packages/{sim,rules}/src all clean; enforced by sim/tests/purity.test.ts + rules/tests/magicNumbers.test.ts (rejects any literal incl. floats outside whitelist) |
| simulateCombat byte-identical; 100-run test serializes deeply | PASS | sim/tests/determinism.test.ts:40-44 compares `JSON.stringify(simulateCombat(...))` of full result ×100, plus sha256 snapshot of event log |
| full match fixed seed → identical placements; AI seeded | PASS | rules/tests/match.test.ts:63-76 — 50 runs via map-aware deep serializer (tests/serializeMatchState.ts); ai.ts is a pure function of (state, prng, data), no wall clock |
| PRNG single stream owned by match state; no unseeded secondaries | PASS | `state.prngState` threaded at match.ts:38,49-50,70-71 and rounds.ts:210-211; every `mulberry32(...)` call site explicitly seeded; only Date.now seeds are match-creation entropy (server room.ts:33, LocalDriver default) outside sim/rules |

## 3. Rules correctness

| Item | Grade | Evidence |
|---|---|---|
| Pool conservation (buy/sell/merge/elimination incl. boards) | PASS | rounds.ts:319-325 returns bench+board+shop on elimination; pool.test.ts:107-177 asserts invariant through elimination and a full AI match |
| Merge cascade bench+board, 3×2-star → 3-star | PASS | commands.ts:47-125 (recursive `tryAutoMerge` over bench+board); pool.test.ts:207-258 |
| Income 5 + interest(1/10g cap 5) + streak ≤3; xp 4g/4xp; board cap = level; reroll 2g | PASS | economy.ts:4-22; economy.json (`rerollCost:2`, `xpBuyCost/Amount:4`, `interestCap:5`, streak bonuses 0-3); board cap commands.ts:260; economy.test.ts all green |
| Shop odds from economy.json per level; draws deplete pool | PASS | shop.ts:8-20 reads `shopOdds[level-1]` directly; drawFromPool at roll time shop.ts:51; pool.test.ts:54-63; shop.test.ts sanity (exact distribution not statistically tested) |
| Pairing avoids repeats until forced; ghost on odd; damage = 2 + stage + unit term | PASS | rounds.ts:111-141 budget-relaxation matching, ghost 181-188; calcPlayerDamage rounds.ts:193-204 = `damageBase(2) + floor(round/3) + Σ tierWeight·star`; pairing.test.ts:33-48 (7 distinct opponents over 7 rounds) |
| applyCommand rejects bad gold/full bench/over-cap/foreign units/wrong phase; never throws | PASS | commands.test.ts covers gold, BENCH_FULL, BOARD_FULL, EMPTY_SLOT, ITEM_NOT_FOUND, all 6 cmds × COMBAT/RESOLUTION → PHASE_INVALID; foreign uids → UNIT_NOT_FOUND structurally (commands.ts:33-45 searches own player only — no explicit cross-player test); all paths return CommandResult |

## 4. Sim correctness

| Item | Grade | Evidence |
|---|---|---|
| Star multipliers ×1.8/×3.24 fixed-point | PASS | engine.ts:43-50 `fmul` with data `starMultipliers {2:1800, 3:3240}`; no test asserts multiplied stats (see gaps) |
| Traits applied at breakpoints, counting unique units | PASS | engine.ts:62-68 counts unique defIds; determinism.test.ts:177-193 (2 copies ≠ active, 2 distinct = active) |
| Items applied at combat start | PASS | engine.ts:85-94 + 111-114; caveat: stat `"mana"` adds to current mana not maxMana (mana_crystal = starting mana) — see gaps |
| Tick order status→mana/cast→movement→attacks→death cleanup | PARTIAL | engine.ts:192-272 — per-unit order is status→cast→move→attack with deaths emitted inline; no separate end-of-tick death-cleanup phase, and processing is per-unit sequential rather than per-phase; deterministic but diverges from documented phase order |
| 1200-tick cap + overtime ramp | PASS | engine.ts:167-188 (`overtimeStartTick:1200`, hard cap 1800, ramp 50+10/tick); determinism.test.ts:114-132 incl. hard-cap HP tiebreak |
| Targeting nearest, lowest-uid tiebreak | PASS | engine.ts:22 `d < bestDist || (d === bestDist && e.uid < best.uid)`; no dedicated test (see gaps) |
| A* never paths through occupied hexes | PASS | hex.ts:81 blocks all occupied except goal (standard exemption; engine consumes only `path[0]`, never the goal hex since movement requires dist>range); hex.test.ts:65-109 incl. blocked goal, walled no-path, 25 randomized boards |

## 5. Client invariants

| Item | Grade | Evidence |
|---|---|---|
| Renderer holds no authoritative state; combat purely from event log | PASS | combat/reducer.ts pure fold (no Pixi/MatchState); view.ts renders frames only; every scene action goes through `driver.playerCommand` (match.ts:600-720); combat.test.ts reducer-conformance vs engine result. Exception: trait panel/scout re-derive trait counts and count copies, diverging from engine's unique-unit rule (see gaps) |
| All colors from theme.ts | PASS | theme.test.ts forbids `0x` literals in client src outside theme.ts — green |
| Pixi interactives use eventMode (+hitArea where needed) | PASS | all interactives set `eventMode` (match.ts:160,221,284,319,341,372,415,433,452,739,795,971,1057); explicit hitArea on shop cards, buttons, dragCatcher, Continue; Graphics geometry hit-test elsewhere |
| No leaked overlays after phase change | PASS | onPlanningStart clears combatLayer + resolution timer + scout (match.ts:813-819); driver.test.ts:96-119 asserts every RESOLUTION is followed by PLANNING (the teardown trigger) |
| Drag-drop issues MOVE with exact hex | PASS | onDragEnd → `hexFromPointer` → `MOVE {toIndex: boardSlot}` (match.ts:598-606); hexUtils.test.ts covers center, off-center, distance threshold, -1 cases |

## 6. Data-driven check

| Item | Grade | Evidence |
|---|---|---|
| No tuning constants hardcoded in sim/rules | PASS | rules/tests/magicNumbers.test.ts rejects any numeric literal ∉ {0,1,2,3} in all sim/rules src (whitelist: prng/fixed/hex structure + justified `magic-ok` lines) — all 12 file checks green. Client-side stragglers: `RESOLUTION_AUTO_ADVANCE_MS=5000` (match.ts:29) duplicates `economy.resolutionSeconds`; HUD hp fraction `p.hp/100` (match.ts:214) vs `gameplay.startingHp` |

## 7. Code health

| Item | Grade | Evidence |
|---|---|---|
| Circular deps between workspaces | PASS | dep graph: data ← sim ← rules ← {server, client}; protocol dep-free — acyclic (workspace package.json deps) |
| Dead code | PARTIAL | netDriver.ts:150-153 PONG case unreachable (net.ts:67-70 swallows PONG before emit → `_clockOffset` always 0); unused `pg` dependency in server/package.json (zero references in src); validateC2S emits `authToken` not present on `C2S_QueueJoin` type (envelope.ts:56-58) |
| Duplicated logic client driver vs rules | PARTIAL | LocalDriver correctly delegates to rules (driver.ts:112,139); but scene re-implements trait-count logic divergently (match.ts:474-478, 766-769 vs engine.ts:62-68) and duplicates the resolution auto-advance timer (scene 5000ms + driver `resolutionSeconds`) |
| `any` in exported APIs | PASS | grep `: any|as any|any[]|<any>` over all packages/*/src → none; protocol payloads use `unknown` (weak but not `any`) |
| Hex pathfinding edge-case coverage | PASS | hex.test.ts:65-75 blocked/occupied target, 77-82 fully-walled no path → `[]`, 84-109 randomized blocked boards assert no occupied step + adjacency |

## 8. CLAUDE.md invariants vs enforcing tests

| Invariant | Grade | Evidence |
|---|---|---|
| sim pure (no Math.random/Date/floats/I/O) | PASS | purity.test.ts (Math.random/Date.now/parseFloat) + magicNumbers.test.ts (float/numeric literals); no direct no-I/O test but import surface is clean |
| Integer fixed-point, scale 1000 | PARTIAL | SCALE used throughout (fixed.ts); no test asserts fixed-point arithmetic results (e.g. star multiplier math) |
| Seeded mulberry32 only | PASS | prng.test.ts known-answer; determinism suites |
| Tuning numbers live in packages/data | PASS | magicNumbers.test.ts |
| Determinism tests green | PASS | determinism.test.ts, match.test.ts (50-run + byte-identical) |
| Pool conservation | PASS | pool.test.ts (8 cases incl. elimination + full match) |
| Command legality server-side, typed errors never throw | PASS | commands.test.ts; server applies via applyCommand (room.ts:86) |
| Server result canon; client reconciles + logs mismatch | PARTIAL | server room.test.ts proves client resim hash == server hash both sides; the mismatch-log path itself (netDriver.ts:136-139) has no test |
| Combat playback = pure reducer over event log | PASS | combat.test.ts reducer conformance, mid-playback, skip equivalence |
| Renderer-is-dumb (no game logic in renderer) | PARTIAL | theme.test + reducer tests cover parts; no test guards scenes/ against game logic, and the trait-panel divergence shows the gap |
| Star multipliers 1.8×/3.24× | FAIL (no test) | applied in engine.ts:43-50 but no test asserts the values |
| Tick order incl. death cleanup | FAIL (no test) | no test pins per-tick phase order |
| Targeting nearest/lowest-uid | FAIL (no test) | engine.ts:22 untested directly |
| Player damage formula | FAIL (no test) | calcPlayerDamage (rounds.ts:193-204) has no unit test |
| Item stat bundles in combat | FAIL (no test) | items.test.ts covers drop+equip only, not combat stat application |
| Data content claims accurate | PARTIAL | CLAUDE.md says "2 traits (knight, sorcerer)"; traits.json has 5 (knight, sorcerer, ranger, assassin, holy) — doc drift; units (12) and items (3) match |
| Pairing avoids repeats / ghost | PASS | pairing.test.ts |
| 8p or 10s matchmaker + bots; reconnect; rate limit | PASS | integration.test.ts (2 humans + 6 bots, reconnect token, >20 CMD/s disconnect) |

## Severity-ranked gaps

**Blocker** — none. Build, typecheck, and all 137 tests pass; core determinism/conservation invariants hold.

**Major**

1. Placement semantics inverted: rounds.ts:304-316 gives the FIRST eliminated player `placement = 1`; the winner never gets a placement. MATCH_END (room.ts:182-186) appends the winner last, and the match-over screen (scenes/match.ts:1114-1133) renders `#1 = first eliminated` and shows "You placed #1" for both the winner (null-placement fallback) and the first player out. Deterministic but user-facing standings are wrong.
2. Online clock offset is dead: net.ts:67-70 consumes PONG without emitting, so netDriver.ts:150-153 never runs and `_clockOffset` stays 0 — `getPlanningTimeLeft()` ignores server clock skew, defeating the documented PING/PONG clock-offset mechanism.
3. Renderer duplicates trait logic and gets it wrong: match.ts:474-478 and 766-769 count unit copies while engine.ts:62-68 counts unique defIds — trait panel/scout can display a breakpoint as active that combat will not apply (violates renderer-is-dumb).

**Minor**

4. Untested sim invariants (CLAUDE.md §8 FAILs): star multipliers 1.8×/3.24×, item stat application in combat, per-tick phase order, targeting tiebreak, calcPlayerDamage formula.
5. EQUIP has no per-unit item cap (commands.ts:283-294) while merge truncates to 3 (commands.ts:104) — a unit can carry unlimited items via direct equips.
6. Item stat `"mana"` (mana_crystal) adds to current mana, not maxMana (engine.ts:52-56) — likely unintended "starting mana" semantics; can start a unit at full mana for an instant cast.
7. Engine applies items before traits (engine.ts:110-117) while CLAUDE.md documents traits-then-items; commutative for current flat-add effects but order-sensitive if multiplicative effects are added.
8. Client hardcodes tuning-adjacent constants: resolution auto-advance 5000ms (match.ts:29) duplicating `economy.resolutionSeconds`, HUD hp `/100` (match.ts:214) vs `gameplay.startingHp`.
9. Dead/drifting code: unused `pg` dependency (server/package.json); `authToken` emitted by validateC2S but absent from `C2S_QueueJoin` type (envelope.ts:56-58); CLAUDE.md trait-count drift (2 documented vs 5 shipped).
10. Test gaps: no explicit foreign-uid rejection test in commands.test.ts; shop odds distribution only sanity-checked (level-1/level-9), not statistically verified against economy.json.
11. npm audit reports 4 vulnerabilities (2 moderate, 1 high, 1 critical) in the dependency tree (dev tooling: vite 5/vitest 1 era).
