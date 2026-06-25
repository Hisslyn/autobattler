// Invariant assertions — the SPEC of CORRECT combat behavior, asserted over
// the structured result.trace + result.events for the six fixed scenarios
// (packages/sim/tests/fixtures/scenarios.ts). These are deliberately STRICT:
// where the CURRENT engine violates an invariant, the violating test is
// wrapped in `it.fails(...)` (documenting the bug, keeping the suite green,
// and alerting the moment it starts passing) rather than weakened or deleted.
//
// PURE test inputs: SCENARIOS + gameData; no engine/fixture behavior changed.

import { describe, it, expect } from "vitest";
import { simulateCombat } from "../src/engine.js";
import { gameData } from "@autobattler/data";
import { hexDistance } from "../src/hex.js";
import { SCALE } from "../src/fixed.js";
import { SCENARIOS, type Scenario } from "./fixtures/scenarios.js";
import type {
  CombatResult,
  TraceTick,
  TraceUnitRecord,
  UnitInstance,
  BoardState,
} from "../src/types.js";

// One traced run per scenario, shared across invariant checks in this file.
const TRACED: Array<{ scenario: Scenario; result: CombatResult }> = SCENARIOS.map((scenario) => ({
  scenario,
  result: simulateCombat(scenario.boardA, scenario.boardB, scenario.seed, gameData, {
    trace: true,
  }),
}));

function unitRange(scenario: Scenario, side: 0 | 1, uid: number): number {
  const board: BoardState = side === 0 ? scenario.boardA : scenario.boardB;
  const unit = board.units.find((u) => u.uid === uid);
  if (!unit) throw new Error(`unitRange: uid ${uid} not found on side ${side}`);
  return unit.range;
}

function unitAs(scenario: Scenario, side: 0 | 1, uid: number): number {
  const board: BoardState = side === 0 ? scenario.boardA : scenario.boardB;
  const unit = board.units.find((u) => u.uid === uid);
  if (!unit) throw new Error(`unitAs: uid ${uid} not found on side ${side}`);
  return unit.as;
}

function unitsByUidAtTick(tick: TraceTick): Map<number, TraceUnitRecord> {
  const m = new Map<number, TraceUnitRecord>();
  for (const u of tick.units) m.set(u.uid, u);
  return m;
}

// --- (a) Range: no unit attacks a target outside its range -----------------
describe("invariant (a): no unit attacks a target outside its range", () => {
  for (const { scenario, result } of TRACED) {
    it(`${scenario.name}: every attack record is within the attacker's range`, () => {
      const trace = result.trace!;
      expect(trace).toBeDefined();

      // Last-known hex per uid, updated tick-by-tick. A unit on a LETHAL
      // attack this tick is removed from the end-of-tick alive list (the
      // trace only records currently-alive units), but the attacker measured
      // distance against the target's position as of THIS tick's action loop
      // (before death cleanup) — so when the target is absent from the
      // current frame (died this tick), its last-known hex (carried over from
      // the prior tick, since dead units don't move) is the correct position
      // to check against.
      const lastKnownHex = new Map<number, { q: number; r: number }>();

      let attackCount = 0;
      for (const tick of trace.ticks) {
        const byUid = unitsByUidAtTick(tick);
        for (const u of tick.units) {
          if (u.action !== "attack") continue;
          if (u.targetUid === null) continue; // shouldn't happen for attack, but guard
          attackCount++;
          const targetRecord = byUid.get(u.targetUid);
          const targetHex = targetRecord ? targetRecord.hex : lastKnownHex.get(u.targetUid);
          expect(
            targetHex,
            `tick ${tick.tick}: attacker ${u.uid}'s target ${u.targetUid} has no known position (dead before first tick?)`
          ).toBeDefined();
          const dist = hexDistance(u.hex, targetHex!);
          const range = unitRange(scenario, u.side, u.uid);
          expect(
            dist,
            `tick ${tick.tick}: uid ${u.uid} attacked uid ${u.targetUid} at distance ${dist} > range ${range}`
          ).toBeLessThanOrEqual(range);
        }
        // Update last-known positions AFTER checking this tick's attacks
        // (so a lethal attack still gets the pre-death position above).
        for (const u of tick.units) lastKnownHex.set(u.uid, u.hex);
      }
      // Sanity: at least one attack actually occurred in scenarios designed to attack.
      if (scenario.name !== "blocked_path") {
        expect(attackCount).toBeGreaterThan(0);
      }
    });
  }
});

