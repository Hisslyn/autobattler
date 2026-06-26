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
  /**
   * Sticky current-target uid (transient live-combat field, like attackCooldown).
   * Persisted across ticks so targeting is sticky: the unit retains this enemy
   * while it stays alive + targetable + reachable, and only re-acquires when it
   * dies / becomes untargetable / is unreachable. Boards start with it undefined;
   * `cloneUnit`'s `{...u}` spread copies it, so it survives the start-of-combat clone.
   */
  targetUid?: number;
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

/**
 * Why a unit's resolved target changed from one tick to the next.
 * Targeting is now STICKY/persistent (see engine.ts `resolveTarget`): a unit
 * RETAINS its current target while it stays alive + targetable + reachable, and
 * only re-acquires on death / untargetability / provable unreachability. The
 * engine emits ONLY these reasons:
 *
 * - acquired_no_target          — first acquire (had no current target).
 * - switched_target_dead        — previous target is no longer alive.
 * - switched_target_untargetable— previous target is alive but untargetable
 *                                 (its untargetableUntil > current tick).
 * - switched_target_unreachable — previous target is alive + targetable but
 *                                 has no A* path toward a hex within range, AND
 *                                 a reachable alternative enemy exists (the only
 *                                 distance-related switch; covers a blocked path).
 *                                 If there is NO reachable alternative the unit
 *                                 KEEPS its held target and idles (no retarget).
 * - switched_forced             — RESERVED for an explicit forcing effect
 *                                 (taunt). The current engine has none, so this
 *                                 is never emitted; kept for spec completeness.
 *
 * The following two are RESERVED-as-FORBIDDEN: kept in the union for spec
 * completeness / back-compat but NEVER emitted post-stickiness (the QA invariant
 * (b) test asserts they never occur). A nearer enemy or a uid-tiebreak flip is
 * NOT a reason to switch any more.
 *
 * - switched_target_out_of_range— (no longer emitted) a held target merely going
 *                                 out of range now triggers a CHASE, not a switch.
 * - retarget_recomputed         — (no longer emitted) the stateless
 *                                 nearest-recompute switch no longer exists.
 */
export type RetargetReason =
  | "acquired_no_target"
  | "switched_target_dead"
  | "switched_target_untargetable"
  | "switched_target_unreachable"
  | "switched_target_out_of_range"
  | "switched_forced"
  | "retarget_recomputed";

/** One unit's end-of-tick state for the trace (one row per alive unit per tick). */
export interface TraceUnitRecord {
  uid: number;
  side: 0 | 1;
  defId: string;
  /** End-of-tick position. */
  hex: HexCoord;
  hp: number;
  mana: number;
  /** The target uid the engine actually used this tick (null if none / idle). */
  targetUid: number | null;
  /** Single label by precedence cast > attack > move > idle. */
  action: "move" | "attack" | "cast" | "idle";
  /** Post-mitigation, post-shield damage this unit inflicted on others this tick. */
  damageDealt: number;
}

/** A single target change for one unit on one tick. */
export interface TraceRetarget {
  uid: number;
  fromUid: number | null;
  toUid: number | null;
  reason: RetargetReason;
}

/** Per-tick trace frame: every currently-alive unit + any target changes. */
export interface TraceTick {
  tick: number;
  units: TraceUnitRecord[];
  retargets: TraceRetarget[];
}

/** The full opt-in combat trace (one frame per simulated tick). */
export interface CombatTrace {
  ticks: TraceTick[];
}

export interface CombatResult {
  winner: 0 | 1 | "draw";
  ticks: number;
  survivingUnits: UnitInstance[];
  events: CombatEvent[];
  /** Populated only when simulateCombat is called with { trace: true }. */
  trace?: CombatTrace;
}
