import type { GameData, MobStageDef } from "@autobattler/data";
import type { MatchState, PlayerState } from "./state.js";
import type { UnitInstance, BoardState, CombatResult } from "@autobattler/sim/src/types.js";
import type { Prng } from "@autobattler/sim/src/prng.js";
import { simulateCombat } from "@autobattler/sim";
import { COLS, ROWS } from "@autobattler/sim/src/hex.js";
import { mulberry32 } from "@autobattler/sim/src/prng.js";
import { calcIncome } from "./economy.js";
import { returnUnitsToPool, returnToPool } from "./pool.js";
import { generateLoot, applyLootOrb } from "./loot.js";

export function isPveRound(round: number, data: GameData): boolean {
  return data.gameplay.pveRounds.includes(round);
}

/** The PvE stage fought on a given round, if any. */
export function pveStageForRound(round: number, data: GameData): MobStageDef | null {
  return data.mobs.stages.find((s) => s.round === round) ?? null;
}

/**
 * Builds a PvE stage's creep board (side 1). Mobs reuse UnitInstance but are
 * never drawn from the unit pool and carry no traits, so they never affect
 * the player's trait counts. Uids come from the match's uid namespace.
 */
export function buildMobBoard(state: MatchState, stage: MobStageDef, data: GameData): BoardState {
  const slots: (UnitInstance | null)[] = new Array(data.gameplay.boardSlots).fill(null);
  for (const placement of stage.units) {
    const mob = data.mobs.mobs.find((m) => m.id === placement.mobId);
    if (!mob) continue;
    const unit: UnitInstance = {
      uid: state.nextUid++,
      defId: mob.id,
      tier: mob.tier,
      star: placement.star,
      team: 1,
      pos: { q: 0, r: 0 },
      hp: mob.hp,
      maxHp: mob.hp,
      ad: mob.ad,
      as: mob.as,
      armor: mob.armor,
      mr: mob.mr,
      range: mob.range,
      mana: mob.manaStart,
      maxMana: mob.mana,
      abilityDamage: mob.abilityDamage,
      attackCooldown: 0,
      statusEffects: [],
      items: [],
      ...(mob.ability ? { ability: mob.ability } : {}),
    };
    if (placement.slot >= 0 && placement.slot < slots.length) slots[placement.slot] = unit;
  }
  return boardToCombatState(slots, 1);
}

/**
 * Derives the seed for one pairing's combat from the round seed.
 * Must be used identically by rules, server, and clients re-simulating
 * from COMBAT_START. Constants are avalanche-mix steps, not tuning.
 */
export function derivePairingSeed(roundSeed: number, pairingIndex: number): number {
  let h = (roundSeed ^ Math.imul(pairingIndex + 1, 0x9e3779b1)) >>> 0; // magic-ok: hash constant
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0; // magic-ok: hash constant
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0; // magic-ok: hash constant
  return (h ^ (h >>> 16)) >>> 0; // magic-ok: hash constant
}

/** Converts a board-slot array to a combat BoardState for the given side. */
export function boardToCombatState(
  board: (UnitInstance | null)[],
  side: 0 | 1
): BoardState {
  return {
    units: board
      .map((u, i) =>
        u
          ? {
              ...u,
              team: side,
              pos: {
                q: i % COLS,
                r: side === 0 ? Math.floor(i / COLS) : ROWS - 1 - Math.floor(i / COLS),
              },
            }
          : null
      )
      .filter((u): u is NonNullable<typeof u> => u !== null),
  };
}

/** Converts a ghost (dense, positions preserved) board to the B-side BoardState. */
export function ghostToCombatState(units: UnitInstance[]): BoardState {
  return { units: units.map((u) => ({ ...u, team: 1 as const })) };
}

export interface PairingView {
  opponentId: number; // negative = ghost source encoding, check isGhost
  isGhost: boolean;
  side: 0 | 1;
  result: CombatResult | null;
  opponentBoard: (UnitInstance | null)[] | null;
  outcome: "win" | "loss" | "draw" | null;
}

