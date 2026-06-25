// Deterministic combat scenario fixtures for the trace harness + qa suite.
//
// PURE: no I/O, no Date, no Math.random. Every scenario is fixed units on fixed
// hexes with a fixed seed, built from real gameData unit defs. A UnitInstance is
// constructed the same way packages/balance's buildBoard does (base stats from
// the UnitDef, no items, attackCooldown 0, mana at the def's manaStart).
//
// Unit selection note: melee = range 1, ranged = range > 1. Single-copy boards
// use DISTINCT defIds so no trait reaches a 2-count breakpoint (a single unique
// defId carrying a trait grants no bonus — confirmed by applyTraits counting
// unique defIds), keeping damage conservation cleanly checkable.

import type { BoardState, UnitDef, UnitInstance } from "@autobattler/sim/src/types.js";
import type { HexCoord } from "@autobattler/sim/src/hex.js";
import { gameData } from "@autobattler/data";

export interface Scenario {
  name: string;
  description: string;
  seed: number;
  boardA: BoardState;
  boardB: BoardState;
}

function defById(id: string): UnitDef {
  const def = gameData.units.find((d) => d.id === id);
  if (!def) throw new Error(`scenarios: unknown unit def "${id}"`);
  return def;
}

/**
 * Build a live UnitInstance from a UnitDef at a fixed hex — modeled on
 * balance's buildBoard. Base 1-star stats, no items, mana at manaStart, fresh
 * (empty) status effects, attackCooldown 0.
 */
function buildInstance(
  def: UnitDef,
  opts: { uid: number; team: 0 | 1; star?: 1 | 2 | 3; pos: HexCoord }
): UnitInstance {
  const inst: UnitInstance = {
    uid: opts.uid,
    defId: def.id,
    tier: def.tier,
    star: opts.star ?? 1,
    team: opts.team,
    pos: { ...opts.pos },
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
    attackCooldown: 0,
    statusEffects: [],
    items: [],
  };
  if (def.ability) inst.ability = def.ability;
  return inst;
}

// Convenience: a one-unit board.
function board(...units: UnitInstance[]): BoardState {
  return { units };
}

// --- 1. melee_1v1 ----------------------------------------------------------
// Two melee units (range 1) placed adjacent so they trade attacks immediately.
// paladin/footman both self-cast (shield), so no magic nuke pollutes the trace.
const melee_1v1: Scenario = {
  name: "melee_1v1",
  description: "1 melee vs 1 melee, placed in attack range (adjacent).",
  seed: 1,
  boardA: board(buildInstance(defById("paladin"), { uid: 1, team: 0, pos: { q: 3, r: 3 } })),
  boardB: board(buildInstance(defById("footman"), { uid: 1001, team: 1, pos: { q: 3, r: 4 } })),
};

// --- 2. ranged_vs_melee ----------------------------------------------------
// A ranged archer (range 3) vs a melee footman that must close the gap. The
// melee unit walks several hexes before it can attack; the archer fires across.
const ranged_vs_melee: Scenario = {
  name: "ranged_vs_melee",
  description: "1 ranged (archer, range 3) vs 1 melee (footman) — melee must approach.",
  seed: 2,
  boardA: board(buildInstance(defById("archer"), { uid: 1, team: 0, pos: { q: 3, r: 1 } })),
  boardB: board(buildInstance(defById("footman"), { uid: 1001, team: 1, pos: { q: 3, r: 6 } })),
};

// --- 3. retarget_1v2 -------------------------------------------------------
// A lone ranged archer (range 3) at center vs two melee enemies approaching
// from slightly different positions. The stateless nearest-recompute flips the
// archer's resolved target between the two LIVE enemies as they advance
// (retarget_recomputed / switched_target_out_of_range) BEFORE either dies, and
// then switches off the first enemy to the second once it dies
// (switched_target_dead). Both enemies are distinct defIds (no trait count).
const retarget_1v2: Scenario = {
  name: "retarget_1v2",
  description:
    "1 ranged vs 2 melee: the stateless nearest-recompute flips the lone unit's " +
    "resolved target between the two LIVE enemies as they advance " +
    "(retarget_recomputed), then a switched_target_dead retarget once the first " +
    "enemy is killed. The lone unit (stormlord) survives to demonstrate both.",
  seed: 3,
  // A tanky ranged carry that wins the 1v2, so it retargets through both kills.
  boardA: board(buildInstance(defById("stormlord"), { uid: 1, team: 0, pos: { q: 3, r: 3 } })),
  boardB: board(
    // The two melee approach from offset positions so their nearest-distance
    // ordering crosses (flips the lone unit's resolved target) at least once
    // while both are alive, before either dies. (Verified via the harness: uid 1
    // emits a retarget_recomputed here, then a switched_target_dead.)
    buildInstance(defById("footman"), { uid: 1001, team: 1, pos: { q: 0, r: 5 } }),
    buildInstance(defById("brawler"), { uid: 1002, team: 1, pos: { q: 4, r: 4 } })
  ),
};

