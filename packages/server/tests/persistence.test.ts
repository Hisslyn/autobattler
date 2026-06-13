import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { WebSocket } from "ws";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, Socket } from "node:net";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { decodeS2C, PROTOCOL_VERSION } from "@autobattler/protocol";
import type { S2CMessage, S2C_MatchEnd } from "@autobattler/protocol";
import { gameData } from "@autobattler/data";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverEntry = resolve(__dirname, "../src/index.ts");
const tsxEsm = resolve(__dirname, "../../../node_modules/.bin/tsx");

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function waitForPort(port: number, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    function tryConnect() {
      const sock = new Socket();
      sock.connect(port, "127.0.0.1", () => { sock.destroy(); resolve(); });
      sock.on("error", () => {
        if (Date.now() > deadline) { reject(new Error(`Port ${port} not open within ${timeoutMs}ms`)); return; }
        setTimeout(tryConnect, 100);
      });
    }
    tryConnect();
  });
}

function sendRaw(ws: WebSocket, msg: { type: string; [key: string]: unknown }): void {
  ws.send(JSON.stringify({ v: PROTOCOL_VERSION, t: msg.type, p: msg }));
}

function waitOpen(ws: WebSocket): Promise<void> {
  return new Promise((r, e) => { ws.on("open", r); ws.on("error", e); });
}

function collectUntil(ws: WebSocket, stopType: string, timeoutMs: number): Promise<S2CMessage[]> {
  const msgs: S2CMessage[] = [];
  return new Promise((resolve) => {
    const timer = setTimeout(() => { ws.off("message", handler); resolve(msgs); }, timeoutMs);
    const handler = (data: Buffer | string) => {
      const msg = decodeS2C(typeof data === "string" ? data : data.toString());
      if (!msg) return;
      msgs.push(msg);
      if (msg.type === stopType) { clearTimeout(timer); ws.off("message", handler); resolve(msgs); }
    };
    ws.on("message", handler);
  });
}

function autoReady(ws: WebSocket): void {
  ws.on("message", (data: Buffer | string) => {
    const msg = decodeS2C(typeof data === "string" ? data : data.toString());
    if (msg?.type === "PHASE_CHANGE" && (msg.phase === "PLANNING" || msg.phase === "RESOLUTION")) {
      setTimeout(() => sendRaw(ws, { type: "READY" }), 30);
    }
  });
}

interface Profile { accountId: string; name: string; mmr: number }
interface HistoryEntry {
  matchId: string; dataVersion: string; endedAt: number;
  seat: number; placement: number; mmrBefore: number | null; mmrAfter: number | null;
}

