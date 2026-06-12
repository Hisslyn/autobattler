# Audit — autobattler @ 2026-06-12

## 1. Build & tests

| Item | Grade | Evidence |
|---|---|---|
| npm install clean on Node 20 | PARTIAL | Installs exit 0 but on Node v22.18.0 (no Node 20 available; no `engines` field); npm reports "4 vulnerabilities (3 moderate, 1 critical)" in dev deps |
| npm test all green | PASS | `npm test`: "Test Files 14 passed (14), Tests 85 passed (85)" |
| npm run dev builds | PASS | `vite` dev server serves HTTP 200; `vite build` succeeds ("✓ built in 1.09s") |
| tsc strict passes in every workspace | FAIL | `npx tsc --build` exit 2: packages/sim/src/engine.ts:3 TS2459 (`hexKey` not exported), engine.ts:84,97 TS2352, packages/data/src/loader.ts:1-4 TS2880+TS6307, packages/server/tests/integration.test.ts:156 TS2677, plus pixi.js/vite .d.ts errors (root tsconfig lacks skipLibCheck) |
| no skipped/it.only tests | PASS | `grep -rE "\.only\(|\.skip\(|xit\(|xdescribe\("` over packages/*/tests and src → no matches |

## 2. Determinism & purity

| Item | Grade | Evidence |
|---|---|---|
| No Math.random/Date/performance.now/parseFloat/I-O/client imports in sim+rules | PASS | grep over packages/sim/src + packages/rules/src for all patterns → empty |
| No float literals / float math in game math | PARTIAL | No float literals; but [engine.ts:21](packages/sim/src/engine.ts#L21) computes dead float expression `SCALE / (100 + armor) * 1000 \| 0`; damage formulas use float intermediates truncated via Math.trunc (deterministic) |
| simulateCombat: same inputs → byte-identical; 100-run test serializes deeply | PASS | [determinism.test.ts:40-44](packages/sim/tests/determinism.test.ts#L40-L44) compares full `JSON.stringify(result)` strings (deep, not reference) across 100 runs; green |
| Full match fixed seed → identical placements across runs | PARTIAL | [match.test.ts:43-50](packages/rules/tests/match.test.ts#L43-L50) passes, but it never calls applyCommand; with AI commands, two same-seed runs in one process differ (verified: "UID DETERMINISM: DIFFERENT") due to module-global `_uidCounter` at [commands.ts:125](packages/rules/src/commands.ts#L125); also `JSON.stringify(MatchState)` serializes Map fields (pool, lastCombatResults) as `{}` so the test ignores them |
| AI policy seeded, not wall-clock | PASS | [ai.ts:20-25](packages/rules/src/ai.ts#L20-L25) takes injected Prng, uses no Date/Math.random (policy is actually fully deterministic, prng unused) |
| PRNG: single stream owned by match state; no sneaky secondary instances | FAIL | Match phases chain `state.prngState` ([match.ts:41-54](packages/rules/src/match.ts#L41-L54)) but server commands use a separate `room.prng` stream ([room.ts:34](packages/server/src/room.ts#L34),[85](packages/server/src/room.ts#L85)), LocalDriver creates its own ([driver.ts:41](packages/client/src/driver.ts#L41)), and the sim's PRNG is created and never used ([engine.ts:109](packages/sim/src/engine.ts#L109)) — verified: same boards with seeds 1 and 999999 produce byte-identical results |

## 3. Rules correctness vs spec

| Item | Grade | Evidence |
|---|---|---|
| Pool conservation (buy/sell/merge/elimination) | FAIL | Verified: total copies 294 → 1058 over one AI match; `rollShop` never draws from pool ([shop.ts:34-50](packages/rules/src/shop.ts#L34-L50), test comment "roll previews" at [pool.test.ts:14](packages/rules/tests/pool.test.ts#L14)) yet REROLL ([commands.ts:211-212](packages/rules/src/commands.ts#L211-L212)) and round refresh ([match.ts:74-77](packages/rules/src/match.ts#L74-L77)) return those undrawn units to pool (+50 after 10 rerolls, verified); elimination return itself is implemented ([rounds.ts:204](packages/rules/src/rounds.ts#L204)) |
| Merge cascade across bench+board, 3x 2★ → 3★ | PASS | [commands.ts:50-123](packages/rules/src/commands.ts#L50-L123) recursion; tested green at [pool.test.ts:105-159](packages/rules/tests/pool.test.ts#L105-L159) (note: merged units silently drop equipped items, commands.ts:104) |
| Income 5 + interest (1/10g cap 5) + streak 1–3; xp 4g/4xp; board cap = level; reroll 2g | PASS | [economy.json:14-27](packages/data/src/economy.json#L14-L27) (rerollCost 2, xpBuyCost 4/xpBuyAmount 4, interestPer 10/cap 5, streak bonuses 0-3); [economy.ts:4-22](packages/rules/src/economy.ts#L4-L22); board cap at [commands.ts:149](packages/rules/src/commands.ts#L149),[251](packages/rules/src/commands.ts#L251); all covered green in economy.test.ts |
| Shop odds match economy.json per level; draws deplete pool | PARTIAL | Odds: PASS — [shop.ts:7-18](packages/rules/src/shop.ts#L7-L18) cumulative roll over `shopOdds[level-1]`, sanity-tested in shop.test.ts. Depletion: FAIL — `drawFromPool` only called at BUY ([commands.ts:151](packages/rules/src/commands.ts#L151)); rolls never deplete |
| Pairing avoids repeats until forced; ghost on odd; damage = 2 + stage + unit term | PARTIAL | History-aware greedy at [rounds.ts:37-64](packages/rules/src/rounds.ts#L37-L64) but fallback is "first available", not least-met; pairing test assertion weak (`>= 3` of 7, [pairing.test.ts:55](packages/rules/tests/pairing.test.ts#L55)); ghost PASS ([rounds.ts:67-74](packages/rules/src/rounds.ts#L67-L74), tested); damage = `damageBase(2) + floor(round/3) + Σ tierWeight×star` ([rounds.ts:79-90](packages/rules/src/rounds.ts#L79-L90)) matches shape |
| applyCommand rejects gold/bench/board-cap/foreign/wrong-phase; never throws | PARTIAL | Gold/board-cap/empty-slot rejections PASS (commands.test.ts green). Bench: BUY with full bench but board below cap is *accepted* and pushes bench to 10 units (verified `benchLen=10`; [commands.ts:149,177](packages/rules/src/commands.ts#L149)). Foreign units: rejected as UNIT_NOT_FOUND (own-roster search only); `NOT_YOUR_UNIT` dead. Wrong-phase: not enforced in packages/rules at all — only in server [room.ts:72](packages/server/src/room.ts#L72) and LocalDriver [driver.ts:92](packages/client/src/driver.ts#L92). Never throws: holds for valid data (no throw paths reachable; not fuzz-tested) |

## 4. Sim correctness

| Item | Grade | Evidence |
|---|---|---|
| Star multipliers ×1.8/×3.24 fixed-point | PASS | [engine.ts:14](packages/sim/src/engine.ts#L14) `{1:1000, 2:1800, 3:3240}` applied via fmul at engine.ts:57-64 |
| Traits at breakpoints from data, counting unique units | FAIL | [engine.ts:70-73](packages/sim/src/engine.ts#L70-L73) counts unit *copies*, not unique defIds — verified: 2 copies of warrior activate knight(2) (first attack dmg 18 = armor 240, vs 43 expected unbuffed) |
| Items applied at combat start | PARTIAL | `applyItems` works for valid ids ([engine.ts:91-101](packages/sim/src/engine.ts#L91-L101)) but the only item source pushes `Object.keys(data.items)` on an array → players receive `"0"`/`"1"`/`"2"` ([rounds.ts:102-105](packages/rules/src/rounds.ts#L102-L105), verified `items: ["0"]`), which match no ItemDef — items never take effect in real play |
| Tick order status→mana/cast→movement→attack→deaths | PARTIAL | Order holds *per unit* within the uid-sorted loop ([engine.ts:164-246](packages/sim/src/engine.ts#L164-L246)); not phase-segregated across units and deaths handled inline, not as end-of-tick cleanup |
| 1200-tick cap + overtime ramping | FAIL | Loop condition `tick < MAX_TICKS + (overtime ? 0 : 0)` ≡ `tick < 1200` ([engine.ts:141](packages/sim/src/engine.ts#L141)) makes overtime unreachable — verified: unkillable boards end at ticks=1200, winner=draw, no overtime event |
| Targeting nearest, lowest-uid tiebreak | PASS | [engine.ts:29-42](packages/sim/src/engine.ts#L29-L42) `d < bestDist \|\| (d === bestDist && e.uid < best.uid)` |
| A* never paths through occupied hexes | PASS | [hex.ts:81](packages/sim/src/hex.ts#L81) skips blocked except goal hex (standard occupied-goal exemption; movers only take `path[0]`, which can't be the goal at range ≥ 1) |

## 5. Client invariants

| Item | Grade | Evidence |
|---|---|---|
| Renderer holds no authoritative state | PASS | scenes/match.ts renders only from `driver.getState()` / driver getters; local fields are UI-only (selection, drag, panel toggles); all actions via `driver.playerCommand` |
| Combat derived purely from CombatEvent log | FAIL | No event playback — combat renders static pre-combat boards ([match.ts:806-896](packages/client/src/scenes/match.ts#L806-L896)); result display uses `winner === 0` ([match.ts:910](packages/client/src/scenes/match.ts#L910)) and `getMyPairing` only matches when human is the A-side of a pairing ([driver.ts:63](packages/client/src/driver.ts#L63)) → as B-side the player sees "Bye (PvE)" and wrong Victory/Defeat |
| All colors from theme.ts | FAIL | Hardcoded colors outside theme: [match.ts:269](packages/client/src/scenes/match.ts#L269) 0x1a3a5a, [302](packages/client/src/scenes/match.ts#L302) 0x1a3050, [324](packages/client/src/scenes/match.ts#L324) 0x280808, [778](packages/client/src/scenes/match.ts#L778) 0x2a1a1a, [959](packages/client/src/scenes/match.ts#L959) 0x1a3020, [86](packages/client/src/scenes/match.ts#L86) 0x666677/0xbbc4d0; [main.ts:67-89](packages/client/src/main.ts#L67-L89) 0xbbc4d0/0x2a2a3a |
| Pixi interactives use eventMode (+hitArea where needed) | PARTIAL | scenes/match.ts consistently uses `eventMode: "static"/"none"` with hitArea on shop/buttons/dragCatcher; [main.ts:84](packages/client/src/main.ts#L84) uses deprecated `btn.interactive = true` |
| No leaked overlays after phase change | FAIL | Verified headlessly: LocalDriver advances RESOLUTION→PLANNING internally before emitting "RESOLUTION" ([driver.ts:120-136](packages/client/src/driver.ts#L120-L136)), so `advanceFromResolution()` no-ops (phase guard [driver.ts:139](packages/client/src/driver.ts#L139)) and `phase_change: PLANNING` is never re-emitted → resolution overlay is never cleared by [match.ts:799-804](packages/client/src/scenes/match.ts#L799-L804) and the 30s planning timer never restarts after round 1 |
| Drag-drop issues MOVE with exact hex | PASS | [match.ts:584-592](packages/client/src/scenes/match.ts#L584-L592) `hexFromPointer` → slot index → `MOVE {toIndex}`; nearest-center mapping tested green in hexUtils.test.ts |

## 6. Data-driven check

| Item | Grade | Evidence |
|---|---|---|
| No tuning constants hardcoded in sim/rules | FAIL | sim: MANA_PER_ATTACK=10, MANA_PER_DAMAGE_RECV=7, OVERTIME_DAMAGE_PER_TICK=50, STAR_MULT, armor/MR 100-denominator ([engine.ts:9-14](packages/sim/src/engine.ts#L9-L14),[22](packages/sim/src/engine.ts#L22)); rules: BENCH_MAX=9, BOARD_SLOTS=28 ([commands.ts:29-30](packages/rules/src/commands.ts#L29-L30)), copies-per-star 1/3/9 duplicated ([commands.ts:198](packages/rules/src/commands.ts#L198), [pool.ts:32](packages/rules/src/pool.ts#L32)), sell value formula (commands.ts:203), STARTING_HP=100/STARTING_GOLD=0/PLAYER_COUNT=8 ([match.ts:8-10](packages/rules/src/match.ts#L8-L10)), PVE_ROUNDS ([rounds.ts:10](packages/rules/src/rounds.ts#L10)), AI thresholds ([ai.ts:30](packages/rules/src/ai.ts#L30),[59](packages/rules/src/ai.ts#L59)); none in economy.json |

## 7. Code health

| Item | Grade | Evidence |
|---|---|---|
| Circular deps between workspaces | PASS | DAG: data ← sim ← rules ← {server, client}; protocol ← {server, client}; no cycles (package.json deps) |
| Dead code | FAIL | Unused: `_prng` [engine.ts:109](packages/sim/src/engine.ts#L109), `_hexKey` import [engine.ts:3](packages/sim/src/engine.ts#L3) (also a type error), `mitigation` [engine.ts:21](packages/sim/src/engine.ts#L21), `getFriends` [engine.ts:137](packages/sim/src/engine.ts#L137), `poolAvailable`/`totalPoolCount` [pool.ts:39-55](packages/rules/src/pool.ts#L39-L55), `NOT_YOUR_UNIT` [commands.ts:25](packages/rules/src/commands.ts#L25), `botCount` param [room.ts:31](packages/server/src/room.ts#L31); stale build output committed at dist/ and packages/*/dist |
| Duplicated logic client ↔ rules | FAIL | Board-state construction duplicated: [rounds.ts:119-146](packages/rules/src/rounds.ts#L119-L146) vs [netDriver.ts:92-102](packages/client/src/netDriver.ts#L92-L102); UnitInstance construction duplicated in BUY vs tryAutoMerge ([commands.ts:85-105](packages/rules/src/commands.ts#L85-L105) vs [156-176](packages/rules/src/commands.ts#L156-L176)); LocalDriver phase loop re-implements room.ts advanceCombat |
| `any` in exported APIs | PASS | grep `: any|as any|<any>` over packages/*/src → no matches (protocol uses `unknown` for snapshot/delta payloads) |
| Hex pathfinding edge-case coverage | FAIL | No blocked-goal test; the "no path" test asserts only `Array.isArray(path)` with comment "just check it runs" ([hex.test.ts:61-68](packages/sim/tests/hex.test.ts#L61-L68)); hexUtils "resolution auto-advance" tests exercise raw setTimeout, not scene code ([hexUtils.test.ts:37-64](packages/client/tests/hexUtils.test.ts#L37-L64)) |

## 8. CLAUDE.md invariants vs enforcing tests

| Invariant | Grade | Evidence |
|---|---|---|
| sim pure (no I/O, Math.random, Date, floats) | PARTIAL | purity.test.ts checks only Math.random/Date.now/parseFloat in sim; no float/I-O/performance.now check; rules not covered at all |
| Integer fixed-point math (scale 1000) | FAIL | No enforcing test |
| All randomness via seeded mulberry32 | FAIL | No enforcing test; sim's PRNG instance is never consumed (engine.ts:109) |
| All tuning numbers in packages/data | FAIL | No enforcing test; violated (section 6) |
| Determinism tests green | PASS | determinism.test.ts (100-run), match.test.ts (50-run) — though latter bypasses applyCommand and Map fields |
| Pool conservation constant | PARTIAL | pool.test.ts covers buy/sell only; no test for reroll, round refresh, or elimination — the untested paths are exactly where the invariant breaks (294→1058) |
| Command legality in rules, typed errors never throw | PARTIAL | commands.test.ts covers 7 rejection cases; no wrong-phase test (not implemented in rules), no foreign-unit test, no never-throws fuzz |
| Server result canon; client reconciles, logs mismatch | FAIL | No test; reconciliation compares winner only ([netDriver.ts:119-123](packages/client/src/netDriver.ts#L119-L123)); broadcast seed is post-advance `prngState` ([room.ts:159](packages/server/src/room.ts#L159)) while per-pairing seeds were drawn from the internal stream ([rounds.ts:150](packages/rules/src/rounds.ts#L150)) — client local sim cannot reproduce the server combat |

## Severity-ranked gap list

**Blockers**

1. Pool conservation broken: shop rolls never draw from the pool but REROLL and per-round shop refresh return slots to it — pool inflates ~294→1058 over one match, corrupting shop odds and unit availability (packages/rules/src/shop.ts:34, commands.ts:211, match.ts:74; verified empirically).
2. Practice (local) mode soft-breaks after round 1: LocalDriver emits RESOLUTION after the state is already back in PLANNING, so the resolution overlay is never destroyed, `advanceFromResolution()` no-ops, and the 30s planning timer/`phase_change: PLANNING` never fire again (packages/client/src/driver.ts:120-146; verified headlessly).
3. Overtime is unreachable dead code — `tick < MAX_TICKS + (overtime ? 0 : 0)`; long fights end as draws at tick 1200 with no ramping true damage, contradicting CLAUDE.md (packages/sim/src/engine.ts:141-156; verified).
4. Workspace typecheck fails (`tsc --build` exit 2): real errors in sim/engine.ts (unexported `hexKey` import, invalid casts), data/loader.ts (legacy `assert` import attributes, missing JSON include), server test, plus node_modules .d.ts errors from missing skipLibCheck at root.

**Major**

5. Module-global `_uidCounter` in rules makes same-seed matches non-reproducible within a process (uids feed targeting tiebreaks); breaks server-side determinism/replay for any process hosting >1 match (packages/rules/src/commands.ts:125; verified DIFFERENT).
6. PvE item drops grant array indices (`"0"`) instead of item ids (`Object.keys` on an array), so items can never be validly equipped/applied in real play (packages/rules/src/rounds.ts:102).
7. Trait breakpoints count copies, not unique units — two copies of one knight activate knight(2) (packages/sim/src/engine.ts:70; verified).
8. BUY with a full bench but board below cap is accepted and overflows the bench to 10 units (packages/rules/src/commands.ts:149,177; verified).
9. Online combat rendering/reconciliation broken end-to-end: COMBAT_START seed cannot reproduce server combats (room.ts:159 vs rounds.ts:150), `opponentSnapshots` are keyed off the *previous* round's pairings (room.ts:148-154), and COMBAT_RESULT is keyed by pairing A-side only so B-side players receive no result (room.ts:290-296, netDriver.ts:117).
10. A/B-side asymmetry in client drivers: a player who is the B-side of a pairing gets null pairing/opponent-board/result and an inverted win check (`winner === 0`), showing "Bye (PvE)" and wrong Victory/Defeat (packages/client/src/driver.ts:63-77, scenes/match.ts:910).
11. Reconnect is non-functional: disconnect deletes the token mapping, QUEUE_JOIN carries no token, and the lookup finds the *current* session's own fresh token (packages/server/src/session.ts:39-43, index.ts:64).
12. Sim never consumes its seed — combat outcome is independent of the seed parameter; the "different seeds produce different results" test admits this and asserts nothing (packages/sim/src/engine.ts:109, determinism.test.ts:60-70).
13. Merging three units destroys any items equipped on them (packages/rules/src/commands.ts:104).

**Minor**

14. Wrong-phase command rejection lives only in server/room.ts and LocalDriver, not in packages/rules as CLAUDE.md implies; no typed PHASE error in CommandError.
15. Tuning constants hardcoded across sim/rules (mana gains, overtime dpt, star multipliers, bench/board caps, copies-per-star, starting hp/gold, PvE rounds, AI thresholds) instead of packages/data.
16. STATE_DELTA broadcasts the acting player's full private state (gold, shop, bench) to all seats — information leak (packages/server/src/room.ts:282-288, 214-222).
17. Hardcoded colors bypass theme.ts in scenes/match.ts and main.ts; main.ts uses deprecated `.interactive = true`.
18. Pairing fallback picks first available opponent rather than least-met; pairing test asserts `>= 3` of 7 expected opponents.
19. Hex A*/no-path edge cases untested (vacuous assertions); hexUtils "auto-advance timer" tests exercise setTimeout itself, not scene logic.
20. Match determinism tests serialize MatchState with JSON.stringify, silently dropping Map fields (pool, pairingHistory, lastCombatResults).
21. Units reference traits with no definitions (ranger, assassin, holy) — silent no-ops; economy.json carries pool counts/odds for tiers 4-5 with no units.
22. Server broadcasts PHASE_CHANGE "RESOLUTION" when authoritative state is already PLANNING (no real resolution pause online); resolution overlay shows the already-incremented round number.
23. Dead code: `_prng`, `_hexKey`, `mitigation`, `getFriends`, `poolAvailable`, `totalPoolCount`, `NOT_YOUR_UNIT`, unused `botCount`; stale compiled artifacts committed under dist/ and packages/*/dist.
24. npm install reports 4 dev-dependency vulnerabilities (3 moderate, 1 critical); no `engines` field to pin Node 20.
