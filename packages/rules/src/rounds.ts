import type { GameData } from "@autobattler/data";
import type { MatchState, PlayerState } from "./state.js";
import type { UnitInstance, BoardState } from "@autobattler/sim/src/types.js";
import { simulateCombat } from "@autobattler/sim";
import { mulberry32 } from "@autobattler/sim/src/prng.js";
import { calcIncome } from "./economy.js";
import { returnUnitsToPool } from "./pool.js";

// PvE rounds (1-indexed): rounds 1, 2, 4 are PvE/carousel
const PVE_ROUNDS = new Set([1, 2, 4]);

export function isPveRound(round: number): boolean {
  return PVE_ROUNDS.has(round);
}

export function buildPairings(
  state: MatchState,
  prng: ReturnType<typeof mulberry32>
): [number, number][] {
  const alivePlayers = state.players
    .filter((p) => p.alive)
    .map((p) => p.id);

  const pairs: [number, number][] = [];
  const used = new Set<number>();

  // Shuffle alive players using prng
  const shuffled = [...alivePlayers];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = prng() % (i + 1);
    const tmp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = tmp;
  }

  // Greedy pairing preferring opponents not yet faced
  for (let i = 0; i < shuffled.length; i++) {
    const a = shuffled[i]!;
    if (used.has(a)) continue;
    const history = state.pairingHistory.get(a) ?? new Set<number>();

    // Find best opponent: prefer unmet, fallback to least-met
    let bestOpp: number | null = null;
    for (let j = i + 1; j < shuffled.length; j++) {
      const b = shuffled[j]!;
      if (used.has(b)) continue;
      if (!history.has(b)) {
        bestOpp = b;
        break;
      }
      if (bestOpp === null) bestOpp = b;
    }

    if (bestOpp !== null) {
      pairs.push([a, bestOpp]);
      used.add(a);
      used.add(bestOpp);
      // Record pairing history
      if (!state.pairingHistory.has(a)) state.pairingHistory.set(a, new Set());
      if (!state.pairingHistory.has(bestOpp)) state.pairingHistory.set(bestOpp, new Set());
      state.pairingHistory.get(a)!.add(bestOpp);
      state.pairingHistory.get(bestOpp)!.add(a);
    }
  }

  // Handle odd survivor: ghost match vs eliminated player's last board
  const unpaired = shuffled.filter((id) => !used.has(id));
  for (const ghostFighterId of unpaired) {
    const eliminated = state.players.filter((p) => !p.alive && p.lastBoard !== null);
    if (eliminated.length > 0) {
      const ghostSource = eliminated[prng() % eliminated.length]!;
      pairs.push([ghostFighterId, -(ghostSource.id + 1)]); // negative id = ghost
    }
  }

  return pairs;
}

function calcPlayerDamage(
  survivingUnits: UnitInstance[],
  round: number,
  data: GameData
): number {
  const econ = data.economy;
  const unitDamage = survivingUnits.reduce((sum, u) => {
    const weight = econ.damageTierWeights[String(u.tier)] ?? 1;
    return sum + weight * u.star;
  }, 0);
  return econ.damageBase + Math.floor(round / 3) + unitDamage;
}

export function runCombatPhase(
  state: MatchState,
  data: GameData
): void {
  const prng = mulberry32(state.prngState);
  state.prngState = prng();

  if (isPveRound(state.round)) {
    // PvE: give item component drops, no HP damage
    for (const player of state.players.filter((p) => p.alive)) {
      const items = Object.keys(data.items);
      if (items.length > 0) {
        player.items.push(items[prng() % items.length]!);
      }
    }
    return;
  }

  const pairings = buildPairings(state, prng);
  state.lastPairings = pairings;
  state.lastCombatResults = new Map();
  state.lastOpponentBoards = new Map();

  for (const [aId, bId] of pairings) {
    const playerA = state.players[aId];
    if (!playerA) continue;

    const boardA: BoardState = {
      units: playerA.board
        .map((u, i) => u ? { ...u, team: 0 as const, pos: { q: i % 7, r: Math.floor(i / 7) } } : null)
        .filter((u): u is NonNullable<typeof u> => u !== null),
    };

    let boardB: BoardState;
    let isGhost = false;
    let opponentBoardSnapshot: (UnitInstance | null)[] = [];

    if (bId < 0) {
      // Ghost fight
      isGhost = true;
      const ghostSource = state.players[-(bId + 1)];
      const ghostBoard = ghostSource?.lastBoard ?? { units: [] };
      boardB = {
        units: ghostBoard.units.map((u) => ({ ...u, team: 1 as const })),
      };
      opponentBoardSnapshot = ghostBoard.units.map((u) => ({ ...u }));
    } else {
      const playerB = state.players[bId];
      if (!playerB) continue;
      boardB = {
        units: playerB.board
          .map((u, i) => u ? { ...u, team: 1 as const, pos: { q: i % 7, r: 7 - Math.floor(i / 7) } } : null)
          .filter((u): u is NonNullable<typeof u> => u !== null),
      };
      opponentBoardSnapshot = [...playerB.board];
    }
    state.lastOpponentBoards.set(aId, opponentBoardSnapshot);

    const seed = prng();
    const result = simulateCombat(boardA, boardB, seed, data);
    state.lastCombatResults.set(aId, result);

    // Update win/lose streaks and apply damage
    if (result.winner === 0) {
      // Player A wins
      playerA.winStreak++;
      playerA.loseStreak = 0;
      if (!isGhost) {
        const playerB = state.players[bId]!;
        playerB.loseStreak++;
        playerB.winStreak = 0;
        const survivorsA = result.survivingUnits.filter((u) => u.team === 0);
        playerB.hp -= calcPlayerDamage(survivorsA, state.round, data);
      }
    } else if (result.winner === 1) {
      // Player B wins (or ghost wins)
      playerA.loseStreak++;
      playerA.winStreak = 0;
      const survivorsB = result.survivingUnits.filter((u) => u.team === 1);
      playerA.hp -= calcPlayerDamage(survivorsB, state.round, data);
      if (!isGhost) {
        const playerB = state.players[bId]!;
        playerB.winStreak++;
        playerB.loseStreak = 0;
      }
    } else {
      // Draw: no HP change, no streak change
    }

    // Save board snapshots (dense, positions preserved)
    playerA.lastBoard = { units: playerA.board.filter((u): u is UnitInstance => u != null) };
    if (!isGhost && bId >= 0) {
      const playerB = state.players[bId]!;
      playerB.lastBoard = { units: playerB.board.filter((u): u is UnitInstance => u != null) };
    }
  }

  // Eliminate players at or below 0 hp
  let placement = state.players.filter((p) => !p.alive).length + 1;
  const eliminated: PlayerState[] = [];
  for (const player of state.players) {
    if (player.alive && player.hp <= 0) {
      eliminated.push(player);
    }
  }
  // Sort eliminated by hp (lowest first = eliminated first)
  eliminated.sort((a, b) => a.hp - b.hp);
  for (const player of eliminated) {
    player.alive = false;
    player.placement = placement++;
    state.placements.push(player.id);
    // Return their units to pool
    returnUnitsToPool(state, [...player.bench, ...player.board.filter((u): u is UnitInstance => u != null)]);
  }
}

export function distributeIncome(state: MatchState, data: GameData): void {
  for (const player of state.players.filter((p) => p.alive)) {
    player.gold += calcIncome(player, data);
  }
}
