import { describe, it, expect } from "vitest";
import { gameData } from "@autobattler/data";
import { createMatch } from "../src/match.js";
import { applyCommand } from "../src/commands.js";
import { mulberry32 } from "@autobattler/sim/src/prng.js";
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

// Bench is 9 FIXED positional slots (holes allowed); build one from live units.
function makeBench(units: UnitInstance[]): (UnitInstance | null)[] {
  const bench: (UnitInstance | null)[] = new Array(gameData.gameplay.benchMax).fill(null);
  units.forEach((u, i) => { bench[i] = u; });
  return bench;
}

/** Count of occupied bench slots. */
function benchCount(bench: (UnitInstance | null)[]): number {
  return bench.filter((u) => u != null).length;
}

describe("command validation", () => {
  it("BUY rejects insufficient gold", () => {
    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    const player = state.players[0]!;
    player.gold = 0;
    const slot = player.shop.findIndex((s) => s !== null);
    if (slot < 0) return; // no shop slot available, skip
    const result = applyCommand(state, 0, { type: "BUY", shopSlotIndex: slot }, prng, gameData);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("INSUFFICIENT_GOLD");
  });

  it("BUY rejects empty slot", () => {
    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    state.players[0]!.gold = 100;
    state.players[0]!.shop[4] = null;
    const result = applyCommand(state, 0, { type: "BUY", shopSlotIndex: 4 }, prng, gameData);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("EMPTY_SLOT");
  });

  it("BUY rejects when bench is full and purchase does not complete a merge", () => {
    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    const player = state.players[0]!;
    player.gold = 100;
    player.level = 1;
    // Clear the default starting unit, then fill bench to max with 9 distinct
    // units so no merge is possible.
    player.bench = makeBench(
      Array.from({ length: 9 }, (_, i) => makeUnit(9000 + i, gameData.units[i]!.id))
    );
    const defId = gameData.units[10]!.id;
    player.shop[0] = { defId, tier: gameData.units[10]!.tier };
    const result = applyCommand(state, 0, { type: "BUY", shopSlotIndex: 0 }, prng, gameData);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("BENCH_FULL");
    expect(benchCount(player.bench)).toBe(9);
  });

  it("BUY with full bench succeeds when it immediately completes a merge", () => {
    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    const player = state.players[0]!;
    player.gold = 100;
    player.level = 1;
    const defId = gameData.units[0]!.id;
    // Clear the default starting unit, then build a full bench:
    // 2 copies of defId + 7 distinct fillers.
    player.bench = makeBench([
      makeUnit(9000, defId),
      makeUnit(9001, defId),
      ...Array.from({ length: 7 }, (_, i) => makeUnit(9100 + i, gameData.units[i + 1]!.id)),
    ]);
    expect(benchCount(player.bench)).toBe(9);
    player.shop[0] = { defId, tier: 1 };
    const result = applyCommand(state, 0, { type: "BUY", shopSlotIndex: 0 }, prng, gameData);
    expect(result.ok).toBe(true);
    // Net bench growth <= 0: 3 copies merged into one 2-star
    expect(benchCount(player.bench)).toBeLessThanOrEqual(9);
    const twoStar = player.bench.find((u) => u != null && u.defId === defId && u.star === 2);
    expect(twoStar).toBeDefined();
  });

  it("MOVE rejects board cap at player level", () => {
    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    const player = state.players[0]!;
    player.level = 1;
    const defId = gameData.units[0]!.id;
    const u1 = makeUnit(8001, defId);
    const u2 = makeUnit(8002, defId);
    // Board already at cap (1 unit for level 1)
    player.board[0] = u1;
    player.bench = makeBench([u2]);
    const result = applyCommand(
      state, 0,
      { type: "MOVE", unitUid: u2.uid, toBench: false, toIndex: 1 },
      prng, gameData
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("BOARD_FULL");
  });

  // ── Fixed positional bench (9 slots, no compaction) ──────────────────────
  describe("bench is 9 fixed positional slots", () => {
    const defId = () => gameData.units[0]!.id;
    const otherId = () => gameData.units[1]!.id;

    it("BUY fills the lowest-index empty slot", () => {
      const state = createMatch(1, gameData);
      const prng = mulberry32(1);
      const player = state.players[0]!;
      player.gold = 100;
      // Bench: slot 0 occupied (starting unit), slots 1-2 occupied, leave a gap at 1.
      player.bench = makeBench([]);
      player.bench[0] = makeUnit(100, otherId());
      player.bench[2] = makeUnit(101, otherId()); // gap at slot 1
      const buyId = gameData.units[5]!.id;
      player.shop[0] = { defId: buyId, tier: gameData.units[5]!.tier };
      const res = applyCommand(state, 0, { type: "BUY", shopSlotIndex: 0 }, prng, gameData);
      expect(res.ok).toBe(true);
      // Lowest empty slot was 1 → the new unit must land there.
      expect(player.bench[1]?.defId).toBe(buyId);
      expect(player.bench[0]?.uid).toBe(100);
      expect(player.bench[2]?.uid).toBe(101);
    });

    it("MOVE bench→empty bench slot moves to exactly that slot, leaving the old empty", () => {
      const state = createMatch(1, gameData);
      const prng = mulberry32(1);
      const player = state.players[0]!;
      const u = makeUnit(200, defId());
      player.bench = makeBench([]);
      player.bench[0] = u;
      const res = applyCommand(state, 0, { type: "MOVE", unitUid: 200, toBench: true, toIndex: 5 }, prng, gameData);
      expect(res.ok).toBe(true);
      expect(player.bench[5]?.uid).toBe(200);
      expect(player.bench[0]).toBeNull();
      // No reflow: every other slot stays empty.
      expect(benchCount(player.bench)).toBe(1);
    });

    it("MOVE bench→occupied bench slot SWAPS the two units' slots", () => {
      const state = createMatch(1, gameData);
      const prng = mulberry32(1);
      const player = state.players[0]!;
      const a = makeUnit(300, defId());
      const b = makeUnit(301, otherId());
      player.bench = makeBench([]);
      player.bench[1] = a;
      player.bench[6] = b;
      const res = applyCommand(state, 0, { type: "MOVE", unitUid: 300, toBench: true, toIndex: 6 }, prng, gameData);
      expect(res.ok).toBe(true);
      expect(player.bench[6]?.uid).toBe(300);
      expect(player.bench[1]?.uid).toBe(301);
      expect(benchCount(player.bench)).toBe(2);
    });

    it("SELL empties only that unit's slot — never shifts others (rightmost gap persists)", () => {
      const state = createMatch(1, gameData);
      const prng = mulberry32(1);
      const player = state.players[0]!;
      player.bench = makeBench([]);
      player.bench[0] = makeUnit(400, defId());
      player.bench[3] = makeUnit(401, otherId());
      player.bench[8] = makeUnit(402, otherId()); // rightmost slot occupied
      const res = applyCommand(state, 0, { type: "SELL", unitUid: 401 }, prng, gameData);
      expect(res.ok).toBe(true);
      expect(player.bench[3]).toBeNull();
      // Others unmoved — including the rightmost slot gap.
      expect(player.bench[0]?.uid).toBe(400);
      expect(player.bench[8]?.uid).toBe(402);
    });

    it("MOVE bench→board empties only that bench slot (no reflow)", () => {
      const state = createMatch(1, gameData);
      const prng = mulberry32(1);
      const player = state.players[0]!;
      player.level = 3;
      player.bench = makeBench([]);
      player.bench[2] = makeUnit(500, defId());
      player.bench[5] = makeUnit(501, otherId());
      const res = applyCommand(state, 0, { type: "MOVE", unitUid: 500, toBench: false, toIndex: 0 }, prng, gameData);
      expect(res.ok).toBe(true);
      expect(player.board[0]?.uid).toBe(500);
      expect(player.bench[2]).toBeNull();
      expect(player.bench[5]?.uid).toBe(501); // untouched, still at slot 5
    });

    it("arbitrary gaps persist across a sequence of operations", () => {
      const state = createMatch(1, gameData);
      const prng = mulberry32(1);
      const player = state.players[0]!;
      player.level = 3;
      player.bench = makeBench([]);
      player.bench[0] = makeUnit(600, defId());
      player.bench[4] = makeUnit(601, otherId());
      player.bench[7] = makeUnit(602, otherId());
      // Move 600 (slot 0) to empty slot 8.
      applyCommand(state, 0, { type: "MOVE", unitUid: 600, toBench: true, toIndex: 8 }, prng, gameData);
      // Swap 601 (slot 4) with 602 (slot 7).
      applyCommand(state, 0, { type: "MOVE", unitUid: 601, toBench: true, toIndex: 7 }, prng, gameData);
      expect(player.bench[8]?.uid).toBe(600);
      expect(player.bench[7]?.uid).toBe(601);
      expect(player.bench[4]?.uid).toBe(602);
      expect(player.bench[0]).toBeNull();
      expect(benchCount(player.bench)).toBe(3);
      // Bench length never grows past benchMax.
      expect(player.bench.length).toBe(gameData.gameplay.benchMax);
    });
  });

  it("SELL returns gold and unit goes away", () => {
    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    const player = state.players[0]!;
    const defId = gameData.units[0]!.id;
    const unit = makeUnit(7001, defId);
    player.bench = makeBench([unit]);
    const goldBefore = player.gold;
    const result = applyCommand(state, 0, { type: "SELL", unitUid: 7001 }, prng, gameData);
    expect(result.ok).toBe(true);
    expect(benchCount(player.bench)).toBe(0);
    expect(player.gold).toBeGreaterThan(goldBefore);
  });

  it("SELL rejects non-existent unit", () => {
    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    const result = applyCommand(state, 0, { type: "SELL", unitUid: 999999 }, prng, gameData);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("UNIT_NOT_FOUND");
  });

  it("REROLL rejects insufficient gold", () => {
    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    state.players[0]!.gold = 0;
    const result = applyCommand(state, 0, { type: "REROLL" }, prng, gameData);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("INSUFFICIENT_GOLD");
  });

  it("BUY_XP rejects insufficient gold", () => {
    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    state.players[0]!.gold = 0;
    const result = applyCommand(state, 0, { type: "BUY_XP" }, prng, gameData);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("INSUFFICIENT_GOLD");
  });

  it("rejects every command outside PLANNING with PHASE_INVALID", () => {
    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    const player = state.players[0]!;
    player.gold = 100;
    player.bench = makeBench([makeUnit(5001, gameData.units[0]!.id)]);
    player.items = ["iron_sword"];
    const slot = player.shop.findIndex((s) => s !== null);
    const commands = [
      { type: "BUY", shopSlotIndex: slot },
      { type: "SELL", unitUid: 5001 },
      { type: "REROLL" },
      { type: "BUY_XP" },
      { type: "MOVE", unitUid: 5001, toBench: false, toIndex: 0 },
      { type: "EQUIP", unitUid: 5001, itemId: "iron_sword" },
    ] as const;
    for (const phase of ["COMBAT", "RESOLUTION"] as const) {
      state.phase = phase;
      for (const cmd of commands) {
        const result = applyCommand(state, 0, cmd, prng, gameData);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toBe("PHASE_INVALID");
      }
    }
    // Sanity: same commands are accepted again in PLANNING
    state.phase = "PLANNING";
    expect(applyCommand(state, 0, { type: "BUY_XP" }, prng, gameData).ok).toBe(true);
  });

  it("EQUIP rejects missing item", () => {
    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    const player = state.players[0]!;
    const defId = gameData.units[0]!.id;
    player.bench = makeBench([makeUnit(6001, defId)]);
    player.items = []; // no items
    const result = applyCommand(
      state, 0,
      { type: "EQUIP", unitUid: 6001, itemId: "iron_sword" },
      prng, gameData
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("ITEM_NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// GAP 2: SELL exact gold refund at the rules layer —
//   formula: tier × copiesPerStar[star] × sellValueMultiplier
//   All constants read from gameData (never hardcoded).
// ---------------------------------------------------------------------------
describe("SELL exact refund amount (rules layer)", () => {
  const { copiesPerStar, sellValueMultiplier } = gameData.gameplay;

  it("SELL 1-star unit: refund = tier × copiesPerStar[1] × sellValueMultiplier", () => {
    // Use the first tier-1 unit so tier = 1.
    const unitDef = gameData.units.find((u) => u.tier === 1)!;
    const expectedRefund = unitDef.tier * copiesPerStar["1"]! * sellValueMultiplier;

    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    const player = state.players[0]!;
    const unit = makeUnit(8500, unitDef.id);
    unit.star = 1;
    player.bench = makeBench([unit]);
    player.gold = 0;

    const result = applyCommand(state, 0, { type: "SELL", unitUid: 8500 }, prng, gameData);
    expect(result.ok).toBe(true);
    expect(player.gold).toBe(expectedRefund);
  });

  it("SELL 2-star unit: refund = tier × copiesPerStar[2] × sellValueMultiplier", () => {
    // Use the first tier-1 unit for a clear expected value.
    const unitDef = gameData.units.find((u) => u.tier === 1)!;
    const expectedRefund = unitDef.tier * copiesPerStar["2"]! * sellValueMultiplier;

    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    const player = state.players[0]!;
    const unit = makeUnit(8501, unitDef.id);
    unit.star = 2;
    player.bench = makeBench([unit]);
    player.gold = 0;

    const result = applyCommand(state, 0, { type: "SELL", unitUid: 8501 }, prng, gameData);
    expect(result.ok).toBe(true);
    // copiesPerStar[2] = 3, so this is 3× the 1-star refund.
    expect(player.gold).toBe(expectedRefund);
  });

  it("SELL 3-star unit: refund = tier × copiesPerStar[3] × sellValueMultiplier", () => {
    const unitDef = gameData.units.find((u) => u.tier === 1)!;
    const expectedRefund = unitDef.tier * copiesPerStar["3"]! * sellValueMultiplier;

    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    const player = state.players[0]!;
    const unit = makeUnit(8502, unitDef.id);
    unit.star = 3;
    player.bench = makeBench([unit]);
    player.gold = 0;

    const result = applyCommand(state, 0, { type: "SELL", unitUid: 8502 }, prng, gameData);
    expect(result.ok).toBe(true);
    // copiesPerStar[3] = 9, so this is 9× the 1-star refund.
    expect(player.gold).toBe(expectedRefund);
  });

  it("SELL higher-tier 1-star unit: refund scales by tier (tier read from gameData)", () => {
    // Use the first tier-3 unit to verify the tier multiplier is not always 1.
    const unitDef = gameData.units.find((u) => u.tier === 3)!;
    const expectedRefund = unitDef.tier * copiesPerStar["1"]! * sellValueMultiplier;

    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    const player = state.players[0]!;
    const unit = makeUnit(8503, unitDef.id);
    unit.star = 1;
    player.bench = makeBench([unit]);
    player.gold = 0;

    const result = applyCommand(state, 0, { type: "SELL", unitUid: 8503 }, prng, gameData);
    expect(result.ok).toBe(true);
    expect(player.gold).toBe(expectedRefund);
  });
});

// ---------------------------------------------------------------------------
// GAP 3: BUY exact gold deduction —
//   buying a tier-N unit must deduct exactly N gold (cost === tier).
//   Tier read from gameData, never hardcoded.
// ---------------------------------------------------------------------------
describe("BUY exact gold deduction (rules layer)", () => {
  it("BUY tier-1 unit: deducts exactly 1 gold", () => {
    const unitDef = gameData.units.find((u) => u.tier === 1)!;

    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    const player = state.players[0]!;
    player.gold = 50;
    player.bench = makeBench([]); // empty bench (room to buy)
    player.shop[0] = { defId: unitDef.id, tier: unitDef.tier };

    const goldBefore = player.gold;
    const result = applyCommand(state, 0, { type: "BUY", shopSlotIndex: 0 }, prng, gameData);
    expect(result.ok).toBe(true);
    expect(player.gold).toBe(goldBefore - unitDef.tier);
  });

  it("BUY tier-3 unit: deducts exactly 3 gold", () => {
    const unitDef = gameData.units.find((u) => u.tier === 3)!;

    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    const player = state.players[0]!;
    player.gold = 50;
    player.bench = makeBench([]);
    player.shop[0] = { defId: unitDef.id, tier: unitDef.tier };

    const goldBefore = player.gold;
    const result = applyCommand(state, 0, { type: "BUY", shopSlotIndex: 0 }, prng, gameData);
    expect(result.ok).toBe(true);
    expect(player.gold).toBe(goldBefore - unitDef.tier);
  });

  it("BUY tier-5 unit: deducts exactly 5 gold", () => {
    const unitDef = gameData.units.find((u) => u.tier === 5)!;

    const state = createMatch(1, gameData);
    const prng = mulberry32(1);
    const player = state.players[0]!;
    player.gold = 50;
    player.bench = makeBench([]);
    player.shop[0] = { defId: unitDef.id, tier: unitDef.tier };

    const goldBefore = player.gold;
    const result = applyCommand(state, 0, { type: "BUY", shopSlotIndex: 0 }, prng, gameData);
    expect(result.ok).toBe(true);
    expect(player.gold).toBe(goldBefore - unitDef.tier);
  });
});
