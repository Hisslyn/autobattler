import { mulberry32 } from "./prng.js";
import { fmul, SCALE } from "./fixed.js";
import { hexDistance, hexAstar, COLS } from "./hex.js";
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
  // order, and never mutates any unit field; it only OBSERVES already-computed
  // values. We do NOT add fields to UnitInstance and do NOT change cloning.
  const traceEnabled = options?.trace === true;
  const traceTicks: TraceTick[] = [];
  // Previous tick's resolved target per uid (for retarget-reason inference).
  // A uid absent from the map means "no prior observation" (treated as null).
  const prevTargets = new Map<number, number | null>();
  // Per-unit observations for the CURRENT tick (rebuilt each tick).
  let tickObs: Map<number, TickObservation> = new Map();
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

  const { manaPerAttack, manaPerDamageTaken, mitigationBase, ticksPerSec, overtimeStartTick } = data.gameplay;
  const hardCap = data.economy.overtimeHardCapTicks;
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
      if (enemies.length === 0) continue;

      const castKind = unit.ability?.effect.kind ?? "magic_damage";
      if (unit.mana >= unit.maxMana && castKind !== "stealth") {
        const eff = unit.ability?.effect;
        if (castKind === "magic_damage" || castKind === "burn") {
          const target = findTarget(unit, enemies);
          if (target) {
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
          unit.shield = (unit.shield ?? 0) + eff.amount;
          refreshStatus(unit, "shield", eff.duration);
          if (traceEnabled) {
            const o = obsFor(unit.uid);
            o.cast = true;
            o.targetUid = unit.uid; // self-target shield
          }
          events.push({ tick, type: "cast", uid: unit.uid, targetUid: unit.uid, dmg: 0 });
          if (unit.mana !== 0) {
            unit.mana = 0;
            events.push({ tick, type: "mana", uid: unit.uid, value: 0 });
          }
          continue;
        }
        if (castKind === "buff" && eff?.kind === "buff") {
          addStat(unit, eff.stat, eff.value);
          unit.statusEffects.push({ type: "buff", stat: eff.stat, value: eff.value, duration: eff.duration });
          if (traceEnabled) {
            const o = obsFor(unit.uid);
            o.cast = true;
            o.targetUid = unit.uid; // self-target buff
          }
          events.push({ tick, type: "cast", uid: unit.uid, targetUid: unit.uid, dmg: 0 });
          if (unit.mana !== 0) {
            unit.mana = 0;
            events.push({ tick, type: "mana", uid: unit.uid, value: 0 });
          }
          continue;
        }
      }

      // Movement
      const target = findTarget(unit, enemies);
      if (!target) continue;
      // Resolved target for move/attack — recorded even if the unit ends up
      // idle (out of range with no path, or still on attack cooldown), since it
      // is the enemy the engine selected this tick (drives retarget detection).
      if (traceEnabled) obsFor(unit.uid).targetUid = target.uid;

      const dist = hexDistance(unit.pos, target.pos);
      if (dist > unit.range) {
        const occupied = new Set<number>();
        for (const u of getAlive()) {
          if (u.uid !== unit.uid) {
            occupied.add(hexKey(u.pos.q, u.pos.r));
          }
        }
        const path = hexAstar(unit.pos, target.pos, occupied);
        if (path.length > 0) {
          const next = path[0]!;
          const from = { ...unit.pos };
          unit.pos = next;
          if (traceEnabled) obsFor(unit.uid).moved = true;
          events.push({ tick, type: "move", uid: unit.uid, from, to: { ...next } });
        }
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

          unit.attackCooldown = Math.trunc(ticksPerSec * SCALE / unit.as);
        } else {
          unit.attackCooldown--;
        }
      } else {
        if (unit.attackCooldown > 0) unit.attackCooldown--;
      }
    }

    // --- Assemble this tick's trace frame (trace mode only) ----------------
    // Pure observation of already-computed state; no PRNG, no mutation of any
    // unit, no effect on iteration order. Units are processed in the engine's
    // existing uid-ascending order so retarget records are deterministic.
    if (traceEnabled) {
      const aliveEnd = getAlive().slice().sort((a, b) => a.uid - b.uid);
      const aliveById = new Map<number, UnitInstance>();
      for (const u of aliveEnd) aliveById.set(u.uid, u);

      const units: TraceUnitRecord[] = [];
      const retargets: TraceTick["retargets"] = [];

      for (const u of aliveEnd) {
        const o = tickObs.get(u.uid);
        const targetUid = o ? o.targetUid : null;
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

        // Retarget inference: compare this tick's resolved target to last tick's.
        // Reasons are inferred from OBSERVABLE end-of-tick state at the switch.
        const prev = prevTargets.has(u.uid) ? prevTargets.get(u.uid)! : null;
        if (targetUid !== prev) {
          let reason: RetargetReason;
          if (prev === null) {
            // Had no resolved target last tick, has one now (or still none).
            reason = "acquired_no_target";
          } else if (targetUid === null) {
            // Lost a target entirely. The only way the engine drops to null is
            // its previous target no longer being a valid enemy — characterize
            // it the same way as a mid-list switch off a now-invalid target.
            const prevUnit = aliveById.get(prev);
            if (!prevUnit) reason = "switched_target_dead";
            else if (prevUnit.untargetableUntil !== undefined && tick < prevUnit.untargetableUntil)
              reason = "switched_target_untargetable";
            else reason = "switched_target_out_of_range";
          } else {
            // Switched to a different non-null target. Inspect the old target.
            const prevUnit = aliveById.get(prev);
            if (!prevUnit) {
              reason = "switched_target_dead";
            } else if (prevUnit.untargetableUntil !== undefined && tick < prevUnit.untargetableUntil) {
              reason = "switched_target_untargetable";
            } else if (hexDistance(u.pos, prevUnit.pos) > u.range) {
              reason = "switched_target_out_of_range";
            } else {
              // Previous target still alive, targetable, and in range, but the
              // nearest-recompute picked a different enemy (nearer / tiebreak
              // flip). This characterizes the engine's stateless targeting; it
              // is EXPECTED to happen and is not a bug.
              reason = "retarget_recomputed";
            }
          }
          retargets.push({ uid: u.uid, fromUid: prev, toUid: targetUid, reason });
        }
        prevTargets.set(u.uid, targetUid);
      }

      traceTicks.push({ tick, units, retargets });
      tickObs = new Map();
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
