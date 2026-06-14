// Pure derivations for the unit-inspect panel. No Pixi, no game logic — assemble
// a unit's identity, full stat block, and a readable ability description from
// the data definitions (units.json via the loader) plus a live UnitInstance when
// one exists (board/bench show current hp/mana; shop shows base stats).
import type { UnitInstance } from "@autobattler/sim/src/types.js";
import type { GameData, UnitDataDef, AbilityEffectData } from "@autobattler/data";
import { formatStat, formatStatDelta } from "./statFormat.js";
import { itemModel } from "./itemModel.js";
import type { ItemModel } from "./itemModel.js";

export interface InspectStat {
  label: string;
  value: string;
}

export interface InspectTrait {
  id: string;
  name: string;
  kind: "origin" | "class";
}

export interface InspectModel {
  defId: string;
  name: string;
  tier: number;
  /** Star to render (1 for a shop preview, the live star for an owned unit). */
  star: number;
  /** Buy cost in gold (= tier). */
  cost: number;
  origin: InspectTrait | null;
  classes: InspectTrait[];
  ability: { name: string; manaCost: number; description: string };
  /** Glanceable stat rows in display order. */
  stats: InspectStat[];
  /** Items the unit currently holds (empty for a shop preview / no items). */
  items: ItemModel[];
}

/** One-line, human-readable description of an ability effect. */
export function abilityDescription(
  name: string,
  effect: AbilityEffectData,
  abilityDamage: number
): string {
  switch (effect.kind) {
    case "magic_damage":
      return `Deals ${abilityDamage} magic damage to the current target.`;
    case "burn":
      return `Deals ${abilityDamage} magic damage, then burns for ${effect.burn} over ${effect.duration} ticks.`;
    case "shield":
      return `Gains a ${effect.amount} shield for ${effect.duration} ticks.`;
    case "buff":
      return `Buffs ${effect.stat} by ${formatStatDelta(effect.stat, effect.value)} for ${effect.duration} ticks.`;
    case "stealth":
      return `Untargetable for the first ${effect.duration} ticks of combat.`;
  }
}

function traitRef(id: string, data: GameData): InspectTrait | null {
  const t = data.traits.find((x) => x.id === id);
  return t ? { id: t.id, name: t.name, kind: t.kind } : null;
}

/**
 * Build the inspect model from a unit def id, an optional live instance (for
 * owned units showing current hp/mana/star), and the game data. Returns null if
 * the def id is unknown.
 */
export function inspectModel(
  defId: string,
  instance: UnitInstance | null,
  data: GameData
): InspectModel | null {
  const def: UnitDataDef | undefined = data.units.find((u) => u.id === defId);
  if (!def) return null;

  const star = instance?.star ?? 1;
  const hp = instance ? `${instance.hp}/${instance.maxHp}` : `${def.hp}`;
  const mana = instance
    ? `${instance.mana}/${instance.maxMana}`
    : `${def.manaStart}/${def.mana}`;

  const stats: InspectStat[] = [
    { label: "HP", value: hp },
    { label: "AD", value: formatStat("ad", instance?.ad ?? def.ad) },
    { label: "AS", value: formatStat("as", instance?.as ?? def.as) },
    { label: "Armor", value: formatStat("armor", instance?.armor ?? def.armor) },
    { label: "MR", value: formatStat("mr", instance?.mr ?? def.mr) },
    { label: "Range", value: formatStat("range", instance?.range ?? def.range) },
    { label: "Mana", value: mana },
    { label: "Ability", value: `${def.ability.manaCost}` },
  ];

  return {
    defId: def.id,
    name: def.name,
    tier: def.tier,
    star,
    cost: def.tier,
    origin: traitRef(def.origin, data),
    classes: def.classes
      .map((c) => traitRef(c, data))
      .filter((t): t is InspectTrait => t !== null),
    ability: {
      name: def.ability.name,
      manaCost: def.ability.manaCost,
      description: abilityDescription(def.ability.name, def.ability.effect, def.abilityDamage),
    },
    stats,
    items: (instance?.items ?? [])
      .map((id) => itemModel(id, data))
      .filter((m): m is ItemModel => m !== null),
  };
}
