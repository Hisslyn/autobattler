// Client → Server message types
export type C2SType = "QUEUE_JOIN" | "QUEUE_LEAVE" | "CMD" | "READY" | "PING" | "RECONNECT";

export interface C2S_QueueJoin { type: "QUEUE_JOIN"; authToken?: string }
export interface C2S_QueueLeave { type: "QUEUE_LEAVE" }
export interface C2S_Cmd {
  type: "CMD";
  cmd: {
    type: string;
    [key: string]: unknown;
  };
}
export interface C2S_Ready { type: "READY" }
export interface C2S_Ping { type: "PING"; ts: number }
export interface C2S_Reconnect { type: "RECONNECT"; token: string }

export type C2SMessage = C2S_QueueJoin | C2S_QueueLeave | C2S_Cmd | C2S_Ready | C2S_Ping | C2S_Reconnect;

// Server → Client message types
export type S2CType =
  | "QUEUE_STATUS"
  | "MATCH_FOUND"
  | "STATE_SNAPSHOT"
  | "STATE_DELTA"
  | "PHASE_CHANGE"
  | "COMBAT_START"
  | "COMBAT_RESULT"
  | "LOOT"
  | "ROUND_RESULT"
  | "MATCH_END"
  | "ERROR"
  | "PONG";

// Loot wire shape (structurally mirrors rules' LootOrb; protocol keeps zero
// runtime deps so the shape is declared locally rather than imported).
export const LOOT_RARITIES = ["common", "uncommon", "rare", "legendary"] as const;
export type LootRarityWire = (typeof LOOT_RARITIES)[number];
export type LootRewardWire =
  | { kind: "gold"; amount: number }
  | { kind: "component"; id: string }
  | { kind: "item"; id: string };
export interface LootOrbWire { rarity: LootRarityWire; reward: LootRewardWire }

// Per-round combat result, per seat (structurally mirrors rules' RoundResult).
export const ROUND_RESULT_STATUSES = ["won", "lost", "bye", "pve"] as const;
export type RoundResultStatusWire = (typeof ROUND_RESULT_STATUSES)[number];
export interface RoundResultWire {
  status: RoundResultStatusWire;
  damageTaken: number;
  damageDealt: number;
}

// Per-seat accumulated match stats (structurally mirrors rules' PlayerState
// accumulators); carried on MATCH_END next to placements/mmr/names.
export interface MatchStats {
  roundWins: number;
  roundLosses: number;
  totalDamageTaken: number;
  totalDamageDealt: number;
}

export interface S2C_QueueStatus { type: "QUEUE_STATUS"; position: number; size: number }
export interface S2C_MatchFound { type: "MATCH_FOUND"; roomId: string; token: string; seatIndex: number }
export interface S2C_StateSnapshot { type: "STATE_SNAPSHOT"; state: unknown }
export interface S2C_StateDelta { type: "STATE_DELTA"; delta: unknown }
export interface S2C_PhaseChange { type: "PHASE_CHANGE"; phase: string; round: number; endsAt: number }
export interface S2C_CombatStart {
  type: "COMBAT_START";
  pairings: [number, number][];
  opponentSnapshots: Record<number, unknown>;
  roundSeed: number;
}
export interface S2C_CombatResult { type: "COMBAT_RESULT"; results: unknown }
/** Private per-seat PvE loot for a round (already decided by rules; client only animates). */
export interface S2C_Loot { type: "LOOT"; round: number; orbs: LootOrbWire[] }
/** Private per-seat result for the just-finished round (resolution screen). */
export interface S2C_RoundResult { type: "ROUND_RESULT"; round: number; result: RoundResultWire }
export interface MmrChange { before: number; after: number }
export interface S2C_MatchEnd {
  type: "MATCH_END";
  placements: number[];
  /** Per-seat MMR change; only seats backed by an account appear. */
  mmr?: Record<number, MmrChange>;
  /** Public per-seat display name (humans + bots). */
  names?: Record<number, string>;
  /** Per-seat accumulated match stats (round W/L, total damage taken/dealt). */
  stats?: Record<number, MatchStats>;
}
export interface S2C_Error { type: "ERROR"; code: ErrorCode; message: string }
export interface S2C_Pong { type: "PONG"; ts: number; serverTs: number }

export type S2CMessage =
  | S2C_QueueStatus
  | S2C_MatchFound
  | S2C_StateSnapshot
  | S2C_StateDelta
  | S2C_PhaseChange
  | S2C_CombatStart
  | S2C_CombatResult
  | S2C_Loot
  | S2C_RoundResult
  | S2C_MatchEnd
  | S2C_Error
  | S2C_Pong;

export type ErrorCode =
  | "INVALID_MESSAGE"
  | "NOT_IN_MATCH"
  | "WRONG_PHASE"
  | "WRONG_SEAT"
  | "COMMAND_REJECTED"
  | "RATE_LIMITED"
  | "ALREADY_QUEUED"
  | "RECONNECT_FAILED"
  | "UNAUTHENTICATED";
