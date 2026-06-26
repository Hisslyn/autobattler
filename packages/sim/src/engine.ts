import { mulberry32 } from "./prng.js";
import { fmul, SCALE, TICK_HZ, secondsToTicks } from "./fixed.js";
import { hexDistance, hexAstar, COLS } from "./hex.js";
import type { HexCoord } from "./hex.js";
import type {
  BoardState,
  CombatEvent,
  CombatResult,
  CombatTrace,
  RetargetReason,
  StatusEffect,
  TraceTick,
  TraceUnitRecord,
  UnitInstance,
} from "./types.js";
import type { GameData } from "@autobattler/data";

/** Opt-in simulateCombat options. Default (undefined) = byte-identical behavior. */
export interface SimulateOptions {
  /** When true, collect a behavior-neutral CombatTrace onto the result. */
  trace?: boolean;
}

/**
 * Transient per-unit observation accumulated DURING a single tick's action loop
 * (trace mode only). Never attached to UnitInstance; never affects cloning.
 */
interface TickObservation {
  targetUid: number | null;
  moved: boolean;
  attacked: boolean;
  cast: boolean;
  damageDealt: number;
}

function hexKey(q: number, r: number): number {
  return r * COLS + q;
}

function mitigate(rawDamage: number, resist: number, mitigationBase: number): number {
  return Math.max(1, rawDamage - Math.trunc(rawDamage * resist / (mitigationBase + resist)));
}

