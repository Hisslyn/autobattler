import type { GameData } from "@autobattler/data";
import { recipeResult, itemKind, itemTier, getOrCreateRadiantItem } from "@autobattler/data";
import type { MatchState } from "./state.js";
import type { UnitInstance } from "@autobattler/sim/src/types.js";
import type { Prng } from "@autobattler/sim/src/prng.js";
import { returnToPool } from "./pool.js";
import { rollShop } from "./shop.js";
import { levelForXp } from "./economy.js";

/** Max items (components or completed) a single unit may hold. */
export const MAX_ITEMS_PER_UNIT = 3; // magic-ok: slot-cap union bound, not tuning

export type Command =
  | { type: "BUY"; shopSlotIndex: number }
  | { type: "SELL"; unitUid: number }
  | { type: "REROLL" }
  | { type: "BUY_XP" }
  | { type: "MOVE"; unitUid: number; toBench: boolean; toIndex: number }
  | { type: "EQUIP"; unitUid: number; itemId: string }
  | { type: "UNEQUIP"; unitUid: number; itemId: string }
  | { type: "COMBINE_ITEMS"; itemIdA: string; itemIdB: string }
  | { type: "USE_CONSUMABLE"; consumableId: string; targetUnitId: number; targetItemId?: string };

export type CommandError =
  | "INSUFFICIENT_GOLD"
  | "BENCH_FULL"
  | "BOARD_FULL"
  | "EMPTY_SLOT"
  | "UNIT_NOT_FOUND"
  | "ITEM_NOT_FOUND"
  | "ITEM_SLOTS_FULL"
  | "NO_RECIPE"
  | "INVALID_POSITION"
  | "PHASE_INVALID"
  | "CONSUMABLE_NOT_FOUND"
  | "ITEM_NOT_EQUIPPED"
  | "NO_ALTERNATIVE_ITEM"
  | "NOT_TIER_2_ITEM"
  | "NO_TIER_2_ITEMS_EQUIPPED";

export type CommandResult = { ok: true } | { ok: false; error: CommandError };

/** Pure recipe resolver re-exported for rules consumers (data is the source). */
export { recipeResult } from "@autobattler/data";

function countBoardUnits(board: (UnitInstance | null)[]): number {
  return board.reduce((n, u) => n + (u ? 1 : 0), 0);
}

/** Live units on the (holed) bench. */
function benchUnits(bench: (UnitInstance | null)[]): UnitInstance[] {
  return bench.filter((u): u is UnitInstance => u != null);
}

/** True when no bench slot is free. */
function benchFull(bench: (UnitInstance | null)[]): boolean {
  return bench.indexOf(null) < 0;
}

/** Lowest-index empty bench slot, or -1 when the bench is full. */
function firstEmptyBenchSlot(bench: (UnitInstance | null)[]): number {
  return bench.indexOf(null);
}

function findUnitAnywhere(
  state: MatchState,
  playerId: number,
  uid: number
): { onBench: boolean; idx: number } | null {
  const player = state.players[playerId];
  if (!player) return null;
  let idx = player.bench.findIndex((u) => u != null && u.uid === uid);
  if (idx >= 0) return { onBench: true, idx };
  idx = player.board.findIndex((u) => u != null && u.uid === uid);
  if (idx >= 0) return { onBench: false, idx };
  return null;
}

