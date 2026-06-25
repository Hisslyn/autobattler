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
  previewPveStage,
} from "@autobattler/rules/src/rounds.js";
import { simulateCombat } from "@autobattler/sim";
import { stateAtTick } from "../src/combat/reducer.js";
import { LocalDriver } from "../src/driver.js";
import { NetDriver } from "../src/netDriver.js";
import type { DriverEvent } from "../src/driver.js";
import type { UnitInstance } from "@autobattler/sim/src/types.js";
import { inventoryModel } from "../src/itemModel.js";

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

      // Planning runs its full duration; only the 30s timer advances it.
      vi.advanceTimersByTime(30_000);

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
      vi.advanceTimersByTime(30_000); // planning runs full duration → combat
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
    vi.advanceTimersByTime(30_000);
    expect(driver.getState().phase).toBe("RESOLUTION");

    driver.combatPlaybackDone();
    driver.advanceFromResolution();
    expect(driver.getState().phase).toBe("PLANNING");
    expect(driver.getState().round).toBe(2);
    expect(driver.getPlanningTimeLeft()).toBeGreaterThan(29_000);

    // The cancelled resolution timer must not double-advance
    vi.advanceTimersByTime(60_000); // fires the planning timer → next round
    expect(driver.getState().phase).not.toBe("COMBAT");
  });

  it("PvE round (round 1): exposes the stage, a PvE combat result, and seeded loot orbs", () => {
    // Round 1 is PvE under the stage formula (stage 1, all rounds PvE).
    expect(isPveRound(1)).toBe(true);
    const driver = new LocalDriver(21);
    driver.startPlanning();
    expect(driver.isPveRound()).toBe(true);
    expect(typeof driver.getPveStageName()).toBe("string");

    vi.advanceTimersByTime(30_000); // planning elapses → runs the PvE round
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
    vi.advanceTimersByTime(30_000);
    expect(JSON.stringify(d2.getMyLootOrbs())).toBe(JSON.stringify(orbs));
  });

  it("PvE round: playback is HELD (cap reflects PvE combat duration, not a 0ms cap that fires instantly)", () => {
    // Regression for: PvE mob board flashes and vanishes in Practice. PvE has no
    // pairing, so the OLD cap used getPairingFor(...).result === null → capMs=0,
    // firing combatPlaybackDone() on the next macrotask and tearing the combat
    // view down on frame 1. The cap must use the PvE-aware combat result so the
    // RESOLUTION phase_change is NOT emitted until the scene reports playback
    // done (or the real 1x-duration cap elapses).
    const driver = new LocalDriver(21);
    expect(driver.isPveRound()).toBe(true);
    const phases: string[] = [];
    driver.on((e: DriverEvent) => {
      if (e.type === "phase_change") phases.push(e.phase);
    });
    driver.startPlanning();
    vi.advanceTimersByTime(30_000);

    // COMBAT was emitted; RESOLUTION must NOT yet be emitted.
    expect(phases).toEqual(["PLANNING", "COMBAT"]);

    // A PvE round must still produce a playable combat result (mob init events).
    const result = driver.getMyCombatResult()!;
    expect(result.events.length).toBeGreaterThan(0);

    // The cap timer must NOT have fired synchronously / on the next macrotask
    // (the old bug: getPairingFor(...).result === null → capMs=0 → instant
    // teardown of the mob board). Flushing the microtask/macrotask queue at 0ms
    // must not emit RESOLUTION; only the scene's combatPlaybackDone() (or the
    // real >0 cap) may release it.
    vi.advanceTimersByTime(0);
    expect(phases).not.toContain("RESOLUTION");

    // The scene reporting playback done releases RESOLUTION (normal path).
    driver.combatPlaybackDone();
    expect(phases[phases.length - 1]).toBe("RESOLUTION");
  });

  it("PvE round: mob board reaching the driver is non-empty and renders (regression: empty PvE board)", () => {
    // Regression for: PvE mobs not rendering. LocalDriver must expose a populated
    // opponent (mob) board AND a combat result whose event log carries side-1
    // (mob) units, so the combat-playback render draws the creeps.
    const driver = new LocalDriver(33);
    driver.startPlanning();
    expect(driver.isPveRound()).toBe(true);
    vi.advanceTimersByTime(30_000);

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

  it("planning duration is a full 30s for every round, regardless of adjacent PvE status", () => {
    // Regression: user reported never observing Planning before a PvE round.
    // Ground truth — drive rounds 1-5 (PvE rounds 1-3, then PvP) and assert the
    // planning timer is always the full 30s and never short-circuited by the
    // PvE-ness of the current OR the previous round.
    const driver = new LocalDriver(21);
    const planningStarts: Array<{ round: number; pve: boolean; timeLeft: number }> = [];
    driver.on((e: DriverEvent) => {
      if (e.type === "phase_change" && e.phase === "PLANNING") {
        planningStarts.push({
          round: e.round,
          pve: driver.isPveRound(),
          timeLeft: driver.getPlanningTimeLeft(),
        });
      }
    });

    driver.startPlanning();
    for (let r = 1; r <= 5; r++) {
      expect(driver.getState().round).toBe(r);
      expect(driver.getState().phase).toBe("PLANNING");
      // Full 30s available at the very start of planning.
      expect(driver.getPlanningTimeLeft()).toBe(30_000);
      // 10s in, still planning, ~20s left (no early/auto advance for PvE).
      vi.advanceTimersByTime(10_000);
      expect(driver.getState().phase).toBe("PLANNING");
      expect(driver.getPlanningTimeLeft()).toBe(20_000);
      // The 30s timer fires on its own → ready() runs combat synchronously and
      // the state lands in RESOLUTION (the RESOLUTION *emit* is held for playback).
      vi.advanceTimersByTime(20_000);
      expect(driver.getState().phase).toBe("RESOLUTION");
      driver.combatPlaybackDone();
      vi.runOnlyPendingTimers(); // resolution pause → next planning
    }

    // PLANNING fires for round 1 (startPlanning) then each advance into rounds
    // 2-6 (the 5th iteration lands the match back in planning for round 6).
    expect(planningStarts.map((p) => p.round)).toEqual([1, 2, 3, 4, 5, 6]);
    // Rounds 1-3 are PvE, 4-6 are PvP — every one still started with a full 30s.
    expect(planningStarts.map((p) => p.pve)).toEqual([true, true, true, false, false, false]);
    for (const p of planningStarts) expect(p.timeLeft).toBe(30_000);
  });

  it("ready() mid-planning is a no-op; only the full 30s timer reaches RESOLUTION", () => {
    // Regression: READY no longer skips planning. Calling ready() at any point
    // during planning must leave the phase in PLANNING; advancing the full 30s
    // timer is the only path to RESOLUTION.
    const driver = new LocalDriver(5);
    driver.startPlanning();
    expect(driver.getState().phase).toBe("PLANNING");

    driver.ready();
    expect(driver.getState().phase).toBe("PLANNING");

    vi.advanceTimersByTime(15_000);
    driver.ready();
    expect(driver.getState().phase).toBe("PLANNING");

    // Just before the timer fires, still planning even after another ready().
    vi.advanceTimersByTime(14_999);
    driver.ready();
    expect(driver.getState().phase).toBe("PLANNING");

    // The final tick fires the timer → combat runs → RESOLUTION.
    vi.advanceTimersByTime(1);
    expect(driver.getState().phase).toBe("RESOLUTION");
  });

  it("RESOLUTION is held until combatPlaybackDone; duplicate calls are no-ops", () => {
    const driver = new LocalDriver(13);
    const phases: string[] = [];
    driver.on((e: DriverEvent) => {
      if (e.type === "phase_change") phases.push(e.phase);
    });

    driver.startPlanning();
    vi.advanceTimersByTime(30_000);

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

// Minimal WebSocket stub so a NetDriver can be constructed without a real
// connection — onopen never fires, so the driver stays inert and we inject its
// _state directly (getUpcomingPveBoard only reads state.round + state.phase).
class FakeWebSocket {
  static OPEN = 1;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(_url: string) {}
  send(): void {}
  close(): void {}
}

describe("getUpcomingPveBoard (PvE planning preview)", () => {
  beforeEach(() => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("LocalDriver exposes the upcoming creep board during a PvE planning phase", () => {
    // Round 1 is PvE; the driver opens in PLANNING.
    const driver = new LocalDriver(21);
    driver.startPlanning();
    expect(driver.isPveRound()).toBe(true);

    const board = driver.getUpcomingPveBoard();
    expect(board).not.toBeNull();
    expect(board!.units.length).toBeGreaterThan(0);
    // Preview uses disposable negative uids (never collides with real combat uids).
    expect(board!.units.every((u) => u.uid < 0)).toBe(true);
    // It is exactly what the pure rules accessor produces for this state.
    expect(JSON.stringify(board)).toBe(
      JSON.stringify(previewPveStage(driver.getState(), gameData))
    );
  });

  it("inline creep preview (getUpcomingPveBoard) tracks the round being planned for, not the previous round", () => {
    // The enemy half renders the upcoming creep board iff getUpcomingPveBoard() is
    // non-null. It must reflect the CURRENT round being planned (combat happens
    // AFTER planning), so a PvE round's planning shows creeps and the planning
    // AFTER a PvE round (round 4, PvP) does NOT — no off-by-one against the
    // just-finished round.
    vi.useFakeTimers();
    try {
      const driver = new LocalDriver(21);
      driver.startPlanning();

      const chipVisible = (): boolean => driver.getUpcomingPveBoard() !== null;

      // Rounds 1-3 are PvE → chip visible during each one's planning.
      for (const r of [1, 2, 3]) {
        expect(driver.getState().round).toBe(r);
        expect(isPveRound(r)).toBe(true);
        expect(chipVisible(), `round ${r} planning should render the inline creep preview`).toBe(true);
        vi.advanceTimersByTime(30_000); // planning elapses → combat
        driver.combatPlaybackDone();
        vi.runOnlyPendingTimers();
      }

      // Round 4 is PvP — the round AFTER a PvE round. The chip must be hidden
      // (it checks round 4's PvE-ness, not round 3's).
      expect(driver.getState().round).toBe(4);
      expect(isPveRound(4)).toBe(false);
      expect(chipVisible(), "round 4 (post-PvE) planning must NOT render the creep preview").toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reuses the pure previewPveStage (idempotent, no state mutation, no new rules logic)", () => {
    // The inline creep render reuses the already-built pure previewPveStage as-is
    // — calling it any number of times yields identical boards and never mutates
    // the match state (its negative preview uids are disposable, not drawn from
    // the pool / match uid namespace).
    const driver = new LocalDriver(21);
    driver.startPlanning();
    const stateBefore = JSON.stringify(driver.getState());

    const a = previewPveStage(driver.getState(), gameData);
    const b = previewPveStage(driver.getState(), gameData);
    const c = driver.getUpcomingPveBoard();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(c)).toBe(JSON.stringify(a));

    // Pure: repeated previews left the match state untouched.
    expect(JSON.stringify(driver.getState())).toBe(stateBefore);
  });

  it("LocalDriver returns null once out of the planning phase", () => {
    vi.useFakeTimers();
    try {
      const driver = new LocalDriver(21);
      driver.startPlanning();
      vi.advanceTimersByTime(30_000); // planning elapses → PvE round → COMBAT phase
      expect(driver.getState().phase).not.toBe("PLANNING");
      expect(driver.getUpcomingPveBoard()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("NetDriver derives the same preview client-side (no protocol round-trip)", () => {
    const local = new LocalDriver(21);
    local.startPlanning();
    const localBoard = local.getUpcomingPveBoard();
    expect(localBoard).not.toBeNull();

    const net = new NetDriver("ws://test");
    // Inject the minimal state the accessor reads (round + phase).
    (net as unknown as { _state: unknown })._state = { round: 1, phase: "PLANNING" };
    const netBoard = net.getUpcomingPveBoard();

    // Both drivers compute from the same pure rules accessor → identical boards.
    expect(JSON.stringify(netBoard)).toBe(JSON.stringify(localBoard));
  });

  it("NetDriver returns null on a non-PvE round and outside planning", () => {
    const net = new NetDriver("ws://test");
    const inject = (s: unknown): void => {
      (net as unknown as { _state: unknown })._state = s;
    };

    inject({ round: 4, phase: "PLANNING" }); // round 4 is PvP
    expect(isPveRound(4)).toBe(false);
    expect(net.getUpcomingPveBoard()).toBeNull();

    inject({ round: 1, phase: "COMBAT" }); // PvE round, wrong phase
    expect(net.getUpcomingPveBoard()).toBeNull();

    inject(null); // no state yet
    expect(net.getUpcomingPveBoard()).toBeNull();
  });
});

// ── Item drag → EQUIP command path (shared by the item bar AND the tab-2 browse) ──
// Both the main item bar and the landscape tab-2 browse render the player's
// inventory via inventoryModel and drag a chip → startDragItem → tryEquip →
// driver.playerCommand({type:"EQUIP", unitUid, itemId}). The scene is Pixi/WebGL
// and not headless-testable, so we exercise the one command path both sources
// funnel into and assert it applies exactly once (the "no double-handling" guard).
describe("item drag EQUIP command path", () => {
  const COMPONENT = "iron_sword"; // a loose component in items.json
  const def = gameData.units[0]!;

  function benchUnit(uid: number): UnitInstance {
    return {
      uid,
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
  }

  it("an EQUIP issued the way both sources issue it moves the item onto the unit", () => {
    const driver = new LocalDriver(7);
    driver.startPlanning();
    const me = driver.getState().players[driver.seatIndex]!;
    me.items.length = 0; // clear the practice-mode all-items seed for a known baseline
    const unit = benchUnit(9999);
    me.bench[me.bench.indexOf(null)] = unit;
    me.items.push(COMPONENT);

    // The inventory model both the bar and the tab-2 browse consume sees the item.
    const inv = inventoryModel(me.items, gameData);
    const entry = inv.find((e) => e.id === COMPONENT)!;
    expect(entry).toBeDefined();

    // tryEquip's exact command (unitUid + itemId from the dragged InventoryEntry).
    const res = driver.playerCommand({ type: "EQUIP", unitUid: unit.uid, itemId: entry.id });
    expect(res.ok).toBe(true);
    expect(unit.items).toEqual([COMPONENT]);
    expect(me.items.includes(COMPONENT)).toBe(false);
  });

  it("the same item is consumed once — a second identical EQUIP fails (no double-handling)", () => {
    const driver = new LocalDriver(7);
    driver.startPlanning();
    const me = driver.getState().players[driver.seatIndex]!;
    me.items.length = 0; // clear the practice-mode all-items seed for a known baseline
    const unit = benchUnit(9998);
    me.bench[me.bench.indexOf(null)] = unit;
    me.items.push(COMPONENT);

    const first = driver.playerCommand({ type: "EQUIP", unitUid: unit.uid, itemId: COMPONENT });
    expect(first.ok).toBe(true);

    // Whether the gesture originated in the bar or the tab-2 browse, the item is
    // already consumed — re-issuing the same EQUIP is rejected, never applied twice.
    const second = driver.playerCommand({ type: "EQUIP", unitUid: unit.uid, itemId: COMPONENT });
    expect(second).toEqual({ ok: false, error: "ITEM_NOT_FOUND" });
    expect(unit.items).toEqual([COMPONENT]); // still exactly one copy
  });
});