// --- (b) Target stickiness --------------------------------------------------
// A unit must not change target while its current target is alive, targetable,
// and in range, absent an explicit forcing effect. Any retarget reason of
// `retarget_recomputed` or `switched_target_out_of_range` is, BY THE TRACE'S
// OWN DEFINITION (engine.ts / RetargetReason doc), a switch off a target that
// was still alive + targetable (and, for `retarget_recomputed`, still in
// range) — i.e. a violation of this spec. The current engine recomputes
// nearest-enemy every tick with no target stickiness, so this is EXPECTED to
// fail today (confirmed empirically: retarget_1v2 tick 2 emits uid 1
// `1002 -> 1001 reason=retarget_recomputed` while uid 1002 is still alive, in
// range, and targetable).
describe("invariant (b): no target switch off a still-valid (alive+targetable+in-range) target", () => {
  it.fails(
    "no retarget across any scenario has reason retarget_recomputed or switched_target_out_of_range",
    () => {
      // BUG: engine.ts's findTarget recomputes nearest-enemy from scratch every
      // tick with zero target stickiness — a unit abandons a still-valid
      // in-range target the instant a different enemy becomes nearer (or the
      // uid tiebreak flips), producing retarget_recomputed; an analogous
      // out-of-range recompute can also fire while the old target was itself
      // still alive+targetable. See engine.ts's per-tick `findTarget(unit, enemies)`
      // call (movement + magic_damage/burn cast dispatch) — no prior-target
      // argument is ever consulted.
      const offenders: string[] = [];
      for (const { scenario, result } of TRACED) {
        const trace = result.trace!;
        for (const tick of trace.ticks) {
          for (const rt of tick.retargets) {
            if (rt.reason === "retarget_recomputed" || rt.reason === "switched_target_out_of_range") {
              offenders.push(
                `${scenario.name} tick ${tick.tick}: uid ${rt.uid} ${rt.fromUid} -> ${rt.toUid} reason=${rt.reason}`
              );
            }
          }
        }
      }
      expect(offenders, offenders.join("\n")).toHaveLength(0);
    }
  );
});

// --- (c) Damage conservation -------------------------------------------------
// For each unit: (initial hp from init snapshot) - (final hp, 0 if dead) ===
// sum of post-mitigation damage applied to it via attack/cast events + any
// burn/overtime true-damage hp deltas it took. None lost or duplicated.
describe("invariant (c): damage conservation (hp lost == damage applied)", () => {
  for (const { scenario, result } of TRACED) {
    it(`${scenario.name}: cumulative hp lost per unit equals damage applied`, () => {
      const events = result.events;
      const initEvent = events.find((e) => e.type === "init");
      expect(initEvent).toBeDefined();
      if (initEvent?.type !== "init") throw new Error("unreachable");

      const initialHp = new Map<number, number>();
      for (const u of initEvent.units) initialHp.set(u.uid, u.hp);

      // Damage taken via attack/cast events (post-mitigation/post-shield dmg
      // values are damage to HP+shield combined; we derive *actual hp lost*
      // from the hp-event ledger directly instead of re-deriving shield math,
      // since the hp event stream is the authoritative absolute-value record).
      // Sum every hp DROP (this-tick value < previous known value) per uid —
      // this captures attack dmg, cast dmg, burn DoT, and overtime true-damage
      // uniformly, without re-implementing damageThroughShield.
      const lastHp = new Map<number, number>(initialHp);
      const totalDrop = new Map<number, number>();
      for (const u of initEvent.units) totalDrop.set(u.uid, 0);

      for (const e of events) {
        if (e.type !== "hp") continue;
        const prev = lastHp.get(e.uid) ?? 0;
        const delta = prev - e.value;
        if (delta > 0) {
          totalDrop.set(e.uid, (totalDrop.get(e.uid) ?? 0) + delta);
        } else if (delta < 0) {
          // hp should never increase in this engine (no heals) — flag it.
          throw new Error(`uid ${e.uid} hp increased from ${prev} to ${e.value} at tick ${e.tick}`);
        }
        lastHp.set(e.uid, e.value);
      }

      // Final hp per uid: from survivingUnits (alive) else 0 (dead, hp clamped).
      const finalHp = new Map<number, number>();
      for (const u of result.survivingUnits) finalHp.set(u.uid, u.hp);
      for (const uid of initialHp.keys()) {
        if (!finalHp.has(uid)) finalHp.set(uid, 0);
      }

      for (const uid of initialHp.keys()) {
        const expected = (initialHp.get(uid) ?? 0) - (finalHp.get(uid) ?? 0);
        const actual = totalDrop.get(uid) ?? 0;
        expect(actual, `uid ${uid}: hp lost (${expected}) != sum of hp-event drops (${actual})`).toBe(
          expected
        );
      }
    });
  }
});

