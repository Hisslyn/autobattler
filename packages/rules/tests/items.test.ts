import { describe, it, expect } from "vitest";
import { gameData } from "@autobattler/data";
import { createMatch, advancePhase } from "../src/match.js";
import { applyCommand } from "../src/commands.js";
import { mulberry32 } from "@autobattler/sim/src/prng.js";

describe("PvE loot drops", () => {
  it("awards pveBaseGold and only valid inventory item ids on a PvE round", () => {
    const state = createMatch(11, gameData);
    expect(state.round).toBe(1); // round 1 is PvE

    // PLANNING → RESOLUTION runs the PvE round and applies gold + loot orbs.
    advancePhase(state, gameData);

    const validIds = new Set(gameData.items.map((i) => i.id));
    for (const player of state.players) {
      // Every alive player gets at least the flat PvE base gold.
      expect(player.gold).toBeGreaterThanOrEqual(gameData.economy.pveBaseGold);
      for (const id of player.items) {
        expect(validIds.has(id)).toBe(true);
      }
    }
  });

  it("a granted item equips onto a unit and leaves the inventory", () => {
    const state = createMatch(11, gameData);
    advancePhase(state, gameData); // PLANNING → RESOLUTION (PvE drops)
    advancePhase(state, gameData); // RESOLUTION → PLANNING

    const prng = mulberry32(3);
    const player = state.players[0]!;
    // Seed a known component so the test is independent of loot RNG.
    player.items = ["iron_sword"];
    const itemId = "iron_sword";
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
