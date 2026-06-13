import type { HexCoord } from "./hex.js";

export type AbilityEffect =
  | { kind: "magic_damage" }
  | { kind: "burn"; burn: number; duration: number }
  | { kind: "shield"; amount: number; duration: number }
  | { kind: "buff"; stat: "ad" | "as" | "armor" | "mr" | "abilityDamage"; value: number; duration: number }
  | { kind: "stealth"; duration: number };

export interface AbilityDef {
  name: string;
  manaCost: number;
  effect: AbilityEffect;
}

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
  ability?: AbilityDef;
}

export interface TraitDef {
  id: string;
  name: string;
  breakpoints: Array<{
    count: number;
    effect: { stat: string; value: number };
  }>;
}

export type ItemPassive =
  | { kind: "burn"; value: number; duration: number }
  | { kind: "shield"; value: number; duration: number };

export interface ItemDef {
  id: string;
  name: string;
  stats: Partial<Record<string, number>>;
  component?: boolean;
  recipe?: [string, string];
  passive?: ItemPassive;
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
  ability?: AbilityDef;
  /** Remaining absorb pool from shields (ability cast or item passive). */
  shield?: number;
  /** Untargetable while combat tick < this value (start-of-combat stealth). */
  untargetableUntil?: number;
  /** On-hit burn applied by an item passive. */
  onHitBurn?: { value: number; duration: number };
}

export interface StatusEffect {
  type: string;
  duration: number;
  value: number;
  /** For "buff" effects: the stat to revert on expiry. */
  stat?: string;
}

export interface BoardState {
  units: UnitInstance[];
}

/** Per-unit snapshot at combat start, after star/item/trait application. */
export interface InitUnitSnapshot {
  uid: number;
  side: 0 | 1;
  defId: string;
  star: 1 | 2 | 3;
  hex: HexCoord;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  items: string[];
}

/**
 * The event log fully describes combat: a consumer can reconstruct
 * positions/hp/mana/alive per uid at any tick by folding events in order,
 * without re-running game logic. "hp" and "mana" carry absolute values
 * (post-change, hp clamped at 0) and are emitted only on change.
 */
export type CombatEvent =
  | { type: "init"; tick: number; units: InitUnitSnapshot[] }
  | { type: "move"; tick: number; uid: number; from: HexCoord; to: HexCoord }
  | { type: "attack"; tick: number; uid: number; targetUid: number; dmg: number; crit: boolean }
  | { type: "cast"; tick: number; uid: number; targetUid: number; dmg: number }
  | { type: "mana"; tick: number; uid: number; value: number }
  | { type: "hp"; tick: number; uid: number; value: number }
  | { type: "death"; tick: number; uid: number }
  | { type: "overtime_start"; tick: number }
  | { type: "end"; tick: number; winnerSide: 0 | 1 | "draw"; survivingUids: number[] };

export type CombatEventType = CombatEvent["type"];

export interface CombatResult {
  winner: 0 | 1 | "draw";
  ticks: number;
  survivingUnits: UnitInstance[];
  events: CombatEvent[];
}
