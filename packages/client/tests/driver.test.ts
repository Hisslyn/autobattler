import { describe, it, expect } from "vitest";
import { gameData } from "@autobattler/data";
import { createMatch, advancePhase, isMatchOver } from "@autobattler/rules";
import { applyAiCommands } from "@autobattler/rules/src/ai.js";
import { mulberry32 } from "@autobattler/sim/src/prng.js";

describe("headless AI match", () => {
  it("completes a full match without error", () => {
    const seed = 42;
    const prng = mulberry32(seed);
    const state = createMatch(seed, gameData);

    let safeguard = 0;
    while (!isMatchOver(state) && safeguard < 10000) {
      if (state.phase === "PLANNING") {
        for (const player of state.players) {
          if (!player.alive) continue;
          applyAiCommands(state, player.id, prng, gameData);
        }
      }
      advancePhase(state, gameData);
      safeguard++;
    }

    expect(isMatchOver(state)).toBe(true);
    const alive = state.players.filter((p) => p.alive);
    expect(alive.length).toBeLessThanOrEqual(1);
    expect(safeguard).toBeLessThan(10000);
  });
});
