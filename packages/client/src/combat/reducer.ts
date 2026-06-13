// Pure event-log reducer — no Pixi, no MatchState. Playback state is derived
// strictly by folding CombatEvents in log order.
import type { CombatEvent } from "@autobattler/sim/src/types.js";
import type { HexCoord } from "@autobattler/sim/src/hex.js";

export interface PlaybackUnit {
  uid: number;
  side: 0 | 1;
  defId: string;
  star: 1 | 2 | 3;
  pos: HexCoord;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  alive: boolean;
  items: string[];
}

export interface PlaybackState {
  units: Map<number, PlaybackUnit>;
  overtime: boolean;
  ended: boolean;
  winnerSide: 0 | 1 | "draw" | null;
  survivingUids: number[];
}

export function emptyPlaybackState(): PlaybackState {
  return { units: new Map(), overtime: false, ended: false, winnerSide: null, survivingUids: [] };
}

/** Mutates and returns state. attack/cast carry no state change of their own
 *  (hp/mana arrive as separate absolute-value events); they only drive fx. */
export function applyEvent(state: PlaybackState, ev: CombatEvent): PlaybackState {
  switch (ev.type) {
    case "init":
      for (const u of ev.units) {
        state.units.set(u.uid, {
          uid: u.uid,
          side: u.side,
          defId: u.defId,
          star: u.star,
          pos: { ...u.hex },
          hp: u.hp,
          maxHp: u.maxHp,
          mana: u.mana,
          maxMana: u.maxMana,
          alive: true,
          items: [...u.items],
        });
      }
      break;
    case "move": {
      const u = state.units.get(ev.uid);
      if (u) u.pos = { ...ev.to };
      break;
    }
    case "hp": {
      const u = state.units.get(ev.uid);
      if (u) u.hp = ev.value;
      break;
    }
    case "mana": {
      const u = state.units.get(ev.uid);
      if (u) u.mana = ev.value;
      break;
    }
    case "death": {
      const u = state.units.get(ev.uid);
      if (u) u.alive = false;
      break;
    }
    case "overtime_start":
      state.overtime = true;
      break;
    case "end":
      state.ended = true;
      state.winnerSide = ev.winnerSide;
      state.survivingUids = [...ev.survivingUids];
      break;
    case "attack":
    case "cast":
      break;
  }
  return state;
}

/** State after all events with event.tick <= t (log is tick-ordered). */
export function stateAtTick(log: CombatEvent[], t: number): PlaybackState {
  const state = emptyPlaybackState();
  for (const ev of log) {
    if (ev.tick > t) break;
    applyEvent(state, ev);
  }
  return state;
}
