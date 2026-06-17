import { gameData } from "@autobattler/data";
import { encode } from "@autobattler/protocol";
import type { S2CMessage, MatchStats } from "@autobattler/protocol";
import {
  createMatch,
  advancePhase,
  isMatchOver,
} from "@autobattler/rules";
import { applyCommand } from "@autobattler/rules/src/commands.js";
import { applyAiCommands } from "@autobattler/rules/src/ai.js";
import { isPveRound } from "@autobattler/rules/src/rounds.js";
import { mulberry32 } from "@autobattler/sim/src/prng.js";
import type { MatchState, PlayerState } from "@autobattler/rules/src/state.js";
import type { Command } from "@autobattler/rules/src/commands.js";
import { randomUUID } from "node:crypto";
import type { Session } from "./session.js";
import { send, registerSeatToken, clearRoomSeatTokens } from "./session.js";
import type { Repository } from "./db/index.js";
import { MemoryRepository } from "./db/index.js";
import { recordMatchResult } from "./recorder.js";
import type { SeatResult } from "./recorder.js";

// Planning runs its full duration in production (30s). An env override
// (PLANNING_MS_OVERRIDE) lets the integration harness shorten real-wall-clock
// planning since READY no longer skips it; unset → 30_000. The room and the
// room.test.ts fake-timer harness both read this single value.
const PLANNING_MS_DEFAULT = 30_000;
const _planningOverride = Number(process.env.PLANNING_MS_OVERRIDE);
export const PLANNING_MS =
  Number.isFinite(_planningOverride) && _planningOverride > 0
    ? _planningOverride
    : PLANNING_MS_DEFAULT;
const HUMAN_SEAT_COUNT = 8;

export interface Room {
  id: string;
  matchId: string;
  state: MatchState;
  seats: (Session | null)[];
  /** Account per seat, captured at room creation; null = bot seat. */
  seatAccounts: (string | null)[];
  /** Public display name per seat, captured at room creation (humans + bots). */
  seatNames: string[];
  phaseTimer: ReturnType<typeof setTimeout> | null;
  prng: () => number;
}

// All persistence goes through the Repository; defaults to in-memory so
// tests that drive rooms directly need no setup.
let repo: Repository = new MemoryRepository();
export function setRoomRepository(r: Repository): void {
  repo = r;
}

const rooms = new Map<string, Room>();
let _roomCounter = 0;

export function createRoom(sessions: Session[], seedOverride?: number): Room {
  const roomId = `room${++_roomCounter}`;
  const seed = seedOverride ?? (Date.now() ^ (Math.random() * 0xffffffff));
  const prng = mulberry32(seed);
  const state = createMatch(seed, gameData);

  const seats: (Session | null)[] = new Array(HUMAN_SEAT_COUNT).fill(null);
  const seatAccounts: (string | null)[] = new Array(HUMAN_SEAT_COUNT).fill(null);
  // Names are set once per match: humans use their profile name, bot seats a
  // generated placeholder. Public via the leaderboard, so safe to broadcast.
  const seatNames: string[] = new Array(HUMAN_SEAT_COUNT).fill("").map((_, i) => `Bot ${i + 1}`);
  for (let i = 0; i < sessions.length && i < HUMAN_SEAT_COUNT; i++) {
    seats[i] = sessions[i]!;
    seatAccounts[i] = sessions[i]!.accountId;
    seatNames[i] = sessions[i]!.name ?? `Player ${i + 1}`;
  }

  const room: Room = { id: roomId, matchId: randomUUID(), state, seats, seatAccounts, seatNames, phaseTimer: null, prng };
  rooms.set(roomId, room);

  // Assign sessions to room/seat
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i]!;
    s.roomId = roomId;
    s.seatIndex = i;
  }

  // Broadcast MATCH_FOUND to all human seats; seat tokens persist until match end
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i]!;
    registerSeatToken(s.token!, roomId, i);
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

export function handlePlayerReady(room: Room, _seatIndex: number): void {
  const allReady = room.seats.every((s) => s === null || s.afk || isReady(room, s));
  if (!allReady) return;
  // Planning runs its full duration; READY is a no-op for PLANNING (advanceCombat
  // is reachable only via the startPlanning timer). READY still skips the
  // RESOLUTION pause (Continue / auto-advance feature).
  if (room.state.phase === "RESOLUTION") {
    finishResolution(room);
  }
}

