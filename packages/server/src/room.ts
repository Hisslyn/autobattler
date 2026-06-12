import { gameData } from "@autobattler/data";
import { encode } from "@autobattler/protocol";
import type { S2CMessage } from "@autobattler/protocol";
import {
  createMatch,
  advancePhase,
  isMatchOver,
} from "@autobattler/rules";
import { applyCommand } from "@autobattler/rules/src/commands.js";
import { applyAiCommands } from "@autobattler/rules/src/ai.js";
import { mulberry32 } from "@autobattler/sim/src/prng.js";
import type { MatchState, PlayerState } from "@autobattler/rules/src/state.js";
import type { Command } from "@autobattler/rules/src/commands.js";
import type { Session } from "./session.js";
import { send } from "./session.js";

const PLANNING_MS = 30_000;
const HUMAN_SEAT_COUNT = 8;

export interface Room {
  id: string;
  state: MatchState;
  seats: (Session | null)[];
  phaseTimer: ReturnType<typeof setTimeout> | null;
  prng: () => number;
}

const rooms = new Map<string, Room>();
let _roomCounter = 0;

export function createRoom(sessions: Session[], botCount: number): Room {
  const roomId = `room${++_roomCounter}`;
  const seed = Date.now() ^ (Math.random() * 0xffffffff);
  const prng = mulberry32(seed);
  const state = createMatch(seed, gameData);

  const seats: (Session | null)[] = new Array(HUMAN_SEAT_COUNT).fill(null);
  for (let i = 0; i < sessions.length && i < HUMAN_SEAT_COUNT; i++) {
    seats[i] = sessions[i]!;
  }

  const room: Room = { id: roomId, state, seats, phaseTimer: null, prng };
  rooms.set(roomId, room);

  // Assign sessions to room/seat
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i]!;
    s.roomId = roomId;
    s.seatIndex = i;
  }

  // Broadcast MATCH_FOUND to all human seats
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i]!;
    send(s, { type: "MATCH_FOUND", roomId, token: s.token!, seatIndex: i });
  }

  // Send initial snapshot to each seat
  for (let i = 0; i < sessions.length; i++) {
    sendSnapshot(room, sessions[i]!);
  }

  startPlanning(room);
  return room;
}

export function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId);
}

export function handlePlayerCommand(room: Room, seatIndex: number, rawCmd: Record<string, unknown>): void {
  if (room.state.phase !== "PLANNING") {
    const seat = room.seats[seatIndex];
    if (seat) send(seat, { type: "ERROR", code: "WRONG_PHASE", message: "Not planning phase" });
    return;
  }

  const cmd = validateCommand(rawCmd);
  if (!cmd) {
    const seat = room.seats[seatIndex];
    if (seat) send(seat, { type: "ERROR", code: "INVALID_MESSAGE", message: "Invalid command" });
    return;
  }

  const result = applyCommand(room.state, seatIndex, cmd, room.prng, gameData);
  const seat = room.seats[seatIndex];
  if (!result.ok) {
    if (seat) send(seat, { type: "ERROR", code: "COMMAND_REJECTED", message: result.error });
    return;
  }

  broadcastDelta(room, seatIndex);
}

export function handlePlayerReady(room: Room, seatIndex: number): void {
  if (room.state.phase !== "PLANNING") return;
  const allReady = room.seats.every((s) => s === null || s.afk || isReady(room, s));
  if (allReady) {
    advanceCombat(room);
  }
}

const readySet = new WeakMap<Room, Set<number>>();

function isReady(room: Room, session: Session): boolean {
  return readySet.get(room)?.has(session.seatIndex!) ?? false;
}

export function markReady(room: Room, seatIndex: number): void {
  if (!readySet.has(room)) readySet.set(room, new Set());
  readySet.get(room)!.add(seatIndex);
  handlePlayerReady(room, seatIndex);
}

function startPlanning(room: Room): void {
  if (!readySet.has(room)) readySet.set(room, new Set());
  readySet.get(room)!.clear();

  const endsAt = Date.now() + PLANNING_MS;
  broadcastAll(room, {
    type: "PHASE_CHANGE",
    phase: "PLANNING",
    round: room.state.round,
    endsAt,
  });

  room.phaseTimer = setTimeout(() => advanceCombat(room), PLANNING_MS);
}

