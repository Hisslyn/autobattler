import { describe, it, expect } from "vitest";
import { mmrToRank, RANK_BANDS } from "../src/loader.js";

describe("mmrToRank known-answer band boundaries", () => {
  const cases: Array<[number, string]> = [
    [0, "bronze"],
    [500, "bronze"],
    [999, "bronze"],
    [1000, "silver"], // boundary inclusive on minMmr
    [1199, "silver"],
    [1200, "gold"],
    [1399, "gold"],
    [1400, "platinum"],
    [1599, "platinum"],
    [1600, "diamond"],
    [1799, "diamond"],
    [1800, "master"],
    [99999, "master"],
  ];
  for (const [mmr, id] of cases) {
    it(`mmr ${mmr} -> ${id}`, () => {
      expect(mmrToRank(mmr).id).toBe(id);
    });
  }

  it("clamps below the lowest band to the lowest band", () => {
    expect(mmrToRank(-500).id).toBe(RANK_BANDS[0]!.id);
  });

  it("bands are sorted by ascending minMmr", () => {
    for (let i = 1; i < RANK_BANDS.length; i++) {
      expect(RANK_BANDS[i]!.minMmr).toBeGreaterThan(RANK_BANDS[i - 1]!.minMmr);
    }
  });
});
