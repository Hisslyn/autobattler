import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import { decodeC2S } from "@autobattler/protocol";
import {
  createSession,
  removeSession,
  send,
  checkRateLimit,
  registerToken,
  findSeatByToken,
} from "./session.js";
import { joinQueue, leaveQueue } from "./matchmaker.js";
import { getRoom, handlePlayerCommand, markReady, reconnectSession, setRoomRepository } from "./room.js";
import { createRepository } from "./db/index.js";
import { createHttpHandler } from "./http.js";

const PORT = Number(process.env["PORT"] ?? 3001);
const HEARTBEAT_MS = 5_000;

const repo = await createRepository();
setRoomRepository(repo);

const httpServer = createServer((req, res) => {
  void createHttpHandler(repo)(req, res);
});
const wss = new WebSocketServer({ server: httpServer });

function generateToken(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

wss.on("connection", (ws: WebSocket) => {
  const session = createSession(ws);
  const token = generateToken();
  registerToken(session.id, token);

  // Heartbeat via WS ping frames
  let alive = true;
  const heartbeat = setInterval(() => {
    if (!alive) {
      ws.terminate();
      return;
    }
    alive = false;
    ws.ping();
  }, HEARTBEAT_MS);

  ws.on("message", (data: Buffer | string) => {
    const raw = typeof data === "string" ? data : data.toString();

    // Rate limit only CMD messages
    const msg = decodeC2S(raw);
    if (!msg) {
      send(session, { type: "ERROR", code: "INVALID_MESSAGE", message: "Malformed message" });
      return;
    }

    if (msg.type === "CMD" && !checkRateLimit(session)) return;

    switch (msg.type) {
      case "PING":
        send(session, { type: "PONG", ts: msg.ts, serverTs: Date.now() });
        break;

      case "QUEUE_JOIN": {
        if (session.roomId) {
          send(session, { type: "ERROR", code: "ALREADY_QUEUED", message: "Already in match" });
          break;
        }
        const authToken = msg.authToken;
        if (!authToken) {
          send(session, { type: "ERROR", code: "UNAUTHENTICATED", message: "QUEUE_JOIN requires authToken" });
          break;
        }
        void repo.findByToken(authToken).then(async (account) => {
          if (!account) {
            send(session, { type: "ERROR", code: "UNAUTHENTICATED", message: "Invalid auth token" });
            return;
          }
          session.accountId = account.accountId;
          const profile = await repo.getProfile(account.accountId);
          session.name = profile?.name ?? null;
          joinQueue(session);
        });
        break;
      }

      case "RECONNECT": {
        const claim = findSeatByToken(msg.token);
        const room = claim ? getRoom(claim.roomId) : undefined;
        if (!claim || !room) {
          send(session, { type: "ERROR", code: "RECONNECT_FAILED", message: "Unknown or expired token" });
          break;
        }
        // Adopt the original seat token on this fresh connection
        registerToken(session.id, msg.token);
        reconnectSession(room, session, claim.seatIndex);
        break;
      }

      case "QUEUE_LEAVE":
        leaveQueue(session);
        break;

      case "CMD": {
        if (!session.roomId || session.seatIndex === null) {
          send(session, { type: "ERROR", code: "NOT_IN_MATCH", message: "Not in a match" });
          break;
        }
        const room = getRoom(session.roomId);
        if (!room) {
          send(session, { type: "ERROR", code: "NOT_IN_MATCH", message: "Room not found" });
          break;
        }
        if (room.seats[session.seatIndex] !== session) {
          send(session, { type: "ERROR", code: "WRONG_SEAT", message: "Wrong seat" });
          break;
        }
        handlePlayerCommand(room, session.seatIndex, msg.cmd);
        break;
      }

      case "READY": {
        if (!session.roomId || session.seatIndex === null) break;
        const room = getRoom(session.roomId);
        if (!room) break;
        markReady(room, session.seatIndex);
        break;
      }
    }

    alive = true;
  });

  ws.on("close", () => {
    clearInterval(heartbeat);
    // Mark seat AFK if in a room
    if (session.roomId && session.seatIndex !== null) {
      const room = getRoom(session.roomId);
      if (room) {
        session.afk = true;
      }
    } else {
      leaveQueue(session);
    }
    removeSession(session.id);
  });

  ws.on("pong", () => {
    alive = true;
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server listening on ws://localhost:${PORT} (HTTP auth/leaderboard on same port)`);
});