/** Returns the last combat pairing normalized to the asking player's perspective. */
export function getPairingFor(state: MatchState, playerId: number): PairingView | null {
  for (const [aId, bId] of state.lastPairings) {
    if (aId !== playerId && bId !== playerId) continue;
    const side: 0 | 1 = aId === playerId ? 0 : 1;
    const isGhost = side === 0 && bId < 0;
    const opponentId = side === 0 ? bId : aId;
    const result = state.lastCombatResults.get(playerId) ?? null;
    const opponentBoard = state.lastOpponentBoards.get(playerId) ?? null;
    const outcome =
      result === null
        ? null
        : result.winner === "draw"
          ? "draw"
          : result.winner === side
            ? "win"
            : "loss";
    return { opponentId, isGhost, side, result, opponentBoard, outcome };
  }
  return null;
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

  const meetCount = (a: number, b: number): number =>
    state.pairingHistory.get(a)?.get(b) ?? 0;

  // Backtracking: perfect matching whose total meet count is the given
  // budget; budget 0 means "all pairs unmet". Players are consumed in
  // shuffle order, so randomness is preserved across equivalent matchings.
  function matchWithBudget(remaining: number[], budget: number): [number, number][] | null {
    if (remaining.length === 0) return [];
    const a = remaining[0]!;
    for (let j = 1; j < remaining.length; j++) {
      const b = remaining[j]!;
      const cost = meetCount(a, b);
      if (cost > budget) continue;
      const rest = remaining.filter((_, k) => k !== 0 && k !== j);
      const sub = matchWithBudget(rest, budget - cost);
      if (sub) return [[a, b], ...sub];
    }
    return null;
  }

  if (shuffled.length % 2 === 0 && shuffled.length > 0) {
    // Prefer an all-unmet matching; failing that, relax the repeat budget
    // one meet at a time so repeats go to the least-met pairs overall.
    let maxBudget = 0;
    for (let i = 0; i < shuffled.length; i++) {
      for (let j = i + 1; j < shuffled.length; j++) {
        maxBudget += meetCount(shuffled[i]!, shuffled[j]!);
      }
    }
    let matched: [number, number][] | null = null;
    for (let budget = 0; matched === null && budget <= maxBudget; budget++) {
      matched = matchWithBudget(shuffled, budget);
    }
    for (const [a, b] of matched ?? []) {
      pairs.push([a, b]);
      used.add(a);
      used.add(b);
    }
  } else {
    // Odd count: greedy, prefer unmet (shuffle order), fallback least-met
    // (min meet count, tiebreak lowest seat id); the leftover gets a ghost.
    for (let i = 0; i < shuffled.length; i++) {
      const a = shuffled[i]!;
      if (used.has(a)) continue;
      let bestOpp: number | null = null;
      let bestCount = Infinity;
      for (let j = i + 1; j < shuffled.length; j++) {
        const b = shuffled[j]!;
        if (used.has(b)) continue;
        const count = meetCount(a, b);
        if (count === 0) {
          bestOpp = b;
          break;
        }
        if (count < bestCount || (count === bestCount && (bestOpp === null || b < bestOpp))) {
          bestOpp = b;
          bestCount = count;
        }
      }
      if (bestOpp !== null) {
        pairs.push([a, bestOpp]);
        used.add(a);
        used.add(bestOpp);
      }
    }
  }

  // Record pairing history (meet counts, both directions)
  for (const [a, b] of pairs) {
    if (!state.pairingHistory.has(a)) state.pairingHistory.set(a, new Map());
    if (!state.pairingHistory.has(b)) state.pairingHistory.set(b, new Map());
    state.pairingHistory.get(a)!.set(b, meetCount(a, b) + 1);
    state.pairingHistory.get(b)!.set(a, meetCount(b, a) + 1);
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
  return econ.damageBase + Math.floor(round / econ.damageRoundDivisor) + unitDamage;
}

/**
 * PvE round: every alive player fights the round's creep board (built once and
 * shared). Combat is deterministic per player from the round seed; PvE never
 * damages player HP or changes streaks. At round end each player gets flat
 * pveBaseGold plus seeded loot orbs resolved deterministically from loot.json.
 */
export function runPveRound(state: MatchState, prng: Prng, data: GameData): void {
  state.lastPairings = [];
  state.lastCombatResults = new Map();
  state.lastOpponentBoards = new Map();
  state.lastLootOrbs = new Map();

  const roundSeed = prng();
  const lootSeed = prng();
  state.lastRoundSeed = roundSeed;

  const stage = pveStageForRound(state.round, data);
  const mobBoard: BoardState = stage ? buildMobBoard(state, stage, data) : { units: [] };
  const mobSnapshot: (UnitInstance | null)[] = mobBoard.units.map((u) => ({ ...u }));

  for (const player of state.players.filter((p) => p.alive)) {
    const boardA = boardToCombatState(player.board, 0);
    const result = simulateCombat(boardA, mobBoard, derivePairingSeed(roundSeed, player.id), data);
    state.lastCombatResults.set(player.id, result);
    state.lastOpponentBoards.set(player.id, mobSnapshot);

    player.gold += data.economy.pveBaseGold;
    const lootPrng = mulberry32(derivePairingSeed(lootSeed, player.id));
    const orbs = generateLoot(state.round, lootPrng, data);
    for (const orb of orbs) {
      applyLootOrb(player, orb);
    }
    // Record the already-decided orbs so the canonical client can animate the
    // reveal deterministically (it never re-derives loot itself).
    state.lastLootOrbs.set(player.id, orbs);
  }
}

export function runCombatPhase(
  state: MatchState,
  data: GameData
): void {
  const prng = mulberry32(state.prngState);
  state.prngState = prng();

  if (isPveRound(state.round, data)) {
    runPveRound(state, prng, data);
    return;
  }

  const pairings = buildPairings(state, prng);
  // Round seed is drawn from the match stream before any combat runs;
  // per-pairing seeds are derived from it by index.
  const roundSeed = prng();
  state.lastPairings = pairings;
  state.lastRoundSeed = roundSeed;
  state.lastCombatResults = new Map();
  state.lastOpponentBoards = new Map();
  state.lastLootOrbs = new Map();

  for (let pairingIndex = 0; pairingIndex < pairings.length; pairingIndex++) {
    const [aId, bId] = pairings[pairingIndex]!;
    const playerA = state.players[aId];
    if (!playerA) continue;

    const boardA = boardToCombatState(playerA.board, 0);

    let boardB: BoardState;
    let isGhost = false;
    let opponentBoardSnapshot: (UnitInstance | null)[] = [];

    if (bId < 0) {
      // Ghost fight
      isGhost = true;
      const ghostSource = state.players[-(bId + 1)];
      const ghostBoard = ghostSource?.lastBoard ?? { units: [] };
      boardB = ghostToCombatState(ghostBoard.units);
      opponentBoardSnapshot = ghostBoard.units.map((u) => ({ ...u }));
    } else {
      const playerB = state.players[bId];
      if (!playerB) continue;
      boardB = boardToCombatState(playerB.board, 1);
      opponentBoardSnapshot = [...playerB.board];
      state.lastOpponentBoards.set(bId, [...playerA.board]);
    }
    state.lastOpponentBoards.set(aId, opponentBoardSnapshot);

    const seed = derivePairingSeed(roundSeed, pairingIndex);
    const result = simulateCombat(boardA, boardB, seed, data);
    state.lastCombatResults.set(aId, result);
    if (!isGhost && bId >= 0) state.lastCombatResults.set(bId, result);

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
    // Return their units (bench + board) and undrafted shop copies to pool,
    // then clear holdings so pool conservation counts each copy once.
    returnUnitsToPool(state, [...player.bench, ...player.board.filter((u): u is UnitInstance => u != null)], data);
    for (const slot of player.shop) {
      if (slot) returnToPool(state.pool, slot.defId);
    }
    player.bench = [];
    player.board = new Array(data.gameplay.boardSlots).fill(null);
    player.shop = new Array(data.economy.shopSlots).fill(null);
  }
}

export function distributeIncome(state: MatchState, data: GameData): void {
  for (const player of state.players.filter((p) => p.alive)) {
    player.gold += calcIncome(player, data);
  }
}