const readySet = new WeakMap<Room, Set<number>>();

function isReady(room: Room, session: Session): boolean {
  return readySet.get(room)?.has(session.seatIndex!) ?? false;
}

function clearReady(room: Room): void {
  if (!readySet.has(room)) readySet.set(room, new Set());
  readySet.get(room)!.clear();
}

export function markReady(room: Room, seatIndex: number): void {
  if (!readySet.has(room)) readySet.set(room, new Set());
  readySet.get(room)!.add(seatIndex);
  handlePlayerReady(room, seatIndex);
}

function startPlanning(room: Room): void {
  clearReady(room);

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

  // PLANNING → COMBAT (runs combat internally). This sets the CURRENT round's
  // pairings, roundSeed, per-player opponent boards, and per-player results.
  advancePhase(room.state, gameData);

  // Opponent snapshots come from the boards captured at combat start in rules,
  // keyed by the receiving player's id (both sides of each pairing).
  const opponentSnapshots: Record<number, unknown> = {};
  for (const [aId, bId] of room.state.lastPairings) {
    opponentSnapshots[aId] = serializeOpponentSnapshot(room.state, aId, bId < 0 ? null : bId);
    if (bId >= 0) {
      opponentSnapshots[bId] = serializeOpponentSnapshot(room.state, bId, aId);
    }
  }

  broadcastAll(room, {
    type: "COMBAT_START",
    pairings: room.state.lastPairings,
    opponentSnapshots,
    roundSeed: room.state.lastRoundSeed,
  });

  broadcastAll(room, {
    type: "COMBAT_RESULT",
    results: serializeCombatResults(room),
  });

  if (isMatchOver(room.state)) {
    void finalizeMatch(room);
    return;
  }

  startResolution(room);
}

// Persists the result (memory or pg repo) before broadcasting MATCH_END so
// the payload's MMR deltas always match what the repository stores.
async function finalizeMatch(room: Room): Promise<void> {
  const placements = [...room.state.placements];
  // Add last survivor
  const lastAlive = room.state.players.find((p) => p.alive);
  if (lastAlive) placements.push(lastAlive.id);

  // state.placements is elimination order (1 = first out); convert to final
  // standing where 1 = winner.
  const playerCount = room.state.players.length;
  const seatResults: SeatResult[] = room.state.players.map((p, seat) => ({
    seat,
    accountId: room.seatAccounts[seat] ?? null,
    placement: p.alive ? 1 : playerCount - (p.placement ?? playerCount) + 1,
  }));

  let mmr: Record<number, { before: number; after: number }> = {};
  try {
    mmr = await recordMatchResult(repo, room.matchId, seatResults);
  } catch (err) {
    console.error(`[room ${room.id}] failed to persist match result`, err);
  }

  const names: Record<number, string> = {};
  room.seatNames.forEach((n, i) => { names[i] = n; });

  // Per-seat accumulated match stats (round W/L, total damage taken/dealt),
  // read straight off final player state (not persisted; payload only).
  const stats: Record<number, MatchStats> = {};
  room.state.players.forEach((p, i) => {
    stats[i] = {
      roundWins: p.roundWins,
      roundLosses: p.roundLosses,
      totalDamageTaken: p.totalDamageTaken,
      totalDamageDealt: p.totalDamageDealt,
    };
  });

  broadcastAll(room, { type: "MATCH_END", placements, mmr, names, stats });
  clearRoomSeatTokens(room.id);
  rooms.delete(room.id);
}

