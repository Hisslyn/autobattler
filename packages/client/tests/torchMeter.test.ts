import { describe, it, expect } from "vitest";
import { TORCHES_PER_SIDE, TORCH_GOLD_PER, litCount, torchLit } from "../src/torchMeter.js";

describe("torch gold meter", () => {
  it("lit count is floor(gold/10) capped at 5", () => {
    expect(litCount(0)).toBe(0);
    expect(litCount(9)).toBe(0);
    expect(litCount(10)).toBe(1);
    expect(litCount(29)).toBe(2);
    expect(litCount(49)).toBe(4);
    expect(litCount(50)).toBe(5);
    expect(litCount(120)).toBe(5); // capped
    expect(TORCH_GOLD_PER).toBe(10);
    expect(TORCHES_PER_SIDE).toBe(5);
  });

  it("tolerates negative / non-finite gold (reads empty)", () => {
    expect(litCount(-5)).toBe(0);
    expect(litCount(NaN)).toBe(0);
  });

  it("LEFT fills front→back: index 0 = back, last = front", () => {
    // 2 lit → the two FRONT pillars (highest indices) light.
    expect(torchLit(20, "left")).toEqual([false, false, false, true, true]);
    expect(torchLit(0, "left")).toEqual([false, false, false, false, false]);
    expect(torchLit(50, "left")).toEqual([true, true, true, true, true]);
  });

  it("RIGHT fills back→front: index 0 = back, last = front", () => {
    // 2 lit → the two BACK pillars (lowest indices) light.
    expect(torchLit(20, "right")).toEqual([true, true, false, false, false]);
    expect(torchLit(0, "right")).toEqual([false, false, false, false, false]);
    expect(torchLit(50, "right")).toEqual([true, true, true, true, true]);
  });

  it("each side always reports exactly TORCHES_PER_SIDE flags", () => {
    for (const g of [0, 7, 33, 99]) {
      expect(torchLit(g, "left").length).toBe(TORCHES_PER_SIDE);
      expect(torchLit(g, "right").length).toBe(TORCHES_PER_SIDE);
    }
  });
});
