import type { BoardState, UnitInstance } from "@autobattler/sim/src/types.js";
import type { GameData } from "@autobattler/data";

/** A board archetype, expressed purely as data (defId + star per unit). */
export interface CompUnit {
  defId: string;
  star: 1 | 2 | 3;
}

export interface Composition {
  id: string;
  name: string;
  /** Traits the comp is built to activate (for reporting/grouping). */
  targets: string[];
  units: CompUnit[];
}

/**
 * Representative comps hitting specific trait breakpoints. Each is a small,
 * legal board (<= 8 units). Star levels stay at 1 for a clean baseline.
 */
export const COMPOSITIONS: Composition[] = [
  {
    id: "knights",
    name: "Knights",
    targets: ["knight"],
    units: ["warrior", "paladin", "knight_errant", "templar", "squire", "frost_knight"].map((d) => ({ defId: d, star: 1 })),
  },
  {
    id: "sorcerers",
    name: "Sorcerers",
    targets: ["sorcerer"],
    units: ["mage", "archmage", "sage", "pyromancer", "stormcaller", "phoenix"].map((d) => ({ defId: d, star: 1 })),
  },
  {
    id: "assassins",
    name: "Assassins",
    targets: ["assassin"],
    units: ["rogue", "shadowblade", "cutpurse", "nightblade", "wraith", "nightlord"].map((d) => ({ defId: d, star: 1 })),
  },
  {
    id: "rangers",
    name: "Rangers",
    targets: ["ranger"],
    units: ["archer", "ranger", "sharpshooter", "houndmaster", "stormlord", "huntress"].map((d) => ({ defId: d, star: 1 })),
  },
  {
    id: "wardens",
    name: "Wardens",
    targets: ["warden"],
    units: ["footman", "sentinel", "frost_knight", "vanguard", "treant", "paragon"].map((d) => ({ defId: d, star: 1 })),
  },
  {
    id: "berserkers",
    name: "Berserkers",
    targets: ["berserker"],
    units: ["brawler", "reaver", "champion", "ravager", "dragonlord", "void_reaper"].map((d) => ({ defId: d, star: 1 })),
  },
  {
    id: "holy",
    name: "Holy",
    targets: ["holy"],
    units: ["paladin", "cleric", "templar", "sage", "warpriest", "archon", "god_king"].map((d) => ({ defId: d, star: 1 })),
  },
  {
    id: "mystics",
    name: "Mystics",
    targets: ["mystic"],
    units: ["acolyte", "warpriest", "stormcaller", "necromancer", "archon", "archsage"].map((d) => ({ defId: d, star: 1 })),
  },
  {
    id: "gunners",
    name: "Gunners",
    targets: ["gunner"],
    units: ["scout", "sharpshooter", "arbalest", "stormlord", "huntress"].map((d) => ({ defId: d, star: 1 })),
  },
  {
    id: "duelists",
    name: "Duelists",
    targets: ["duelist"],
    units: ["cutpurse", "fencer", "ravager", "spellblade", "nightlord", "world_ender"].map((d) => ({ defId: d, star: 1 })),
  },
];

/** Deterministic placement: front rows fill first, then the back row behind. */
export function buildBoard(comp: Composition, team: 0 | 1, data: GameData): BoardState {
  const rows = team === 0 ? [1, 0] : [6, 7];
  const units: UnitInstance[] = comp.units.map((cu, i) => {
    const def = data.units.find((d) => d.id === cu.defId);
    if (!def) throw new Error(`comp ${comp.id} references unknown unit ${cu.defId}`);
    const q = i % 7;
    const r = rows[Math.floor(i / 7)] ?? rows[rows.length - 1]!;
    return {
      uid: team * 1000 + i,
      defId: def.id,
      tier: def.tier,
      star: cu.star,
      team,
      pos: { q, r },
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
  });
  return { units };
}

/** Distinct traits a comp activates (>=2 distinct units carrying the trait). */
export function activeTraits(comp: Composition, data: GameData): string[] {
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const cu of comp.units) {
    if (seen.has(cu.defId)) continue;
    seen.add(cu.defId);
    const def = data.units.find((d) => d.id === cu.defId);
    for (const t of def?.traits ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, c]) => c >= 2).map(([t]) => t);
}
