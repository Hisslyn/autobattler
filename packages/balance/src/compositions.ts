import type { BoardState, UnitInstance, UnitDef } from "@autobattler/sim/src/types.js";
import { gameData, type GameData } from "@autobattler/data";

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

/** Resource normalization knobs shared by every comp in a sweep. */
export const LEVEL = 8; // board slot count (= player level) every comp fills
export const BUDGET = 30; // total gold spent on units, equal across comps
export const BUDGET_TOLERANCE = 2; // max |compGold - BUDGET| allowed

/** Gold copies a star level represents (1-star = 1 copy, 2-star = 3, 3-star = 9). */
const STAR_COPIES: Record<1 | 2 | 3, number> = { 1: 1, 2: 3, 3: 9 };
/** A tier-4/5 unit can only reach 2-star within a realistic budget. */
function maxStar(tier: number): 1 | 2 | 3 {
  return tier >= 4 ? 2 : 3;
}
/** Gold cost = tier × copies (unit cost is its tier; see rules/commands.ts). */
export function unitGoldCost(def: UnitDef, star: 1 | 2 | 3): number {
  return def.tier * STAR_COPIES[star];
}
export function compGold(comp: Composition, data: GameData): number {
  return comp.units.reduce((s, cu) => {
    const def = data.units.find((d) => d.id === cu.defId)!;
    return s + unitGoldCost(def, cu.star);
  }, 0);
}

/**
 * Build a budget-normalized comp from a fixed slate of LEVEL defIds: start every
 * unit at 1-star, then greedily raise the single star that lands total gold
 * closest to BUDGET. Deterministic and pure. A slate whose 1-star floor already
 * exceeds BUDGET (can't be built to budget) is invalid and throws.
 */
function makeComp(id: string, name: string, targets: string[], defIds: string[], data: GameData): Composition {
  if (defIds.length !== LEVEL) throw new Error(`comp ${id} must field ${LEVEL} units, got ${defIds.length}`);
  const defs = defIds.map((d) => {
    const def = data.units.find((u) => u.id === d);
    if (!def) throw new Error(`comp ${id} references unknown unit ${d}`);
    return def;
  });
  const stars: (1 | 2 | 3)[] = defs.map(() => 1);
  const gold = () => defs.reduce((s, def, i) => s + unitGoldCost(def, stars[i]!), 0);
  if (gold() > BUDGET + BUDGET_TOLERANCE) {
    throw new Error(`comp ${id} 1-star floor ${gold()} exceeds budget ${BUDGET}`);
  }
  for (;;) {
    let bestI = -1;
    let bestGap = Math.abs(BUDGET - gold());
    for (let i = 0; i < defs.length; i++) {
      const s = stars[i]!;
      if (s >= maxStar(defs[i]!.tier)) continue;
      const inc = unitGoldCost(defs[i]!, (s + 1) as 1 | 2 | 3) - unitGoldCost(defs[i]!, s);
      const gap = Math.abs(BUDGET - (gold() + inc));
      if (gap < bestGap) {
        bestGap = gap;
        bestI = i;
      }
    }
    if (bestI < 0) break;
    stars[bestI] = (stars[bestI]! + 1) as 1 | 2 | 3;
  }
  return { id, name, targets, units: defIds.map((d, i) => ({ defId: d, star: stars[i]! })) };
}

/**
 * Deliberate archetype coverage at equal level + equal gold:
 *  - pure-frontline (melee tanks/bruisers)
 *  - pure-backline-carry (ranged casters/carries)
 *  - mixed frontline+carry per major trait (backline traits get a tank present)
 * Every unit appears in >=3 distinct comps so its per-unit signal is real.
 */
