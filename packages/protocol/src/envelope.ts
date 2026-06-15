import type { C2SMessage, S2CMessage, LootOrbWire } from "./messages.js";
import { LOOT_RARITIES } from "./messages.js";

export const PROTOCOL_VERSION = 1;

const NAME_MAX_LEN = 32;

/** A display name carried over the wire: non-empty string within the length cap. */
export function isValidName(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= NAME_MAX_LEN;
}

/** A seat→name map (humans + bots), all entries valid names. */
export function validateNameMap(value: unknown): Record<number, string> | null {
  if (typeof value !== "object" || value === null) return null;
  for (const v of Object.values(value as Record<string, unknown>)) {
    if (!isValidName(v)) return null;
  }
  return value as Record<number, string>;
}

/** Validates a per-seat loot payload's orbs (rarity + reward shape). */
export function validateLootOrbs(value: unknown): LootOrbWire[] | null {
  if (!Array.isArray(value)) return null;
  for (const orb of value) {
    if (typeof orb !== "object" || orb === null) return null;
    const o = orb as Record<string, unknown>;
    if (!LOOT_RARITIES.includes(o["rarity"] as never)) return null;
    const r = o["reward"];
    if (typeof r !== "object" || r === null) return null;
    const reward = r as Record<string, unknown>;
    if (reward["kind"] === "gold") {
      if (typeof reward["amount"] !== "number") return null;
    } else if (reward["kind"] === "component" || reward["kind"] === "item") {
      if (typeof reward["id"] !== "string") return null;
    } else {
      return null;
    }
  }
  return value as LootOrbWire[];
}

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
  // Field-level validation for the payloads carrying loot / names.
  if (p["type"] === "LOOT" && validateLootOrbs(p["orbs"]) === null) return null;
  if (p["type"] === "MATCH_END" && p["names"] !== undefined && validateNameMap(p["names"]) === null) return null;
  return p as unknown as S2CMessage;
}

export function validateC2S(p: unknown): C2SMessage | null {
  if (typeof p !== "object" || p === null) return null;
  const msg = p as Record<string, unknown>;
  if (typeof msg["type"] !== "string") return null;

  switch (msg["type"]) {
    case "QUEUE_JOIN":
      return typeof msg["authToken"] === "string"
        ? { type: "QUEUE_JOIN", authToken: msg["authToken"] as string }
        : { type: "QUEUE_JOIN" };

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