function findTarget(unit: UnitInstance, enemies: UnitInstance[]): UnitInstance | undefined {
  if (enemies.length === 0) return undefined;
  let best = enemies[0]!;
  let bestDist = hexDistance(unit.pos, best.pos);
  for (let i = 1; i < enemies.length; i++) {
    const e = enemies[i]!;
    const d = hexDistance(unit.pos, e.pos);
    if (d < bestDist || (d === bestDist && e.uid < best.uid)) {
      best = e;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Nearest enemy the unit can actually engage: an enemy is REACHABLE if it is
 * already in range OR an A* path toward it exists (around the `occupied` set).
 * Picks the nearest by hex distance, ties broken by lowest uid (fully
 * deterministic). Returns the target plus the A* path toward it (empty array if
 * already in range), or undefined if NO enemy is reachable.
 */
function nearestReachable(
  unit: UnitInstance,
  enemies: UnitInstance[],
  occupied: Set<number>
): { target: UnitInstance; path: HexCoord[] } | undefined {
  let best: { target: UnitInstance; path: HexCoord[]; dist: number } | undefined;
  for (const e of enemies) {
    const dist = hexDistance(unit.pos, e.pos);
    let path: HexCoord[];
    if (dist <= unit.range) {
      path = [];
    } else {
      path = hexAstar(unit.pos, e.pos, occupied);
      if (path.length === 0) continue; // unreachable
    }
    if (
      best === undefined ||
      dist < best.dist ||
      (dist === best.dist && e.uid < best.target.uid)
    ) {
      best = { target: e, path, dist };
    }
  }
  if (!best) return undefined;
  return { target: best.target, path: best.path };
}

function cloneUnit(u: UnitInstance): UnitInstance {
  return {
    ...u,
    pos: { ...u.pos },
    statusEffects: u.statusEffects.map((s) => ({ ...s })),
    items: [...u.items],
  };
}

function cloneBoard(b: BoardState): BoardState {
  return { units: b.units.map(cloneUnit) };
}

function applyStarMultiplier(unit: UnitInstance, data: GameData): void {
  const mult = data.gameplay.starMultipliers[String(unit.star)] ?? SCALE;
  if (mult === SCALE) return;
  unit.hp = fmul(unit.hp, mult);
  unit.maxHp = fmul(unit.maxHp, mult);
  unit.ad = fmul(unit.ad, mult);
  unit.abilityDamage = fmul(unit.abilityDamage, mult);
}

function addStat(unit: UnitInstance, stat: string, value: number): void {
  const rec = unit as unknown as Record<string, number>;
  rec[stat] = (rec[stat] ?? 0) + value;
  if (stat === "hp") unit.maxHp = unit.hp;
}

function applyTraits(units: UnitInstance[], data: GameData): void {
  for (const team of [0, 1] as const) {
    const teamUnits = units.filter((u) => u.team === team);
    for (const traitDef of data.traits) {
      // Count unique defIds, not copies
      const uniqueDefIds = new Set<string>();
      for (const u of teamUnits) {
        const def = data.units.find((d) => d.id === u.defId);
        if (def?.traits.includes(traitDef.id)) uniqueDefIds.add(u.defId);
      }
      const count = uniqueDefIds.size;
      // find highest active breakpoint
      let activeEffect: { stat: string; value: number } | null = null;
      for (const bp of traitDef.breakpoints) {
        if (count >= bp.count) activeEffect = bp.effect;
      }
      if (!activeEffect) continue;
      const { stat, value } = activeEffect;
      for (const u of teamUnits) {
        const def = data.units.find((d) => d.id === u.defId);
        if (!def?.traits.includes(traitDef.id)) continue;
        addStat(u, stat, value);
      }
    }
  }
}

function applyItems(unit: UnitInstance, data: GameData): void {
  for (const itemId of unit.items) {
    const itemDef = data.items.find((i) => i.id === itemId);
    if (!itemDef) continue;
    for (const [stat, value] of Object.entries(itemDef.stats)) {
      if (value === undefined) continue;
      addStat(unit, stat, value);
    }
  }
}

/**
 * Item passives + start-of-combat ability behaviors. Runs once after stats.
 *
 * Pair-passive gating: if an item def carries a `pairPassive`, that passive is
 * active ONLY when the unit also has the `pairPassive.partnerId` in its items
 * array. The item's own base stat bundle (applied in `applyItems`) is never
 * gated — base stats always apply regardless. A unit that equips only one item
 * from a pair receives the base stats but NOT the pair passive. A missing partner
 * id (item not in items array) silently skips the pairPassive; no error.
 */
function applyStartOfCombat(unit: UnitInstance, data: GameData): void {
  for (const itemId of unit.items) {
    const itemDef = data.items.find((i) => i.id === itemId);
    if (!itemDef) continue;

    // Base passive (burn on-hit / shield start-of-combat) — always applied.
    const passive = itemDef.passive;
    if (passive) {
      if (passive.kind === "shield") {
        unit.shield = (unit.shield ?? 0) + passive.value;
        refreshStatus(unit, "shield", passive.duration);
      } else if (passive.kind === "burn") {
        unit.onHitBurn = { value: passive.value, duration: passive.duration };
      }
    }

    // Pair-passive — active only when the partner item is also equipped.
    const pairPassive = itemDef.pairPassive;
    if (pairPassive && unit.items.includes(pairPassive.partnerId)) {
      const eff = pairPassive.effect;
      if (eff.kind === "shield") {
        unit.shield = (unit.shield ?? 0) + eff.value;
        refreshStatus(unit, "shield", eff.duration);
      } else if (eff.kind === "burn") {
        unit.onHitBurn = { value: eff.value, duration: eff.duration };
      }
    }
  }

  if (unit.ability?.effect.kind === "stealth") {
    unit.untargetableUntil = unit.ability.effect.duration;
  }
}

/** Subtracts damage through any shield first; returns hp actually lost. */
function damageThroughShield(target: UnitInstance, dmg: number): number {
  let remaining = dmg;
  if (target.shield && target.shield > 0) {
    const absorbed = Math.min(target.shield, remaining);
    target.shield -= absorbed;
    remaining -= absorbed;
  }
  target.hp -= remaining;
  return remaining;
}

function applyBurn(target: UnitInstance, value: number, duration: number): void {
  const existing = target.statusEffects.find((s) => s.type === "burn");
  if (existing) {
    existing.value = value;
    existing.duration = duration;
  } else {
    target.statusEffects.push({ type: "burn", value, duration });
  }
}

function refreshStatus(unit: UnitInstance, type: string, duration: number): void {
  const existing = unit.statusEffects.find((s) => s.type === type);
  if (existing) existing.duration = duration;
  else unit.statusEffects.push({ type, value: 0, duration });
}

export function simulateCombat(
  boardA: BoardState,
  boardB: BoardState,
  seed: number,
  data: GameData,
  options?: SimulateOptions
): CombatResult {
  const prng = mulberry32(seed);
  const events: CombatEvent[] = [];

  // --- Trace collection (opt-in; behavior-neutral) -------------------------
  // When tracing is off, `traceEnabled` is false and none of the trace-only
  // branches below run, allocate, or read anything — the default path is
  // byte-identical. The trace never consumes the PRNG, never changes iteration
  // order, and never mutates any unit field beyond the targeting logic that runs
  // in BOTH modes; it only OBSERVES already-computed values. The retarget reason
  // is the engine's ACTUAL decision (from resolveTarget), not a post-hoc guess.
  const traceEnabled = options?.trace === true;
  const traceTicks: TraceTick[] = [];
  // Per-unit observations for the CURRENT tick (rebuilt each tick).
  let tickObs: Map<number, TickObservation> = new Map();
  // Retargets the engine actually decided THIS tick (rebuilt each tick); these
  // are recorded inline in the action loop from resolveTarget's returned reason.
  let tickRetargets: TraceTick["retargets"] = [];
  const obsFor = (uid: number): TickObservation => {
    let o = tickObs.get(uid);
    if (!o) {
      o = { targetUid: null, moved: false, attacked: false, cast: false, damageDealt: 0 };
      tickObs.set(uid, o);
    }
    return o;
  };

  const allUnits: UnitInstance[] = [
    ...cloneBoard(boardA).units,
    ...cloneBoard(boardB).units,
  ];

  // Apply star multipliers and items per unit
  for (const unit of allUnits) {
    applyStarMultiplier(unit, data);
    applyItems(unit, data);
  }

  // Apply trait bonuses per team
  applyTraits(allUnits, data);

  // Item passives + start-of-combat ability behaviors (after all stat math)
  for (const unit of allUnits) {
    applyStartOfCombat(unit, data);
  }

  const { manaPerAttack, manaPerDamageTaken, mitigationBase } = data.gameplay;
  // Durations are authored in SECONDS (fixed-point) in packages/data and
  // converted to whole integer ticks here at the canonical TICK_HZ. The sim
  // advances by whole ticks only and never reads wall-clock time/Date/FPS.
  const overtimeStartTick = secondsToTicks(data.gameplay.overtimeStartSeconds);
  const hardCap = secondsToTicks(data.economy.overtimeHardCapSeconds);
  let tick = 0;
  let overtime = false;

  events.push({
    type: "init",
    tick: 0,
    units: allUnits.map((u) => ({
      uid: u.uid,
      side: u.team,
      defId: u.defId,
      star: u.star,
      hex: { ...u.pos },
      hp: u.hp,
      maxHp: u.maxHp,
      mana: u.mana,
      maxMana: u.maxMana,
      items: [...u.items],
    })),
  });

  function emitHp(u: UnitInstance): void {
    events.push({ tick, type: "hp", uid: u.uid, value: Math.max(0, u.hp) });
  }

  function gainMana(u: UnitInstance, amount: number): void {
    const next = Math.min(u.maxMana, u.mana + amount);
    if (next === u.mana) return;
    u.mana = next;
    events.push({ tick, type: "mana", uid: u.uid, value: next });
  }

  function getAlive(): UnitInstance[] {
    return allUnits.filter((u) => u.hp > 0);
  }

  function getEnemies(unit: UnitInstance): UnitInstance[] {
    return getAlive().filter(
      (u) =>
        u.team !== unit.team &&
        (u.untargetableUntil === undefined || tick >= u.untargetableUntil)
    );
  }

  /**
   * STICKY targeting. Resolves the unit's target ONCE per tick, reusing the
   * persistent `unit.targetUid`:
   *  - Holds a still-valid (alive + targetable) current target: if in range,
   *    keep it (no path needed); if out of range but a path toward it exists,
   *    keep it and CHASE (return that path); if unreachable, switch to the
   *    nearest reachable alternative — or, if none, KEEP it and idle (no thrash).
   *  - No valid current target (none held / dead / untargetable): acquire the
   *    nearest reachable enemy (lowest-uid tiebreak); if none reachable, fall
   *    back to the nearest overall so the unit still has a target to face.
   * Returns `{target, reason, path}` — `reason` is the RetargetReason when the
   * resolved target CHANGED this tick (incl. first acquire), else null; `path`
   * is the A* result toward the target (empty if already in range or
   * unreachable), threaded into the movement step so a chase costs one A* per
   * tick. `enemies` is assumed non-empty (caller checks). Runs in BOTH trace modes.
   */
  function resolveTarget(
    unit: UnitInstance,
    enemies: UnitInstance[],
    occupied: Set<number>
  ): { target: UnitInstance; reason: RetargetReason | null; path: HexCoord[] } {
    const current =
      unit.targetUid !== undefined
        ? enemies.find((e) => e.uid === unit.targetUid)
        : undefined;

    // Case A: holding a still-valid (alive + targetable) target.
    if (current) {
      if (hexDistance(unit.pos, current.pos) <= unit.range) {
        return { target: current, reason: null, path: [] };
      }
      const path = hexAstar(unit.pos, current.pos, occupied);
      if (path.length > 0) {
        // Reachable but out of range → chase, retain the target.
        return { target: current, reason: null, path };
      }
      // Unreachable: try a reachable alternative enemy.
      const alt = nearestReachable(unit, enemies, occupied);
      if (alt && alt.target.uid !== current.uid) {
        return { target: alt.target, reason: "switched_target_unreachable", path: alt.path };
      }
      // No reachable alternative → keep the held target and idle (no thrash).
      return { target: current, reason: null, path: [] };
    }

    // Case B: no valid current target → (re-)acquire.
    // Determine WHY we are acquiring, from the prior targetUid (if any).
    let reason: RetargetReason;
    if (unit.targetUid === undefined) {
      reason = "acquired_no_target";
    } else if (allUnits.some((u) => u.uid === unit.targetUid && u.hp > 0)) {
      // Prior target is still alive somewhere but not a valid enemy in `enemies`
      // → it's untargetable (stealth window).
      reason = "switched_target_untargetable";
    } else {
      reason = "switched_target_dead";
    }

    const alt = nearestReachable(unit, enemies, occupied);
    if (alt) {
      return { target: alt.target, reason, path: alt.path };
    }
    // Nothing reachable: fall back to the nearest overall (enemies non-empty) so
    // the unit still has a target to face. No path (it can't get there now).
    const nearest = findTarget(unit, enemies)!;
    const path =
      hexDistance(unit.pos, nearest.pos) <= unit.range
        ? []
        : hexAstar(unit.pos, nearest.pos, occupied);
    return { target: nearest, reason, path };
  }

  while (tick < hardCap) {
    const aliveCheck = getAlive();
    if (aliveCheck.filter((u) => u.team === 0).length === 0 ||
        aliveCheck.filter((u) => u.team === 1).length === 0) {
      break;
    }

    if (tick >= overtimeStartTick) {
      if (!overtime) {
        overtime = true;
        events.push({ tick, type: "overtime_start" });
      }
      // Ramping true damage to all units
      const trueDmg = data.economy.overtimeBaseDamage +
        data.economy.overtimeRampPerTick * (tick - overtimeStartTick);
      for (const u of getAlive()) {
        u.hp -= trueDmg;
        emitHp(u);
        if (u.hp <= 0) {
          events.push({ tick, type: "death", uid: u.uid });
        }
      }
      const alive = getAlive();
      if (alive.filter((u) => u.team === 0).length === 0 ||
          alive.filter((u) => u.team === 1).length === 0) {
        tick++;
        break;
      }
    }

    const tickUnits = getAlive().slice().sort((a, b) => a.uid - b.uid);

    for (const unit of tickUnits) {
      if (unit.hp <= 0) continue;

      // Status effects tick: burn DoT (true damage), then decrement/expire.
      const survivors: StatusEffect[] = [];
      let burnedToDeath = false;
      for (const se of unit.statusEffects) {
        if (se.type === "burn" && unit.hp > 0) {
          unit.hp -= se.value;
          emitHp(unit);
          if (unit.hp <= 0) {
            events.push({ tick, type: "death", uid: unit.uid });
            burnedToDeath = true;
          }
        }
        se.duration--;
        if (se.duration > 0) {
          survivors.push(se);
        } else if (se.type === "buff" && se.stat) {
          addStat(unit, se.stat, -se.value);
        } else if (se.type === "shield") {
          unit.shield = 0;
        }
      }
      unit.statusEffects = survivors;
      if (burnedToDeath || unit.hp <= 0) continue;

      // Mana / ability cast
      const enemies = getEnemies(unit);
      if (enemies.length === 0) {
        // No targetable enemy this tick — drop any held target so a fresh
        // acquire (acquired_no_target) fires when one reappears.
        delete unit.targetUid;
        continue;
      }

      // Resolve the unit's STICKY target ONCE per tick, reusing the persistent
      // `unit.targetUid`. `occupied` (every OTHER alive unit's hex) is computed
      // once and reused for both resolveTarget's A* and the movement step (so a
      // chasing unit pays at most one A* per tick). The returned `path` is the
      // A* result toward the resolved target (empty if already in range or
      // unreachable) — threaded straight into movement.
      const occupied = new Set<number>();
      for (const u of getAlive()) {
        if (u.uid !== unit.uid) occupied.add(hexKey(u.pos.q, u.pos.r));
      }
      const fromUid = unit.targetUid ?? null;
      const { target, reason, path } = resolveTarget(unit, enemies, occupied);
      unit.targetUid = target.uid;
      if (traceEnabled) {
        obsFor(unit.uid).targetUid = target.uid;
        if (reason !== null) {
          tickRetargets.push({ uid: unit.uid, fromUid, toUid: target.uid, reason });
        }
      }

      const castKind = unit.ability?.effect.kind ?? "magic_damage";
      if (unit.mana >= unit.maxMana && castKind !== "stealth") {
        const eff = unit.ability?.effect;
        if (castKind === "magic_damage" || castKind === "burn") {
          // Single-target nukes hit the unit's CURRENT sticky target.
          {
            const dmg = mitigate(unit.abilityDamage, target.mr, mitigationBase);
            damageThroughShield(target, dmg);
            if (traceEnabled) {
              const o = obsFor(unit.uid);
              o.cast = true;
              o.targetUid = target.uid; // resolved target = the nuke target
              o.damageDealt += dmg;
            }
            events.push({ tick, type: "cast", uid: unit.uid, targetUid: target.uid, dmg });
            emitHp(target);
            if (unit.mana !== 0) {
              unit.mana = 0;
              events.push({ tick, type: "mana", uid: unit.uid, value: 0 });
            }
            if (castKind === "burn" && eff?.kind === "burn" && target.hp > 0) {
              applyBurn(target, eff.burn, eff.duration);
            }
            if (target.hp <= 0) {
              events.push({ tick, type: "death", uid: target.uid });
            } else {
              gainMana(target, manaPerDamageTaken);
            }
          }
          continue;
        }
        if (castKind === "shield" && eff?.kind === "shield") {
          // Self-cast: does NOT change the unit's sticky enemy target.
          unit.shield = (unit.shield ?? 0) + eff.amount;
          refreshStatus(unit, "shield", eff.duration);
          if (traceEnabled) {
            const o = obsFor(unit.uid);
            o.cast = true;
            // Self-target cast; the unit's persistent enemy target is retained,
            // so the trace row keeps showing the held enemy (set above).
          }
          events.push({ tick, type: "cast", uid: unit.uid, targetUid: unit.uid, dmg: 0 });
          if (unit.mana !== 0) {
            unit.mana = 0;
            events.push({ tick, type: "mana", uid: unit.uid, value: 0 });
          }
          continue;
        }
        if (castKind === "buff" && eff?.kind === "buff") {
          // Self-cast: does NOT change the unit's sticky enemy target.
          addStat(unit, eff.stat, eff.value);
          unit.statusEffects.push({ type: "buff", stat: eff.stat, value: eff.value, duration: eff.duration });
          if (traceEnabled) {
            const o = obsFor(unit.uid);
            o.cast = true;
            // Self-target cast; the unit's persistent enemy target is retained.
          }
          events.push({ tick, type: "cast", uid: unit.uid, targetUid: unit.uid, dmg: 0 });
          if (unit.mana !== 0) {
            unit.mana = 0;
            events.push({ tick, type: "mana", uid: unit.uid, value: 0 });
          }
          continue;
        }
      }

      // Movement: chase the resolved target using the path resolveTarget already
      // computed (no second A* this tick). `path` is empty when already in range
      // or when the held target is unreachable with no reachable alternative.
      const dist = hexDistance(unit.pos, target.pos);
      if (dist > unit.range && path.length > 0) {
        const next = path[0]!;
        const from = { ...unit.pos };
        unit.pos = next;
        if (traceEnabled) obsFor(unit.uid).moved = true;
        events.push({ tick, type: "move", uid: unit.uid, from, to: { ...next } });
      }

      // Attack
      const freshDist = hexDistance(unit.pos, target.pos);
      if (freshDist <= unit.range) {
        if (unit.attackCooldown <= 0) {
          // Crit roll from the sim's seeded PRNG (fixed-point, SCALE=1000)
          const isCrit = prng() % SCALE < data.economy.critChance;
          const rawAd = isCrit ? fmul(unit.ad, data.economy.critMultiplier) : unit.ad;
          const dmg = mitigate(rawAd, target.armor, mitigationBase);
          damageThroughShield(target, dmg);
          if (traceEnabled) {
            const o = obsFor(unit.uid);
            o.attacked = true;
            o.targetUid = target.uid;
            o.damageDealt += dmg;
          }
          events.push({ tick, type: "attack", uid: unit.uid, targetUid: target.uid, dmg, crit: isCrit });
          emitHp(target);
          gainMana(unit, manaPerAttack);

          if (target.hp <= 0) {
            events.push({ tick, type: "death", uid: target.uid });
          } else {
            gainMana(target, manaPerDamageTaken);
            if (unit.onHitBurn) applyBurn(target, unit.onHitBurn.value, unit.onHitBurn.duration);
          }

          // Attack cooldown in ticks derived from attack speed (as, fixed-point
          // attacks/sec): cooldown = TICK_HZ * SCALE / as. One attack per
          // (TICK_HZ / (as/SCALE)) ticks → faster as = shorter cooldown.
          unit.attackCooldown = Math.trunc(TICK_HZ * SCALE / unit.as);
        } else {
          unit.attackCooldown--;
        }
      } else {
        if (unit.attackCooldown > 0) unit.attackCooldown--;
      }
    }

    // --- Assemble this tick's trace frame (trace mode only) ----------------
    // Pure observation of already-computed state; no PRNG, no extra mutation, no
    // effect on iteration order. Units are emitted in the engine's existing
    // uid-ascending order. The retarget records are the engine's AUTHORITATIVE
    // decisions (collected inline in the action loop from resolveTarget's reason),
    // not a post-hoc inference.
    if (traceEnabled) {
      const aliveEnd = getAlive().slice().sort((a, b) => a.uid - b.uid);

      const units: TraceUnitRecord[] = [];

      for (const u of aliveEnd) {
        const o = tickObs.get(u.uid);
        // The trace row's target is the unit's PERSISTENT sticky target, so a
        // self-cast (shield/buff) tick shows the retained enemy, not self.
        const targetUid = u.targetUid ?? null;
        // Action label by precedence cast > attack > move > idle.
        const action: TraceUnitRecord["action"] = o
          ? o.cast
            ? "cast"
            : o.attacked
              ? "attack"
              : o.moved
                ? "move"
                : "idle"
          : "idle";

        units.push({
          uid: u.uid,
          side: u.team,
          defId: u.defId,
          hex: { ...u.pos }, // end-of-tick position
          hp: u.hp,
          mana: u.mana,
          targetUid,
          action,
          damageDealt: o ? o.damageDealt : 0,
        });
      }

      // Only keep retargets for units that are still alive at end-of-tick (a
      // unit that acquired then died this tick isn't in the frame); the engine
      // appended them in action-loop (uid-ascending) order already.
      const aliveUids = new Set(aliveEnd.map((u) => u.uid));
      const retargets = tickRetargets.filter((rt) => aliveUids.has(rt.uid));

      traceTicks.push({ tick, units, retargets });
      tickObs = new Map();
      tickRetargets = [];
    }

    tick++;
  }

  const finalAlive = getAlive();
  const t0alive = finalAlive.filter((u) => u.team === 0);
  const t1alive = finalAlive.filter((u) => u.team === 1);

  let winner: 0 | 1 | "draw";
  if (t0alive.length > 0 && t1alive.length === 0) winner = 0;
  else if (t1alive.length > 0 && t0alive.length === 0) winner = 1;
  else if (t0alive.length === 0 && t1alive.length === 0) winner = "draw";
  else {
    // Hard cap reached with both sides alive: higher total remaining HP wins
    const hp0 = t0alive.reduce((s, u) => s + u.hp, 0);
    const hp1 = t1alive.reduce((s, u) => s + u.hp, 0);
    winner = hp0 > hp1 ? 0 : hp1 > hp0 ? 1 : "draw";
  }

  events.push({
    tick,
    type: "end",
    winnerSide: winner,
    survivingUids: finalAlive.map((u) => u.uid),
  });

  const result: CombatResult = {
    winner,
    ticks: tick,
    survivingUnits: finalAlive.map(cloneUnit),
    events,
  };
  if (traceEnabled) {
    const trace: CombatTrace = { ticks: traceTicks };
    result.trace = trace;
  }
  return result;
}
