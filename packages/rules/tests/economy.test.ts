import { describe, it, expect } from "vitest";
import { gameData } from "@autobattler/data";
import { calcIncome, levelForXp } from "../src/economy.js";
import type { PlayerState } from "../src/state.js";

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 0,
    hp: 100,
    gold: 0,
    xp: 0,
    level: 1,
    bench: [],
    board: [],
    items: [],
    shop: [],
    winStreak: 0,
    loseStreak: 0,
    alive: true,
    lastBoard: null,
    placement: null,
    roundWins: 0,
    roundLosses: 0,
    totalDamageTaken: 0,
    totalDamageDealt: 0,
    ...overrides,
  };
}

describe("income", () => {
  it("base income with no gold no streak = 5", () => {
    const p = makePlayer({ gold: 0, winStreak: 0, loseStreak: 0 });
    expect(calcIncome(p, gameData)).toBe(5);
  });

  it("interest capped at 5: 50g gives +5 interest", () => {
    const p = makePlayer({ gold: 50 });
    expect(calcIncome(p, gameData)).toBe(10); // 5 base + 5 interest
  });

  it("interest capped: 100g still gives +5", () => {
    const p = makePlayer({ gold: 100 });
    expect(calcIncome(p, gameData)).toBe(10);
  });

  it("partial interest: 23g gives +2", () => {
    const p = makePlayer({ gold: 23 });
    expect(calcIncome(p, gameData)).toBe(7); // 5 + 2
  });

  it("win streak 2 gives +1 bonus", () => {
    const p = makePlayer({ gold: 0, winStreak: 2, loseStreak: 0 });
    expect(calcIncome(p, gameData)).toBe(6); // 5 + 1
  });

  it("win streak 3 gives +2 bonus", () => {
    const p = makePlayer({ gold: 0, winStreak: 3 });
    expect(calcIncome(p, gameData)).toBe(7);
  });

  it("win streak 5+ gives +3 bonus", () => {
    const p = makePlayer({ gold: 0, winStreak: 5 });
    expect(calcIncome(p, gameData)).toBe(8);
  });

  it("lose streak 3 gives +2 bonus", () => {
    const p = makePlayer({ gold: 0, loseStreak: 3, winStreak: 0 });
    expect(calcIncome(p, gameData)).toBe(7);
  });

  it("combined: 30g + 3 streak = 5+3+2 = 10", () => {
    const p = makePlayer({ gold: 30, winStreak: 3 });
    expect(calcIncome(p, gameData)).toBe(10); // 5 base + 3 interest + 2 streak
  });
});

describe("levelForXp", () => {
  it("0 xp = level 1", () => {
    expect(levelForXp(0, gameData)).toBe(1);
  });

  it("at first threshold = level 2", () => {
    const thresh = gameData.economy.levelXpThresholds[1] ?? 2;
    expect(levelForXp(thresh, gameData)).toBe(2);
  });

  it("max level from max xp", () => {
    expect(levelForXp(9999, gameData)).toBe(9);
  });
});
