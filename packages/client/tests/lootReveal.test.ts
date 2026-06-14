import { describe, it, expect } from "vitest";
import { gameData } from "@autobattler/data";
import type { LootOrb } from "@autobattler/rules/src/loot.js";
import { lootRevealModel } from "../src/lootReveal.js";

const component = gameData.items.find((i) => i.component)!;
const completed = gameData.items.find((i) => i.recipe)!;

const orbs: LootOrb[] = [
  { rarity: "legendary", reward: { kind: "item", id: completed.id } },
  { rarity: "common", reward: { kind: "gold", amount: 2 } },
  { rarity: "rare", reward: { kind: "component", id: component.id } },
  { rarity: "common", reward: { kind: "gold", amount: 3 } },
];

describe("lootRevealModel", () => {
  it("is empty for no orbs", () => {
    const m = lootRevealModel([], gameData);
    expect(m.empty).toBe(true);
    expect(m.steps).toHaveLength(0);
  });

  it("orders reveal steps by ascending rarity, stable within a rarity", () => {
    const m = lootRevealModel(orbs, gameData);
    expect(m.steps.map((s) => s.rarity)).toEqual([
      "common",
      "common",
      "rare",
      "legendary",
    ]);
    // The two common gold orbs keep their original drop order (2 then 3).
    const commons = m.steps.filter((s) => s.rarity === "common");
    expect(commons.map((s) => (s.content.kind === "gold" ? s.content.amount : 0))).toEqual([2, 3]);
    // order index is contiguous + matches playback order
    expect(m.steps.map((s) => s.order)).toEqual([0, 1, 2, 3]);
  });

  it("routes gold to the gold counter and items/components to inventory", () => {
    const m = lootRevealModel(orbs, gameData);
    for (const s of m.steps) {
      expect(s.destination).toBe(s.content.kind === "gold" ? "gold" : "inventory");
    }
  });

  it("resolves item/component names from data for the reveal label", () => {
    const m = lootRevealModel(orbs, gameData);
    const itemStep = m.steps.find((s) => s.content.kind === "item")!;
    if (itemStep.content.kind === "item") expect(itemStep.content.name).toBe(completed.name);
  });

  it("summarizes total gold + item count for the reduced-motion form", () => {
    const m = lootRevealModel(orbs, gameData);
    expect(m.totalGold).toBe(5); // 2 + 3
    expect(m.itemCount).toBe(2); // one component + one completed item
  });

  it("is deterministic for the same orb list", () => {
    const a = lootRevealModel(orbs, gameData);
    const b = lootRevealModel(orbs, gameData);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
