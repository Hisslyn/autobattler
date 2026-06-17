import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { gameData } from "@autobattler/data";
import { createMatch } from "@autobattler/rules";
import { runPveRound } from "@autobattler/rules/src/rounds.js";
import { mulberry32 } from "@autobattler/sim/src/prng.js";
import { stateAtTick } from "../src/combat/reducer.js";

const MATCH_SRC = readFileSync(join(import.meta.dirname, "../src/scenes/match.ts"), "utf8");

/** Slice the `renderBoard` method body from match.ts source for structural scans. */
function renderBoardBody(): string {
  const start = MATCH_SRC.indexOf("private renderBoard(");
  expect(start).toBeGreaterThan(-1);
  // renderBoard ends where the bench-geometry helper begins.
  const end = MATCH_SRC.indexOf("private benchGeom()", start);
  expect(end).toBeGreaterThan(start);
  return MATCH_SRC.slice(start, end);
}

describe("pve combat result renders mobs", () => {
  it("init event includes mob units (side 1)", () => {
    const state = createMatch(42, gameData);
    const d: any = gameData.units[0]!;
    state.players[0]!.board[24] = {
      uid: state.nextUid++, defId: d.id, tier: d.tier, star: 1, team: 0,
      pos: { q: 0, r: 0 }, hp: d.hp, maxHp: d.hp, ad: d.ad, as: d.as, armor: d.armor,
      mr: d.mr, range: d.range, mana: 0, maxMana: d.mana, abilityDamage: d.abilityDamage,
      attackCooldown: 0, statusEffects: [], items: [],
    } as any;
    state.round = 1;
    runPveRound(state, mulberry32(state.prngState), gameData);
    const result = state.lastCombatResults.get(0)!;
    expect(result.events.length).toBeGreaterThan(0);
    const s0 = stateAtTick(result.events, 0);
    const sides = [...s0.units.values()].map((u) => u.side);
    expect(sides.filter((x) => x === 1).length).toBeGreaterThan(0);
    expect(sides.filter((x) => x === 0).length).toBeGreaterThan(0);
  });
});

describe("PvE creeps render inline on the enemy half (read-only)", () => {
  const body = renderBoardBody();

  it("tints the enemy half with mobZone on a PvE round (mirrors onCombatPhase)", () => {
    // PvE-aware enemy-zone fill, exactly like the combat-phase pattern.
    expect(body).toMatch(/isPveRound\s*\?\s*C\.mobZone\s*:\s*C\.enemyHex/);
  });

  it("renders the upcoming creep board via the pure driver accessor with withBars=false", () => {
    expect(body).toContain("this.driver.getUpcomingPveBoard()");
    // withBars=false: drawUnit(..., false, false) — no bars, mobTint ring auto-fires.
    expect(body).toMatch(/drawUnit\(uc,\s*unit,\s*x,\s*y,\s*tokR,\s*false,\s*false\)/);
  });

  it("makes mob tokens READ-ONLY: long-press inspect only, never draggable", () => {
    // Isolate the PvE mob-render block (between the getUpcomingPveBoard() call and
    // the player-zone loop that follows it).
    const mobStart = body.indexOf("getUpcomingPveBoard()");
    const mobEnd = body.indexOf("// Player zone", mobStart);
    expect(mobStart).toBeGreaterThan(-1);
    expect(mobEnd).toBeGreaterThan(mobStart);
    const mobBlock = body.slice(mobStart, mobEnd);

    // The only interaction is long-press → inspect (same armInspect path as units).
    expect(mobBlock).toContain("this.armInspect(");
    // Non-grabbing cursor — read-only, not draggable.
    expect(mobBlock).toContain('cursor = "default"');
    // No drag handlers wired on a mob token.
    expect(mobBlock).not.toContain("startDragBoard");
    expect(mobBlock).not.toContain("startDrag");
    expect(mobBlock).not.toMatch(/cursor\s*=\s*"grab"/);
  });

  it("leaves the enemy-zone hex tiles non-interactive (no drop targets)", () => {
    // The enemy-zone hex loop (drawn before the mob render) must not wire pointer
    // handlers or set eventMode static on the hex graphics — only the player-zone
    // loop does. Scan the enemy-zone loop slice.
    const enemyStart = body.indexOf("// Enemy zone");
    const mobOrPlayer = body.indexOf("PvE creep preview", enemyStart);
    expect(enemyStart).toBeGreaterThan(-1);
    expect(mobOrPlayer).toBeGreaterThan(enemyStart);
    const enemyLoop = body.slice(enemyStart, mobOrPlayer);
    // No interactivity on the enemy hex tiles.
    expect(enemyLoop).not.toContain("onHexPointerDown");
    expect(enemyLoop).not.toContain('eventMode = "static"');
    expect(enemyLoop).not.toContain('cursor = "pointer"');
  });
});
