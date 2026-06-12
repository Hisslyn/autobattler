import type { WebSocket } from "ws";
import { encode } from "@autobattler/protocol";
import type { S2CMessage } from "@autobattler/protocol";

export interface Session {
  id: string;
  ws: WebSocket;
  roomId: string | null;
  seatIndex: number | null;
  token: string | null;
  afk: boolean;
  cmdCount: number;
  cmdWindowStart: number;
}

const CMD_RATE_LIMIT = 20;
const CMD_WINDOW_MS = 1000;

const sessions = new Map<string, Session>();
const tokenToSessionId = new Map<string, string>();

let _idCounter = 0;
export function createSession(ws: WebSocket): Session {
  const id = `s${++_idCounter}`;
  const session: Session = {
    id,
    ws,
    roomId: null,
    seatIndex: null,
    token: null,
    afk: false,
    cmdCount: 0,
    cmdWindowStart: Date.now(),
  };
  sessions.set(id, session);
  return session;
}

export function removeSession(id: string): void {
  const session = sessions.get(id);
  if (session?.token) tokenToSessionId.delete(session.token);
  sessions.delete(id);
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function registerToken(sessionId: string, token: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  if (session.token) tokenToSessionId.delete(session.token);
  session.token = token;
  tokenToSessionId.set(token, sessionId);
}

export function findSessionByToken(token: string): Session | undefined {
  const id = tokenToSessionId.get(token);
  return id ? sessions.get(id) : undefined;
}

// Seat tokens survive disconnects: token → seat mapping is kept until the
// match ends so RECONNECT can restore the seat from a fresh connection.
export interface SeatClaim {
  roomId: string;
  seatIndex: number;
}

const tokenToSeat = new Map<string, SeatClaim>();

export function registerSeatToken(token: string, roomId: string, seatIndex: number): void {
  tokenToSeat.set(token, { roomId, seatIndex });
}

export function findSeatByToken(token: string): SeatClaim | undefined {
  return tokenToSeat.get(token);
}

export function clearRoomSeatTokens(roomId: string): void {
  for (const [token, claim] of tokenToSeat) {
    if (claim.roomId === roomId) tokenToSeat.delete(token);
  }
}

export function send(session: Session, msg: S2CMessage): void {
  if (session.ws.readyState === 1 /* OPEN */) {
    session.ws.send(encode(msg));
  }
}

/** Returns false and disconnects if rate limit exceeded. */
export function checkRateLimit(session: Session): boolean {
  const now = Date.now();
  if (now - session.cmdWindowStart >= CMD_WINDOW_MS) {
    session.cmdCount = 0;
    session.cmdWindowStart = now;
  }
  session.cmdCount++;
  if (session.cmdCount > CMD_RATE_LIMIT) {
    send(session, { type: "ERROR", code: "RATE_LIMITED", message: "Too many commands" });
    session.ws.terminate();
    return false;
  }
  return true;
}
