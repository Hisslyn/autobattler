import type { C2SMessage, S2CMessage } from "./messages.js";

export const PROTOCOL_VERSION = 1;

export interface Envelope {
  v: number;  // protocol version
  t: string;  // message type
  p: unknown; // payload
}

export function encode(msg: S2CMessage): string {
  const env: Envelope = { v: PROTOCOL_VERSION, t: msg.type, p: msg };
  return JSON.stringify(env);
}

export function decodeEnvelope(raw: string): Envelope | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>)["v"] !== "number" ||
      typeof (parsed as Record<string, unknown>)["t"] !== "string" ||
      !("p" in (parsed as Record<string, unknown>))
    ) {
      return null;
    }
    return parsed as Envelope;
  } catch {
    return null;
  }
}

export function decodeC2S(raw: string): C2SMessage | null {
  const env = decodeEnvelope(raw);
  if (!env) return null;
  return validateC2S(env.p);
}

export function decodeS2C(raw: string): S2CMessage | null {
  const env = decodeEnvelope(raw);
  if (!env) return null;
  if (typeof env.p !== "object" || env.p === null) return null;
  const p = env.p as Record<string, unknown>;
  if (typeof p["type"] !== "string") return null;
  return p as unknown as S2CMessage;
}

export function validateC2S(p: unknown): C2SMessage | null {
  if (typeof p !== "object" || p === null) return null;
  const msg = p as Record<string, unknown>;
  if (typeof msg["type"] !== "string") return null;

  switch (msg["type"]) {
    case "QUEUE_JOIN":
      return { type: "QUEUE_JOIN" };

    case "QUEUE_LEAVE":
      return { type: "QUEUE_LEAVE" };

    case "READY":
      return { type: "READY" };

    case "PING": {
      if (typeof msg["ts"] !== "number") return null;
      return { type: "PING", ts: msg["ts"] as number };
    }

    case "RECONNECT": {
      if (typeof msg["token"] !== "string") return null;
      return { type: "RECONNECT", token: msg["token"] as string };
    }

    case "CMD": {
      if (typeof msg["cmd"] !== "object" || msg["cmd"] === null) return null;
      const cmd = msg["cmd"] as Record<string, unknown>;
      if (typeof cmd["type"] !== "string") return null;
      return { type: "CMD", cmd: cmd as { type: string; [key: string]: unknown } };
    }

    default:
      return null;
  }
}
