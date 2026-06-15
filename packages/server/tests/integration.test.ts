import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { WebSocket } from "ws";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, Socket } from "node:net";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { decodeS2C, PROTOCOL_VERSION } from "@autobattler/protocol";
import type { S2CMessage } from "@autobattler/protocol";

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

function launchServer(port: number): ChildProcess {
  return spawn(tsxEsm, [serverEntry], {
    env: { ...process.env, PORT: String(port) },
    stdio: "pipe",
  });
}

function sendRaw(ws: WebSocket, msg: { type: string; [key: string]: unknown }): void {
  ws.send(JSON.stringify({ v: PROTOCOL_VERSION, t: msg.type, p: msg }));
}

async function authGuest(port: number, deviceId: string, name?: string): Promise<{ accountId: string; token: string }> {
  const res = await fetch(`http://localhost:${port}/auth/guest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, ...(name ? { name } : {}) }),
  });
  if (!res.ok) throw new Error(`auth/guest failed: ${res.status}`);
  return (await res.json()) as { accountId: string; token: string };
}

function waitOpen(ws: WebSocket): Promise<void> {
  return new Promise((r, e) => { ws.on("open", r); ws.on("error", e); });
}

function waitClose(ws: WebSocket): Promise<void> {
  return new Promise((r) => ws.on("close", r));
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

describe("integration: 2 humans + 6 bots full match", () => {
  let proc: ChildProcess;
  let port: number;

  beforeAll(async () => {
    port = await getFreePort();
    proc = launchServer(port);
    await waitForPort(port, 8000);
  }, 15_000);

  afterAll(() => { proc.kill(); });

  it("both clients receive MATCH_END with consistent placements", async () => {
    const [auth1, auth2] = await Promise.all([
      authGuest(port, "it-dev-1"),
      authGuest(port, "it-dev-2"),
    ]);
    const ws1 = new WebSocket(`ws://localhost:${port}`);
    const ws2 = new WebSocket(`ws://localhost:${port}`);
    await Promise.all([waitOpen(ws1), waitOpen(ws2)]);

    const done1 = collectUntil(ws1, "MATCH_END", 40_000);
    const done2 = collectUntil(ws2, "MATCH_END", 40_000);

    sendRaw(ws1, { type: "QUEUE_JOIN", authToken: auth1.token });
    sendRaw(ws2, { type: "QUEUE_JOIN", authToken: auth2.token });

    function autoReady(ws: WebSocket): void {
      ws.on("message", (data: Buffer | string) => {
        const msg = decodeS2C(typeof data === "string" ? data : data.toString());
        // READY skips both the planning wait and the resolution pause
        if (msg?.type === "PHASE_CHANGE" && (msg.phase === "PLANNING" || msg.phase === "RESOLUTION")) {
          setTimeout(() => sendRaw(ws, { type: "READY" }), 30);
        }
      });
    }
    autoReady(ws1);
    autoReady(ws2);

    const [msgs1, msgs2] = await Promise.all([done1, done2]);

    ws1.close();
    ws2.close();

    const end1 = msgs1.find((m) => m.type === "MATCH_END") as { type: "MATCH_END"; placements: number[] } | undefined;
    const end2 = msgs2.find((m) => m.type === "MATCH_END") as { type: "MATCH_END"; placements: number[] } | undefined;

    expect(end1, "client 1 did not receive MATCH_END").toBeDefined();
    expect(end2, "client 2 did not receive MATCH_END").toBeDefined();
    expect(end1!.placements).toHaveLength(8);
    expect(end1!.placements).toEqual(end2!.placements);
  }, 60_000);
});

