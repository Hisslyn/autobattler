import type { GameData } from "@autobattler/data";
import type { MatchState } from "./state.js";
import type { UnitInstance } from "@autobattler/sim/src/types.js";
import type { Prng } from "@autobattler/sim/src/prng.js";
import { returnToPool, drawFromPool } from "./pool.js";
import { rollShop } from "./shop.js";
import { levelForXp } from "./economy.js";

export type Command =
  | { type: "BUY"; shopSlotIndex: number }
  | { type: "SELL"; unitUid: number }
  | { type: "REROLL" }
  | { type: "BUY_XP" }
  | { type: "MOVE"; unitUid: number; toBench: boolean; toIndex: number }
  | { type: "EQUIP"; unitUid: number; itemId: string };

export type CommandError =
  | "INSUFFICIENT_GOLD"
  | "BENCH_FULL"
  | "BOARD_FULL"
  | "EMPTY_SLOT"
  | "UNIT_NOT_FOUND"
  | "ITEM_NOT_FOUND"
  | "INVALID_POSITION"
  | "NOT_YOUR_UNIT";

export type CommandResult = { ok: true } | { ok: false; error: CommandError };

const BENCH_MAX = 9;
const BOARD_SLOTS = 28; // 7 cols × 4 rows

function countBoardUnits(board: (UnitInstance | null)[]): number {
  return board.reduce((n, u) => n + (u ? 1 : 0), 0);
}

function findUnitAnywhere(
  state: MatchState,
  playerId: number,
  uid: number
): { onBench: boolean; idx: number } | null {
  const player = state.players[playerId];
  if (!player) return null;
  let idx = player.bench.findIndex((u) => u.uid === uid);
  if (idx >= 0) return { onBench: true, idx };
  idx = player.board.findIndex((u) => u != null && u.uid === uid);
  if (idx >= 0) return { onBench: false, idx };
  return null;
}

function tryAutoMerge(
  state: MatchState,
  playerId: number,
  defId: string,
  data: GameData
): void {
  const player = state.players[playerId];
  if (!player) return;

  for (const targetStar of [1, 2] as const) {
    const allUnits = [
      ...player.bench,
      ...player.board.filter((u): u is UnitInstance => u != null),
    ].filter((u) => u.defId === defId && u.star === targetStar);
    if (allUnits.length < 3) continue;

    // Remove 3 copies
    let removed = 0;
    for (let i = player.bench.length - 1; i >= 0 && removed < 3; i--) {
      if (player.bench[i]!.defId === defId && player.bench[i]!.star === targetStar) {
        player.bench.splice(i, 1);
        removed++;
      }
    }
    for (let i = player.board.length - 1; i >= 0 && removed < 3; i--) {
      const u = player.board[i];
      if (u && u.defId === defId && u.star === targetStar) {
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
      attackCooldown: 0,
      statusEffects: [],
      items: [],
    };

    // Place on bench if space, else first empty board slot
    if (player.bench.length < BENCH_MAX) {
      player.bench.push(newUnit);
    } else {
      const emptySlot = player.board.indexOf(null);
      if (emptySlot >= 0 && countBoardUnits(player.board) < player.level) {
        player.board[emptySlot] = newUnit;
      } else {
        player.bench.push(newUnit);
      }
    }

    // Cascade: check if newly created star can also merge
    tryAutoMerge(state, playerId, defId, data);
    return;
  }
}

let _uidCounter = 10000;
function nextUid(_state: MatchState): number {
  return _uidCounter++;
}

export function applyCommand(
  state: MatchState,
  playerId: number,
  cmd: Command,
  prng: Prng,
  data: GameData
): CommandResult {
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
      const boardUnits = countBoardUnits(player.board);
      if (player.bench.length >= BENCH_MAX && boardUnits >= player.level) return { ok: false, error: "BENCH_FULL" };

      if (!drawFromPool(state.pool, slot.defId)) return { ok: false, error: "UNIT_NOT_FOUND" };

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
        attackCooldown: 0,
        statusEffects: [],
        items: [],
      };
      player.bench.push(newUnit);

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

      if (found.onBench) {
        player.bench.splice(found.idx, 1);
      } else {
        player.board[found.idx] = null;
      }

      // Return pool copies based on star
      const copies = unit.star === 1 ? 1 : unit.star === 2 ? 3 : 9;
      for (let i = 0; i < copies; i++) returnToPool(state.pool, unit.defId);

      // Sell value = tier * copies_in_star (1 for 1*, 3 for 2*, 9 for 3*)
      // Simplified: tier gold per unit's equivalent 1-star copies
      player.gold += def.tier * copies;
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
        if (player.bench.length >= BENCH_MAX) return { ok: false, error: "BENCH_FULL" };
        // Remove from source
        if (found.onBench) {
          player.bench.splice(found.idx, 1);
        } else {
          player.board[found.idx] = null;
        }
        const clampedIdx = Math.min(Math.max(0, cmd.toIndex), player.bench.length);
        player.bench.splice(clampedIdx, 0, unit);
      } else {
        // Moving to board slot
        const targetSlot = Math.min(Math.max(0, cmd.toIndex), BOARD_SLOTS - 1);
        const occupant = player.board[targetSlot] ?? null;
        const isFromBoard = !found.onBench;
        const boardCount = countBoardUnits(player.board);

        if (!occupant) {
          // Target slot is empty — check board cap only for bench→board moves
          if (!isFromBoard && boardCount >= player.level) {
            return { ok: false, error: "BOARD_FULL" };
          }
        }
        // Remove from source
        if (found.onBench) {
          player.bench.splice(found.idx, 1);
        } else {
          player.board[found.idx] = null;
        }
        // Swap occupant back to source if needed
        if (occupant) {
          if (found.onBench) {
            player.bench.splice(Math.min(found.idx, player.bench.length), 0, occupant);
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

      player.items.splice(itemIdx, 1);
      equipUnit.items.push(cmd.itemId);
      return { ok: true };
    }
  }
}
