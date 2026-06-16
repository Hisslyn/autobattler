import { describe, it, expect } from "vitest";
import { gameData, itemKind } from "@autobattler/data";
import { recipeResult } from "@autobattler/data";
import {
  itemIcon,
  itemArtPath,
  resolveItemTexture,
  COMPONENT_EMBLEM,
} from "../src/itemIcon.js";

const components = gameData.items.filter((i) => i.component);
const completed = gameData.items.filter((i) => i.recipe);

describe("component emblems", () => {
  it("there are the expected counts (9 components, 36 completed)", () => {
    expect(components).toHaveLength(9);
    expect(completed).toHaveLength(36);
  });

  it("every base component maps to a distinct base emblem (no generic fallback)", () => {
    for (const c of components) {
      const icon = itemIcon(c.id, gameData);
      expect(icon, `component ${c.id} must resolve to an icon`).not.toBeNull();
      expect(icon!.kind).toBe("component");
      expect(COMPONENT_EMBLEM[c.id], `component ${c.id} must have an emblem`).toBeTruthy();
    }
    // Every component emblem is distinct (one archetype per component).
    const emblems = components.map((c) => COMPONENT_EMBLEM[c.id]);
    expect(new Set(emblems).size).toBe(components.length);
  });

  it("only maps real component ids (no stale entries)", () => {
    const ids = new Set(components.map((c) => c.id));
    for (const id of Object.keys(COMPONENT_EMBLEM)) {
      expect(ids.has(id), `emblem map has unknown component ${id}`).toBe(true);
    }
  });
});

describe("completed-item icons", () => {
  it("every completed item resolves to its two components AND a derived icon", () => {
    for (const c of completed) {
      const icon = itemIcon(c.id, gameData);
      expect(icon, `completed ${c.id} must resolve`).not.toBeNull();
      if (!icon || icon.kind !== "completed") {
        throw new Error(`completed ${c.id} did not resolve to a completed icon`);
      }
      // The two source components match the recipe (order preserved).
      expect(icon.components).toEqual(c.recipe);
      // recipeResult agrees this pair builds this item (no game logic dup'd).
      expect(recipeResult(icon.components[0], icon.components[1])).toBe(c.id);
      // The derived icon is the two components' emblems (never a generic glyph).
      expect(icon.emblems).toEqual([
        COMPONENT_EMBLEM[c.recipe![0]],
        COMPONENT_EMBLEM[c.recipe![1]],
      ]);
      expect(icon.emblems[0]).toBeTruthy();
      expect(icon.emblems[1]).toBeTruthy();
    }
  });

  it("no real item falls back to the generic glyph (every component/completed resolves)", () => {
    // Consumables, artifacts, and mythicals have no procedural emblem yet (client
    // icon work is out of scope for the item-system data/rules phase); every
    // component/completed resolves.
    const SKIP_KINDS = new Set(["consumable", "artifact", "mythical"]);
    for (const item of gameData.items) {
      if (SKIP_KINDS.has(itemKind(item))) continue;
      expect(itemIcon(item.id, gameData), `item ${item.id} resolves`).not.toBeNull();
    }
  });

  it("returns null for an unknown id (renderer's generic fallback)", () => {
    expect(itemIcon("__nope__", gameData)).toBeNull();
  });
});

describe("item art resolver", () => {
  it("builds the public/items drop-in path", () => {
    expect(itemArtPath("iron_sword")).toBe("/items/iron_sword.png");
    expect(itemArtPath("iron_sword__sorcerer_rod")).toBe(
      "/items/iron_sword__sorcerer_rod.png"
    );
    expect(itemArtPath("iron_sword", "/assets/items")).toBe(
      "/assets/items/iron_sword.png"
    );
  });

  it("returns the texture when the lookup has the file (exists branch)", () => {
    const TEX = { id: "tex" };
    const lookup = (p: string): typeof TEX | null =>
      p === "/items/iron_sword.png" ? TEX : null;
    expect(resolveItemTexture("iron_sword", lookup)).toBe(TEX);
  });

  it("falls back to null when the file is absent (procedural branch)", () => {
    expect(resolveItemTexture("iron_sword", () => null)).toBeNull();
    // base override is honored in the lookup key
    const lookup = (p: string): string | null =>
      p === "/art/iron_sword.png" ? "hit" : null;
    expect(resolveItemTexture("iron_sword", lookup, "/art")).toBe("hit");
    expect(resolveItemTexture("iron_sword", lookup)).toBeNull();
  });
});