describe("integration: PvE loot + player names", () => {
  let proc: ChildProcess;
  let port: number;

  beforeAll(async () => {
    port = await getFreePort();
    proc = launchServer(port);
    await waitForPort(port, 8000);
  }, 15_000);

  afterAll(() => { proc.kill(); });

  it("each human gets its own PvE loot; names in snapshots + MATCH_END; bots named", async () => {
    const [auth1, auth2] = await Promise.all([
      authGuest(port, "loot-dev-1", "Alice"),
      authGuest(port, "loot-dev-2", "Bob"),
    ]);
    const ws1 = new WebSocket(`ws://localhost:${port}`);
    const ws2 = new WebSocket(`ws://localhost:${port}`);
    await Promise.all([waitOpen(ws1), waitOpen(ws2)]);

    const done1 = collectUntil(ws1, "MATCH_END", 50_000);
    const done2 = collectUntil(ws2, "MATCH_END", 50_000);

    function autoReady(ws: WebSocket): void {
      ws.on("message", (data: Buffer | string) => {
        const msg = decodeS2C(typeof data === "string" ? data : data.toString());
        if (msg?.type === "PHASE_CHANGE" && (msg.phase === "PLANNING" || msg.phase === "RESOLUTION")) {
          setTimeout(() => sendRaw(ws, { type: "READY" }), 30);
        }
      });
    }
    autoReady(ws1);
    autoReady(ws2);

    sendRaw(ws1, { type: "QUEUE_JOIN", authToken: auth1.token });
    sendRaw(ws2, { type: "QUEUE_JOIN", authToken: auth2.token });

    const [msgs1, msgs2] = await Promise.all([done1, done2]);
    ws1.close();
    ws2.close();

    type Found = { type: "MATCH_FOUND"; seatIndex: number };
    type Snap = { type: "STATE_SNAPSHOT"; state: { players: { id: number; name: string }[] } };
    type Loot = { type: "LOOT"; round: number; orbs: { rarity: string; reward: { kind: string } }[] };
    type Round = { type: "ROUND_RESULT"; round: number; result: { status: string; damageTaken: number; damageDealt: number } };
    type Stats = { roundWins: number; roundLosses: number; totalDamageTaken: number; totalDamageDealt: number };
    type End = { type: "MATCH_END"; placements: number[]; names?: Record<number, string>; stats?: Record<number, Stats> };

    const seat1 = (msgs1.find((m) => m.type === "MATCH_FOUND") as Found).seatIndex;
    const seat2 = (msgs2.find((m) => m.type === "MATCH_FOUND") as Found).seatIndex;
    const snap1 = msgs1.find((m) => m.type === "STATE_SNAPSHOT") as Snap;
    const snap2 = msgs2.find((m) => m.type === "STATE_SNAPSHOT") as Snap;
    const loot1 = msgs1.filter((m) => m.type === "LOOT") as Loot[];
    const loot2 = msgs2.filter((m) => m.type === "LOOT") as Loot[];
    const rr1 = msgs1.filter((m) => m.type === "ROUND_RESULT") as Round[];
    const rr2 = msgs2.filter((m) => m.type === "ROUND_RESULT") as Round[];
    const end1 = msgs1.find((m) => m.type === "MATCH_END") as End;
    const end2 = msgs2.find((m) => m.type === "MATCH_END") as End;

    // Names: every seat in the snapshot has a name; own seat is the profile name,
    // the other human appears, and bot seats carry generated "Bot N" names.
    expect(snap1.state.players).toHaveLength(8);
    expect(snap1.state.players.every((p) => typeof p.name === "string" && p.name.length > 0)).toBe(true);
    expect(snap1.state.players[seat1]!.name).toBe("Alice");
    expect(snap2.state.players[seat2]!.name).toBe("Bob");
    expect(snap1.state.players[seat2]!.name).toBe("Bob"); // other human visible publicly
    const botSeats = snap1.state.players.filter((_, i) => i !== seat1 && i !== seat2);
    expect(botSeats.every((p) => p.name.startsWith("Bot "))).toBe(true);

    // Round 1 is PvE (drops 2 common orbs). Each human gets EXACTLY its own one
    // private LOOT message for the round — never the other's (no broadcast leak).
    const r1a = loot1.filter((m) => m.round === 1);
    const r1b = loot2.filter((m) => m.round === 1);
    expect(r1a).toHaveLength(1);
    expect(r1b).toHaveLength(1);
    expect(r1a[0]!.orbs).toHaveLength(2);
    expect(r1a[0]!.orbs.every((o) => o.rarity === "common")).toBe(true);
    expect(r1b[0]!.orbs).toHaveLength(2);
    expect(r1a[0]!.orbs.every((o) => ["gold", "component", "item"].includes(o.reward.kind))).toBe(true);

    // Each human gets its own private ROUND_RESULT every round (like loot).
    // Round 1 is PvE → status "pve" with 0/0 damage; combat rounds are won|lost|bye.
    expect(rr1.length).toBeGreaterThan(0);
    expect(rr2.length).toBeGreaterThan(0);
    const r1res1 = rr1.find((m) => m.round === 1);
    expect(r1res1, "client 1 received a round-1 result").toBeDefined();
    expect(r1res1!.result.status).toBe("pve");
    expect(r1res1!.result.damageTaken).toBe(0);
    expect(r1res1!.result.damageDealt).toBe(0);
    for (const m of [...rr1, ...rr2]) {
      expect(["won", "lost", "bye", "pve"]).toContain(m.result.status);
      // A loss is the only outcome with HP damage; a win is the only one dealing it.
      if (m.result.status !== "lost") expect(m.result.damageTaken).toBe(0);
      if (m.result.status !== "won") expect(m.result.damageDealt).toBe(0);
    }

    // MATCH_END carries public names (humans + bots).
    expect(end1.names).toBeDefined();
    expect(end2.names).toBeDefined();
    expect(end1.names![seat1]).toBe("Alice");
    expect(end1.names![seat2]).toBe("Bob");
    expect(Object.values(end1.names!).filter((n) => n.startsWith("Bot "))).toHaveLength(6);

    // MATCH_END carries per-seat accumulated match stats for all 8 seats.
    expect(end1.stats).toBeDefined();
    expect(end2.stats).toBeDefined();
    expect(Object.keys(end1.stats!)).toHaveLength(8);
    for (const s of Object.values(end1.stats!)) {
      expect(typeof s.roundWins).toBe("number");
      expect(typeof s.roundLosses).toBe("number");
      expect(typeof s.totalDamageTaken).toBe("number");
      expect(typeof s.totalDamageDealt).toBe("number");
      expect(s.roundWins).toBeGreaterThanOrEqual(0);
      expect(s.roundLosses).toBeGreaterThanOrEqual(0);
    }
  }, 70_000);
});