// Real resolution pause: state stays in RESOLUTION (round = just-finished
// round) until the timer fires or all human seats READY again.
function startResolution(room: Room): void {
  clearReady(room);
  const resolutionMs = gameData.economy.resolutionSeconds * 1000;

  // PvE rounds award seeded loot decided by rules. Each human gets ONLY its own
  // orbs (private, like gold/shop) — sent before the phase change so the client
  // has them when it triggers the reveal on RESOLUTION.
  if (isPveRound(room.state.round, gameData)) {
    for (let i = 0; i < HUMAN_SEAT_COUNT; i++) {
      const s = room.seats[i];
      if (!s || s.afk) continue;
      const orbs = room.state.lastLootOrbs.get(i) ?? [];
      send(s, { type: "LOOT", round: room.state.round, orbs });
    }
  }

  // Each human gets ONLY its own round result (private, like loot) — sent before
  // the phase change so the resolution screen can read it as it opens.
  for (let i = 0; i < HUMAN_SEAT_COUNT; i++) {
    const s = room.seats[i];
    if (!s || s.afk) continue;
    const result = room.state.lastRoundResult.get(i);
    if (result) send(s, { type: "ROUND_RESULT", round: room.state.round, result });
  }

  broadcastAll(room, {
    type: "PHASE_CHANGE",
    phase: "RESOLUTION",
    round: room.state.round,
    endsAt: Date.now() + resolutionMs,
  });

  // Snapshots reflect post-combat state (hp, eliminations)
  for (let i = 0; i < HUMAN_SEAT_COUNT; i++) {
    const s = room.seats[i];
    if (s && !s.afk) sendSnapshot(room, s);
  }

  room.phaseTimer = setTimeout(() => finishResolution(room), resolutionMs);
}

function finishResolution(room: Room): void {
  if (room.phaseTimer) {
    clearTimeout(room.phaseTimer);
    room.phaseTimer = null;
  }
  if (room.state.phase !== "RESOLUTION") return;

  // RESOLUTION → PLANNING (income, round++, shop refresh)
  advancePhase(room.state, gameData);

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
  send(session, { type: "STATE_SNAPSHOT", state: serializeState(room.state, session.seatIndex!, room.seatNames) });
}

// Per-seat deltas: private fields (gold, shop, unequipped item inventory)
// go only to the acting player's own seat; everyone else gets public fields.
function broadcastDelta(room: Room, changedSeat: number): void {
  for (let i = 0; i < HUMAN_SEAT_COUNT; i++) {
    const s = room.seats[i];
    if (s && !s.afk) {
      send(s, { type: "STATE_DELTA", delta: serializeDelta(room.state, changedSeat, i, room.seatNames) });
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

// Public view: name, hp, level, xp, streaks, board (fielded units carry their
// items), bench. Private (own seat only): gold, shop, item inventory.
function serializePlayerPublic(p: PlayerState, name: string) {
  return {
    id: p.id,
    name,
    hp: p.hp,
    level: p.level,
    xp: p.xp,
    winStreak: p.winStreak,
    loseStreak: p.loseStreak,
    board: p.board,
    bench: p.bench,
    alive: p.alive,
    placement: p.placement,
  };
}

// Snapshot of the recipient's opponent at combat start. The board comes from
// the rules-side capture (lastOpponentBoards) so it is exactly what the
// server simulated, even if the opponent was eliminated this round.
function serializeOpponentSnapshot(state: MatchState, recipientId: number, opponentId: number | null) {
  const board = state.lastOpponentBoards.get(recipientId) ?? [];
  const opponent = opponentId !== null ? state.players[opponentId] : undefined;
  return {
    id: opponentId ?? -1,
    hp: opponent?.hp ?? 0,
    level: opponent?.level ?? 0,
    board,
    alive: opponent?.alive ?? false,
    placement: opponent?.placement ?? null,
  };
}

function serializeState(state: MatchState, seatIndex: number, names: string[]) {
  return {
    round: state.round,
    phase: state.phase,
    me: state.players[seatIndex],
    players: state.players.map((p, i) => serializePlayerPublic(p, names[i] ?? `Player ${i + 1}`)),
    lastPairings: state.lastPairings,
  };
}

function serializeDelta(state: MatchState, changedSeat: number, recipientSeat: number, names: string[]) {
  return {
    changedSeat,
    players: state.players.map((p, i) => serializePlayerPublic(p, names[i] ?? `Player ${i + 1}`)),
    // Full state (incl. gold/shop/items) only for the recipient's own seat
    ...(changedSeat === recipientSeat ? { me: state.players[changedSeat] } : {}),
  };
}

function serializeCombatResults(room: Room) {
  const out: Record<number, unknown> = {};
  for (const [id, result] of room.state.lastCombatResults) {
    out[id] = result;
  }
  return out;
}