function advanceCombat(room: Room): void {
  if (room.phaseTimer) {
    clearTimeout(room.phaseTimer);
    room.phaseTimer = null;
  }
  if (room.state.phase !== "PLANNING") return;

  // Apply AI for bot seats (null seats)
  for (let i = 0; i < HUMAN_SEAT_COUNT; i++) {
    if (room.seats[i] === null || room.seats[i]!.afk) {
      const player = room.state.players[i];
      if (player?.alive) {
        applyAiCommands(room.state, i, room.prng, gameData);
      }
    }
  }

  // Capture pre-combat snapshots per seat for COMBAT_START
  const opponentSnapshots: Record<number, unknown> = {};
  for (const [aId, bId] of room.state.lastPairings) {
    if (bId >= 0) {
      opponentSnapshots[aId] = serializePlayerPublic(room.state.players[bId]!);
      opponentSnapshots[bId] = serializePlayerPublic(room.state.players[aId]!);
    }
  }

  // PLANNING → COMBAT (runs combat internally)
  advancePhase(room.state, gameData);

  const combatSeed = room.state.prngState;

  broadcastAll(room, {
    type: "COMBAT_START",
    pairings: room.state.lastPairings,
    opponentSnapshots,
    seed: combatSeed,
  });

  broadcastAll(room, {
    type: "COMBAT_RESULT",
    results: serializeCombatResults(room),
  });

  // COMBAT → RESOLUTION
  advancePhase(room.state, gameData);

  if (isMatchOver(room.state)) {
    const placements = [...room.state.placements];
    // Add last survivor
    const lastAlive = room.state.players.find((p) => p.alive);
    if (lastAlive) placements.push(lastAlive.id);
    broadcastAll(room, { type: "MATCH_END", placements });
    rooms.delete(room.id);
    return;
  }

  broadcastAll(room, {
    type: "PHASE_CHANGE",
    phase: "RESOLUTION",
    round: room.state.round,
    endsAt: Date.now(),
  });

  // Send updated snapshots
  for (let i = 0; i < HUMAN_SEAT_COUNT; i++) {
    const s = room.seats[i];
    if (s && !s.afk) sendSnapshot(room, s);
  }

  startPlanning(room);
}

export function reconnectSession(room: Room, session: Session, seatIndex: number): void {
  room.seats[seatIndex] = session;
  session.roomId = room.id;
  session.seatIndex = seatIndex;
  session.afk = false;
  sendSnapshot(room, session);
}

function sendSnapshot(room: Room, session: Session): void {
  send(session, { type: "STATE_SNAPSHOT", state: serializeState(room.state, session.seatIndex!) });
}

function broadcastDelta(room: Room, changedSeat: number): void {
  const delta = serializeDelta(room.state, changedSeat);
  for (let i = 0; i < HUMAN_SEAT_COUNT; i++) {
    const s = room.seats[i];
    if (s && !s.afk) {
      send(s, { type: "STATE_DELTA", delta });
    }
  }
}

function broadcastAll(room: Room, msg: S2CMessage): void {
  const encoded = encode(msg);
  for (let i = 0; i < HUMAN_SEAT_COUNT; i++) {
    const s = room.seats[i];
    if (s && s.ws.readyState === 1 /* OPEN */) {
      s.ws.send(encoded);
    }
  }
}

function validateCommand(raw: Record<string, unknown>): Command | null {
  if (typeof raw["type"] !== "string") return null;
  switch (raw["type"]) {
    case "BUY":
      if (typeof raw["shopSlotIndex"] !== "number") return null;
      return { type: "BUY", shopSlotIndex: raw["shopSlotIndex"] as number };
    case "SELL":
      if (typeof raw["unitUid"] !== "number") return null;
      return { type: "SELL", unitUid: raw["unitUid"] as number };
    case "REROLL":
      return { type: "REROLL" };
    case "BUY_XP":
      return { type: "BUY_XP" };
    case "MOVE":
      if (typeof raw["unitUid"] !== "number") return null;
      if (typeof raw["toBench"] !== "boolean") return null;
      if (typeof raw["toIndex"] !== "number") return null;
      return { type: "MOVE", unitUid: raw["unitUid"] as number, toBench: raw["toBench"] as boolean, toIndex: raw["toIndex"] as number };
    case "EQUIP":
      if (typeof raw["unitUid"] !== "number") return null;
      if (typeof raw["itemId"] !== "string") return null;
      return { type: "EQUIP", unitUid: raw["unitUid"] as number, itemId: raw["itemId"] as string };
    default:
      return null;
  }
}

function serializePlayerPublic(p: PlayerState) {
  return {
    id: p.id,
    hp: p.hp,
    level: p.level,
    board: p.board,
    alive: p.alive,
    placement: p.placement,
  };
}

function serializeState(state: MatchState, seatIndex: number) {
  return {
    round: state.round,
    phase: state.phase,
    me: state.players[seatIndex],
    players: state.players.map(serializePlayerPublic),
    lastPairings: state.lastPairings,
  };
}

function serializeDelta(state: MatchState, changedSeat: number) {
  return {
    changedSeat,
    player: state.players[changedSeat],
    players: state.players.map(serializePlayerPublic),
  };
}

function serializeCombatResults(room: Room) {
  const out: Record<number, unknown> = {};
  for (const [id, result] of room.state.lastCombatResults) {
    out[id] = result;
  }
  return out;
}
