# autobattler

8-player PvP auto-battler. Server-authoritative with a shared deterministic simulation core used by both server and clients.

## Hard invariants

- `packages/sim` is pure: no I/O, no `Math.random`, no `Date`, no floats
- All arithmetic uses integer fixed-point math (scale 1000 = 1.0)
- All randomness goes through the seeded mulberry32 PRNG in `prng.ts`
- All tuning numbers (unit stats, trait effects, item stats, economy) live in `packages/data`
- Every change must keep determinism tests green (`npm test`)
- Pool conservation: total unit copies across pool + all player benches/boards is constant
- Command legality is enforced server-side in `packages/rules`; invalid commands return typed errors, never throw
- Server result is canon; client sim is presentation only (reconcile with COMBAT_RESULT, log mismatches)

## Workspace layout

```
packages/
  data/     — JSON content + typed loader, version 0.1.0
  sim/      — pure deterministic combat engine
  rules/    — pure match state machine (no I/O)
  protocol/ — shared WS message types, envelope, encode/decode, validators (zero runtime deps)
  server/   — Node + ws authoritative server (matchmaker, rooms, sessions)
  client/   — Vite + TypeScript + PixiJS v8 web client
```

## Commands

```bash
npm install          # install all workspace deps
npm test             # run all tests via vitest
npm run typecheck    # tsc --build
npm run dev          # start Vite dev server for the client
npm run server       # start the authoritative WS server (default port 3001)
```

## packages/sim internals

- `prng.ts` — mulberry32 seeded PRNG; all sim randomness must use this
- `fixed.ts` — integer fixed-point helpers; scale 1000
- `hex.ts` — axial hex grid 7×8, neighbors, distance, A*
- `types.ts` — UnitDef, TraitDef, ItemDef, UnitInstance (has tier+star), BoardState, CombatEvent, CombatResult
- `engine.ts` — `simulateCombat(boardA, boardB, seed, data) → CombatResult`
  - Applies star multipliers (1.8x at 2-star, 3.24x at 3-star) at combat start
  - Applies trait breakpoint bonuses per team at combat start
  - Applies item stat bundles per unit at combat start
  - Fixed timestep 20 ticks/s, max 1200 ticks then overtime (ramping true damage)
  - Per-tick order: status effects → mana/cast → movement → attacks → death cleanup
  - Targeting: nearest enemy, tiebreak lowest uid
  - Ability: single-target magic damage at full mana
  - Emits ordered CombatEvent log
  - survivingUnits in CombatResult carries tier+star for damage calculation

## packages/data content (v0.1.0)

- 12 units across tiers 1-3: warrior, archer, mage, paladin, rogue, cleric (t1); knight_errant, ranger, archmage (t2); templar, shadowblade, sage (t3)
- 2 traits (knight, sorcerer) with 2/4 breakpoints, stat-buff effects
- 3 items (iron_sword, chain_vest, mana_crystal)
- economy.json: pool counts by tier, shop odds by level, xp thresholds, streak table, income constants, damage constants

## packages/rules internals

- `state.ts` — MatchState, PlayerState, ShopSlot, Phase
- `pool.ts` — pool counts by tier (29/22/18/12/10), draw/return without replacement
- `shop.ts` — roll 5 slots using shopOdds table; reroll returns current shop to pool
- `economy.ts` — calcIncome (base 5 + interest + streak), levelForXp
- `commands.ts` — applyCommand: BUY, SELL, REROLL, BUY_XP, MOVE, EQUIP; validates legality, returns CommandResult (never throws); auto-merge 3 copies → 2-star, cascade 3x 2-star → 3-star
- `rounds.ts` — buildPairings (avoids repeat opponents, ghost on odd count), runCombatPhase, distributeIncome
- `match.ts` — createMatch(seed, data), advancePhase, runMatchToEnd
- `ai.ts` — applyAiCommands(state, playerId, prng, data): seeded bot policy for planning phase

## packages/protocol internals

- Zero runtime deps; pure TypeScript types + helpers
- `messages.ts` — C2SMessage union (QUEUE_JOIN, QUEUE_LEAVE, CMD, READY, PING) and S2CMessage union (QUEUE_STATUS, MATCH_FOUND, STATE_SNAPSHOT, STATE_DELTA, PHASE_CHANGE, COMBAT_START, COMBAT_RESULT, MATCH_END, ERROR, PONG)
- `envelope.ts` — `{ v, t, p }` envelope; `encode(S2CMessage) → string`; `decodeC2S(raw) → C2SMessage | null` with full runtime validation; `decodeS2C` for client side

## packages/server internals

- Single-process Node + ws server on `PORT` (default 3001)
- `session.ts` — connection registry, seat tokens, per-connection rate limit (20 CMD/s), AFK tracking
- `matchmaker.ts` — FIFO queue; 8 players OR 10s timeout with ≥1 human; backfills remaining seats with AI bots
- `room.ts` — owns MatchState; authoritative 30s planning timer; applies validated commands via applyCommand; broadcasts STATE_DELTA on each accepted command; at combat start runs sim server-side and broadcasts COMBAT_START + COMBAT_RESULT; READY from all human seats skips the 30s wait
- `index.ts` — WS server, heartbeat via ws.ping every 5s, reconnect via token restores seat

## packages/client internals

- Vite + TypeScript + PixiJS v8; design resolution 390×844, scale-to-fit
- Mode select on boot: "Practice (local AI)" vs "Online (localhost)"
- `driver.ts` — `IDriver` interface + `LocalDriver`: wraps match.ts with 30s planning timer, skippable via ready(); AI commands applied at phase end; emits DriverEvent stream
- `netDriver.ts` — `NetDriver implements IDriver`: drives scene from server messages; runs local sim from received seed for rendering; reconciles with COMBAT_RESULT (logs mismatch)
- `net.ts` — `NetClient`: WS wrapper with reconnect backoff + token; PING/PONG RTT measurement for clock offset
- `scenes/match.ts` — single screen: HP strip, hex board (player 4 rows + opponent 4 rows), bench (9 slots + sell zone), shop bar (5 cards + reroll/buy-xp/ready)
- **Renderer-is-dumb invariant**: no game logic in the renderer; render strictly from MatchState snapshots and CombatEvent logs; all actions go through driver.playerCommand → applyCommand
- Planning phase: tap shop card to buy; tap unit then tap hex/bench slot to move; tap sell zone to sell; rejections shown as brief toast
- Combat phase: static board display (event log playback is a future enhancement)
- Resolution: round result overlay with Continue button; auto-advance after confirm
