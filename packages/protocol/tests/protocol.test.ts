import { describe, it, expect } from "vitest";
import {
  encode,
  decodeC2S,
  decodeS2C,
  validateC2S,
  validateLootOrbs,
  validateNameMap,
  validateRoundResult,
  validateMatchStatsMap,
  isValidName,
  PROTOCOL_VERSION,
} from "../src/index.js";
import type { S2C_Loot, S2C_MatchEnd, S2C_RoundResult } from "../src/index.js";

describe("encode/decodeS2C round-trip", () => {
  it("PONG", () => {
    const msg = { type: "PONG" as const, ts: 123, serverTs: 456 };
    const decoded = decodeS2C(encode(msg));
    expect(decoded).toEqual(msg);
  });

  it("QUEUE_STATUS", () => {
    const msg = { type: "QUEUE_STATUS" as const, position: 2, size: 5 };
    expect(decodeS2C(encode(msg))).toEqual(msg);
  });

  it("MATCH_FOUND", () => {
    const msg = { type: "MATCH_FOUND" as const, roomId: "r1", token: "tok", seatIndex: 3 };
    expect(decodeS2C(encode(msg))).toEqual(msg);
  });

  it("MATCH_END", () => {
    const msg = { type: "MATCH_END" as const, placements: [2, 5, 1, 7, 0, 3, 4, 6] };
    expect(decodeS2C(encode(msg))).toEqual(msg);
  });

  it("MATCH_END with names", () => {
    const msg: S2C_MatchEnd = {
      type: "MATCH_END",
      placements: [0, 1],
      names: { 0: "Alice", 1: "Bot 2" },
    };
    expect(decodeS2C(encode(msg))).toEqual(msg);
  });

  it("LOOT", () => {
    const msg: S2C_Loot = {
      type: "LOOT",
      round: 1,
      orbs: [
        { rarity: "common", reward: { kind: "gold", amount: 3 } },
        { rarity: "rare", reward: { kind: "item", id: "iron_sword" } },
        { rarity: "uncommon", reward: { kind: "component", id: "chain_vest" } },
      ],
    };
    expect(decodeS2C(encode(msg))).toEqual(msg);
  });

  it("ROUND_RESULT (per-seat round outcome)", () => {
    for (const status of ["won", "lost", "bye", "pve"] as const) {
      const msg: S2C_RoundResult = {
        type: "ROUND_RESULT",
        round: 3,
        result: { status, damageTaken: status === "lost" ? 7 : 0, damageDealt: status === "won" ? 7 : 0 },
      };
      expect(decodeS2C(encode(msg))).toEqual(msg);
    }
  });

  it("MATCH_END with stats", () => {
    const msg: S2C_MatchEnd = {
      type: "MATCH_END",
      placements: [0, 1],
      stats: {
        0: { roundWins: 5, roundLosses: 2, totalDamageTaken: 30, totalDamageDealt: 80 },
        1: { roundWins: 2, roundLosses: 5, totalDamageTaken: 80, totalDamageDealt: 30 },
      },
    };
    expect(decodeS2C(encode(msg))).toEqual(msg);
  });
});

