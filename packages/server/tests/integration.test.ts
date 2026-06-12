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
    const ws1 = new WebSocket(`ws://localhost:${port}`);
    const ws2 = new WebSocket(`ws://localhost:${port}`);
    await Promise.all([waitOpen(ws1), waitOpen(ws2)]);

    const done1 = collectUntil(ws1, "MATCH_END", 40_000);
    const done2 = collectUntil(ws2, "MATCH_END", 40_000);

    sendRaw(ws1, { type: "QUEUE_JOIN" });
    sendRaw(ws2, { type: "QUEUE_JOIN" });

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
    sendRaw(ws1, { type: "QUEUE_JOIN" });
    sendRaw(ws2, { type: "QUEUE_JOIN" });
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
