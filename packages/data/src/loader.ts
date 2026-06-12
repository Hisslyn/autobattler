import rawUnits from "./units.json" assert { type: "json" };
import rawTraits from "./traits.json" assert { type: "json" };
import rawItems from "./items.json" assert { type: "json" };
import rawEconomy from "./economy.json" assert { type: "json" };

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
  damageTierWeights: Record<string, number>;
}

export interface GameData {
  units: UnitDataDef[];
  traits: TraitDataDef[];
  items: ItemDataDef[];
  economy: EconomyData;
}

export const gameData: GameData = {
  units: rawUnits as UnitDataDef[],
  traits: rawTraits as TraitDataDef[],
  items: rawItems as ItemDataDef[],
  economy: rawEconomy as EconomyData,
};
