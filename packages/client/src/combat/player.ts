// Playback clock + frame builder — no Pixi. Maps wall time to ticks
// (ticksPerSec at 1x), folds events through the reducer, and emits
// interpolated unit positions plus one-shot fx for the view layer.
//
// The fx stream is the single source of combat presentation: every visual and
// every combat sound is derived here from the CombatEvent log (positions from
// the reducer state at the event tick, ranged-vs-melee from each unit's range,
// ability kind from the casting unit's ability effect — both looked up in the
// passed `data`). Playback stays a pure deterministic function of (log, seed):
// the same log + reducedMotion flag always yields the same fx sequence.
import type { CombatEvent, AbilityEffect } from "@autobattler/sim/src/types.js";
import type { HexCoord } from "@autobattler/sim/src/hex.js";
import { ROWS, hexDistance } from "@autobattler/sim/src/hex.js";
import type { GameData } from "@autobattler/data";
import { applyEvent, emptyPlaybackState } from "./reducer.js";
import type { PlaybackState } from "./reducer.js";

export type PlaybackSpeed = 1 | 2;

/** Ability effect kind keyed into per-kind visuals/sounds. */
export type AbilityFxKind = AbilityEffect["kind"];

export type CombatFx =
  // ranged attack: a bolt that travels attacker→target over travelTicks
  | { kind: "projectile"; fromPos: HexCoord; toPos: HexCoord; targetUid: number; startTick: number; travelTicks: number; crit: boolean }
  // melee attack: a short lunge/contact toward the target
  | { kind: "contact"; fromPos: HexCoord; toPos: HexCoord; targetUid: number; crit: boolean }
  // hit-spark at the target on attack landing
  | { kind: "impact"; pos: HexCoord; targetUid: number; crit: boolean }
  // damage number floater (weighted: crits larger + gold)
  | { kind: "floater"; pos: HexCoord; amount: number; crit: boolean; magic: boolean }
  // ability cast: burst at the caster, keyed by effect kind
  | { kind: "abilityCast"; casterPos: HexCoord; effect: AbilityFxKind }
  // ability landing on the target, keyed by effect kind (drives per-kind sound + token aura)
  | { kind: "abilityHit"; targetPos: HexCoord; targetUid: number; effect: AbilityFxKind }
  // unit death: dissolve (fade + sink/scale + burst)
  | { kind: "dissolve"; uid: number; pos: HexCoord }
  | { kind: "overtime" };

export interface UnitFrame {
  uid: number;
  side: 0 | 1;
  defId: string;
  star: 1 | 2 | 3;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  alive: boolean;
  /** Logical hex (reducer position). */
  hex: HexCoord;
  /** When mid-move, lerp from fromHex to hex by moveT (hex centers in view space). */
  fromHex: HexCoord | null;
  moveT: number;
}

export interface PlaybackFrame {
  tick: number;
  units: UnitFrame[];
  fx: CombatFx[];
  overtime: boolean;
  done: boolean;
}

interface UnitMeta {
  range: number;
  abilityKind: AbilityFxKind | null;
}

/** Travel time (ticks) for a ranged bolt over `dist` hexes; small + capped. */
function travelTicksFor(dist: number): number {
  return Math.max(2, Math.min(8, Math.round(dist * 1.5)));
}

/** Row flip keeping columns; involutive. */
export function flipRows(hex: HexCoord): HexCoord {
  return { q: hex.q, r: ROWS - 1 - hex.r };
}

/**
 * Maps a sim hex to display coords (display row 0 = top) so the viewer's
 * units always land on the bottom rows: side 0 occupies sim rows 0..3 and
 * gets the row flip, side 1 already sits on rows 4..7.
 */
export function toDisplayHex(hex: HexCoord, mySide: 0 | 1): HexCoord {
  return mySide === 0 ? flipRows(hex) : hex;
}

export class CombatPlayer {
  readonly endTick: number;
  private readonly msPerTick: number;
  private readonly log: CombatEvent[];
  private readonly meta: Map<string, UnitMeta>;
  private readonly reducedMotion: boolean;
  private state = emptyPlaybackState();
  private cursor = 0;
  private timeMs = 0;
  private _speed: PlaybackSpeed = 1;
  /** Last MOVE per uid, for lerping across its one-tick span. */
  private moves = new Map<number, { from: HexCoord; tick: number }>();

  constructor(
    log: CombatEvent[],
    ticksPerSec: number,
    data: GameData,
    opts: { reducedMotion?: boolean } = {}
  ) {
    this.log = log;
    this.msPerTick = 1000 / ticksPerSec;
    this.reducedMotion = opts.reducedMotion ?? false;
    this.meta = new Map(
      data.units.map((u) => [u.id, { range: u.range, abilityKind: u.ability?.effect.kind ?? null }])
    );
    const last = log[log.length - 1];
    this.endTick = last?.type === "end" ? last.tick : (last?.tick ?? 0);
  }

  get speed(): PlaybackSpeed {
    return this._speed;
  }

  setSpeed(s: PlaybackSpeed): void {
    this._speed = s;
  }

  /** Total playback duration in ms at 1x speed. */
  get durationMs(): number {
    return this.endTick * this.msPerTick;
  }

