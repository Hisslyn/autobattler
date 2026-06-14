import { describe, it, expect } from "vitest";
import { gameData } from "@autobattler/data";
import { recipeResult } from "@autobattler/data";
import { combinePreview, equipPreview } from "../src/combinePreview.js";

// Pick a real recipe pair from the data so the test tracks content.
const recipe = gameData.items.find((i) => i.recipe)!;
const [a, b] = recipe.recipe!;

describe("combinePreview", () => {
  it("previews the completed item for a valid component pair", () => {
    const p = combinePreview(a, 0, b, 1, gameData);
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.result.id).toBe(recipe.id);
  });

  it("is order-independent (matches recipeResult)", () => {
    const p = combinePreview(b, 0, a, 1, gameData);
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.result.id).toBe(recipeResult(a, b, gameData.items));
  });

  it("reports no-recipe for a pair with no recipe", () => {
    // Two copies of the same single component never form a recipe in this data.
    const p = combinePreview(a, 0, a, 1, gameData);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.reason).toBe("no-recipe");
  });

  it("never combines an entry with itself (same index)", () => {
    const p = combinePreview(a, 2, b, 2, gameData);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.reason).toBe("same-entry");
  });
});

describe("equipPreview", () => {
  it("plain add when the unit holds nothing that completes a recipe", () => {
    const p = equipPreview(a, [], gameData)!;
    expect(p.kind).toBe("add");
    expect(p.result.id).toBe(a);
  });

  it("auto-combine in place when a held component completes a recipe", () => {
    const p = equipPreview(a, ["__filler__", b], gameData)!;
    expect(p.kind).toBe("combine");
    if (p.kind === "combine") {
      expect(p.slot).toBe(1);
      expect(p.result.id).toBe(recipe.id);
    }
  });

  it("returns null for an unknown incoming item id", () => {
    expect(equipPreview("__nope__", [], gameData)).toBeNull();
  });
});
