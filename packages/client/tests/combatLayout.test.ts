import { describe, it, expect } from "vitest";
import {
  Z_COMBAT_TILE,
  Z_COMBAT_HEADER,
  Z_RESOLUTION_OVERLAY,
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

  // Regression guard for the "PvE · …Resolution… · Creeps" garble: a fast PvE
  // round can hit RESOLUTION before the planning→combat fade finishes, so the
  // resolution overlay surface MUST outrank the combat header (and its own
  // controls outrank the surface) — the round-result modal always wins, never
  // co-rendering with a leftover combat header at the same position.
  it("keeps the resolution overlay strictly above the combat header", () => {
    expect(Z_RESOLUTION_OVERLAY).toBeGreaterThan(Z_COMBAT_HEADER);
  });

  it("keeps resolution controls above the resolution surface", () => {
    expect(Z_RESOLUTION_CONTROL).toBeGreaterThan(Z_RESOLUTION_OVERLAY);
    expect(Z_RESOLUTION_BUTTON).toBeGreaterThan(Z_RESOLUTION_OVERLAY);
  });
});
