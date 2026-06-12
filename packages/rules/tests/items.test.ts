import { describe, it, expect } from "vitest";
import { gameData } from "@autobattler/data";
import { createMatch, advancePhase } from "../src/match.js";
import { applyCommand } from "../src/commands.js";
import { mulberry32 } from "@autobattler/sim/src/prng.js";

describe("PvE item drops", () => {
  it("grants real item ids that resolve in items.json and equip successfully", () => {
    const state = createMatch(11, gameData);
    expect(state.round).toBe(1); // round 1 is PvE

    // PLANNING → RESOLUTION runs the PvE round and grants drops
    advancePhase(state, gameData);

    const validIds = new Set(gameData.items.map((i) => i.id));
    for (const player of state.players) {
      expect(player.items.length).toBeGreaterThan(0);
      for (const id of player.items) {
        expect(validIds.has(id)).toBe(true);
      }
    }

    // Equip the granted item onto a unit and verify it sticks
    advancePhase(state, gameData); // RESOLUTION → PLANNING
    const prng = mulberry32(3);
    const player = state.players[0]!;
    const itemId = player.items[0]!;
    player.gold = 100;
    const slotIdx = player.shop.findIndex((s) => s !== null);
    expect(slotIdx).toBeGreaterThanOrEqual(0);
    expect(applyCommand(state, 0, { type: "BUY", shopSlotIndex: slotIdx }, prng, gameData).ok).toBe(true);
    const unit = player.bench[0]!;
    const equipRes = applyCommand(state, 0, { type: "EQUIP", unitUid: unit.uid, itemId }, prng, gameData);
    expect(equipRes.ok).toBe(true);
    expect(unit.items).toContain(itemId);
    expect(player.items).not.toContain(itemId);
  });
});
