import type { GameData } from "@autobattler/data";
import type { PlayerState } from "./state.js";

export function calcIncome(player: PlayerState, data: GameData): number {
  const econ = data.economy;
  const interest = Math.min(
    econ.interestCap,
    Math.trunc(player.gold / econ.interestPer)
  );
  const streak = Math.abs(player.winStreak) >= Math.abs(player.loseStreak)
    ? player.winStreak
    : -player.loseStreak;
  const streakLen = Math.abs(streak);
  let streakBonus = 0;
  for (const entry of econ.streakTable) {
    if (streakLen >= entry.min && streakLen <= entry.max) {
      streakBonus = entry.bonus;
      break;
    }
  }
  return econ.baseIncome + interest + streakBonus;
}

export function levelForXp(xp: number, data: GameData): number {
  const thresholds = data.economy.levelXpThresholds;
  let level = 1;
  for (let i = 0; i < thresholds.length; i++) {
    if (xp >= (thresholds[i] ?? 0)) level = i + 1;
  }
  return Math.min(level, 9);
}