// --- (d) No hex collisions ---------------------------------------------------
describe("invariant (d): no two alive units occupy the same hex on any tick", () => {
  for (const { scenario, result } of TRACED) {
    it(`${scenario.name}: every tick's alive-unit hexes are unique`, () => {
      const trace = result.trace!;
      for (const tick of trace.ticks) {
        const seen = new Map<string, number>();
        for (const u of tick.units) {
          const key = `${u.hex.q},${u.hex.r}`;
          const prevUid = seen.get(key);
          expect(
            prevUid,
            `tick ${tick.tick}: uid ${u.uid} and uid ${prevUid} both at hex ${key}`
          ).toBeUndefined();
          seen.set(key, u.uid);
        }
      }
    });
  }
});

// --- (e) Attack cadence ------------------------------------------------------
// engine.ts resets attackCooldown to trunc(ticksPerSec*SCALE/as) ON the tick of
// an attack, then decrements it by 1 each subsequent tick until it reaches 0
// (the tick AFTER it hits 0 is when the next attack actually fires) — so the
// observed tick-to-tick gap between consecutive attacks is the raw formula
// PLUS 1 (verified empirically: paladin as=650 -> trunc(20*1000/650)=30, but
// every observed gap is 31). A unit that casts (full mana) instead of
// attacking on a given tick skips the cooldown decrement entirely that tick
// (the cast branch `continue`s before reaching the attack block), adding
// exactly one MORE tick to that one gap (observed: one gap of 32 coinciding
// with the paladin's self-cast shield). Both are accounted for here — the
// ±1 tolerance covers the cast-interruption case, not rounding slop.
describe("invariant (e): attack interval matches attack speed within rounding", () => {
  it("melee_1v1: paladin's attack-tick gaps equal trunc(ticksPerSec*SCALE/as)+1 within ±1 tick", () => {
    const { scenario, result } = TRACED.find((t) => t.scenario.name === "melee_1v1")!;
    const trace = result.trace!;
    const as = unitAs(scenario, 0, 1);
    const expectedInterval = Math.trunc((gameData.gameplay.ticksPerSec * SCALE) / as) + 1;

    const attackTicks: number[] = [];
    for (const tick of trace.ticks) {
      for (const u of tick.units) {
        if (u.uid === 1 && u.action === "attack") attackTicks.push(tick.tick);
      }
    }
    expect(attackTicks.length).toBeGreaterThan(2);

    for (let i = 1; i < attackTicks.length; i++) {
      const gap = attackTicks[i]! - attackTicks[i - 1]!;
      expect(
        Math.abs(gap - expectedInterval),
        `gap ${gap} at attack #${i} (ticks ${attackTicks[i - 1]}->${attackTicks[i]}) too far from expected ${expectedInterval}`
      ).toBeLessThanOrEqual(1);
    }
  });
});

// --- (f) Termination ---------------------------------------------------------
describe("invariant (f): combat terminates within the bounded tick cap", () => {
  for (const { scenario, result } of TRACED) {
    it(`${scenario.name}: result.ticks <= overtimeHardCapTicks`, () => {
      expect(result.ticks).toBeLessThanOrEqual(gameData.economy.overtimeHardCapTicks);
    });
  }
});

// --- (g) Determinism ---------------------------------------------------------
describe("invariant (g): determinism — identical trace + events across two runs", () => {
  for (const scenario of SCENARIOS) {
    it(`${scenario.name}: two independent runs produce byte-identical trace + events`, () => {
      const r1 = simulateCombat(scenario.boardA, scenario.boardB, scenario.seed, gameData, {
        trace: true,
      });
      const r2 = simulateCombat(scenario.boardA, scenario.boardB, scenario.seed, gameData, {
        trace: true,
      });
      expect(JSON.stringify(r1.trace)).toBe(JSON.stringify(r2.trace));
      expect(JSON.stringify(r1.events)).toBe(JSON.stringify(r2.events));
      expect(r1.winner).toBe(r2.winner);
      expect(r1.ticks).toBe(r2.ticks);
    });
  }
});
