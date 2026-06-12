import { describe, it, expect } from "vitest";
import { encode, decodeC2S, decodeS2C, validateC2S, PROTOCOL_VERSION } from "../src/index.js";

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