const SLATES: Array<[string, string, string[], string[]]> = [
  // pure-frontline
  ["knights_front", "Knights (frontline)", ["knight"], ["warrior", "paladin", "squire", "knight_errant", "frost_knight", "sentinel", "templar", "dragonlord"]],
  ["wardens_front", "Wardens (frontline)", ["warden"], ["footman", "sentinel", "frost_knight", "vanguard", "treant", "paragon", "god_king", "knight_errant"]],
  ["berserkers_front", "Berserkers (frontline)", ["berserker"], ["brawler", "reaver", "champion", "ravager", "dragonlord", "world_ender", "void_reaper", "footman"]],
  ["duelists_front", "Duelists (frontline)", ["duelist"], ["cutpurse", "fencer", "ravager", "spellblade", "nightlord", "world_ender", "brawler", "champion"]],
  // pure-backline-carry
  ["sorcerers_back", "Sorcerers (backline)", ["sorcerer"], ["mage", "archmage", "pyromancer", "stormcaller", "sage", "phoenix", "frostmage", "archsage"]],
  ["gunners_back", "Gunners (backline)", ["gunner"], ["scout", "sharpshooter", "arbalest", "stormlord", "huntress", "archer", "ranger", "houndmaster"]],
  ["mystics_back", "Mystics (backline)", ["mystic"], ["acolyte", "warpriest", "stormcaller", "necromancer", "archon", "archsage", "lich", "novice"]],
  ["rangers_back", "Rangers (backline)", ["ranger"], ["archer", "ranger", "sharpshooter", "houndmaster", "stormlord", "huntress", "scout", "arbalest"]],
  // mixed frontline + carry, one per major trait
  ["holy_mixed", "Holy (mixed)", ["holy"], ["paladin", "templar", "god_king", "frost_knight", "cleric", "sage", "warpriest", "archon"]],
  ["frost_mixed", "Frost (mixed)", ["frost"], ["warrior", "sentinel", "frost_knight", "paragon", "frostmage", "mage", "archmage", "archsage"]],
  ["shadow_mixed", "Shadow (mixed)", ["shadow"], ["treant", "rogue", "cutpurse", "nightblade", "shadowblade", "wraith", "nightlord", "void_reaper"]],
  ["storm_mixed", "Storm (mixed)", ["storm"], ["vanguard", "frost_knight", "scout", "stormcaller", "arbalest", "stormlord", "sharpshooter", "huntress"]],
  ["dragon_mixed", "Dragon (mixed)", ["dragon"], ["footman", "champion", "dragonlord", "treant", "phoenix", "brawler", "reaver", "sage"]],
  ["beast_mixed", "Beast (mixed)", ["beast"], ["sentinel", "brawler", "ranger", "houndmaster", "ravager", "archer", "sharpshooter", "treant"]],
  ["undead_mixed", "Undead (mixed)", ["undead"], ["treant", "acolyte", "necromancer", "wraith", "lich", "novice", "warpriest", "archon"]],
  ["celestial_mixed", "Celestial (mixed)", ["celestial"], ["knight_errant", "vanguard", "paragon", "fencer", "archmage", "sharpshooter", "sage", "world_ender"]],
  ["elemental_mixed", "Elemental (mixed)", ["elemental"], ["squire", "pyromancer", "paladin", "mage", "archmage", "frostmage", "sentinel", "cleric"]],
  ["arcane_mixed", "Arcane (mixed)", ["arcane"], ["paragon", "mage", "archmage", "novice", "spellblade", "archsage", "pyromancer", "frostmage"]],
  ["summoner_mixed", "Summoner (mixed)", ["summoner"], ["treant", "novice", "houndmaster", "necromancer", "lich", "acolyte", "archon", "sharpshooter"]],
  ["gunner_mixed", "Gunner (mixed)", ["gunner"], ["vanguard", "paragon", "scout", "sharpshooter", "arbalest", "stormlord", "huntress", "ranger"]],
  ["assassin_mixed", "Assassin (mixed)", ["assassin"], ["rogue", "cutpurse", "nightblade", "shadowblade", "wraith", "nightlord", "void_reaper", "fencer"]],
  ["holy_knights", "Holy Knights (mixed)", ["holy", "knight"], ["warrior", "paladin", "templar", "god_king", "cleric", "sage", "warpriest", "phoenix"]],
  ["melee_carry", "Melee Carry (mixed)", ["assassin", "duelist"], ["rogue", "nightblade", "shadowblade", "squire", "spellblade", "reaver", "world_ender", "templar"]],
];

export const COMPOSITIONS: Composition[] = SLATES.map(([id, name, targets, defIds]) =>
  makeComp(id, name, targets, defIds, gameData)
);

/** Completed items handed to a comp when itemsPerComp = 6 (carry-concentrated). */
const AP_ITEMS = ["mana_crystal__sorcerer_rod", "mana_crystal__giants_belt", "sorcerer_rod__tear_flask"];
const AD_ITEMS = ["iron_sword__sparring_gloves", "recurve_bow__sparring_gloves"];
const TANK_ITEMS = ["chain_vest__giants_belt"];

/** Assign `itemsPerComp` completed items sensibly: AP stack on the best ability
 * carry, AD stack on the best attacker, the tank item on the beefiest unit. */
function assignItems(units: UnitInstance[], itemsPerComp: number): void {
  if (itemsPerComp <= 0) return;
  const taken = new Set<number>();
  const pick = (score: (u: UnitInstance) => number): UnitInstance | undefined => {
    let best: UnitInstance | undefined;
    for (const u of units) {
      if (taken.has(u.uid)) continue;
      if (!best || score(u) > score(best) || (score(u) === score(best) && u.uid < best.uid)) best = u;
    }
    if (best) taken.add(best.uid);
    return best;
  };
  const ap = pick((u) => u.abilityDamage);
  const ad = pick((u) => u.ad);
  const tank = pick((u) => u.maxHp + u.armor * 10);
  if (ap) ap.items = [...AP_ITEMS];
  if (ad) ad.items = [...AD_ITEMS];
  if (tank) tank.items = [...TANK_ITEMS];
}

/**
 * Place melee (range 1) on the front row and ranged on the back row, filling
 * distinct hexes deterministically (spills into the other row if a row fills).
 */
export function buildBoard(comp: Composition, team: 0 | 1, data: GameData, itemsPerComp = 0): BoardState {
  const units: UnitInstance[] = comp.units.map((cu, i) => {
    const def = data.units.find((d) => d.id === cu.defId);
    if (!def) throw new Error(`comp ${comp.id} references unknown unit ${cu.defId}`);
    return {
      uid: team * 1000 + i,
      defId: def.id,
      tier: def.tier,
      star: cu.star,
      team,
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
  });

  const frontRow = team === 0 ? 1 : 6;
  const backRow = team === 0 ? 0 : 7;
  const used = new Set<string>();
  const place = (prefRow: number, altRow: number): { q: number; r: number } => {
    for (const r of [prefRow, altRow]) {
      for (let q = 0; q < 7; q++) {
        const key = `${q},${r}`;
        if (!used.has(key)) {
          used.add(key);
          return { q, r };
        }
      }
    }
    throw new Error(`comp ${comp.id}: no free hex`);
  };
  for (const u of units) {
    u.pos = u.range <= 1 ? place(frontRow, backRow) : place(backRow, frontRow);
  }

  assignItems(units, itemsPerComp);
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
