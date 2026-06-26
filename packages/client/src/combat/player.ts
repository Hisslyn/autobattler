// Playback clock + frame builder — no Pixi. PLAYBACK is decoupled from the
// SIMULATION: the sim advances in whole integer ticks (canonical TICK_HZ game
// rate, see @autobattler/sim/src/fixed.ts), and this layer maps those sim ticks
// onto real time via a time accumulator (timeMs → tickFloat) with interpolation.
// The device refresh rate therefore affects only smoothness — never combat
// outcome and never the measured duration (durationMs = endTick / TICK_HZ).
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
import { TICK_HZ } from "@autobattler/sim/src/fixed.js";
import type { GameData } from "@autobattler/data";
import { applyEvent, emptyPlaybackState } from "./reducer.js";
import type { PlaybackState } from "./reducer.js";

// Re-export the canonical sim rate so the playback layer (and its callers) read
// the SAME 30 Hz tick rate the engine simulates at, rather than hardcoding it.
export { TICK_HZ };

// 0.25 = quarter the 1x pace (the new experienced default); 1x keeps its prior meaning.
export type PlaybackSpeed = 0.25 | 0.5 | 1 | 2;

// Playback-rate multiplier on how fast REAL time consumes sim ticks — the home
// of the slow-mo dev knob (was the old 0.2x "monitor fights" slow-mo). Applied
// to the wall-clock delta fed to advance() at the scene call site (NOT inside
// CombatPlayer, so determinism tests over advance(dtMs) are unchanged). 1 = no
// extra slowdown (playback runs at the user-selected speed); set to e.g. 0.2 to
// quarter real-time pacing without touching the sim, outcomes, or measured
// duration. Tunable in one place.
export const PLAYBACK_TIME_SCALE = 1;

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

const HALF = ROWS / 2; // 4 — sim rows 0..3 = side 0, 4..7 = side 1

/**
 * Maps a sim hex to display coords (display row 0 = top) so the viewer's own
 * units land on the bottom rows (4..7) in the SAME orientation they had during
 * planning, and the opponent is mirrored onto the top rows (0..3).
 *
 * Planning renders my board straight from its slot array — slot row
 * `floor(idx/COLS)` (0 = the player-zone's far/back row, 3 = the near/front row)
 * — so combat must put my far row at the player zone's top and my near row at
 * its bottom. The previous `flipRows` for side 0 inverted that order, so a
 * back-row placement appeared in the front row once combat started. The mapping
 * below preserves the placement 1:1 for BOTH sides:
 *
 *   side 0 (mine = sim 0..3): mine → r + HALF  (sim 0 → 4 top … sim 3 → 7 front)
 *                             opp  → ROWS-1-r  (sim 4 → 3 … sim 7 → 0, mirrored)
 *   side 1 (mine = sim 4..7): mine → ROWS-1-r+HALF (sim 7 → 4 top … sim 4 → 7 front)
 *                             opp  → r          (sim 0 → 0 … sim 3 → 3, mirrored)
 */
export function toDisplayHex(hex: HexCoord, mySide: 0 | 1): HexCoord {
  const r = hex.r;
  const mine = mySide === 0 ? r < HALF : r >= HALF;
  if (mine) {
    // My units: bottom half, keeping planning's near/far ordering.
    const planningRow = mySide === 0 ? r : ROWS - 1 - r; // 0 = far/back … 3 = near/front
    return { q: hex.q, r: planningRow + HALF };
  }
  // Opponent: mirrored onto the top half so their front faces my front.
  const displayRow = mySide === 0 ? ROWS - 1 - r : r;
  return { q: hex.q, r: displayRow };
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
    // The sim rate; defaults to the canonical TICK_HZ so playback consumes ticks
    // at exactly the rate the engine produced them. One sim tick = 1/TICK_HZ s of
    // game time; msPerTick maps that onto real wall-clock pacing only.
    ticksPerSec: number = TICK_HZ,
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
