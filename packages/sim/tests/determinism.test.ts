import { describe, it, expect } from "vitest";
import { simulateCombat } from "../src/engine.js";
import { gameData } from "@autobattler/data";
import type { BoardState } from "../src/types.js";
import { createHash } from "crypto";

function makeBoard(team: 0 | 1): BoardState {
  const units = gameData.units.slice(0, 3);
  return {
    units: units.map((def, i) => ({
      uid: team * 10 + i,
      defId: def.id,
      tier: def.tier,
      star: 1 as const,
      team,
      pos: { q: team === 0 ? i : 6 - i, r: team === 0 ? 0 : 7 },
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
    })),
  };
}

describe("determinism", () => {
  it("100 runs produce identical JSON output", () => {
    const boardA = makeBoard(0);
    const boardB = makeBoard(1);
    const seed = 0xdeadbeef;

    const first = JSON.stringify(simulateCombat(boardA, boardB, seed, gameData));
    for (let i = 1; i < 100; i++) {
      const result = JSON.stringify(simulateCombat(boardA, boardB, seed, gameData));
      expect(result).toBe(first);
    }
  });

  it("event log hash is stable for fixed seed", () => {
    const boardA = makeBoard(0);
    const boardB = makeBoard(1);
    const seed = 12345;

    const result = simulateCombat(boardA, boardB, seed, gameData);
    const hash = createHash("sha256")
      .update(JSON.stringify(result.events))
      .digest("hex");

    expect(hash).toMatchSnapshot();
  });

  it("different seeds produce different event-log hashes; same seed identical", () => {
    // Melee-heavy boards trade many attacks, so the 15% crit roll is
    // guaranteed to fire (and differ) across seeds.
    const boardA = makeBoard(0);
    const boardB = makeBoard(1);

    const hashFor = (seed: number) =>
      createHash("sha256")
        .update(JSON.stringify(simulateCombat(boardA, boardB, seed, gameData).events))
        .digest("hex");

    const h1 = hashFor(1);
    const h2 = hashFor(2);
    expect(h1).not.toBe(h2);

    // Crits actually occurred, so the seed had something to influence
    const events = simulateCombat(boardA, boardB, 1, gameData).events;
    expect(events.some((e) => e.type === "attack" && e.crit === true)).toBe(true);

    expect(hashFor(1)).toBe(h1);
    expect(hashFor(2)).toBe(h2);
  });
});

describe("overtime", () => {
  function makeTankBoard(team: 0 | 1, hp: number): BoardState {
    // Unkillable by normal damage within 1200 ticks (ad 1, armor 0 → 1 dmg/hit)
    const def = gameData.units[0]!;
    const count = team === 0 ? 2 : 1; // team 0 has more total HP
    return {
      units: Array.from({ length: count }, (_, i) => ({
        uid: team * 10 + i,
        defId: def.id,
        tier: def.tier,
        star: 1 as const,
        team,
        pos: { q: i, r: team === 0 ? 0 : 7 },
        hp,
        maxHp: hp,
        ad: 1,
        as: def.as,
        armor: 0,
        mr: 0,
        range: 1,
        mana: 0,
        maxMana: 100,
        abilityDamage: 1,
        attackCooldown: 0,
        statusEffects: [],
        items: [],
      })),
    };
  }

  it("unkillable boards enter overtime and resolve before the hard cap", () => {
    // Team 0 units have more per-unit HP, so the ramp kills team 1 first
    const result = simulateCombat(makeTankBoard(0, 120_000), makeTankBoard(1, 100_000), 99, gameData);

    const overtimeEvents = result.events.filter((e) => e.type === "overtime_start");
    expect(overtimeEvents.length).toBe(1);
    expect(overtimeEvents[0]!.tick).toBe(1200);
    expect(result.ticks).toBeGreaterThan(1200);
    expect(result.ticks).toBeLessThan(gameData.economy.overtimeHardCapTicks);
    expect(result.winner).toBe(0);
  });

  it("hard cap decides by total remaining HP, never an endless draw", () => {
    // HP too large for the ramp to finish anyone off before 1800
    const result = simulateCombat(makeTankBoard(0, 10_000_000), makeTankBoard(1, 10_000_000), 5, gameData);
    expect(result.ticks).toBe(gameData.economy.overtimeHardCapTicks);
    // Both sides alive at cap: team 0 (2 units) has higher total remaining HP
    expect(result.winner).toBe(0);
  });
});

describe("trait breakpoints count unique units", () => {
  function knightUnit(uid: number, defId: string, team: 0 | 1): BoardState["units"][0] {
    const def = gameData.units.find((d) => d.id === defId)!;
    return {
      uid,
      defId,
      tier: def.tier,
      star: 1 as const,
      team,
      pos: { q: uid % 7, r: team === 0 ? 0 : 7 },
      hp: def.hp,
      maxHp: def.hp,
      ad: def.ad,
      as: def.as,
      armor: def.armor,
      mr: def.mr,
      range: def.range,
      mana: 0,
      maxMana: def.mana,
      abilityDamage: def.abilityDamage,
      attackCooldown: 0,
      statusEffects: [],
      items: [],
    };
  }

  function firstAttackDamageBy(boardA: BoardState): number {
    // Lone ranged enemy so team 0 knights are the ones being measured via
    // their armor: we instead measure damage TAKEN by a knight from a fixed
    // attacker, which reflects whether the armor buff activated.
    const attacker = knightUnit(100, "archer", 1);
    attacker.pos = { q: 0, r: 1 };
    const boardB: BoardState = { units: [attacker] };
    const result = simulateCombat(boardA, boardB, 42, gameData);
    const firstAttack = result.events.find(
      (e): e is Extract<typeof e, { type: "attack" }> =>
        e.type === "attack" && e.uid === 100 && e.crit === false
    );
    expect(firstAttack).toBeDefined();
    return firstAttack!.dmg;
  }

  it("2 copies of one knight do NOT activate knight(2)", () => {
    const board: BoardState = {
      units: [knightUnit(0, "warrior", 0), knightUnit(1, "warrior", 0)],
    };
    const dmg = firstAttackDamageBy(board);
    // warrior armor 40, unbuffed: 55 - trunc(55*40/140) = 55 - 15 = 40
    expect(dmg).toBe(40);
  });

  it("2 distinct knights DO activate knight(2)", () => {
    const board: BoardState = {
      units: [knightUnit(0, "warrior", 0), knightUnit(1, "paladin", 0)],
    };
    const dmg = firstAttackDamageBy(board);
    // knight(2) grants +200 armor; both knights take far less damage
    expect(dmg).toBeLessThan(40);
  });
});
