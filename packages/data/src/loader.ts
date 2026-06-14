import rawUnits from "./units.json" with { type: "json" };
import rawTraits from "./traits.json" with { type: "json" };
import rawItems from "./items.json" with { type: "json" };
import rawEconomy from "./economy.json" with { type: "json" };
import rawGameplay from "./gameplay.json" with { type: "json" };
import rawRanks from "./ranks.json" with { type: "json" };
import rawMobs from "./mobs.json" with { type: "json" };
import rawLoot from "./loot.json" with { type: "json" };

export type AbilityEffectData =
  | { kind: "magic_damage" }
  | { kind: "burn"; burn: number; duration: number }
  | { kind: "shield"; amount: number; duration: number }
  | { kind: "buff"; stat: "ad" | "as" | "armor" | "mr" | "abilityDamage"; value: number; duration: number }
  | { kind: "stealth"; duration: number };

export interface AbilityDataDef {
  name: string;
  manaCost: number;
  effect: AbilityEffectData;
}

export interface UnitDataDef {
  id: string;
  name: string;
  tier: number;
  /** Single origin trait id. */
  origin: string;
  /** 1-2 class trait ids. */
  classes: string[];
  hp: number;
  ad: number;
  as: number;
  armor: number;
  mr: number;
  range: number;
  mana: number;
  manaStart: number;
  abilityDamage: number;
  ability: AbilityDataDef;
  /** Flattened [origin, ...classes]; the sim/rules resolve traits from this. */
  traits: string[];
}

export interface TraitBreakpoint {
  count: number;
  effect: { stat: string; value: number };
}

export interface TraitDataDef {
  id: string;
  name: string;
  /** "origin" or "class"; every unit carries exactly one origin + 1-2 classes. */
  kind: "origin" | "class";
  breakpoints: TraitBreakpoint[];
}

export type ItemPassiveData =
  | { kind: "burn"; value: number; duration: number }
  | { kind: "shield"; value: number; duration: number };

export interface ItemDataDef {
  id: string;
  name: string;
  stats: Partial<Record<string, number>>;
  /** True for the 9 base components (stat-only, no recipe). */
  component?: boolean;
  /** Completed items: the unordered component pair that builds this item. */
  recipe?: [string, string];
  /** At most one passive on a completed item. */
  passive?: ItemPassiveData;
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
  /** Flat gold awarded to every alive player at the end of a PvE round. */
  pveBaseGold: number;
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
  mmrStart: number;
  mmrK: number;
  mmrEloDivisor: number;
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

/** A PvE creep definition. Mobs reuse the combat UnitInstance shape but are
 *  never drawn from the unit pool and never count toward player traits. */
export interface MobDataDef {
  id: string;
  name: string;
  tier: number;
  isMob: true;
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
  ability?: AbilityDataDef;
}

/** One creep placed on a PvE stage board (board-slot index + star scaling). */
export interface MobPlacement {
  mobId: string;
  slot: number;
  star: 1 | 2 | 3;
}

/** A PvE stage: the creep board fought on a designated PvE round. */
export interface MobStageDef {
  round: number;
  name: string;
  units: MobPlacement[];
}

export interface MobsData {
  mobs: MobDataDef[];
  stages: MobStageDef[];
}

export type LootRarity = "common" | "uncommon" | "rare" | "legendary";

/** One weighted entry in a rarity's loot table. */
export type LootEntry =
  | { kind: "gold"; amount: number; weight: number }
  | { kind: "component"; id: string; weight: number }
  | { kind: "item"; id: string; weight: number };

/** How many orbs of each rarity drop on a given PvE round. */
export interface RoundDrop {
  rarity: LootRarity;
  count: number;
}

export interface LootData {
  tables: Record<LootRarity, LootEntry[]>;
  roundDrops: Record<string, RoundDrop[]>;
}

/** A rank band; the player's rank is the highest band whose minMmr <= their MMR. */
export interface RankBand {
  id: string;
  name: string;
  minMmr: number;
}

export interface GameData {
  units: UnitDataDef[];
  traits: TraitDataDef[];
  items: ItemDataDef[];
  economy: EconomyData;
  gameplay: GameplayData;
  mobs: MobsData;
  loot: LootData;
}

export const DATA_VERSION = "0.1.0";

/**
 * Pure recipe lookup: the completed item built from an unordered pair of
 * component ids, or null if no recipe combines them. Recipes in items.json
 * are unordered, so this matches either component order.
 */
export function recipeResult(
  aId: string,
  bId: string,
  items: ItemDataDef[] = gameData.items
): string | null {
  for (const item of items) {
    if (!item.recipe) continue;
    const [x, y] = item.recipe;
    if ((x === aId && y === bId) || (x === bId && y === aId)) return item.id;
  }
  return null;
}

/** Rank bands ordered by ascending minMmr (single source of rank thresholds). */
export const RANK_BANDS: RankBand[] = (rawRanks as { bands: RankBand[] }).bands;

/**
 * Pure: maps an MMR to its rank band. Boundaries are inclusive on minMmr —
 * a player exactly at a band's minMmr is in that (higher) band. MMR below the
 * lowest band's minMmr clamps to the lowest band.
 */
export function mmrToRank(mmr: number): RankBand {
  let band = RANK_BANDS[0]!;
  for (const b of RANK_BANDS) {
    if (mmr >= b.minMmr) band = b;
    else break;
  }
  return band;
}

export const gameData: GameData = {
  units: rawUnits as UnitDataDef[],
  traits: rawTraits as TraitDataDef[],
  items: rawItems as ItemDataDef[],
  economy: rawEconomy as EconomyData,
  gameplay: rawGameplay as GameplayData,
  mobs: rawMobs as MobsData,
  loot: rawLoot as LootData,
};
