import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { gameData } from "@autobattler/data";
import { createMatch, advancePhase, isMatchOver } from "@autobattler/rules";
import { applyAiCommands } from "@autobattler/rules/src/ai.js";
import { mulberry32 } from "@autobattler/sim/src/prng.js";
import {
  isPveRound,
  pveStageForRound,
  buildMobBoard,
  boardToCombatState,
  derivePairingSeed,
} from "@autobattler/rules/src/rounds.js";
import { simulateCombat } from "@autobattler/sim";
import { stateAtTick } from "../src/combat/reducer.js";
import { LocalDriver } from "../src/driver.js";
import type { DriverEvent } from "../src/driver.js";

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

describe("LocalDriver phase flow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("3 rounds: RESOLUTION emitted while in resolution, pauses, then PLANNING with a fresh timer", () => {
    const driver = new LocalDriver(7);
    const phases: Array<{ phase: string; round: number }> = [];
    const phaseAtEmit: string[] = [];
    driver.on((e: DriverEvent) => {
      if (e.type === "phase_change") {
        phases.push({ phase: e.phase, round: e.round });
        phaseAtEmit.push(driver.getState().phase);
      }
    });

    driver.startPlanning();

    const resolutionMs = gameData.economy.resolutionSeconds * 1000;
    for (let round = 1; round <= 3; round++) {
      // Currently planning with a running 30s timer
      expect(driver.getState().phase).toBe("PLANNING");
      expect(driver.getState().round).toBe(round);
      expect(driver.getPlanningTimeLeft()).toBeGreaterThan(29_000);

      driver.ready();

      // State must actually be in RESOLUTION while RESOLUTION is current
      expect(driver.getState().phase).toBe("RESOLUTION");

      // Scene reports playback completion before RESOLUTION is emitted
      driver.combatPlaybackDone();

      // Resolution pause: not yet advanced just before the timeout...
      vi.advanceTimersByTime(resolutionMs - 1);
      expect(driver.getState().phase).toBe("RESOLUTION");
      // ...and advanced to the next planning right after it
      vi.advanceTimersByTime(1);
      expect(driver.getState().phase).toBe("PLANNING");
      expect(driver.getState().round).toBe(round + 1);
    }

    // Event sequence per round: PLANNING, COMBAT, RESOLUTION (×3) + final PLANNING
    const expected = [
      "PLANNING", "COMBAT", "RESOLUTION",
      "PLANNING", "COMBAT", "RESOLUTION",
      "PLANNING", "COMBAT", "RESOLUTION",
      "PLANNING",
    ];
    expect(phases.map((p) => p.phase)).toEqual(expected);

    // Every RESOLUTION event was emitted while the state was in RESOLUTION,
    // and every PLANNING event while the state was in PLANNING
    for (let i = 0; i < phases.length; i++) {
      if (phases[i]!.phase === "RESOLUTION") expect(phaseAtEmit[i]).toBe("RESOLUTION");
      if (phases[i]!.phase === "PLANNING") expect(phaseAtEmit[i]).toBe("PLANNING");
    }
  });

  it("resolution overlay teardown path runs: every RESOLUTION is followed by a PLANNING phase event", () => {
    // MatchScene destroys the resolution overlay in onPlanningStart, which is
    // driven solely by the emitted `phase_change: PLANNING` event — so the
    // teardown path runs iff PLANNING follows each RESOLUTION.
    const driver = new LocalDriver(11);
    const phases: string[] = [];
    driver.on((e: DriverEvent) => {
      if (e.type === "phase_change") phases.push(e.phase);
    });

    driver.startPlanning();
    for (let round = 0; round < 3; round++) {
      driver.ready();
      driver.combatPlaybackDone(); // scene playback finished
      driver.advanceFromResolution(); // Continue button path
    }

    for (let i = 0; i < phases.length; i++) {
      if (phases[i] === "RESOLUTION") {
        expect(phases[i + 1], `RESOLUTION at index ${i} must be followed by PLANNING`).toBe("PLANNING");
      }
    }
    expect(phases.filter((p) => p === "RESOLUTION").length).toBe(3);
  });

  it("Continue (advanceFromResolution) skips the pause and restarts planning", () => {
    const driver = new LocalDriver(9);
    driver.startPlanning();
    driver.ready();
    expect(driver.getState().phase).toBe("RESOLUTION");

    driver.combatPlaybackDone();
    driver.advanceFromResolution();
    expect(driver.getState().phase).toBe("PLANNING");
    expect(driver.getState().round).toBe(2);
    expect(driver.getPlanningTimeLeft()).toBeGreaterThan(29_000);

    // The cancelled resolution timer must not double-advance
    vi.advanceTimersByTime(60_000); // fires the planning timer → ready() → next round
    expect(driver.getState().phase).not.toBe("COMBAT");
  });

  it("PvE round (round 1): exposes the stage, a PvE combat result, and seeded loot orbs", () => {
    // Round 1 is PvE under the stage formula (stage 1, all rounds PvE).
    expect(isPveRound(1)).toBe(true);
    const driver = new LocalDriver(21);
    driver.startPlanning();
    expect(driver.isPveRound()).toBe(true);
    expect(typeof driver.getPveStageName()).toBe("string");

    driver.ready(); // runs the PvE round
    expect(driver.getState().phase).toBe("RESOLUTION");

    // PvE carries no pairing but still produces a combat result for playback.
    expect(driver.getMyPairing()).toBeNull();
    expect(driver.getMyCombatResult()).not.toBeNull();

    // Loot orbs are seeded-deterministic; round 1 drops at least one orb.
    const orbs = driver.getMyLootOrbs();
    expect(orbs.length).toBeGreaterThan(0);

    // A second same-seed run yields byte-identical orbs (determinism).
    const d2 = new LocalDriver(21);
    d2.startPlanning();
    d2.ready();
    expect(JSON.stringify(d2.getMyLootOrbs())).toBe(JSON.stringify(orbs));
  });

  it("PvE round: mob board reaching the driver is non-empty and renders (regression: empty PvE board)", () => {
    // Regression for: PvE mobs not rendering. LocalDriver must expose a populated
    // opponent (mob) board AND a combat result whose event log carries side-1
    // (mob) units, so the combat-playback render draws the creeps.
    const driver = new LocalDriver(33);
    driver.startPlanning();
    expect(driver.isPveRound()).toBe(true);
    driver.ready();

    const oppBoard = driver.getMyOpponentBoard();
    expect(oppBoard, "PvE opponent (mob) board must reach the driver").not.toBeNull();
    expect(oppBoard!.filter((u) => u != null).length).toBeGreaterThan(0);

    const result = driver.getMyCombatResult()!;
    expect(result.events.length).toBeGreaterThan(0);
    const mobsAtStart = [...stateAtTick(result.events, 0).units.values()].filter((u) => u.side === 1);
    expect(mobsAtStart.length).toBeGreaterThan(0);

    // Mob defIds must be absent from data.units (so UnitToken picks the mob ring)
    // and present in data.mobs after the {stage, roundInStage} re-key.
    const unitIds = new Set(gameData.units.map((u) => u.id));
    const mobIds = new Set(gameData.mobs.mobs.map((m) => m.id));
    for (const u of mobsAtStart) {
      expect(unitIds.has(u.defId)).toBe(false);
      expect(mobIds.has(u.defId)).toBe(true);
    }
  });

  it("PvE round: NetDriver-equivalent local derivation (COMBAT_START) yields a non-empty mob board", () => {
    // Mirrors the NetDriver COMBAT_START PvE branch: online a PvE round carries no
    // pairing, so the client must derive the mob board itself from the round seed.
    // Asserts that derivation (the exact shared helpers NetDriver now uses) is
    // populated for every PvE stage under the re-keyed mobs.json schema.
    for (const round of [1, 2, 3, 4, 7, 10]) {
      if (!isPveRound(round)) continue;
      const stage = pveStageForRound(round, gameData);
      expect(stage, `round ${round} must resolve a PvE stage`).not.toBeNull();
      const state = createMatch(1234, gameData);
      state.round = round;
      const mobBoard = buildMobBoard(state, stage!, gameData);
      expect(mobBoard.units.length, `round ${round} mob board`).toBeGreaterThan(0);

      // The combat the client sims for rendering must contain the mob init events.
      const boardA = boardToCombatState(state.players[0]!.board, 0);
      const result = simulateCombat(boardA, mobBoard, derivePairingSeed(state.lastRoundSeed, 0), gameData);
      const mobs = [...stateAtTick(result.events, 0).units.values()].filter((u) => u.side === 1);
      expect(mobs.length, `round ${round} mob init events`).toBeGreaterThan(0);
    }
  });

  it("RESOLUTION is held until combatPlaybackDone; duplicate calls are no-ops", () => {
    const driver = new LocalDriver(13);
    const phases: string[] = [];
    driver.on((e: DriverEvent) => {
      if (e.type === "phase_change") phases.push(e.phase);
    });

    driver.startPlanning();
    driver.ready();

    // Combat ran, but RESOLUTION must wait for the scene's playback signal
    expect(driver.getState().phase).toBe("RESOLUTION");
    expect(phases).toEqual(["PLANNING", "COMBAT"]);
    // Continue is ignored while playback is pending
    driver.advanceFromResolution();
    expect(driver.getState().round).toBe(1);

    driver.combatPlaybackDone();
    expect(phases[phases.length - 1]).toBe("RESOLUTION");
    driver.combatPlaybackDone();
    expect(phases.filter((p) => p === "RESOLUTION").length).toBe(1);
  });
});
