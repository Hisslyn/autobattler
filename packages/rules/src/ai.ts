import type { GameData } from "@autobattler/data";
import type { MatchState } from "./state.js";
import type { Prng } from "@autobattler/sim/src/prng.js";
import { applyCommand } from "./commands.js";

function traitOverlapScore(defId: string, boardDefIds: string[], data: GameData): number {
  const def = data.units.find((u) => u.id === defId);
  if (!def) return 0;
  let score = 0;
  for (const boardDefId of boardDefIds) {
    const boardDef = data.units.find((u) => u.id === boardDefId);
    if (!boardDef) continue;
    for (const trait of def.traits) {
      if (boardDef.traits.includes(trait)) score++;
    }
  }
  return score;
}

export function applyAiCommands(
  state: MatchState,
  playerId: number,
  prng: Prng,
  data: GameData
): void {
  const player = state.players[playerId];
  if (!player || !player.alive) return;

  // Buy XP if gold > 30
  if (player.gold > 30) {
    applyCommand(state, playerId, { type: "BUY_XP" }, prng, data);
  }

  // Score each shop slot by trait overlap + prefer lower tier to conserve gold
  const boardDefIds = player.board.filter((u): u is NonNullable<typeof u> => u != null).map((u) => u.defId);

  // Collect buyable slots sorted by desirability
  const slots: Array<{ idx: number; score: number; cost: number }> = [];
  for (let i = 0; i < player.shop.length; i++) {
    const slot = player.shop[i];
    if (!slot) continue;
    const def = data.units.find((u) => u.id === slot.defId);
    if (!def) continue;
    const cost = def.tier;
    if (player.gold < cost) continue;
    const overlap = traitOverlapScore(slot.defId, boardDefIds, data);
    slots.push({ idx: i, score: overlap * 10 - cost, cost });
  }
  slots.sort((a, b) => b.score - a.score);

  for (const { idx } of slots) {
    const p = state.players[playerId]!;
    const slot = p.shop[idx];
    if (!slot) continue;
    const def = data.units.find((u) => u.id === slot.defId);
    if (!def) continue;
    if (p.gold < def.tier) continue;
    // Keep ~10g for interest unless unit is great overlap
    const interestThreshold = 10;
    if (p.gold - def.tier < interestThreshold && traitOverlapScore(slot.defId, p.board.filter((u): u is NonNullable<typeof u> => u != null).map((u) => u.defId), data) === 0) continue;
    applyCommand(state, playerId, { type: "BUY", shopSlotIndex: idx }, prng, data);
  }

  // Fill board to slot cap (level)
  const p2 = state.players[playerId]!;
  for (let i = 0; i < p2.bench.length; i++) {
    const boardCount = p2.board.filter((u): u is NonNullable<typeof u> => u != null).length;
    if (boardCount >= p2.level) break;
    const unit = p2.bench[i];
    if (!unit) continue;
    // Find first empty board slot
    const emptySlot = p2.board.indexOf(null);
    const targetSlot = emptySlot >= 0 ? emptySlot : boardCount;
    applyCommand(state, playerId, { type: "MOVE", unitUid: unit.uid, toBench: false, toIndex: targetSlot }, prng, data);
  }
}
