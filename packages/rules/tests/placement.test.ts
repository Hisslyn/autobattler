import { describe, it, expect } from "vitest";
import { gameData } from "@autobattler/data";
import { boardToCombatState } from "../src/rounds.js";
import { simulateCombat } from "@autobattler/sim";
import { COLS, ROWS } from "@autobattler/sim/src/hex.js";
import type { UnitInstance } from "@autobattler/sim/src/types.js";

function makeUnit(uid: number, defId: string): UnitInstance {
  const def = gameData.units.find((d) => d.id === defId)!;
  return {
    uid,
    defId,
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
    attackCooldown: 0,
    statusEffects: [],
    items: [],
  };
}

// Player half is COLS × 4 rows; board slot index encodes (q, r):
//   q = idx % COLS, r = floor(idx / COLS), r ∈ {0..3}.
// The BACK row (away from the player) is r = 0 → slots 0..COLS-1.
const BACK_ROW_SLOT = 0; // q=0, r=0 — the back-left corner

describe("placement → combat hex preservation", () => {
  it("boardToCombatState maps a back-row slot to its exact hex (side 0)", () => {
    const board: (UnitInstance | null)[] = new Array(gameData.gameplay.boardSlots).fill(null);
    board[BACK_ROW_SLOT] = makeUnit(1, gameData.units[0]!.id);
    const cs = boardToCombatState(board, 0);
    expect(cs.units).toHaveLength(1);
    // Back-row slot 0 → q=0, r=0. The unit must NOT jump to the front row.
    expect(cs.units[0]!.pos).toEqual({ q: 0, r: 0 });
  });

  it("preserves the full back row 1:1 (every column keeps r=0)", () => {
    const board: (UnitInstance | null)[] = new Array(gameData.gameplay.boardSlots).fill(null);
    for (let q = 0; q < COLS; q++) board[q] = makeUnit(10 + q, gameData.units[0]!.id);
    const cs = boardToCombatState(board, 0);
    for (const u of cs.units) {
      expect(u.pos.r).toBe(0);
    }
    expect(cs.units.map((u) => u.pos.q).sort((a, b) => a - b)).toEqual(
      Array.from({ length: COLS }, (_, q) => q)
    );
  });

  it("a side-1 back-row placement keeps its (mirrored) hex", () => {
    // Side 1 places slot idx → r = ROWS-1 - floor(idx/COLS). Slot 0 (the player's
    // back row in their own array) lands on sim row ROWS-1.
    const board: (UnitInstance | null)[] = new Array(gameData.gameplay.boardSlots).fill(null);
    board[BACK_ROW_SLOT] = makeUnit(1, gameData.units[0]!.id);
    const cs = boardToCombatState(board, 1);
    expect(cs.units[0]!.pos).toEqual({ q: 0, r: ROWS - 1 });
  });

  it("the init event log carries the placed back-row hex unchanged", () => {
    const a: (UnitInstance | null)[] = new Array(gameData.gameplay.boardSlots).fill(null);
    a[BACK_ROW_SLOT] = makeUnit(1, gameData.units[0]!.id); // back-row, q=0 r=0
    const b: (UnitInstance | null)[] = new Array(gameData.gameplay.boardSlots).fill(null);
    b[0] = makeUnit(2, gameData.units[0]!.id);

    const boardA = boardToCombatState(a, 0);
    const boardB = boardToCombatState(b, 1);
    const result = simulateCombat(boardA, boardB, 123, gameData);

    const init = result.events.find((e) => e.type === "init");
    expect(init).toBeDefined();
    const u1 = (init as Extract<typeof init, { type: "init" }>).units.find((u) => u.uid === 1)!;
    // The unit started on the back row (r=0) and the init snapshot must show r=0,
    // not a front-row remap.
    expect(u1.hex).toEqual({ q: 0, r: 0 });
  });
});
