import { mulberry32 } from "./prng.js";
import { fmul, SCALE } from "./fixed.js";
import { hexDistance, hexAstar, COLS } from "./hex.js";
import type { BoardState, CombatEvent, CombatResult, UnitInstance } from "./types.js";
import type { GameData } from "@autobattler/data";

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

export function simulateCombat(
  boardA: BoardState,
  boardB: BoardState,
  seed: number,
  data: GameData
): CombatResult {
  const prng = mulberry32(seed);
  const events: CombatEvent[] = [];

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

  const { manaPerAttack, manaPerDamageTaken, mitigationBase, ticksPerSec, overtimeStartTick } = data.gameplay;
  const hardCap = data.economy.overtimeHardCapTicks;
  let tick = 0;
  let overtime = false;

  function getAlive(): UnitInstance[] {
    return allUnits.filter((u) => u.hp > 0);
  }

  function getEnemies(unit: UnitInstance): UnitInstance[] {
    return getAlive().filter((u) => u.team !== unit.team);
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
        events.push({ tick, type: "overtime", sourceUid: -1 });
      }
      // Ramping true damage to all units
      const trueDmg = data.economy.overtimeBaseDamage +
        data.economy.overtimeRampPerTick * (tick - overtimeStartTick);
      for (const u of getAlive()) {
        u.hp -= trueDmg;
        if (u.hp <= 0) {
          events.push({ tick, type: "death", sourceUid: u.uid });
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

      // Status effects tick
      for (const se of unit.statusEffects) {
        se.duration--;
      }
      unit.statusEffects = unit.statusEffects.filter((s) => s.duration > 0);

      // Mana / ability cast
      const enemies = getEnemies(unit);
      if (enemies.length === 0) continue;

      if (unit.mana >= unit.maxMana) {
        const target = findTarget(unit, enemies);
        if (target) {
          const dmg = mitigate(unit.abilityDamage, target.mr, mitigationBase);
          target.hp -= dmg;
          unit.mana = 0;
          events.push({
            tick,
            type: "ability",
            sourceUid: unit.uid,
            targetUid: target.uid,
            value: dmg,
          });
          if (target.hp <= 0) {
            events.push({ tick, type: "death", sourceUid: target.uid });
          } else {
            target.mana = Math.min(target.maxMana, target.mana + manaPerDamageTaken);
            events.push({ tick, type: "mana_gain", sourceUid: target.uid, value: manaPerDamageTaken });
          }
        }
        continue;
      }

      // Movement
      const target = findTarget(unit, enemies);
      if (!target) continue;

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
          unit.pos = next;
          events.push({ tick, type: "move", sourceUid: unit.uid, pos: { ...next } });
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
          target.hp -= dmg;
          unit.mana = Math.min(unit.maxMana, unit.mana + manaPerAttack);
          events.push({ tick, type: "attack", sourceUid: unit.uid, targetUid: target.uid, value: dmg, crit: isCrit });
          events.push({ tick, type: "mana_gain", sourceUid: unit.uid, value: manaPerAttack });

          if (target.hp <= 0) {
            events.push({ tick, type: "death", sourceUid: target.uid });
          } else {
            target.mana = Math.min(target.maxMana, target.mana + manaPerDamageTaken);
            events.push({ tick, type: "mana_gain", sourceUid: target.uid, value: manaPerDamageTaken });
          }

          unit.attackCooldown = Math.trunc(ticksPerSec * SCALE / unit.as);
        } else {
          unit.attackCooldown--;
        }
      } else {
        if (unit.attackCooldown > 0) unit.attackCooldown--;
      }
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

  return {
    winner,
    ticks: tick,
    survivingUnits: finalAlive.map(cloneUnit),
    events,
  };
}
