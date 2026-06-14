import { describe, it, expect } from "vitest";
import { gameData } from "@autobattler/data";
import type { UnitInstance } from "@autobattler/sim/src/types.js";
import {
  itemModel,
  inventoryModel,
  equippedSlots,
  passiveDescription,
  itemStatLines,
} from "../src/itemModel.js";

const component = gameData.items.find((i) => i.component)!;
const completed = gameData.items.find((i) => i.recipe && i.passive)!;
const completedNoPassive = gameData.items.find((i) => i.recipe && !i.passive)!;

describe("itemModel", () => {
  it("returns null for an unknown item id", () => {
    expect(itemModel("__nope__", gameData)).toBeNull();
  });

  it("marks a base component vs a completed item with distinct tints", () => {
    const c = itemModel(component.id, gameData)!;
    const f = itemModel(completed.id, gameData)!;
    expect(c.component).toBe(true);
    expect(f.component).toBe(false);
    expect(c.color).not.toBe(f.color);
  });

  it("surfaces a completed item's passive, none for stat-only items", () => {
    expect(itemModel(completed.id, gameData)!.passive).not.toBeNull();
    expect(itemModel(completedNoPassive.id, gameData)!.passive).toBeNull();
    expect(itemModel(component.id, gameData)!.passive).toBeNull();
  });

  it("formats stat bundles fixed-point-safe (attack speed divided)", () => {
    const asItem = gameData.items.find((i) => i.stats.as != null)!;
    const line = itemStatLines(asItem.stats).find((s) => s.label === "Attack Speed")!;
    // e.g. +150 (fixed-point) → "+0.15", never the raw integer
    expect(line.value).toBe(`+${(asItem.stats.as! / 1000).toFixed(2)}`);
  });

  it("describes both passive kinds", () => {
    expect(passiveDescription({ kind: "burn", value: 30, duration: 40 })).toMatch(/burn/);
    expect(passiveDescription({ kind: "shield", value: 200, duration: 60 })).toMatch(/shield/);
  });
});

describe("inventoryModel", () => {
  it("preserves array order so an index maps back to a command target", () => {
    const ids = [component.id, completed.id, component.id];
    const inv = inventoryModel(ids, gameData);
    expect(inv.map((e) => e.index)).toEqual([0, 1, 2]);
    expect(inv.map((e) => e.id)).toEqual(ids);
  });

  it("drops unknown ids", () => {
    const inv = inventoryModel([component.id, "__nope__"], gameData);
    expect(inv).toHaveLength(1);
    expect(inv[0]!.id).toBe(component.id);
  });
});

describe("equippedSlots", () => {
  const unitWith = (items: string[]): UnitInstance => ({ items } as UnitInstance);

  it("reports occupancy + free slots vs the cap", () => {
    const s = equippedSlots(unitWith([component.id]), 3, gameData);
    expect(s.items).toHaveLength(1);
    expect(s.max).toBe(3);
    expect(s.free).toBe(2);
    expect(s.full).toBe(false);
  });

  it("is full at the cap", () => {
    const s = equippedSlots(unitWith([component.id, completed.id, component.id]), 3, gameData);
    expect(s.full).toBe(true);
    expect(s.free).toBe(0);
  });
});