async function authGuest(port: number, deviceId: string, name: string): Promise<{ accountId: string; token: string; profile: Profile }> {
  const res = await fetch(`http://localhost:${port}/auth/guest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, name }),
  });
  expect(res.ok).toBe(true);
  return (await res.json()) as { accountId: string; token: string; profile: Profile };
}

async function getAuthed<T>(port: number, path: string, token: string): Promise<T> {
  const res = await fetch(`http://localhost:${port}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok).toBe(true);
  return (await res.json()) as T;
}

describe("persistence: accounts, match recording, MMR", () => {
  let proc: ChildProcess;
  let port: number;

  beforeAll(async () => {
    port = await getFreePort();
    proc = spawn(tsxEsm, [serverEntry], {
      // Force the in-memory repository regardless of the host environment
      env: { ...process.env, PORT: String(port), DATABASE_URL: "" },
      stdio: "pipe",
    });
    await waitForPort(port, 8000);
  }, 15_000);

  afterAll(() => { proc.kill(); });

  it("unauthenticated QUEUE_JOIN is rejected with typed ERROR", async () => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    await waitOpen(ws);
    const msgs = collectUntil(ws, "ERROR", 5_000);
    sendRaw(ws, { type: "QUEUE_JOIN" });
    const err = (await msgs).find((m) => m.type === "ERROR");
    ws.close();
    expect(err).toMatchObject({ type: "ERROR", code: "UNAUTHENTICATED" });
  }, 10_000);

  it("2 authed clients + bots: match persisted, MMR per formula, MATCH_END deltas match repo", async () => {
    const auth1 = await authGuest(port, "p-dev-1", "Player1");
    const auth2 = await authGuest(port, "p-dev-2", "Player2");
    const start = gameData.economy.mmrStart;
    expect(auth1.profile.mmr).toBe(start);
    expect(auth2.profile.mmr).toBe(start);

    const ws1 = new WebSocket(`ws://localhost:${port}`);
    const ws2 = new WebSocket(`ws://localhost:${port}`);
    await Promise.all([waitOpen(ws1), waitOpen(ws2)]);

    const done1 = collectUntil(ws1, "MATCH_END", 40_000);
    const done2 = collectUntil(ws2, "MATCH_END", 40_000);
    sendRaw(ws1, { type: "QUEUE_JOIN", authToken: auth1.token });
    sendRaw(ws2, { type: "QUEUE_JOIN", authToken: auth2.token });
    autoReady(ws1);
    autoReady(ws2);

    const [msgs1, msgs2] = await Promise.all([done1, done2]);
    ws1.close();
    ws2.close();

    const end1 = msgs1.find((m): m is S2C_MatchEnd => m.type === "MATCH_END");
    const end2 = msgs2.find((m): m is S2C_MatchEnd => m.type === "MATCH_END");
    expect(end1).toBeDefined();
    expect(end2).toBeDefined();
    expect(end1!.mmr).toBeDefined();
    expect(end1!.mmr).toEqual(end2!.mmr);
    // exactly the two human seats carry MMR changes
    expect(Object.keys(end1!.mmr!).map(Number).sort()).toEqual([0, 1]);

    for (const [auth, seat] of [[auth1, 0], [auth2, 1]] as const) {
      const change = end1!.mmr![seat]!;
      expect(change.before).toBe(start);

      // MATCH_END payload matches repo state
      const { profile } = await getAuthed<{ profile: Profile }>(port, "/profile", auth.token);
      expect(profile.mmr).toBe(change.after);

      const { history } = await getAuthed<{ history: HistoryEntry[] }>(port, "/history?limit=20", auth.token);
      expect(history).toHaveLength(1);
      const entry = history[0]!;
      expect(entry.seat).toBe(seat);
      expect(entry.mmrBefore).toBe(change.before);
      expect(entry.mmrAfter).toBe(change.after);
      expect(entry.placement).toBeGreaterThanOrEqual(1);
      expect(entry.placement).toBeLessThanOrEqual(8);

      // Elo formula: everyone starts at mmrStart, so expected = 0.5
      const k = gameData.economy.mmrK;
      const expectedDelta = Math.round(k * ((8 - entry.placement) / 7 - 0.5));
      expect(change.after - change.before).toBe(expectedDelta);

      // placements payload (elimination order, winner last) agrees with the
      // persisted standing: standing = 8 - index
      const idx = end1!.placements.indexOf(seat);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(entry.placement).toBe(8 - idx);
    }

    // both humans recorded in the same match
    const h1 = await getAuthed<{ history: HistoryEntry[] }>(port, "/history?limit=20", auth1.token);
    const h2 = await getAuthed<{ history: HistoryEntry[] }>(port, "/history?limit=20", auth2.token);
    expect(h1.history[0]!.matchId).toBe(h2.history[0]!.matchId);

    // replay of the same auth token on a fresh connection still works
    const ws3 = new WebSocket(`ws://localhost:${port}`);
    await waitOpen(ws3);
    const statusMsgs = collectUntil(ws3, "QUEUE_STATUS", 5_000);
    sendRaw(ws3, { type: "QUEUE_JOIN", authToken: auth1.token });
    const status = (await statusMsgs).find((m) => m.type === "QUEUE_STATUS");
    sendRaw(ws3, { type: "QUEUE_LEAVE" });
    ws3.close();
    expect(status).toBeDefined();
  }, 60_000);
});
