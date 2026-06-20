# packages/protocol/src/messages.ts

**Path & purpose** — `packages/protocol/src/messages.ts`. Pure TypeScript type/const definitions for every WS message that can flow client→server (C2S) or server→client (S2C), plus the supporting wire types for loot, round results, and match stats. No logic — types and const-array enums only.

**Responsibility** — Owns the canonical shape of every protocol message. This is the single contract both `packages/server` and `packages/client` compile against; if a message's shape changes, it changes here first.

**Exports**
- `C2SType` — string-literal union of the 6 client→server message type tags: `QUEUE_JOIN`, `QUEUE_LEAVE`, `CMD`, `READY`, `PING`, `RECONNECT`.
- `C2S_QueueJoin {type:"QUEUE_JOIN", authToken?: string}` — join the matchmaking queue; `authToken` optional (absent → anonymous/unauthenticated join attempt, which the server rejects with `UNAUTHENTICATED` per `index.ts`'s documented behavior).
- `C2S_QueueLeave {type:"QUEUE_LEAVE"}` — leave the queue, no payload.
- `C2S_Cmd {type:"CMD", cmd: {type: string, [key: string]: unknown}}` — wraps an arbitrary game command (BUY/SELL/MOVE/EQUIP/etc., defined in `packages/rules/src/commands.ts`); the inner `cmd.type` is NOT constrained to a literal union here — protocol stays decoupled from the rules package's exact command set, so adding a new command type never requires a protocol change.
- `C2S_Ready {type:"READY"}` — signals readiness to skip the 30s planning wait.
- `C2S_Ping {type:"PING", ts: number}` — client-stamped timestamp for RTT measurement.
- `C2S_Reconnect {type:"RECONNECT", token: string}` — resume a dropped connection using a previously issued seat token.
- `C2SMessage` — the discriminated union of all 6 C2S interfaces above.
- `S2CType` — string-literal union of the 12 server→client message type tags: `QUEUE_STATUS`, `MATCH_FOUND`, `STATE_SNAPSHOT`, `STATE_DELTA`, `PHASE_CHANGE`, `COMBAT_START`, `COMBAT_RESULT`, `LOOT`, `ROUND_RESULT`, `MATCH_END`, `ERROR`, `PONG`.
- `LOOT_RARITIES = ["common","uncommon","rare","legendary"] as const` + `LootRarityWire` (its element type) — the wire enum for loot rarity, structurally mirroring `packages/rules/src/loot.ts`'s `LootOrb` rarity field; declared independently here (not imported) to preserve the package's zero-runtime-deps invariant.
- `LootRewardWire` — tagged union `{kind:"gold", amount: number}` | `{kind:"component", id: string}` | `{kind:"item", id: string}` — what a loot orb actually contains.
- `LootOrbWire {rarity: LootRarityWire, reward: LootRewardWire}` — one decided loot orb.
- `ROUND_RESULT_STATUSES = ["won","lost","bye","pve"] as const` + `RoundResultStatusWire` — the wire enum for a round's outcome status, mirroring `packages/rules/src/state.ts`'s `RoundResult.status`.
- `RoundResultWire {status: RoundResultStatusWire, damageTaken: number, damageDealt: number}` — the private per-seat round outcome payload.
- `MatchStats {roundWins, roundLosses, totalDamageTaken, totalDamageDealt: number}` — per-seat accumulated match stats, mirroring the `PlayerState` accumulator fields in rules; carried in `MATCH_END.stats`.
- `S2C_QueueStatus {type, position: number, size: number}` — queue position feedback while waiting.
- `S2C_MatchFound {type, roomId: string, token: string, seatIndex: number}` — match assignment; `token` is the seat's reconnect credential.
- `S2C_StateSnapshot {type, state: unknown}` — full match-state snapshot (untyped at the protocol layer — the actual shape is `packages/rules`' serialized `MatchState`, intentionally opaque here to avoid coupling protocol to rules).
- `S2C_StateDelta {type, delta: unknown}` — incremental state update (also untyped at this layer for the same reason).
- `S2C_PhaseChange {type, phase: string, round: number, endsAt: number}` — phase transition notice (`endsAt` likely an epoch-ms deadline for the planning timer).
- `S2C_CombatStart {type, pairings: [number,number][], opponentSnapshots: Record<number, unknown>, roundSeed: number}` — announces the round's pairings (seat-index tuples), per-seat opponent board snapshots, and the deterministic seed clients use to run their own local sim for presentation.
- `S2C_CombatResult {type, results: unknown}` — the canonical combat outcome (untyped here — actual `CombatResult` shape lives in `packages/sim`); client reconciles its local sim against this.
- `S2C_Loot {type, round: number, orbs: LootOrbWire[]}` — private per-seat PvE loot reveal payload; orbs are already-decided by rules, client only animates.
- `S2C_RoundResult {type, round: number, result: RoundResultWire}` — private per-seat round outcome for the resolution screen.
- `MmrChange {before: number, after: number}` — one seat's MMR delta.
- `S2C_MatchEnd {type, placements: number[], mmr?: Record<number,MmrChange>, names?: Record<number,string>, stats?: Record<number,MatchStats>}` — terminal match message; `placements` is presumably seat-indexed or rank-ordered (consult `packages/server/src/room.ts` for exact semantics); `mmr` only includes seats backed by a real account (bots excluded — bots never persist); `names` is every seat's public display name (humans + generated "Bot N"); `stats` is every seat's accumulated round W/L + damage totals.
- `S2C_Error {type, code: ErrorCode, message: string}` — typed error response.
- `S2C_Pong {type, ts: number, serverTs: number}` — RTT/clock-offset reply to `PING`; echoes the client's `ts` and adds the server's own timestamp.
- `S2CMessage` — the discriminated union of all 12 S2C interfaces above.
- `ErrorCode` — string-literal union of 9 typed error codes: `INVALID_MESSAGE`, `NOT_IN_MATCH`, `WRONG_PHASE`, `WRONG_SEAT`, `COMMAND_REJECTED`, `RATE_LIMITED`, `ALREADY_QUEUED`, `RECONNECT_FAILED`, `UNAUTHENTICATED`.

**Key behavior** — Pure type/const declarations; nothing executes at runtime except the two `as const` arrays (`LOOT_RARITIES`, `ROUND_RESULT_STATUSES`), which exist specifically so `envelope.ts`'s validators can do `.includes()` runtime membership checks against them (TypeScript string-literal unions alone have no runtime representation, hence these const arrays are the runtime-checkable source of truth paired with the type-only unions).

**Invariants & constraints**
- Zero runtime deps (matches the package manifest) — `LootRarityWire`/`LootOrbWire`/`RoundResultWire`/`MatchStats` deliberately do NOT import from `packages/rules`, even though they structurally mirror rules' `LootOrb`/`RoundResult`/`PlayerState` accumulator shapes. Any change to those rules-side shapes must be manually mirrored here — there's no compiler-enforced sync between the two; only structural compatibility (assignability) at usage sites would catch drift, and only if the call sites do a direct structural assignment.
- `C2S_Cmd.cmd` and `S2C_StateSnapshot.state`/`S2C_StateDelta.delta`/`S2C_CombatResult.results`/`S2C_CombatStart.opponentSnapshots` are intentionally typed as `unknown`/loosely-shaped — this is the deliberate protocol/rules decoupling boundary; the protocol package describes the ENVELOPE shape, not deep game-state shape (that's owned by `packages/rules`/`packages/sim` and the consuming app code casts appropriately).
- Every message interface's `type` field is a string LITERAL (not just `string`) — this is what makes the unions discriminated and lets TypeScript narrow on `msg.type` in switch statements (as `envelope.ts`'s `validateC2S` does).
- `mmr`/`names`/`stats` on `S2C_MatchEnd` are all optional (`?`) — older/partial server implementations or test fixtures may omit them; `decodeS2C` only validates `names`/`stats` shape IF present (absence is valid).

**Depends on** — Nothing (leaf file within the package, zero external imports).

**Used by**
- `packages/protocol/src/envelope.ts` — imports `C2SMessage`/`S2CMessage`/`LootOrbWire`/`RoundResultWire`/`MatchStats`/`LOOT_RARITIES`/`ROUND_RESULT_STATUSES` for its encode/decode/validate logic.
- `packages/protocol/src/index.ts` — re-exports everything from this file as part of the public barrel.
- `packages/server` — constructs every outgoing S2C message using these interfaces (room.ts, session.ts, http.ts indirectly via auth flows); `packages/server/src/recorder.ts`'s MMR delta computation feeds `MmrChange`.
- `packages/client/src/net.ts`/`netDriver.ts` — type every incoming/outgoing message against these unions; `driver.ts`'s `DriverEvent` stream and stat accessors (`getMyRoundResult`, `getMatchStats`) are shaped to match `RoundResultWire`/`MatchStats` structurally.

**Notes** — The comment on `LOOT_RARITIES`/`ROUND_RESULT_STATUSES` explicitly states the rationale for NOT importing from `packages/rules` ("protocol keeps zero runtime deps so the shape is declared locally rather than imported") — this is a deliberate, documented architectural tradeoff: duplication-for-decoupling rather than DRY-via-coupling. Any future refactor that tries to "fix" this duplication by importing from rules would violate the package's zero-deps invariant and should be rejected.
