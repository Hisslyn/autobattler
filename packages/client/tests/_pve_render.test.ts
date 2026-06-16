import { describe, it, expect } from "vitest";
import { gameData } from "@autobattler/data";
import { createMatch } from "@autobattler/rules";
import { runPveRound } from "@autobattler/rules/src/rounds.js";
import { mulberry32 } from "@autobattler/sim/src/prng.js";
import { stateAtTick } from "../src/combat/reducer.js";

describe("pve combat result renders mobs", () => {
  it("init event includes mob units (side 1)", () => {
    const state = createMatch(42, gameData);
    const d: any = gameData.units[0]!;
    state.players[0].board[24] = {
      uid: state.nextUid++, defId: d.id, tier: d.tier, star: 1, team: 0,
      pos: { q: 0, r: 0 }, hp: d.hp, maxHp: d.hp, ad: d.ad, as: d.as, armor: d.armor,
      mr: d.mr, range: d.range, mana: 0, maxMana: d.mana, abilityDamage: d.abilityDamage,
      attackCooldown: 0, statusEffects: [], items: [],
    } as any;
    state.round = 1;
    runPveRound(state, mulberry32(state.prngState), gameData);
    const result = state.lastCombatResults.get(0)!;
    expect(result.events.length).toBeGreaterThan(0);
    const s0 = stateAtTick(result.events, 0);
    const sides = [...s0.units.values()].map((u) => u.side);
    expect(sides.filter((x) => x === 1).length).toBeGreaterThan(0);
    expect(sides.filter((x) => x === 0).length).toBeGreaterThan(0);
  });
});