export function tryAutoMerge(
  state: MatchState,
  playerId: number,
  defId: string,
  data: GameData
): void {
  const player = state.players[playerId];
  if (!player) return;

  for (const targetStar of [1, 2] as const) {
    const allUnits = [
      ...benchUnits(player.bench),
      ...player.board.filter((u): u is UnitInstance => u != null),
    ].filter((u) => u.defId === defId && u.star === targetStar);
    if (allUnits.length < 3) continue;

    // Remove 3 copies, collecting their items (slot order per source). Bench
    // slots are cleared in place (set to null) so other units never reflow.
    const sourceItems: string[] = [];
    let removed = 0;
    for (let i = player.bench.length - 1; i >= 0 && removed < 3; i--) {
      const u = player.bench[i];
      if (u && u.defId === defId && u.star === targetStar) {
        sourceItems.push(...u.items);
        player.bench[i] = null;
        removed++;
      }
    }
    for (let i = player.board.length - 1; i >= 0 && removed < 3; i--) {
      const u = player.board[i];
      if (u && u.defId === defId && u.star === targetStar) {
        sourceItems.push(...u.items);
        player.board[i] = null;
        removed++;
      }
    }

    // Create upgraded unit
    const newStar = (targetStar + 1) as 2 | 3;
    const def = data.units.find((d) => d.id === defId)!;
    const newUnit: UnitInstance = {
      uid: nextUid(state),
      defId,
      tier: def.tier,
      star: newStar,
      team: 0,
      pos: { q: 0, r: 0 },
      hp: def.hp,
      maxHp: def.hp,
      ad: def.ad,
      as: def.as,
      armor: def.armor,
      mr: def.mr,
      range: def.range,
      mana: def.manaStart,
      maxMana: def.mana,
      abilityDamage: def.abilityDamage,
      ability: def.ability,
      attackCooldown: 0,
      statusEffects: [],
      items: sourceItems.slice(0, 3),
    };
    // Overflow items go to the player's unequipped inventory
    player.items.push(...sourceItems.slice(3));

    // Place on the lowest empty bench slot if any, else first empty board slot.
    const benchSlot = firstEmptyBenchSlot(player.bench);
    if (benchSlot >= 0) {
      player.bench[benchSlot] = newUnit;
    } else {
      const emptySlot = player.board.indexOf(null);
      if (emptySlot >= 0 && countBoardUnits(player.board) < player.level) {
        player.board[emptySlot] = newUnit;
      } else {
        // Bench full and no legal board slot — the merge still must land somewhere;
        // overwrite is impossible, so this only fires in pathological states. Drop
        // onto the last bench slot as a final fallback (cannot grow the array).
        const last = player.bench.length - 1;
        player.bench[last] = newUnit;
      }
    }

    // Cascade: check if newly created star can also merge
    tryAutoMerge(state, playerId, defId, data);
    return;
  }
}

function nextUid(state: MatchState): number {
  return state.nextUid++;
}

