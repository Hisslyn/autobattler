import { describe, it, expect } from "vitest";
import { gameData } from "@autobattler/data";
import { createMatch } from "../src/match.js";
import { mulberry32 } from "@autobattler/sim/src/prng.js";
import { rollShop } from "../src/shop.js";

describe("shop odds sanity", () => {
  it("level 1 shop only rolls tier-1 units", () => {
    const state = createMatch(42, gameData);
    const player = state.players[0]!;
    player.level = 1;
    const prng = mulberry32(99);

    for (let run = 0; run < 50; run++) {
      rollShop(state, 0, prng, gameData);
      for (const slot of player.shop) {
        if (slot) expect(slot.tier).toBe(1);
      }
    }
  });

  it("level 9 shop can roll tier 3+ units", () => {
    const state = createMatch(42, gameData);
    const player = state.players[0]!;
    player.level = 9;
    const prng = mulberry32(1);

    let sawHighTier = false;
    for (let run = 0; run < 200 && !sawHighTier; run++) {
      rollShop(state, 0, prng, gameData);
      for (const slot of player.shop) {
        if (slot && slot.tier >= 3) sawHighTier = true;
      }
    }
    expect(sawHighTier).toBe(true);
  });

  it("shop has correct number of slots", () => {
    const state = createMatch(1, gameData);
    expect(state.players[0]!.shop.length).toBe(gameData.economy.shopSlots);
  });
});
