// Pure combine-preview resolver (phase 10b). No Pixi, no game logic — wraps the
// data `recipeResult` lookup so the drag layer can show the completed item that
// dropping one component onto another would build, or a clear "no combine" when
// the pair has no recipe. The actual fusion is a COMBINE_ITEMS / EQUIP command
// applied by rules; this only previews the already-decided result.
import type { GameData } from "@autobattler/data";
import { recipeResult } from "@autobattler/data";
import { itemModel } from "./itemModel.js";
import type { ItemModel } from "./itemModel.js";

export type CombinePreview =
  | { ok: true; result: ItemModel }
  | { ok: false; reason: "same-entry" | "no-recipe" };

/**
 * Preview combining the item at inventory index `aIndex` (id `aId`) with the
 * one at `bIndex` (id `bId`). Returns the completed item's model when the pair
 * has a recipe, else a typed "no combine" reason. Dropping an entry on itself
 * (same index) is never a combine.
 */
export function combinePreview(
  aId: string,
  aIndex: number,
  bId: string,
  bIndex: number,
  data: GameData
): CombinePreview {
  if (aIndex === bIndex) return { ok: false, reason: "same-entry" };
  const resultId = recipeResult(aId, bId, data.items);
  if (!resultId) return { ok: false, reason: "no-recipe" };
  const result = itemModel(resultId, data);
  if (!result) return { ok: false, reason: "no-recipe" };
  return { ok: true, result };
}

/**
 * Preview equipping loose item `itemId` onto a unit already holding `heldIds`.
 * Mirrors the rules EQUIP auto-combine: if a held component completes a recipe
 * with the incoming item it fuses in place (returns the combined item + which
 * held slot it replaces); otherwise it's a plain add (subject to the slot cap,
 * checked by the caller). Returns null only for an unknown incoming id.
 */
export function equipPreview(
  itemId: string,
  heldIds: readonly string[],
  data: GameData
):
  | { kind: "combine"; slot: number; result: ItemModel }
  | { kind: "add"; result: ItemModel }
  | null {
  const incoming = itemModel(itemId, data);
  if (!incoming) return null;
  for (let slot = 0; slot < heldIds.length; slot++) {
    const combinedId = recipeResult(heldIds[slot]!, itemId, data.items);
    if (combinedId) {
      const result = itemModel(combinedId, data);
      if (result) return { kind: "combine", slot, result };
    }
  }
  return { kind: "add", result: incoming };
}
