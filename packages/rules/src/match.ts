import type { GameData } from "@autobattler/data";
import type { MatchState, PlayerState } from "./state.js";
import { mulberry32 } from "@autobattler/sim/src/prng.js";
import { buildInitialPool, returnToPool } from "./pool.js";
import { rollShop } from "./shop.js";
import { runCombatPhase, distributeIncome } from "./rounds.js";

export function createMatch(seed: number, data: GameData): MatchState {
  const prng = mulberry32(seed);
  const pool = buildInitialPool(data);
  const gp = data.gameplay;

  const players: PlayerState[] = [];
  for (let i = 0; i < gp.playerCount; i++) {
    players.push({
      id: i,
      hp: gp.startingHp,
      gold: gp.startingGold,
      xp: 0,
      level: 1,
      bench: [],
      board: new Array(gp.boardSlots).fill(null),
      items: [],
      shop: new Array(data.economy.shopSlots).fill(null),
      winStreak: 0,
      loseStreak: 0,
      alive: true,
      lastBoard: null,
      placement: null,
      roundWins: 0,
      roundLosses: 0,
      totalDamageTaken: 0,
      totalDamageDealt: 0,
    });
  }

  const state: MatchState = {
    players,
    pool,
    round: 1,
    phase: "PLANNING",
    prngState: prng(),
    nextUid: 10000, // magic-ok: uid namespace start, not a tuning number
    pairingHistory: new Map(),
    placements: [],
    lastPairings: [],
    lastRoundSeed: 0,
    lastCombatResults: new Map(),
    lastOpponentBoards: new Map(),
    lastLootOrbs: new Map(),
    lastRoundResult: new Map(),
  };

  // Roll initial shops
  const shopPrng = mulberry32(state.prngState);
  state.prngState = shopPrng();
  for (let i = 0; i < gp.playerCount; i++) {
    rollShop(state, i, shopPrng, data);
  }

  return state;
}

export function advancePhase(state: MatchState, data: GameData): void {
  if (state.phase === "PLANNING") {
    state.phase = "COMBAT";
    runCombatPhase(state, data);
    state.phase = "RESOLUTION";
  } else if (state.phase === "RESOLUTION") {
    distributeIncome(state, data);

    state.round++;
    state.phase = "PLANNING";

    // Refresh shops for alive players
    const prng = mulberry32(state.prngState);
    state.prngState = prng();
    for (const player of state.players.filter((p) => p.alive)) {
      // Return current shop to pool
      for (const slot of player.shop) {
        if (slot) returnToPool(state.pool, slot.defId);
      }
      rollShop(state, player.id, prng, data);
    }
  }
}

export function isMatchOver(state: MatchState): boolean {
  return state.players.filter((p) => p.alive).length <= 1;
}

export function getWinner(state: MatchState): PlayerState | null {
  const alive = state.players.filter((p) => p.alive);
  return alive.length === 1 ? (alive[0] ?? null) : null;
}

export function runMatchToEnd(
  seed: number,
  data: GameData,
  setup?: (state: MatchState) => void
): MatchState {
  const state = createMatch(seed, data);
  setup?.(state);
  let safeguard = 0;
  while (!isMatchOver(state) && safeguard < 10000) { // magic-ok: runaway-loop guard
    advancePhase(state, data);
    safeguard++;
  }
  return state;
}
