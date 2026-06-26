import { describe, it, expect } from "vitest";
import { gameData } from "@autobattler/data";
import { createMatch, advancePhase, runMatchToEnd, isMatchOver } from "../src/match.js";
import { applyAiCommands } from "../src/ai.js";
import { mulberry32 } from "@autobattler/sim/src/prng.js";
import type { MatchState } from "../src/state.js";
import type { UnitInstance } from "@autobattler/sim/src/types.js";
import { serializeMatchState as serializeState } from "./serializeMatchState.js";

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

function runAiMatch(seed: number): MatchState {
  const prng = mulberry32(seed);
  const state = createMatch(seed, gameData);
  let safeguard = 0;
  while (!isMatchOver(state) && safeguard < 10000) {
    if (state.phase === "PLANNING") {
      for (const player of state.players) {
        if (!player.alive) continue;
        applyAiCommands(state, player.id, prng, gameData);
      }
    }
    advancePhase(state, gameData);
    safeguard++;
  }
  return state;
}

describe("full match determinism", () => {
  // Sticky targeting (units chase + fight to a clean resolution instead of the
  // old stateless nearest-recompute) makes full matches simulate longer, so
  // these full-match determinism runs need a larger timeout than the 5s default.
  // The determinism itself is unchanged — they pass; they were just slower.
  it("same seed -> identical placement order, 50 runs", () => {
    const seed = 0xc0ffee;
    const first = serializeState(runMatchToEnd(seed, gameData, setupBoards));
    for (let i = 1; i < 50; i++) {
      const result = serializeState(runMatchToEnd(seed, gameData, setupBoards));
      expect(result).toBe(first);
    }
  }, 60000);

  it("two same-seed AI-driven matches in one process are byte-identical (uids included)", () => {
    const a = serializeState(runAiMatch(0xfeed));
    const b = serializeState(runAiMatch(0xfeed));
    expect(b).toBe(a);
  }, 60000);

  it("different seeds produce different outcomes", () => {
    const r1 = serializeState(runAiMatch(1));
    const r2 = serializeState(runAiMatch(2));
    expect(r1).not.toBe(r2);
  }, 60000);

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
