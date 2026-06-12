import type { HexCoord } from "./hex.js";

export interface UnitDef {
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

export interface TraitDef {
  id: string;
  name: string;
  breakpoints: Array<{
    count: number;
    effect: { stat: string; value: number };
  }>;
}

export interface ItemDef {
  id: string;
  name: string;
  stats: Partial<Record<string, number>>;
}

export interface UnitInstance {
  uid: number;
  defId: string;
  tier: number;
  star: 1 | 2 | 3;
  team: 0 | 1;
  pos: HexCoord;
  hp: number;
  maxHp: number;
  ad: number;
  as: number;
  armor: number;
  mr: number;
  range: number;
  mana: number;
  maxMana: number;
  abilityDamage: number;
  attackCooldown: number;
  statusEffects: StatusEffect[];
  items: string[];
}

export interface StatusEffect {
  type: string;
  duration: number;
  value: number;
}

export interface BoardState {
  units: UnitInstance[];
}

export type CombatEventType =
  | "attack"
  | "ability"
  | "move"
  | "death"
  | "mana_gain"
  | "overtime";

export interface CombatEvent {
  tick: number;
  type: CombatEventType;
  sourceUid: number;
  targetUid?: number;
  value?: number;
  pos?: HexCoord;
  crit?: boolean;
}

export interface CombatResult {
  winner: 0 | 1 | "draw";
  ticks: number;
  survivingUnits: UnitInstance[];
  events: CombatEvent[];
}