export function applyCommand(
  state: MatchState,
  playerId: number,
  cmd: Command,
  prng: Prng,
  data: GameData
): CommandResult {
  // Commands are only legal during planning; MatchState owns the phase.
  if (state.phase !== "PLANNING") return { ok: false, error: "PHASE_INVALID" };

  const player = state.players[playerId];
  if (!player) return { ok: false, error: "UNIT_NOT_FOUND" };

  switch (cmd.type) {
    case "BUY": {
      const slot = player.shop[cmd.shopSlotIndex];
      if (!slot) return { ok: false, error: "EMPTY_SLOT" };
      const def = data.units.find((d) => d.id === slot.defId);
      if (!def) return { ok: false, error: "UNIT_NOT_FOUND" };
      const cost = def.tier;
      if (player.gold < cost) return { ok: false, error: "INSUFFICIENT_GOLD" };
      if (benchFull(player.bench)) {
        // Full bench: only allow if this purchase immediately completes a merge
        // (3rd star-1 copy), so net bench growth is <= 0.
        const sameStarCopies = [
          ...benchUnits(player.bench),
          ...player.board.filter((u): u is UnitInstance => u != null),
        ].filter((u) => u.defId === slot.defId && u.star === 1).length;
        if (sameStarCopies < 2) return { ok: false, error: "BENCH_FULL" };
      }

      // The shop copy was already drawn from the pool at roll time — no draw here.
      player.gold -= cost;
      player.shop[cmd.shopSlotIndex] = null;

      const newUnit: UnitInstance = {
        uid: nextUid(state),
        defId: def.id,
        tier: def.tier,
        star: 1,
        team: 0,
        pos: { q: 0, r: 0 },
        hp: def.hp,
        maxHp: def.hp,
        ad: def.ad,
        as: def.as,
        armor: def.armor,
        mr: def.mr,
        range: def.range,
        mana: def.manaStart,
        maxMana: def.mana,
        abilityDamage: def.abilityDamage,
        ability: def.ability,
        attackCooldown: 0,
        statusEffects: [],
        items: [],
      };
      // Drop into the lowest empty bench slot. A full bench only reached here on
      // a merge-completing buy (checked above): place on a free board slot so
      // tryAutoMerge can find + consume it (net occupancy unchanged after merge);
      // if even that is full, fall back to the last bench slot.
      const benchSlot = firstEmptyBenchSlot(player.bench);
      if (benchSlot >= 0) {
        player.bench[benchSlot] = newUnit;
      } else {
        const boardSlot = player.board.indexOf(null);
        if (boardSlot >= 0) player.board[boardSlot] = newUnit;
        else player.bench[player.bench.length - 1] = newUnit;
      }

      tryAutoMerge(state, playerId, def.id, data);
      return { ok: true };
    }

    case "SELL": {
      const found = findUnitAnywhere(state, playerId, cmd.unitUid);
      if (!found) return { ok: false, error: "UNIT_NOT_FOUND" };
      const unit = found.onBench ? player.bench[found.idx]! : player.board[found.idx]!;
      if (!unit) return { ok: false, error: "UNIT_NOT_FOUND" };
      const def = data.units.find((d) => d.id === unit.defId);
      if (!def) return { ok: false, error: "UNIT_NOT_FOUND" };

      // Return the unit's equipped items to inventory (opaque ids, mirroring
      // UNEQUIP — never decomposed into their source components).
      player.items.push(...unit.items);

      if (found.onBench) {
        player.bench[found.idx] = null;
      } else {
        player.board[found.idx] = null;
      }

      // Return pool copies based on star
      const copies = data.gameplay.copiesPerStar[String(unit.star)] ?? 1;
      for (let i = 0; i < copies; i++) returnToPool(state.pool, unit.defId);

      // Sell value = tier gold per equivalent 1-star copy
      player.gold += def.tier * copies * data.gameplay.sellValueMultiplier;
      return { ok: true };
    }

    case "REROLL": {
      if (player.gold < data.economy.rerollCost) return { ok: false, error: "INSUFFICIENT_GOLD" };
      player.gold -= data.economy.rerollCost;
      // Return current shop units to pool
      for (const slot of player.shop) {
        if (slot) returnToPool(state.pool, slot.defId);
      }
      rollShop(state, playerId, prng, data);
      return { ok: true };
    }

    case "BUY_XP": {
      if (player.gold < data.economy.xpBuyCost) return { ok: false, error: "INSUFFICIENT_GOLD" };
      player.gold -= data.economy.xpBuyCost;
      player.xp += data.economy.xpBuyAmount;
      player.level = levelForXp(player.xp, data);
      return { ok: true };
    }

    case "MOVE": {
      const found = findUnitAnywhere(state, playerId, cmd.unitUid);
      if (!found) return { ok: false, error: "UNIT_NOT_FOUND" };
      const unit = found.onBench ? player.bench[found.idx]! : player.board[found.idx]!;
      if (!unit) return { ok: false, error: "UNIT_NOT_FOUND" };

      if (cmd.toBench) {
        // Bench is 9 FIXED positional slots — never reflows. The target slot is
        // chosen explicitly (clamped into range); if it's empty the unit moves
        // there, if occupied the two units SWAP slots. A bench→bench move onto
        // the unit's own slot is a no-op.
        const targetSlot = Math.min(Math.max(0, cmd.toIndex), player.bench.length - 1);
        // No free slot AND the target is empty would be contradictory; only a
        // bench→bench move into the source's own slot can't change occupancy.
        if (found.onBench && found.idx === targetSlot) return { ok: true };

        const occupant = player.bench[targetSlot] ?? null;
        // A bench→bench move into a full bench is fine (it's a swap or same slot);
        // a board→bench move needs the target slot itself to be free OR be a swap
        // back onto the board... but the board source slot is single, so any
        // board→bench lands the occupant (if any) back onto that board slot.
        if (found.onBench) {
          // Bench↔bench: move to empty slot, or swap two occupied slots.
          player.bench[found.idx] = occupant; // null when target was empty → source emptied
          player.bench[targetSlot] = unit;
        } else {
          // Board→bench: clear the board slot, place onto the target bench slot;
          // any bench occupant swaps back onto the now-empty board slot.
          if (!occupant && benchFull(player.bench)) return { ok: false, error: "BENCH_FULL" };
          player.board[found.idx] = occupant; // occupant (or null) returns to the board slot
          player.bench[targetSlot] = unit;
        }
      } else {
        // Moving to board slot
        const targetSlot = Math.min(Math.max(0, cmd.toIndex), data.gameplay.boardSlots - 1);
        const occupant = player.board[targetSlot] ?? null;
        const isFromBoard = !found.onBench;
        const boardCount = countBoardUnits(player.board);

        if (!occupant) {
          // Target slot is empty — check board cap only for bench→board moves
          if (!isFromBoard && boardCount >= player.level) {
            return { ok: false, error: "BOARD_FULL" };
          }
        }
        // Remove from source (bench slot cleared in place — never reflow)
        if (found.onBench) {
          player.bench[found.idx] = null;
        } else {
          player.board[found.idx] = null;
        }
        // Swap occupant back to the source slot if needed
        if (occupant) {
          if (found.onBench) {
            player.bench[found.idx] = occupant;
          } else {
            player.board[found.idx] = occupant;
          }
        }
        player.board[targetSlot] = unit;
      }
      return { ok: true };
    }

    case "EQUIP": {
      const itemIdx = player.items.indexOf(cmd.itemId);
      if (itemIdx < 0) return { ok: false, error: "ITEM_NOT_FOUND" };
      const found = findUnitAnywhere(state, playerId, cmd.unitUid);
      if (!found) return { ok: false, error: "UNIT_NOT_FOUND" };
      const equipUnit = found.onBench ? player.bench[found.idx]! : player.board[found.idx]!;
      if (!equipUnit) return { ok: false, error: "UNIT_NOT_FOUND" };

      // Auto-combine: if the unit already holds a component that completes a
      // recipe with the incoming one, fuse in place (net slots unchanged).
      const matchSlot = equipUnit.items.findIndex(
        (held) => recipeResult(held, cmd.itemId, data.items) !== null
      );
      if (matchSlot >= 0) {
        const combined = recipeResult(equipUnit.items[matchSlot]!, cmd.itemId, data.items)!;
        equipUnit.items[matchSlot] = combined;
        player.items.splice(itemIdx, 1);
        return { ok: true };
      }

      if (equipUnit.items.length >= MAX_ITEMS_PER_UNIT) {
        return { ok: false, error: "ITEM_SLOTS_FULL" };
      }
      player.items.splice(itemIdx, 1);
      equipUnit.items.push(cmd.itemId);
      return { ok: true };
    }

    case "UNEQUIP": {
      const found = findUnitAnywhere(state, playerId, cmd.unitUid);
      if (!found) return { ok: false, error: "UNIT_NOT_FOUND" };
      const unequipUnit = found.onBench ? player.bench[found.idx]! : player.board[found.idx]!;
      if (!unequipUnit) return { ok: false, error: "UNIT_NOT_FOUND" };
      const slot = unequipUnit.items.indexOf(cmd.itemId);
      if (slot < 0) return { ok: false, error: "ITEM_NOT_FOUND" };

      unequipUnit.items.splice(slot, 1);
      player.items.push(cmd.itemId);
      return { ok: true };
    }

    case "COMBINE_ITEMS": {
      const idxA = player.items.indexOf(cmd.itemIdA);
      if (idxA < 0) return { ok: false, error: "ITEM_NOT_FOUND" };
      // Second match must be a distinct inventory entry from the first.
      const idxB = player.items.findIndex((id, i) => i !== idxA && id === cmd.itemIdB);
      if (idxB < 0) return { ok: false, error: "ITEM_NOT_FOUND" };
      const combined = recipeResult(cmd.itemIdA, cmd.itemIdB, data.items);
      if (!combined) return { ok: false, error: "NO_RECIPE" };

      // Remove both loose components (highest index first), add the result.
      const [hi, lo] = idxA > idxB ? [idxA, idxB] : [idxB, idxA];
      player.items.splice(hi, 1);
      player.items.splice(lo, 1);
      player.items.push(combined);
      return { ok: true };
    }

    case "USE_CONSUMABLE": {
      // Resolve the consumable in the player's inventory.
      const consumableIdx = player.items.indexOf(cmd.consumableId);
      if (consumableIdx < 0) return { ok: false, error: "CONSUMABLE_NOT_FOUND" };
      const consumableDef = data.items.find((i) => i.id === cmd.consumableId);
      if (!consumableDef || itemKind(consumableDef) !== "consumable") {
        return { ok: false, error: "CONSUMABLE_NOT_FOUND" };
      }

      // Resolve the target unit (board or bench).
      const found = findUnitAnywhere(state, playerId, cmd.targetUnitId);
      if (!found) return { ok: false, error: "UNIT_NOT_FOUND" };
      const unit = found.onBench ? player.bench[found.idx]! : player.board[found.idx]!;
      if (!unit) return { ok: false, error: "UNIT_NOT_FOUND" };

      switch (consumableDef.consumableEffect) {
        case "remove_item": {
          // Acts on ALL items equipped on the target unit. Zero items is a
          // normal no-op outcome (not a typed error) — the consumable is not
          // consumed and no state changes.
          if (unit.items.length === 0) return { ok: true };
          player.items.push(...unit.items);
          unit.items = [];
          player.items.splice(player.items.indexOf(cmd.consumableId), 1);
          return { ok: true };
        }

        case "reforge": {
          // Reforges EACH equipped item independently to a different random
          // item of the same tier, processed in equipped-slot order (one
          // prng draw per item, off the shared match prng, so determinism
          // holds). Zero items is a no-op (not consumed).
          if (unit.items.length === 0) return { ok: true };
          for (let slot = 0; slot < unit.items.length; slot++) {
            const currentId = unit.items[slot]!;
            const tier = itemTier(currentId, data.items, data.economy);
            const candidates = data.items.filter(
              (i) =>
                i.id !== currentId &&
                itemKind(i) !== "consumable" &&
                itemTier(i.id, data.items, data.economy) === tier
            );
            if (candidates.length === 0) return { ok: false, error: "NO_ALTERNATIVE_ITEM" };
            const pick = candidates[prng() % candidates.length]!;
            unit.items[slot] = pick.id;
          }
          player.items.splice(player.items.indexOf(cmd.consumableId), 1);
          return { ok: true };
        }

        case "radiant_upgrade": {
          if (unit.items.length === 0) return { ok: false, error: "NO_TIER_2_ITEMS_EQUIPPED" };
          const hasTier2 = unit.items.some((id) => {
            const def = data.items.find((i) => i.id === id);
            return def && itemKind(def) === "completed" && !id.startsWith("radiant_");
          });
          if (!hasTier2) return { ok: false, error: "NO_TIER_2_ITEMS_EQUIPPED" };

          const slot = unit.items.indexOf(cmd.targetItemId ?? "");
          if (slot < 0) return { ok: false, error: "ITEM_NOT_EQUIPPED" };
          const currentId = unit.items[slot]!;
          const def = data.items.find((i) => i.id === currentId);
          // Must be a base completed item (tier 2) — not a component, consumable,
          // or an already-radiant variant (which derives from a completed item).
          if (!def || itemKind(def) !== "completed" || currentId.startsWith("radiant_")) {
            return { ok: false, error: "NOT_TIER_2_ITEM" };
          }
          const radiant = getOrCreateRadiantItem(
            currentId,
            data.items,
            data.economy.radiantStatMultiplier
          );
          if (!radiant) return { ok: false, error: "NOT_TIER_2_ITEM" };
          unit.items[slot] = radiant.id;
          player.items.splice(player.items.indexOf(cmd.consumableId), 1);
          return { ok: true };
        }

        default:
          return { ok: false, error: "CONSUMABLE_NOT_FOUND" };
      }
    }
  }
}
