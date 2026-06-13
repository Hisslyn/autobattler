import { describe, it, expect } from "vitest";
import { unitArtPath, resolveUnitTexture } from "../src/sprites.js";

describe("unit art resolver", () => {
  it("builds the public/units drop-in path", () => {
    expect(unitArtPath("warrior")).toBe("/units/warrior.png");
    expect(unitArtPath("mage", "/assets/units")).toBe("/assets/units/mage.png");
  });

  it("returns the texture when the lookup has the file (exists branch)", () => {
    const TEX = { id: "tex" };
    const lookup = (p: string): typeof TEX | null =>
      p === "/units/warrior.png" ? TEX : null;
    expect(resolveUnitTexture("warrior", lookup)).toBe(TEX);
  });

  it("falls back to null when the file is absent (glyph branch)", () => {
    expect(resolveUnitTexture("warrior", () => null)).toBeNull();
    // base override is honored in the lookup key
    const lookup = (p: string): string | null =>
      p === "/art/warrior.png" ? "hit" : null;
    expect(resolveUnitTexture("warrior", lookup, "/art")).toBe("hit");
    expect(resolveUnitTexture("warrior", lookup)).toBeNull();
  });
});
