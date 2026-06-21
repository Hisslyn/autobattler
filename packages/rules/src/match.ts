import type { GameData } from "@autobattler/data";
import type { MatchState, PlayerState } from "./state.js";
import type { UnitInstance } from "@autobattler/sim/src/types.js";
import { mulberry32 } from "@autobattler/sim/src/prng.js";
import { buildInitialPool, drawFromPool, returnToPool } from "./pool.js";
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
      bench: new Array(gp.benchMax).fill(null),
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

  // Give every player one starting unit on bench slot 0, drawn from the pool.
  // Pool conservation: drawFromPool decrements the pool count so the total
  // (pool + all player holdings) remains constant.
  const startUnitId = gp.startingUnitId;
  const startUnitDef = data.units.find((u) => u.id === startUnitId);
  if (startUnitDef) {
    for (const player of state.players) {
      const drew = drawFromPool(pool, startUnitId);
      if (!drew) {
        // Pool exhausted for this unit — return what we drew so far and stop.
        // In practice the pool has 29 tier-1 copies and there are only 8 players,
        // so this branch should never fire in a normal 8-player game.
        break;
      }
      const unit: UnitInstance = {
        uid: state.nextUid++,
        defId: startUnitDef.id,
        tier: startUnitDef.tier,
        star: 1,
        team: 0,
        pos: { q: 0, r: 0 },
        hp: startUnitDef.hp,
        maxHp: startUnitDef.hp,
        ad: startUnitDef.ad,
        as: startUnitDef.as,
        armor: startUnitDef.armor,
        mr: startUnitDef.mr,
        range: startUnitDef.range,
        mana: startUnitDef.manaStart,
        maxMana: startUnitDef.mana,
        abilityDamage: startUnitDef.abilityDamage,
        attackCooldown: 0,
        statusEffects: [],
        items: [],
        ...(startUnitDef.ability ? { ability: startUnitDef.ability } : {}),
      };
      const slot = player.bench.indexOf(null);
      if (slot >= 0) player.bench[slot] = unit;
    }
  }

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
