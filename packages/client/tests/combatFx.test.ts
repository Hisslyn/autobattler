import { describe, it, expect } from "vitest";
import type { GameData } from "@autobattler/data";
import type { CombatEvent } from "@autobattler/sim/src/types.js";
import { hexDistance } from "@autobattler/sim/src/hex.js";
import { CombatPlayer } from "../src/combat/player.js";
import type { CombatFx } from "../src/combat/player.js";

// Minimal data the player needs: id → range + ability effect kind.
const DATA = {
  units: [
    { id: "archer", range: 3, ability: { effect: { kind: "magic_damage" } } },
    { id: "knight", range: 1 },
    { id: "mage", range: 1, ability: { effect: { kind: "shield", amount: 100, duration: 40 } } },
    { id: "dummy", range: 1 },
  ],
} as unknown as GameData;

const ARCHER = { q: 0, r: 0 };
const KNIGHT = { q: 1, r: 0 };
const MAGE = { q: 2, r: 0 };
const TARGET = { q: 0, r: 3 };

function snap(uid: number, defId: string, side: 0 | 1, hex: { q: number; r: number }) {
  return { uid, side, defId, star: 1 as const, hex, hp: 1000, maxHp: 1000, mana: 0, maxMana: 100, items: [] };
}

function fixedLog(): CombatEvent[] {
  return [
    { type: "init", tick: 0, units: [
      snap(1, "archer", 0, ARCHER),
      snap(2, "knight", 0, KNIGHT),
      snap(3, "mage", 0, MAGE),
      snap(10, "dummy", 1, TARGET),
    ] },
    { type: "attack", tick: 1, uid: 1, targetUid: 10, dmg: 50, crit: false },   // ranged
    { type: "attack", tick: 2, uid: 2, targetUid: 10, dmg: 80, crit: true },    // melee crit
    { type: "cast", tick: 3, uid: 3, targetUid: 10, dmg: 0 },                   // shield ability
    { type: "death", tick: 4, uid: 10 },
    { type: "end", tick: 5, winnerSide: 0, survivingUids: [1, 2, 3] },
  ];
}

/** Drain the whole log in one advance and return every emitted fx. */
function allFx(reducedMotion: boolean): CombatFx[] {
  const p = new CombatPlayer(fixedLog(), 20, DATA, { reducedMotion });
  return p.advance(10_000).fx;
}

describe("combat fx emission (known-answer over a fixed log)", () => {
  it("ranged attack emits a projectile with correct from/to/travel", () => {
    const fx = allFx(false);
    const proj = fx.find((f) => f.kind === "projectile");
    expect(proj).toBeDefined();
    if (proj?.kind !== "projectile") throw new Error("no projectile");
    expect(proj.fromPos).toEqual(ARCHER);
    expect(proj.toPos).toEqual(TARGET);
    expect(proj.targetUid).toBe(10);
    expect(proj.crit).toBe(false);
    const dist = hexDistance(ARCHER, TARGET);
    expect(proj.travelTicks).toBe(Math.max(2, Math.min(8, Math.round(dist * 1.5))));
    // ranged emits no melee contact for that attack
    expect(fx.some((f) => f.kind === "contact" && f.targetUid === 10)).toBe(true); // (from the melee unit, below)
  });

  it("melee attack emits a contact lunge", () => {
    const fx = allFx(false);
    const contact = fx.find((f) => f.kind === "contact");
    expect(contact).toBeDefined();
    if (contact?.kind !== "contact") throw new Error("no contact");
    expect(contact.fromPos).toEqual(KNIGHT);
    expect(contact.toPos).toEqual(TARGET);
    // melee did NOT emit a projectile
    const projTargets = fx.filter((f) => f.kind === "projectile").map((f) => (f.kind === "projectile" ? f.fromPos : null));
    expect(projTargets).toEqual([ARCHER]); // only the archer's bolt
  });

  it("crit attack emits a crit-flagged impact + floater", () => {
    const fx = allFx(false);
    const impact = fx.find((f) => f.kind === "impact" && f.crit);
    expect(impact).toBeDefined();
    const floater = fx.find((f) => f.kind === "floater" && f.crit);
    expect(floater).toBeDefined();
    if (floater?.kind !== "floater") throw new Error("no crit floater");
    expect(floater.amount).toBe(80);
    expect(floater.magic).toBe(false);
  });

  it("CAST emits abilityCast + abilityHit of the right kind", () => {
    const fx = allFx(false);
    const cast = fx.find((f) => f.kind === "abilityCast");
    const hit = fx.find((f) => f.kind === "abilityHit");
    expect(cast).toBeDefined();
    expect(hit).toBeDefined();
    if (cast?.kind !== "abilityCast" || hit?.kind !== "abilityHit") throw new Error("no ability fx");
    expect(cast.effect).toBe("shield");
    expect(hit.effect).toBe("shield");
    expect(hit.targetUid).toBe(10);
    expect(cast.casterPos).toEqual(MAGE);
  });

  it("DEATH emits a dissolve for the dying uid", () => {
    const fx = allFx(false);
    const dissolve = fx.find((f) => f.kind === "dissolve");
    expect(dissolve).toBeDefined();
    if (dissolve?.kind !== "dissolve") throw new Error("no dissolve");
    expect(dissolve.uid).toBe(10);
    expect(dissolve.pos).toEqual(TARGET);
  });

  it("non-crit ranged floater is lighter (not crit, physical)", () => {
    const fx = allFx(false);
    const floater = fx.find((f) => f.kind === "floater" && !f.crit && !f.magic);
    expect(floater).toBeDefined();
    if (floater?.kind !== "floater") throw new Error("no phys floater");
    expect(floater.amount).toBe(50);
  });

  it("reduced motion downgrades the emitted set", () => {
    const full = allFx(false);
    const reduced = allFx(true);
    // Heavy motion fx dropped under reduced motion.
    for (const kind of ["projectile", "contact", "abilityCast"] as const) {
      expect(full.some((f) => f.kind === kind)).toBe(true);
      expect(reduced.some((f) => f.kind === kind)).toBe(false);
    }
    // Readability/audio-essential fx survive.
    for (const kind of ["impact", "floater", "abilityHit", "dissolve"] as const) {
      expect(reduced.some((f) => f.kind === kind)).toBe(true);
    }
    expect(reduced.length).toBeLessThan(full.length);
  });

  it("playback fx are a deterministic function of the log", () => {
    expect(allFx(false)).toEqual(allFx(false));
    expect(allFx(true)).toEqual(allFx(true));
  });
});
