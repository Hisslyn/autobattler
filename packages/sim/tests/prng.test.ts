import { describe, it, expect } from "vitest";
import { mulberry32 } from "../src/prng.js";

describe("mulberry32", () => {
  it("known-answer: seed 42 first 5 values", () => {
    const rng = mulberry32(42);
    const out = [rng(), rng(), rng(), rng(), rng()];
    expect(out).toMatchSnapshot();
  });

  it("same seed produces identical sequence", () => {
    const a = mulberry32(1337);
    const b = mulberry32(1337);
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  it("different seeds diverge", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const valA = a();
    const valB = b();
    expect(valA).not.toBe(valB);
  });
});
