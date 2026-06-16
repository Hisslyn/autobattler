import { describe, it, expect } from "vitest";
import { gameData } from "@autobattler/data";
import { createMatch } from "../src/match.js";
import { runCombatPhase, runPveRound } from "../src/rounds.js";
import { mulberry32 } from "@autobattler/sim/src/prng.js";
import type { MatchState } from "../src/state.js";
import type { UnitInstance } from "@autobattler/sim/src/types.js";

function makeUnit(uid: number, defId: string, team: 0 | 1, q: number, r: number): UnitInstance {
  const def = gameData.units.find((d) => d.id === defId)!;
  return {
    uid, defId, tier: def.tier, star: 1, team, pos: { q, r },
    hp: def.hp, maxHp: def.hp, ad: def.ad, as: def.as, armor: def.armor,
    mr: def.mr, range: def.range, mana: def.manaStart, maxMana: def.mana,
    abilityDamage: def.abilityDamage, attackCooldown: 0, statusEffects: [], items: [],
  };
}

/**
 * Leaves only `a` and `b` alive (so buildPairings pairs them together), gives
 * `a` a stacked board and `b` an empty board so `a` deterministically wins.
 * Sets a PvP round (round 4 = stage 2, roundInStage 1 = first PvP round).
 */
function twoPlayerWin(seed: number, a: number, b: number): MatchState {
  const state = createMatch(seed, gameData);
  state.round = 4; // PvP (stage 2, roundInStage 1; stage 1 rounds 1-3 are all PvE)
  for (const p of state.players) p.alive = p.id === a || p.id === b;
  const pa = state.players[a]!;
  pa.level = 5;
  // A strong, multi-unit board crushes an empty enemy board every time.
  pa.board[0] = makeUnit(9000, "warrior", 0, 0, 0);
  pa.board[1] = makeUnit(9001, "archer", 0, 1, 0);
  pa.board[2] = makeUnit(9002, "paladin", 0, 2, 0);
  // b keeps an empty board → guaranteed loss for b, win for a.
  state.players[b]!.board = new Array(28).fill(null);
  return state;
}

describe("per-round combat stats", () => {
  it("records a win for the winner and a loss for the loser with matching damage", () => {
    const state = twoPlayerWin(7, 0, 1);
    runCombatPhase(state, gameData);

    const winner = state.lastRoundResult.get(0)!;
    const loser = state.lastRoundResult.get(1)!;

    expect(winner.status).toBe("won");
    expect(winner.damageTaken).toBe(0);
    expect(winner.damageDealt).toBeGreaterThan(0);

    expect(loser.status).toBe("lost");
    expect(loser.damageDealt).toBe(0);
    expect(loser.damageTaken).toBeGreaterThan(0);

    // damageDealt (winner) === damageTaken (loser): same survivor term.
    expect(winner.damageDealt).toBe(loser.damageTaken);
  });

  it("applies the loser's damageTaken to their HP (same term as damageDealt)", () => {
    const state = twoPlayerWin(7, 0, 1);
    const hpBefore = state.players[1]!.hp;
    runCombatPhase(state, gameData);
    const loser = state.lastRoundResult.get(1)!;
    expect(state.players[1]!.hp).toBe(hpBefore - loser.damageTaken);
  });

  it("works regardless of which side (A or B) wins", () => {
    // Pair seats 3 and 5; give 5 the stacked board so the B-side wins.
    const state = twoPlayerWin(13, 5, 3);
    runCombatPhase(state, gameData);
    // The winner among {3,5} is 5; whichever side it landed on, the result holds.
    const r5 = state.lastRoundResult.get(5)!;
    const r3 = state.lastRoundResult.get(3)!;
    expect(r5.status).toBe("won");
    expect(r3.status).toBe("lost");
    expect(r5.damageDealt).toBe(r3.damageTaken);
  });
});