describe("S2C field validation (reject malformed)", () => {
  it("decodeS2C rejects LOOT with malformed orbs", () => {
    const bad = JSON.stringify({ v: PROTOCOL_VERSION, t: "LOOT", p: { type: "LOOT", round: 1, orbs: [{ rarity: "mythic", reward: { kind: "gold", amount: 1 } }] } });
    expect(decodeS2C(bad)).toBeNull();
    const notArray = JSON.stringify({ v: PROTOCOL_VERSION, t: "LOOT", p: { type: "LOOT", round: 1, orbs: "nope" } });
    expect(decodeS2C(notArray)).toBeNull();
  });

  it("decodeS2C rejects MATCH_END with malformed names", () => {
    const bad = JSON.stringify({ v: PROTOCOL_VERSION, t: "MATCH_END", p: { type: "MATCH_END", placements: [0], names: { 0: 42 } } });
    expect(decodeS2C(bad)).toBeNull();
  });

  it("decodeS2C rejects MATCH_END with malformed stats", () => {
    const bad = JSON.stringify({ v: PROTOCOL_VERSION, t: "MATCH_END", p: { type: "MATCH_END", placements: [0], stats: { 0: { roundWins: 1 } } } });
    expect(decodeS2C(bad)).toBeNull();
  });

  it("decodeS2C rejects ROUND_RESULT with a bad status or missing damage", () => {
    const badStatus = JSON.stringify({ v: PROTOCOL_VERSION, t: "ROUND_RESULT", p: { type: "ROUND_RESULT", round: 1, result: { status: "tied", damageTaken: 0, damageDealt: 0 } } });
    expect(decodeS2C(badStatus)).toBeNull();
    const missingDmg = JSON.stringify({ v: PROTOCOL_VERSION, t: "ROUND_RESULT", p: { type: "ROUND_RESULT", round: 1, result: { status: "won", damageDealt: 0 } } });
    expect(decodeS2C(missingDmg)).toBeNull();
  });

  it("validateRoundResult accepts well-formed, rejects malformed", () => {
    expect(validateRoundResult({ status: "won", damageTaken: 0, damageDealt: 5 })).not.toBeNull();
    expect(validateRoundResult({ status: "pve", damageTaken: 0, damageDealt: 0 })).not.toBeNull();
    expect(validateRoundResult({ status: "bogus", damageTaken: 0, damageDealt: 0 })).toBeNull();
    expect(validateRoundResult({ status: "won", damageDealt: 0 })).toBeNull();
    expect(validateRoundResult("x")).toBeNull();
    expect(validateRoundResult(null)).toBeNull();
  });

  it("validateMatchStatsMap accepts well-formed, rejects malformed", () => {
    expect(validateMatchStatsMap({ 0: { roundWins: 1, roundLosses: 2, totalDamageTaken: 3, totalDamageDealt: 4 } })).not.toBeNull();
    expect(validateMatchStatsMap({})).not.toBeNull();
    expect(validateMatchStatsMap({ 0: { roundWins: 1 } })).toBeNull();
    expect(validateMatchStatsMap({ 0: { roundWins: "x", roundLosses: 2, totalDamageTaken: 3, totalDamageDealt: 4 } })).toBeNull();
    expect(validateMatchStatsMap("x")).toBeNull();
    expect(validateMatchStatsMap(null)).toBeNull();
  });

  it("validateLootOrbs accepts well-formed, rejects malformed", () => {
    expect(validateLootOrbs([{ rarity: "common", reward: { kind: "gold", amount: 5 } }])).not.toBeNull();
    expect(validateLootOrbs([{ rarity: "legendary", reward: { kind: "item", id: "x" } }])).not.toBeNull();
    expect(validateLootOrbs("x")).toBeNull();
    expect(validateLootOrbs([{ rarity: "bogus", reward: { kind: "gold", amount: 1 } }])).toBeNull();
    expect(validateLootOrbs([{ rarity: "common", reward: { kind: "gold" } }])).toBeNull();
    expect(validateLootOrbs([{ rarity: "common", reward: { kind: "item" } }])).toBeNull();
    expect(validateLootOrbs([{ rarity: "common" }])).toBeNull();
  });

  it("validateNameMap / isValidName", () => {
    expect(validateNameMap({ 0: "A", 1: "Bot 2" })).not.toBeNull();
    expect(validateNameMap({ 0: 1 })).toBeNull();
    expect(validateNameMap("x")).toBeNull();
    expect(isValidName("Alice")).toBe(true);
    expect(isValidName("")).toBe(false);
    expect(isValidName("x".repeat(33))).toBe(false);
    expect(isValidName(5)).toBe(false);
  });
});

describe("validateC2S", () => {
  it("QUEUE_JOIN", () => {
    expect(validateC2S({ type: "QUEUE_JOIN" })).toEqual({ type: "QUEUE_JOIN" });
  });

  it("QUEUE_LEAVE", () => {
    expect(validateC2S({ type: "QUEUE_LEAVE" })).toEqual({ type: "QUEUE_LEAVE" });
  });

  it("READY", () => {
    expect(validateC2S({ type: "READY" })).toEqual({ type: "READY" });
  });

  it("PING", () => {
    expect(validateC2S({ type: "PING", ts: 999 })).toEqual({ type: "PING", ts: 999 });
  });

  it("PING missing ts", () => {
    expect(validateC2S({ type: "PING" })).toBeNull();
  });

  it("CMD BUY", () => {
    const result = validateC2S({ type: "CMD", cmd: { type: "BUY", shopSlotIndex: 2 } });
    expect(result).toEqual({ type: "CMD", cmd: { type: "BUY", shopSlotIndex: 2 } });
  });

  it("CMD missing cmd.type", () => {
    expect(validateC2S({ type: "CMD", cmd: { foo: 1 } })).toBeNull();
  });

  it("CMD missing cmd", () => {
    expect(validateC2S({ type: "CMD" })).toBeNull();
  });

  it("unknown type", () => {
    expect(validateC2S({ type: "HACK" })).toBeNull();
  });

  it("not an object", () => {
    expect(validateC2S("hello")).toBeNull();
    expect(validateC2S(null)).toBeNull();
    expect(validateC2S(42)).toBeNull();
  });
});

describe("decodeC2S envelope", () => {
  it("valid QUEUE_JOIN envelope", () => {
    const raw = JSON.stringify({ v: PROTOCOL_VERSION, t: "QUEUE_JOIN", p: { type: "QUEUE_JOIN" } });
    expect(decodeC2S(raw)).toEqual({ type: "QUEUE_JOIN" });
  });

  it("missing v field", () => {
    const raw = JSON.stringify({ t: "QUEUE_JOIN", p: { type: "QUEUE_JOIN" } });
    expect(decodeC2S(raw)).toBeNull();
  });

  it("malformed JSON", () => {
    expect(decodeC2S("not json")).toBeNull();
  });

  it("unknown message type in payload", () => {
    const raw = JSON.stringify({ v: 1, t: "X", p: { type: "X" } });
    expect(decodeC2S(raw)).toBeNull();
  });
});
