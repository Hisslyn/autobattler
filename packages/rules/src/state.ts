import type { UnitInstance, BoardState, CombatResult } from "@autobattler/sim/src/types.js";

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
}

export type Phase = "PLANNING" | "COMBAT" | "RESOLUTION";

export interface MatchState {
  players: PlayerState[];
  pool: Map<string, number>;
  round: number;
  phase: Phase;
  prngState: number;
  pairingHistory: Map<number, Set<number>>;
  placements: number[];
  lastPairings: [number, number][]; // [playerA id, playerB id or negative ghost]
  lastCombatResults: Map<number, CombatResult>; // key = playerA id
  lastOpponentBoards: Map<number, (UnitInstance | null)[]>; // key = playerA id → opponent's board at combat start
}