describe("match-stat accumulation", () => {
  it("accumulates roundWins/roundLosses and total damage across rounds", () => {
    const state = twoPlayerWin(7, 0, 1);
    const winner = state.players[0]!;
    const loser = state.players[1]!;

    runCombatPhase(state, gameData);
    const dmg1Dealt = winner.totalDamageDealt;
    const dmg1Taken = loser.totalDamageTaken;
    expect(winner.roundWins).toBe(1);
    expect(winner.roundLosses).toBe(0);
    expect(loser.roundLosses).toBe(1);
    expect(loser.roundWins).toBe(0);
    expect(dmg1Dealt).toBeGreaterThan(0);
    expect(dmg1Dealt).toBe(dmg1Taken);

    // Run another PvP round with the same setup; stats should add, not reset.
    state.round = 5; // still PvP (stage 2, roundInStage 2)
    runCombatPhase(state, gameData);
    expect(winner.roundWins).toBe(2);
    expect(loser.roundLosses).toBe(2);
    expect(winner.totalDamageDealt).toBeGreaterThan(dmg1Dealt);
    expect(loser.totalDamageTaken).toBe(winner.totalDamageDealt);
  });

  it("starts every player at zeroed accumulators", () => {
    const state = createMatch(1, gameData);
    for (const p of state.players) {
      expect(p.roundWins).toBe(0);
      expect(p.roundLosses).toBe(0);
      expect(p.totalDamageTaken).toBe(0);
      expect(p.totalDamageDealt).toBe(0);
    }
  });
});

describe("lastRoundResult correctness", () => {
  it("marks an unpaired alive player (ghost-side real player) as a bye, 0/0", () => {
    // 3 alive → buildPairings makes one pairing + one ghost fight; the alive
    // player serving only as a ghost source is never paired this round.
    const state = createMatch(99, gameData);
    state.round = 4; // PvP round (stage 2, roundInStage 1)
    for (const p of state.players) p.alive = p.id < 3;
    runCombatPhase(state, gameData);

    // Every alive player has a result; at least one is a bye (the ghost source),
    // and a bye carries 0/0.
    const byes = [0, 1, 2]
      .map((id) => state.lastRoundResult.get(id)!)
      .filter((r) => r.status === "bye");
    expect(byes.length).toBeGreaterThanOrEqual(1);
    for (const b of byes) {
      expect(b.damageTaken).toBe(0);
      expect(b.damageDealt).toBe(0);
    }
  });

  it("a draw leaves both players at the bye-equivalent 0/0 (no W/L credited)", () => {
    // Two empty boards draw: no survivors on either side.
    const state = createMatch(3, gameData);
    state.round = 4; // PvP round (stage 2, roundInStage 1)
    for (const p of state.players) {
      p.alive = p.id === 0 || p.id === 1;
      if (p.id === 0 || p.id === 1) p.board = new Array(28).fill(null);
    }
    runCombatPhase(state, gameData);
    for (const id of [0, 1]) {
      const r = state.lastRoundResult.get(id)!;
      expect(r.damageTaken).toBe(0);
      expect(r.damageDealt).toBe(0);
      expect(r.status).toBe("bye"); // default, never overwritten on a draw
    }
    expect(state.players[0]!.roundWins).toBe(0);
    expect(state.players[0]!.roundLosses).toBe(0);
  });

  it("PvE marks every alive player as pve with 0/0 and no W/L", () => {
    const state = createMatch(11, gameData);
    state.round = 1; // a PvE round (stage 1, all PvE)
    for (let i = 0; i < state.players.length; i++) {
      state.players[i]!.board[0] = makeUnit(7000 + i, "warrior", 0, 0, 0);
    }
    const prng = mulberry32(state.prngState);
    runPveRound(state, prng, gameData);

    for (const p of state.players) {
      const r = state.lastRoundResult.get(p.id)!;
      expect(r.status).toBe("pve");
      expect(r.damageTaken).toBe(0);
      expect(r.damageDealt).toBe(0);
      // PvE never counts as a W/L or accumulates damage.
      expect(p.roundWins).toBe(0);
      expect(p.roundLosses).toBe(0);
      expect(p.totalDamageTaken).toBe(0);
      expect(p.totalDamageDealt).toBe(0);
    }
  });

  it("lastRoundResult is rebuilt fresh each round (no stale entries)", () => {
    const state = twoPlayerWin(7, 0, 1);
    runCombatPhase(state, gameData);
    expect(state.lastRoundResult.get(0)!.status).toBe("won");

    // A subsequent PvE round overwrites the prior PvP results with pve 0/0.
    // Round 7 = stage 2, roundInStage 4 = PvE.
    state.round = 7; // PvE (stage 2, roundInStage 4)
    const prng = mulberry32(state.prngState);
    runPveRound(state, prng, gameData);
    for (const id of [0, 1]) {
      expect(state.lastRoundResult.get(id)!.status).toBe("pve");
    }
  });
});
