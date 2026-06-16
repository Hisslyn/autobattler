// Pure derivations for the in-match item system (phase 10b). No Pixi, no game
// logic — read item definitions (items.json via the loader) and a player's
// inventory / a unit's equipped slots, and turn them into glanceable display
// models. The authoritative inventory + equip/combine all live in rules; this
// only describes what's already there. Raw fixed-point never leaks: stat values
// route through statFormat.
import type { GameData, ItemDataDef, ItemPassiveData, ConsumableEffect } from "@autobattler/data";
import { itemKind } from "@autobattler/data";
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

/** Item tier classification (phase 2): a component, a completed (tier-2) item,
 *  a radiant (tier-4) upgrade, or a consumable. Mirrors rules' itemKind/itemTier
 *  but flattens "completed vs radiant" into one tier axis for display. */
export type ItemTier = "component" | "completed" | "radiant" | "artifact" | "mythical" | "consumable";

export interface ItemModel {
  id: string;
  name: string;
  /** A loose base component (no recipe) vs a completed item. Kept for existing
   *  call sites; equivalent to `tier === "component"`. */
  component: boolean;
  /** Display tint (cooler for components, richer for completed items, distinct
   *  for radiant/consumable — see `tier`). */
  color: number;
  /** Stat bundle in display order, fixed-point safe. */
  stats: ItemStatLine[];
  /** Human-readable passive line, or null for stat-only items. */
  passive: string | null;
  /** Full tier classification (component/completed/radiant/consumable). */
  tier: ItemTier;
  /** True for the three consumable items (item_remover/reforger/radiant_enhancer). */
  consumable: boolean;
  /** Set when `consumable` is true — which effect it applies when used. */
  consumableEffect: ConsumableEffect | null;
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

/** One-line, readable description of a consumable's effect (for chips/detail). */
export function consumableDescription(effect: ConsumableEffect): string {
  switch (effect) {
    case "remove_item":
      return "Removes all items from a unit back to your inventory.";
    case "reforge":
      return "Reforges each of a unit's items into a different item of the same tier.";
    case "radiant_upgrade":
      return "Upgrades one completed item on a unit into its radiant (tier-4) version.";
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

/** Tier classification for an item def (component/completed/radiant/consumable). */
function tierOf(def: ItemDataDef): ItemTier {
  const kind = itemKind(def);
  if (kind === "consumable") return "consumable";
  if (kind === "component") return "component";
  if (kind === "artifact") return "artifact";
  if (kind === "mythical") return "mythical";
  // "completed" kind covers both base completed items and radiant variants
  // (loader gives radiant_* the literal kind "completed"); the id prefix is
  // the only signal distinguishing them.
  return def.id.startsWith("radiant_") ? "radiant" : "completed";
}

/**
 * Display tint for a tier. Components/completed reuse the existing item
 * theme keys unchanged; radiant uses the gilded item-frame gold (already the
 * "completed item, upgraded" motif via itemIconDraw's frame); consumable uses
 * the new `itemConsumable` key so it never reads as an equippable chip.
 */
function colorForTier(tier: ItemTier): number {
  switch (tier) {
    case "component": return C.itemComponent;
    case "completed": return C.itemCompleted;
    case "radiant": return C.itemFrame;
    // Artifact (tier 3) / mythical (tier 5) have no dedicated client color yet —
    // reuse the completed-item tint as a placeholder so they read as equippable.
    case "artifact": return C.itemCompleted;
    case "mythical": return C.itemCompleted;
    case "consumable": return C.itemConsumable;
  }
}

/**
 * Build the display model for an item id, or null for an unknown id. A loose
 * component reads cooler/plainer; a completed item reads richer and carries its
 * passive line when it has one; a radiant item reads as the gilded tier-4
 * upgrade; a consumable carries no stats/passive but flags its effect kind.
 */
export function itemModel(itemId: string, data: GameData): ItemModel | null {
  const def: ItemDataDef | undefined = data.items.find((i) => i.id === itemId);
  if (!def) return null;
  const tier = tierOf(def);
  const consumable = tier === "consumable";
  return {
    id: def.id,
    name: def.name,
    component: tier === "component",
    color: colorForTier(tier),
    stats: itemStatLines(def.stats),
    passive: def.passive ? passiveDescription(def.passive) : null,
    tier,
    consumable,
    consumableEffect: consumable ? (def.consumableEffect ?? null) : null,
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

/**
 * Tier-2 (completed, non-radiant) items currently equipped on a unit — the
 * exact set radiant_enhancer is allowed to target. Pure UI-routing helper: used
 * ONLY to decide whether to open the item-picker overlay (1+ results) or send
 * USE_CONSUMABLE with no targetItemId and let the server reject it (0 results).
 * Never used to block/branch the command itself.
 */
export function tier2EquippedItems(unit: UnitInstance, data: GameData): ItemModel[] {
  return unit.items
    .map((id) => itemModel(id, data))
    .filter((m): m is ItemModel => m !== null && m.tier === "completed");
}
