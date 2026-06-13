import { describe, it, expect } from "vitest";
import { gameData } from "@autobattler/data";
import { TRAIT_GLYPH, glyphForTraits } from "../src/glyphs.js";

describe("glyph mapping", () => {
  it("every origin and class in traits.json has a glyph", () => {
    const missing = gameData.traits
      .filter((t) => !(t.id in TRAIT_GLYPH))
      .map((t) => t.id);
    expect(missing).toEqual([]);
  });

  it("prefers the unit's first class for the rendered glyph", () => {
    expect(glyphForTraits(["frost", "knight"], ["knight"])).toBe("shield");
    expect(glyphForTraits(["holy"], [])).toBe("sun"); // no class → origin
    expect(glyphForTraits([], [])).toBe("orb"); // safe default
  });
});
