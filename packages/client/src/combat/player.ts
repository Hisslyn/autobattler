// Playback clock + frame builder — no Pixi. Maps wall time to ticks
// (ticksPerSec at 1x), folds events through the reducer, and emits
// interpolated unit positions plus one-shot fx for the view layer.
import type { CombatEvent } from "@autobattler/sim/src/types.js";
import type { HexCoord } from "@autobattler/sim/src/hex.js";
import { ROWS } from "@autobattler/sim/src/hex.js";
import { applyEvent, emptyPlaybackState } from "./reducer.js";
import type { PlaybackState } from "./reducer.js";

export type PlaybackSpeed = 1 | 2;

export type CombatFx =
  | { kind: "attack"; uid: number; targetUid: number; crit: boolean }
  | { kind: "cast"; uid: number; targetUid: number }
  | { kind: "hit"; uid: number; amount: number; crit: boolean; magic: boolean }
  | { kind: "death"; uid: number }
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
  private state = emptyPlaybackState();
  private cursor = 0;
  private timeMs = 0;
  private _speed: PlaybackSpeed = 1;
  /** Last MOVE per uid, for lerping across its one-tick span. */
  private moves = new Map<number, { from: HexCoord; tick: number }>();

  constructor(log: CombatEvent[], ticksPerSec: number) {
    this.log = log;
    this.msPerTick = 1000 / ticksPerSec;
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
      collectFx(ev, fx);
      applyEvent(this.state, ev);
    }
    return this.buildFrame(tickFloat, fx);
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

function collectFx(ev: CombatEvent, fx: CombatFx[]): void {
  switch (ev.type) {
    case "attack":
      fx.push({ kind: "attack", uid: ev.uid, targetUid: ev.targetUid, crit: ev.crit });
      fx.push({ kind: "hit", uid: ev.targetUid, amount: ev.dmg, crit: ev.crit, magic: false });
      break;
    case "cast":
      fx.push({ kind: "cast", uid: ev.uid, targetUid: ev.targetUid });
      fx.push({ kind: "hit", uid: ev.targetUid, amount: ev.dmg, crit: false, magic: true });
      break;
    case "death":
      fx.push({ kind: "death", uid: ev.uid });
      break;
    case "overtime_start":
      fx.push({ kind: "overtime" });
      break;
    default:
      break;
  }
}