describe("reconnect: token restores seat mid-match", () => {
  let proc: ChildProcess;
  let port: number;

  beforeAll(async () => {
    port = await getFreePort();
    proc = launchServer(port);
    await waitForPort(port, 8000);
  }, 15_000);

  afterAll(() => { proc.kill(); });

  it("client drops, reconnects with RECONNECT {token}, receives snapshot with its seat", async () => {
    const [auth1, auth2] = await Promise.all([
      authGuest(port, "rc-dev-1"),
      authGuest(port, "rc-dev-2"),
    ]);
    const ws1 = new WebSocket(`ws://localhost:${port}`);
    const ws2 = new WebSocket(`ws://localhost:${port}`);
    await Promise.all([waitOpen(ws1), waitOpen(ws2)]);

    // ws2 keeps the match alive by auto-readying
    ws2.on("message", (data: Buffer | string) => {
      const msg = decodeS2C(typeof data === "string" ? data : data.toString());
      if (msg?.type === "PHASE_CHANGE" && (msg.phase === "PLANNING" || msg.phase === "RESOLUTION")) {
        setTimeout(() => sendRaw(ws2, { type: "READY" }), 30);
      }
    });

    const found1 = collectUntil(ws1, "MATCH_FOUND", 15_000);
    sendRaw(ws1, { type: "QUEUE_JOIN", authToken: auth1.token });
    sendRaw(ws2, { type: "QUEUE_JOIN", authToken: auth2.token });
    const msgs1 = await found1;
    const found = msgs1.find((m) => m.type === "MATCH_FOUND") as
      | { type: "MATCH_FOUND"; token: string; seatIndex: number }
      | undefined;
    expect(found, "client 1 did not receive MATCH_FOUND").toBeDefined();
    const { token, seatIndex } = found!;

    // Play one round, then drop the socket
    const roundDone = collectUntil(ws1, "PHASE_CHANGE", 10_000);
    sendRaw(ws1, { type: "READY" });
    await roundDone;
    const closed = waitClose(ws1);
    ws1.close();
    await closed;

    // Fresh connection + RECONNECT with the original token
    const ws1b = new WebSocket(`ws://localhost:${port}`);
    await waitOpen(ws1b);
    const snapPromise = collectUntil(ws1b, "STATE_SNAPSHOT", 10_000);
    sendRaw(ws1b, { type: "RECONNECT", token });
    const msgs = await snapPromise;
    ws1b.close();
    ws2.close();

    const snap = msgs.find((m) => m.type === "STATE_SNAPSHOT") as
      | { type: "STATE_SNAPSHOT"; state: { me: { id: number } } }
      | undefined;
    expect(snap, "reconnected client did not receive STATE_SNAPSHOT").toBeDefined();
    expect(snap!.state.me.id).toBe(seatIndex);
  }, 40_000);
});

describe("rate limit: flood disconnects client", () => {
  let proc: ChildProcess;
  let port: number;

  beforeAll(async () => {
    port = await getFreePort();
    proc = launchServer(port);
    await waitForPort(port, 8000);
  }, 15_000);

  afterAll(() => { proc.kill(); });

  it("disconnects after >20 CMD/s and sends RATE_LIMITED error", async () => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    await waitOpen(ws);

    sendRaw(ws, { type: "QUEUE_JOIN" });
    await new Promise((r) => setTimeout(r, 200));

    const msgs: S2CMessage[] = [];
    ws.on("message", (data: Buffer | string) => {
      const msg = decodeS2C(typeof data === "string" ? data : data.toString());
      if (msg) msgs.push(msg);
    });

    const closedPromise = waitClose(ws);

    for (let i = 0; i < 25; i++) {
      sendRaw(ws, { type: "CMD", cmd: { type: "REROLL" } });
    }

    await closedPromise;

    const rateLimitError = msgs.find(
      (m) => m.type === "ERROR" && m.code === "RATE_LIMITED"
    );
    expect(rateLimitError).toBeDefined();
  }, 10_000);
});