  get done(): boolean {
    return this.cursor >= this.log.length && this.timeMs >= this.durationMs;
  }

  getState(): PlaybackState {
    return this.state;
  }

  /** Jump to the final state; remaining events are applied without fx. */
  skipToEnd(): PlaybackFrame {
    this.timeMs = this.durationMs;
    while (this.cursor < this.log.length) {
      applyEvent(this.state, this.log[this.cursor++]!);
    }
    this.moves.clear();
    return this.buildFrame(this.endTick, []);
  }

  /** Advance the clock by dtMs of wall time (scaled by speed) and emit a frame. */
  advance(dtMs: number): PlaybackFrame {
    this.timeMs = Math.min(this.durationMs, this.timeMs + dtMs * this._speed);
    const tickFloat = this.timeMs / this.msPerTick;
    const tickInt = Math.floor(tickFloat);
    const fx: CombatFx[] = [];
    while (this.cursor < this.log.length && this.log[this.cursor]!.tick <= tickInt) {
      const ev = this.log[this.cursor++]!;
      if (ev.type === "move") this.moves.set(ev.uid, { from: { ...ev.from }, tick: ev.tick });
      this.emitFx(ev, fx);
      applyEvent(this.state, ev);
    }
    return this.buildFrame(tickFloat, fx);
  }

  /** Position of a unit at the current reducer state (pre-event for the event being emitted). */
  private posOf(uid: number): HexCoord | null {
    const u = this.state.units.get(uid);
    return u ? { ...u.pos } : null;
  }

  /**
   * Derive presentation fx from one event. Positions come from the reducer
   * state already folded up to (but excluding) this event, so attacker/target
   * sit at their pre-event hexes (attack/cast carry no position change).
   *
   * Reduced motion downgrades the emitted set: the travelling/lunging/burst
   * fx (projectile, contact, abilityCast) are dropped and the impact is emitted
   * directly instead of being spawned by the view on bolt landing. Damage
   * floaters, impacts, ability hits, dissolves and the overtime cue remain so
   * readability and combat audio are preserved.
   */
  private emitFx(ev: CombatEvent, fx: CombatFx[]): void {
    switch (ev.type) {
      case "attack": {
        const from = this.posOf(ev.uid);
        const to = this.posOf(ev.targetUid);
        if (!from || !to) break;
        const ranged = (this.meta.get(this.state.units.get(ev.uid)?.defId ?? "")?.range ?? 1) > 1;
        if (this.reducedMotion) {
          fx.push({ kind: "impact", pos: to, targetUid: ev.targetUid, crit: ev.crit });
        } else if (ranged) {
          fx.push({
            kind: "projectile",
            fromPos: from,
            toPos: to,
            targetUid: ev.targetUid,
            startTick: ev.tick,
            travelTicks: travelTicksFor(hexDistance(from, to)),
            crit: ev.crit,
          });
          // ranged impact is spawned by the view when the bolt lands
        } else {
          fx.push({ kind: "contact", fromPos: from, toPos: to, targetUid: ev.targetUid, crit: ev.crit });
          fx.push({ kind: "impact", pos: to, targetUid: ev.targetUid, crit: ev.crit });
        }
        if (ev.dmg > 0) fx.push({ kind: "floater", pos: to, amount: ev.dmg, crit: ev.crit, magic: false });
        break;
      }
      case "cast": {
        const casterPos = this.posOf(ev.uid);
        const targetPos = this.posOf(ev.targetUid);
        const effect = this.meta.get(this.state.units.get(ev.uid)?.defId ?? "")?.abilityKind;
        if (!effect) break;
        if (casterPos && !this.reducedMotion) fx.push({ kind: "abilityCast", casterPos, effect });
        if (targetPos) fx.push({ kind: "abilityHit", targetPos, targetUid: ev.targetUid, effect });
        if (targetPos && ev.dmg > 0) {
          fx.push({ kind: "floater", pos: targetPos, amount: ev.dmg, crit: false, magic: true });
        }
        break;
      }
      case "death": {
        const pos = this.posOf(ev.uid);
        if (pos) fx.push({ kind: "dissolve", uid: ev.uid, pos });
        break;
      }
      case "overtime_start":
        fx.push({ kind: "overtime" });
        break;
      default:
        break;
    }
  }

  private buildFrame(tickFloat: number, fx: CombatFx[]): PlaybackFrame {
    const units: UnitFrame[] = [];
    for (const u of this.state.units.values()) {
      let fromHex: HexCoord | null = null;
      let moveT = 1;
      const mv = this.moves.get(u.uid);
      if (u.alive && mv && tickFloat < mv.tick + 1) {
        fromHex = mv.from;
        moveT = Math.max(0, tickFloat - mv.tick);
      }
      units.push({
        uid: u.uid,
        side: u.side,
        defId: u.defId,
        star: u.star,
        hp: u.hp,
        maxHp: u.maxHp,
        mana: u.mana,
        maxMana: u.maxMana,
        alive: u.alive,
        hex: { ...u.pos },
        fromHex,
        moveT,
      });
    }
    return { tick: tickFloat, units, fx, overtime: this.state.overtime, done: this.done };
  }
}