// --- 4. tiebreak_equidistant ----------------------------------------------
// Two enemies exactly equidistant from a single attacker — exercises the
// nearest/lowest-uid tiebreak (lower uid 1001 is chosen over 1002).
const tiebreak_equidistant: Scenario = {
  name: "tiebreak_equidistant",
  description:
    "Two enemies exactly equidistant from one attacker (archer at q3) — the " +
    "nearest/lowest-uid tiebreak picks uid 1001 over uid 1002.",
  seed: 4,
  boardA: board(buildInstance(defById("archer"), { uid: 1, team: 0, pos: { q: 3, r: 3 } })),
  boardB: board(
    buildInstance(defById("footman"), { uid: 1001, team: 1, pos: { q: 1, r: 3 } }),
    buildInstance(defById("brawler"), { uid: 1002, team: 1, pos: { q: 5, r: 3 } })
  ),
};

// --- 5. blocked_path -------------------------------------------------------
// A melee attacker whose target sits in the bottom-left corner fully walled in
// by a ring of allied units; A* cannot reach an adjacent hex, so the attacker
// can never close to range. The wall is the target's OWN teammates surrounding
// it (occupied hexes block pathing; only the goal hex itself is path-allowed,
// and every hex adjacent to the goal is occupied).
const blocked_path: Scenario = (() => {
  // The traced melee attacker (squire, uid 1) sits in the far corner. Its ONLY
  // enemy is a single footman boxed into corner (0,0). The footman's only
  // on-board neighbor hexes — (1,0), (0,1), (1,1) — are filled by the
  // attacker's OWN ALLIES (team 0, three rogues), so they are NOT targetable
  // enemies (the squire's nearest/only enemy stays the boxed footman) yet they
  // occupy every approach hex. A* therefore finds no path to within range and
  // the squire idles for the entire combat (verified via the harness: uid 1
  // makes 0 attacks). The allies kill the footman, ending the combat cleanly.
  // (rogue×3 is one unique defId → no trait breakpoint is triggered.)
  const attacker = buildInstance(defById("squire"), { uid: 1, team: 0, pos: { q: 6, r: 7 } });
  const wallA = buildInstance(defById("rogue"), { uid: 2, team: 0, pos: { q: 1, r: 0 } });
  const wallB = buildInstance(defById("rogue"), { uid: 3, team: 0, pos: { q: 0, r: 1 } });
  const wallC = buildInstance(defById("rogue"), { uid: 4, team: 0, pos: { q: 1, r: 1 } });
  const target = buildInstance(defById("footman"), { uid: 1001, team: 1, pos: { q: 0, r: 0 } });
  return {
    name: "blocked_path",
    description:
      "A melee attacker (squire) whose only enemy (footman in the corner) is " +
      "walled in by the attacker's own allies — A* is blocked, the squire never " +
      "reaches attack range.",
    seed: 5,
    boardA: board(attacker, wallA, wallB, wallC),
    boardB: board(target),
  };
})();

// --- 6. mana_breakpoint ----------------------------------------------------
// A mage (range 2, magic_damage ability, NOT burn) starts with mana 20/80 and
// fills mana via attacks (+manaPerAttack) and damage taken (+manaPerDamageTaken)
// until it casts its single-target nuke. A tanky melee target keeps the combat
// alive long enough for the cast to provably fire. magic_damage (not burn)
// keeps damage conservation cleanly checkable.
const mana_breakpoint: Scenario = {
  name: "mana_breakpoint",
  description:
    "A mage (magic_damage ability, mana 20/80) fills mana from attacks + damage " +
    "taken and provably casts its single-target nuke (act=cast) against a melee " +
    "footman that closes from range — the mage survives long enough to cast.",
  seed: 6,
  boardA: board(buildInstance(defById("mage"), { uid: 1, team: 0, pos: { q: 3, r: 2 } })),
  boardB: board(buildInstance(defById("footman"), { uid: 1001, team: 1, pos: { q: 3, r: 7 } })),
};

export const SCENARIOS: Scenario[] = [
  melee_1v1,
  ranged_vs_melee,
  retarget_1v2,
  tiebreak_equidistant,
  blocked_path,
  mana_breakpoint,
];

export function scenarioByName(name: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.name === name);
}
