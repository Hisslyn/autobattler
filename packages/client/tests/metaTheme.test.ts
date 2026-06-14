import { describe, it, expect } from "vitest";
import { RANK_BANDS } from "@autobattler/data";
import { C, RANK_COLOR, rankColor, tierColor } from "../src/theme.js";

const definedColors = new Set<number>(Object.values(C));

describe("DOM meta screens reuse theme.ts as the single color source", () => {
  it("every tier color the DOM uses resolves to a defined theme value", () => {
    for (let tier = 1; tier <= 5; tier++) {
      expect(definedColors.has(tierColor(tier))).toBe(true);
    }
  });

  it("every rank band maps to a defined theme color", () => {
    for (const band of RANK_BANDS) {
      // mapped (not the muted fallback) and a real entry in the palette
      expect(RANK_COLOR[band.id]).toBeDefined();
      expect(definedColors.has(rankColor(band.id))).toBe(true);
    }
  });
});
