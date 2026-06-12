import rawUnits from "./units.json" with { type: "json" };
import rawTraits from "./traits.json" with { type: "json" };
import rawItems from "./items.json" with { type: "json" };
import rawEconomy from "./economy.json" with { type: "json" };
import rawGameplay from "./gameplay.json" with { type: "json" };

export interface UnitDataDef {
  id: string;
  name: string;
  tier: number;
  hp: number;
  ad: number;
  as: number;
  armor: number;
  mr: number;
  range: number;
  mana: number;
  manaStart: number;
  abilityDamage: number;
  traits: string[];
}

export interface TraitBreakpoint {
  count: number;
  effect: { stat: string; value: number };
}

export interface TraitDataDef {
  id: string;
  name: string;
  breakpoints: TraitBreakpoint[];
}

export interface ItemDataDef {
  id: string;
  name: string;
  stats: Partial<Record<string, number>>;
}

export interface StreakEntry {
  min: number;
  max: number;
  bonus: number;
}

export interface EconomyData {
  poolCounts: Record<string, number>;
  shopOdds: number[][];
  shopSlots: number;
  rerollCost: number;
  xpBuyCost: number;
  xpBuyAmount: number;
  levelXpThresholds: number[];
  interestCap: number;
  interestPer: number;
  baseIncome: number;
  streakTable: StreakEntry[];
  damageBase: number;
  damageRoundDivisor: number;
  damageTierWeights: Record<string, number>;
  overtimeBaseDamage: number;
  overtimeRampPerTick: number;
  overtimeHardCapTicks: number;
  critChance: number;
  critMultiplier: number;
  resolutionSeconds: number;
}

export interface GameplayData {
  playerCount: number;
  startingHp: number;
  startingGold: number;
  benchMax: number;
  boardSlots: number;
  copiesPerStar: Record<string, number>;
  sellValueMultiplier: number;
  pveRounds: number[];
  manaPerAttack: number;
  manaPerDamageTaken: number;
  starMultipliers: Record<string, number>;
  ticksPerSec: number;
  overtimeStartTick: number;
  mitigationBase: number;
  aiXpGoldThreshold: number;
  aiInterestReserve: number;
  aiTraitOverlapWeight: number;
}

export interface GameData {
  units: UnitDataDef[];
  traits: TraitDataDef[];
  items: ItemDataDef[];
  economy: EconomyData;
  gameplay: GameplayData;
}

export const gameData: GameData = {
  units: rawUnits as UnitDataDef[],
  traits: rawTraits as TraitDataDef[],
  items: rawItems as ItemDataDef[],
  economy: rawEconomy as EconomyData,
  gameplay: rawGameplay as GameplayData,
};
