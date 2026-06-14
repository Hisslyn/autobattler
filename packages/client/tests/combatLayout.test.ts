import { describe, it, expect } from "vitest";
import {
  Z_COMBAT_TILE,
  Z_COMBAT_HEADER,
  Z_RESOLUTION_BUTTON,
  Z_RESOLUTION_CONTROL,
} from "../src/combatLayout.js";

// Regression guard for the "stray text behind the hexes during combat" bug:
// the combat header was added to the sortable combatLayer before the hex tiles,
// so at equal zIndex it rendered behind the board. The header must outrank tiles.
describe("combat layer z-order", () => {
  it("keeps the combat header strictly above the board tiles", () => {
    expect(Z_COMBAT_HEADER).toBeGreaterThan(Z_COMBAT_TILE);
  });

  it("keeps resolution controls above the board tiles", () => {
    expect(Z_RESOLUTION_BUTTON).toBeGreaterThan(Z_COMBAT_TILE);
    expect(Z_RESOLUTION_CONTROL).toBeGreaterThan(Z_COMBAT_TILE);
  });
});
