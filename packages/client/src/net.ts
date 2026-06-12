import { decodeS2C, encode, PROTOCOL_VERSION } from "@autobattler/protocol";
import type { S2CMessage, C2SMessage } from "@autobattler/protocol";

const RECONNECT_DELAYS = [500, 1000, 2000, 4000, 8000];
const PING_INTERVAL_MS = 5000;

export type NetEvent = S2CMessage | { type: "connected" } | { type: "disconnected" };

export class NetClient {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pingTs = 0;
  private _rttMs = 0;
  private listeners: Array<(e: NetEvent) => void> = [];
  private stopped = false;

  constructor(url: string, token?: string) {
    this.url = url;
    this.token = token ?? null;
    this.connect();
  }

  get rttMs(): number { return this._rttMs; }
  get seatToken(): string | null { return this.token; }

  on(listener: (e: NetEvent) => void): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter((l) => l !== listener); };
  }

  send(msg: C2SMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ v: PROTOCOL_VERSION, t: msg.type, p: msg }));
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close();
  }

  private connect(): void {
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.emit({ type: "connected" });
      this.startPing();

      // If we have a seat token, resume the match instead of re-queueing
      if (this.token) {
        this.send({ type: "RECONNECT", token: this.token });
      }
    };

    ws.onmessage = (ev: MessageEvent) => {
      const msg = decodeS2C(String(ev.data));
      if (!msg) return;

      if (msg.type === "PONG") {
        this._rttMs = Date.now() - msg.ts;
        return;
      }
      if (msg.type === "MATCH_FOUND") {
        this.token = msg.token;
      }
      this.emit(msg);
    };

    ws.onclose = () => {
      this.stopPing();
      this.emit({ type: "disconnected" });
      if (!this.stopped) this.scheduleReconnect();
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  private scheduleReconnect(): void {
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)]!;
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      this.pingTs = Date.now();
      this.send({ type: "PING", ts: this.pingTs });
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
  }

  private emit(e: NetEvent): void {
    for (const l of this.listeners) l(e);
  }
}
