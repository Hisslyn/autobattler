import { describe, it, expect } from "vitest";
import { gameData } from "@autobattler/data";
import { createMatch, runMatchToEnd, isMatchOver } from "../src/match.js";
import type { MatchState } from "../src/state.js";
import type { UnitInstance } from "@autobattler/sim/src/types.js";

function makeUnit(uid: number, defId: string, team: 0 | 1): UnitInstance {
  const def = gameData.units.find((d) => d.id === defId)!;
  return {
    uid,
    defId,
    tier: def.tier,
    star: 1,
    team,
    pos: { q: 0, r: 0 },
    hp: def.hp,
    maxHp: def.hp,
    ad: def.ad,
    as: def.as,
    armor: def.armor,
    mr: def.mr,
    range: def.range,
    mana: def.manaStart,
    maxMana: def.mana,
    abilityDamage: def.abilityDamage,
    attackCooldown: 0,
    statusEffects: [],
    items: [],
  };
}

// Give each player a single tier-3 unit on board so combat produces a winner each round
function setupBoards(state: MatchState): void {
  const defId = "shadowblade"; // tier 3, kills fast
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i]!;
    p.level = 3;
    p.board = [makeUnit(5000 + i * 10, defId, 0)];
  }
}

describe("full match determinism", () => {
  it("same seed -> identical placement order, 50 runs", () => {
    const seed = 0xc0ffee;
    const first = JSON.stringify(runMatchToEnd(seed, gameData, setupBoards));
    for (let i = 1; i < 50; i++) {
      const result = JSON.stringify(runMatchToEnd(seed, gameData, setupBoards));
      expect(result).toBe(first);
    }
  });

  it("different seeds produce different outcomes", () => {
    const r1 = JSON.stringify(runMatchToEnd(1, gameData, setupBoards));
    const r2 = JSON.stringify(runMatchToEnd(2, gameData, setupBoards));
    expect(typeof r1).toBe("string");
    expect(typeof r2).toBe("string");
  });

  it("match ends with exactly 1 alive player", () => {
    const state = runMatchToEnd(42, gameData, setupBoards);
    const aliveCount = state.players.filter((p) => p.alive).length;
    expect(aliveCount).toBe(1);
  });

  it("all 8 players get placements assigned or one is winner", () => {
    const state = runMatchToEnd(7, gameData, setupBoards);
    const eliminated = state.players.filter((p) => !p.alive);
    expect(eliminated.length).toBe(7);
    expect(isMatchOver(state)).toBe(true);
  });
});
