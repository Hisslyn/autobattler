// Pure derivations for the in-match item system (phase 10b). No Pixi, no game
// logic — read item definitions (items.json via the loader) and a player's
// inventory / a unit's equipped slots, and turn them into glanceable display
// models. The authoritative inventory + equip/combine all live in rules; this
// only describes what's already there. Raw fixed-point never leaks: stat values
// route through statFormat.
import type { GameData, ItemDataDef, ItemPassiveData } from "@autobattler/data";
import type { UnitInstance } from "@autobattler/sim/src/types.js";
import { C } from "./theme.js";
import { formatStatDelta } from "./statFormat.js";

const STAT_LABEL: Record<string, string> = {
  hp: "HP",
  ad: "AD",
  as: "Attack Speed",
  armor: "Armor",
  mr: "Magic Resist",
  mana: "Mana",
  abilityDamage: "Ability Power",
};

export interface ItemStatLine {
  label: string;
  value: string;
}

export interface ItemModel {
  id: string;
  name: string;
  /** A loose base component (no recipe) vs a completed item. */
  component: boolean;
  /** Display tint (cooler for components, richer for completed items). */
  color: number;
  /** Stat bundle in display order, fixed-point safe. */
  stats: ItemStatLine[];
  /** Human-readable passive line, or null for stat-only items. */
  passive: string | null;
}

/** One-line, readable description of a completed item's passive. */
export function passiveDescription(passive: ItemPassiveData): string {
  switch (passive.kind) {
    case "burn":
      return `On hit: burn the target for ${passive.value} over ${passive.duration} ticks.`;
    case "shield":
      return `Start of combat: gain a ${passive.value} shield for ${passive.duration} ticks.`;
  }
}

/** Display stat lines for an item's stat bundle (fixed-point safe). */
export function itemStatLines(stats: ItemDataDef["stats"]): ItemStatLine[] {
  return (Object.keys(stats) as string[])
    .filter((k) => stats[k] != null)
    .map((k) => ({
      label: STAT_LABEL[k] ?? k,
      value: formatStatDelta(k, stats[k]!),
    }));
}

/**
 * Build the display model for an item id, or null for an unknown id. A loose
 * component reads cooler/plainer; a completed item reads richer and carries its
 * passive line when it has one.
 */
export function itemModel(itemId: string, data: GameData): ItemModel | null {
  const def: ItemDataDef | undefined = data.items.find((i) => i.id === itemId);
  if (!def) return null;
  const component = def.component === true;
  return {
    id: def.id,
    name: def.name,
    component,
    color: component ? C.itemComponent : C.itemCompleted,
    stats: itemStatLines(def.stats),
    passive: def.passive ? passiveDescription(def.passive) : null,
  };
}

export interface InventoryEntry extends ItemModel {
  /** Index into the player's `items` array (stable for this snapshot). */
  index: number;
}

/**
 * Build the inventory view model from a player's loose-item id list. Preserves
 * the rules array order so an index maps straight back to a command target;
 * unknown ids are dropped.
 */
export function inventoryModel(items: readonly string[], data: GameData): InventoryEntry[] {
  const out: InventoryEntry[] = [];
  for (let i = 0; i < items.length; i++) {
    const m = itemModel(items[i]!, data);
    if (m) out.push({ ...m, index: i });
  }
  return out;
}

export interface EquippedSlots {
  /** One model per filled slot (in unit slot order). */
  items: ItemModel[];
  /** Total slot capacity (MAX_ITEMS_PER_UNIT). */
  max: number;
  /** Empty slots remaining. */
  free: number;
  /** True once the unit is at the slot cap. */
  full: boolean;
}

/**
 * Describe a unit's equipped item slots vs the cap. `max` is passed in (mirrors
 * the rules MAX_ITEMS_PER_UNIT) so this module stays free of the rules import.
 */
export function equippedSlots(
  unit: UnitInstance,
  max: number,
  data: GameData
): EquippedSlots {
  const items = unit.items
    .map((id) => itemModel(id, data))
    .filter((m): m is ItemModel => m !== null);
  const free = Math.max(0, max - unit.items.length);
  return { items, max, free, full: unit.items.length >= max };
}
