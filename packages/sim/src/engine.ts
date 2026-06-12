import { mulberry32 } from "./prng.js";
import { fmul, SCALE } from "./fixed.js";
import { hexDistance, hexAstar, hexKey as _hexKey } from "./hex.js";
import type { BoardState, CombatEvent, CombatResult, UnitInstance } from "./types.js";
import type { GameData } from "@autobattler/data";

const TICKS_PER_SEC = 20;
const MAX_TICKS = 1200;
const MANA_PER_ATTACK = 10;
const MANA_PER_DAMAGE_RECV = 7;
const OVERTIME_DAMAGE_PER_TICK = 50;

// Star multipliers in fixed-point (SCALE=1000): 1-star=1000, 2-star=1800, 3-star=3240
const STAR_MULT: Record<number, number> = { 1: 1000, 2: 1800, 3: 3240 };

function hexKey(q: number, r: number): number {
  return r * 7 + q;
}

function applyArmor(rawDamage: number, armor: number): number {
  const mitigation = fmul(armor, SCALE / (100 + armor) * 1000 | 0);
  return Math.max(1, rawDamage - Math.trunc(rawDamage * armor / (100 + armor)));
}

function applyMr(rawDamage: number, mr: number): number {
  return Math.max(1, rawDamage - Math.trunc(rawDamage * mr / (100 + mr)));
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

function applyStarMultiplier(unit: UnitInstance): void {
  const mult = STAR_MULT[unit.star] ?? SCALE;
  if (mult === SCALE) return;
  unit.hp = fmul(unit.hp, mult);
  unit.maxHp = fmul(unit.maxHp, mult);
  unit.ad = fmul(unit.ad, mult);
  unit.abilityDamage = fmul(unit.abilityDamage, mult);
}

function applyTraits(units: UnitInstance[], data: GameData): void {
  for (const team of [0, 1] as const) {
    const teamUnits = units.filter((u) => u.team === team);
    for (const traitDef of data.traits) {
      const count = teamUnits.filter((u) => {
        const def = data.units.find((d) => d.id === u.defId);
        return def?.traits.includes(traitDef.id) ?? false;
      }).length;
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
        (u as Record<string, unknown>)[stat] = ((u as Record<string, unknown>)[stat] as number) + value;
        if (stat === "hp") u.maxHp = u.hp;
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
      (unit as Record<string, unknown>)[stat] = ((unit as Record<string, unknown>)[stat] as number) + value;
      if (stat === "hp") unit.maxHp = unit.hp;
    }
  }
}

export function simulateCombat(
  boardA: BoardState,
  boardB: BoardState,
  seed: number,
  data: GameData
): CombatResult {
  const _prng = mulberry32(seed);
  const events: CombatEvent[] = [];

  const allUnits: UnitInstance[] = [
    ...cloneBoard(boardA).units,
    ...cloneBoard(boardB).units,
  ];

  // Apply star multipliers and items per unit
  for (const unit of allUnits) {
    applyStarMultiplier(unit);
    applyItems(unit, data);
  }

  // Apply trait bonuses per team
  applyTraits(allUnits, data);

  let tick = 0;
  let overtime = false;

  function getAlive(): UnitInstance[] {
    return allUnits.filter((u) => u.hp > 0);
  }

  function getEnemies(unit: UnitInstance): UnitInstance[] {
    return getAlive().filter((u) => u.team !== unit.team);
  }

  function getFriends(unit: UnitInstance): UnitInstance[] {
    return getAlive().filter((u) => u.team === unit.team && u.uid !== unit.uid);
  }

  while (tick < MAX_TICKS + (overtime ? 0 : 0)) {
    if (tick === MAX_TICKS && !overtime) {
      overtime = true;
      events.push({ tick, type: "overtime", sourceUid: -1 });
    }

    if (overtime && tick >= MAX_TICKS) {
      const alive = getAlive();
      const t0 = alive.filter((u) => u.team === 0);
      const t1 = alive.filter((u) => u.team === 1);
      if (t0.length === 0 || t1.length === 0) break;
      const trueDmg = OVERTIME_DAMAGE_PER_TICK * (tick - MAX_TICKS + 1);
      for (const u of alive) {
        u.hp -= trueDmg;
      }
    }

    const alive = getAlive();
    if (alive.filter((u) => u.team === 0).length === 0 ||
        alive.filter((u) => u.team === 1).length === 0) {
      break;
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
          const dmg = applyMr(unit.abilityDamage, target.mr);
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
            target.mana = Math.min(target.maxMana, target.mana + MANA_PER_DAMAGE_RECV);
            events.push({ tick, type: "mana_gain", sourceUid: target.uid, value: MANA_PER_DAMAGE_RECV });
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
          const dmg = applyArmor(unit.ad, target.armor);
          target.hp -= dmg;
          unit.mana = Math.min(unit.maxMana, unit.mana + MANA_PER_ATTACK);
          events.push({ tick, type: "attack", sourceUid: unit.uid, targetUid: target.uid, value: dmg });
          events.push({ tick, type: "mana_gain", sourceUid: unit.uid, value: MANA_PER_ATTACK });

          if (target.hp <= 0) {
            events.push({ tick, type: "death", sourceUid: target.uid });
          } else {
            target.mana = Math.min(target.maxMana, target.mana + MANA_PER_DAMAGE_RECV);
            events.push({ tick, type: "mana_gain", sourceUid: target.uid, value: MANA_PER_DAMAGE_RECV });
          }

          unit.attackCooldown = Math.trunc(TICKS_PER_SEC * SCALE / unit.as);
        } else {
          unit.attackCooldown--;
        }
      } else {
        if (unit.attackCooldown > 0) unit.attackCooldown--;
      }
    }

    tick++;
    if (tick > MAX_TICKS + 600) break;
  }

  const finalAlive = getAlive();
  const t0alive = finalAlive.filter((u) => u.team === 0);
  const t1alive = finalAlive.filter((u) => u.team === 1);

  let winner: 0 | 1 | "draw";
  if (t0alive.length > 0 && t1alive.length === 0) winner = 0;
  else if (t1alive.length > 0 && t0alive.length === 0) winner = 1;
  else winner = "draw";

  return {
    winner,
    ticks: tick,
    survivingUnits: finalAlive.map(cloneUnit),
    events,
  };
}
