import { describe, it, expect } from "vitest";
import { gameData } from "@autobattler/data";
import { simulateCombat } from "@autobattler/sim";
import { COLS, ROWS } from "@autobattler/sim/src/hex.js";
import type { BoardState, CombatEvent } from "@autobattler/sim/src/types.js";
import { emptyPlaybackState, applyEvent, stateAtTick } from "../src/combat/reducer.js";
import { flipRows, toDisplayHex } from "../src/combat/player.js";

const SEEDS = [1, 2, 42, 1337, 0xbeef];

function makeBoard(team: 0 | 1): BoardState {
  // Mixed melee/ranged/caster so logs contain moves, attacks, casts, deaths
  const defs = gameData.units.slice(0, 5);
  return {
    units: defs.map((def, i) => ({
      uid: team * 100 + i,
      defId: def.id,
      tier: def.tier,
      star: 1 as const,
      team,
      pos: { q: i, r: team === 0 ? i % 2 : ROWS - 1 - (i % 2) },
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

function endEvent(log: CombatEvent[]): Extract<CombatEvent, { type: "end" }> {
  const last = log[log.length - 1]!;
  expect(last.type).toBe("end");
  return last as Extract<CombatEvent, { type: "end" }>;
}

describe("reducer conformance", () => {
  it("folding the full event log reproduces the engine's CombatResult", () => {
    for (const seed of SEEDS) {
      const result = simulateCombat(makeBoard(0), makeBoard(1), seed, gameData);
      const end = endEvent(result.events);
      const final = stateAtTick(result.events, end.tick);

      expect(final.units.size).toBe(10);
      expect(final.ended).toBe(true);
      expect(final.winnerSide).toBe(result.winner);
      expect([...final.survivingUids].sort((a, b) => a - b)).toEqual(
        result.survivingUnits.map((u) => u.uid).sort((a, b) => a - b)
      );

      const survivors = new Map(result.survivingUnits.map((u) => [u.uid, u]));
      for (const [uid, u] of final.units) {
        const s = survivors.get(uid);
        if (s) {
          expect(u.alive, `uid ${uid} seed ${seed}`).toBe(true);
          expect(u.hp, `hp uid ${uid} seed ${seed}`).toBe(s.hp);
          expect(u.mana, `mana uid ${uid} seed ${seed}`).toBe(s.mana);
          expect(u.pos, `pos uid ${uid} seed ${seed}`).toEqual(s.pos);
        } else {
          expect(u.alive, `uid ${uid} seed ${seed}`).toBe(false);
        }
      }
    }
  });
});

describe("mid-playback consistency", () => {
  it("stateAtTick at END.tick/2 has no negative hp", () => {
    for (const seed of SEEDS) {
      const result = simulateCombat(makeBoard(0), makeBoard(1), seed, gameData);
      const end = endEvent(result.events);
      const mid = stateAtTick(result.events, Math.floor(end.tick / 2));
      for (const u of mid.units.values()) {
        expect(u.hp, `uid ${u.uid} seed ${seed}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("engine emits no actor events for a unit after its DEATH", () => {
    for (const seed of SEEDS) {
      const result = simulateCombat(makeBoard(0), makeBoard(1), seed, gameData);
      const dead = new Set<number>();
      for (const ev of result.events) {
        if (ev.type === "move" || ev.type === "attack" || ev.type === "cast") {
          expect(dead.has(ev.uid), `uid ${ev.uid} acted after death, seed ${seed}`).toBe(false);
        }
        if (ev.type === "death") dead.add(ev.uid);
      }
      expect(dead.size).toBeGreaterThan(0);
    }
  });
});

describe("display mirroring", () => {
  it("flipRows is involutive", () => {
    for (let q = 0; q < COLS; q++) {
      for (let r = 0; r < ROWS; r++) {
        expect(flipRows(flipRows({ q, r }))).toEqual({ q, r });
      }
    }
  });

  it("each side's own units map to the bottom display rows", () => {
    const HALF = ROWS / 2;
    // Side 0 units occupy sim rows 0..3; side 1 units rows 4..7
    for (let q = 0; q < COLS; q++) {
      for (let r = 0; r < HALF; r++) {
        const d = toDisplayHex({ q, r }, 0);
        expect(d.r).toBeGreaterThanOrEqual(HALF);
        expect(d.q).toBe(q);
      }
      for (let r = HALF; r < ROWS; r++) {
        const d = toDisplayHex({ q, r }, 1);
        expect(d.r).toBeGreaterThanOrEqual(HALF);
        expect(d.q).toBe(q);
      }
    }
  });

  it("B-side transform mirrors opponent units to the top rows", () => {
    const HALF = ROWS / 2;
    for (let q = 0; q < COLS; q++) {
      // From side 0's view, opponent (rows 4..7) lands on top rows
      for (let r = HALF; r < ROWS; r++) {
        expect(toDisplayHex({ q, r }, 0).r).toBeLessThan(HALF);
      }
      for (let r = 0; r < HALF; r++) {
        expect(toDisplayHex({ q, r }, 1).r).toBeLessThan(HALF);
      }
    }
  });
});

describe("skip", () => {
  it("stateAtTick(log, END.tick) equals the fold of the full log", () => {
    for (const seed of SEEDS) {
      const result = simulateCombat(makeBoard(0), makeBoard(1), seed, gameData);
      const end = endEvent(result.events);
      const full = result.events.reduce(applyEvent, emptyPlaybackState());
      expect(stateAtTick(result.events, end.tick)).toEqual(full);
    }
  });
});
