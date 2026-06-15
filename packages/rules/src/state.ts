import type { UnitInstance, BoardState, CombatResult } from "@autobattler/sim/src/types.js";
import type { LootOrb } from "./loot.js";

export interface ShopSlot {
  defId: string;
  tier: number;
}

export interface PlayerState {
  id: number;
  hp: number;
  gold: number;
  xp: number;
  level: number;
  bench: UnitInstance[];
  board: (UnitInstance | null)[];
  items: string[];
  shop: (ShopSlot | null)[];
  winStreak: number;
  loseStreak: number;
  alive: boolean;
  lastBoard: BoardState | null;
  placement: number | null;
  // Accumulated match stats (combat rounds only; bye/PvE don't count as W/L).
  roundWins: number;
  roundLosses: number;
  totalDamageTaken: number; // total HP lost to combat across the match
  totalDamageDealt: number; // total HP this player's board took off opponents
}

/** Outcome of one round from a player's perspective. */
export type RoundResultStatus = "won" | "lost" | "bye" | "pve";

/** Per-player result for the just-finished round (for the resolution screen). */
export interface RoundResult {
  status: RoundResultStatus;
  damageTaken: number; // HP lost this round (0 on win/bye/pve)
  damageDealt: number; // HP the opponent lost from this player's board (win only)
}

export type Phase = "PLANNING" | "COMBAT" | "RESOLUTION";

export interface MatchState {
  players: PlayerState[];
  pool: Map<string, number>;
  round: number;
  phase: Phase;
  prngState: number;
  nextUid: number;
  pairingHistory: Map<number, Map<number, number>>; // player id → opponent id → times met
  placements: number[];
  lastPairings: [number, number][]; // [playerA id, playerB id or negative ghost]
  lastRoundSeed: number; // drawn from the match stream before the round's combats
  lastCombatResults: Map<number, CombatResult>; // keyed by player id (both sides of each pairing)
  lastOpponentBoards: Map<number, (UnitInstance | null)[]>; // keyed by player id → opponent's board at combat start
  lastLootOrbs: Map<number, LootOrb[]>; // keyed by player id → orbs awarded this round (PvE; empty otherwise) — already-decided, the client only animates the reveal
  lastRoundResult: Map<number, RoundResult>; // keyed by player id → this round's outcome + damage (for the resolution screen)
}
