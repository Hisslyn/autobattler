// Pure routing logic for the radiant_enhancer drop flow (phase 2 consumables).
// No Pixi, no game logic, no command construction — this only decides WHICH
// already-equipped items to show in the picker overlay, never whether the
// consumable's effect is legal (that's server/rules-decided). Mirrors the
// itemModel/inventoryModel pattern (plain functions over GameData + a UnitInstance).
import type { GameData } from "@autobattler/data";
import type { UnitInstance } from "@autobattler/sim/src/types.js";
import { tier2EquippedItems } from "./itemModel.js";
import type { ItemModel } from "./itemModel.js";

export type RadiantDropRoute =
  | { kind: "picker"; items: ItemModel[] }
  | { kind: "send" };

/**
 * Decide how to route a radiant_enhancer drop onto `unit`:
 *  - 1+ tier-2 (completed, non-radiant) items equipped → open the picker so the
 *    player chooses which one (the command needs an explicit targetItemId).
 *  - 0 tier-2 items equipped → still "send": the caller fires USE_CONSUMABLE
 *    with no targetItemId and lets the server reject with NO_TIER_2_ITEMS_EQUIPPED,
 *    surfaced via the normal toast path. This function never blocks the send;
 *    it only decides whether a picker step is needed first.
 */
export function radiantDropRoute(unit: UnitInstance, data: GameData): RadiantDropRoute {
  const items = tier2EquippedItems(unit, data);
  return items.length > 0 ? { kind: "picker", items } : { kind: "send" };
}
