import { describe, it, expect } from "vitest";
import { simulateCombat } from "../src/engine.js";
import { gameData } from "@autobattler/data";
import type { AbilityDef, BoardState, UnitInstance } from "../src/types.js";

// The Phase 3 artifacts carry a `pairPassive` that fires only when BOTH paired
// items are equipped on the SAME unit. There are two observable manifestations:
//   - voidstaff + voidmantle → a start-of-combat `shield` (absorbs early hits)
//   - warblade  + warplate   → an on-hit `burn` DoT (extra hp loss after attacks)
// These tests assert on those real event-log observables, never a guessed one.

type Overrides = Partial<UnitInstance>;

function mk(uid: number, team: 0 | 1, q: number, r: number, o: Overrides = {}): UnitInstance {
  return {
    uid,
    defId: "warrior",
    tier: 1,
    star: 1,
    team,
    pos: { q, r },
    hp: 1000,
    maxHp: 1000,
    ad: 50,
    as: 700,
    armor: 0,
    mr: 0,
    range: 1,
    mana: 0,
    maxMana: 100,
    abilityDamage: 100,
    attackCooldown: 0,
    statusEffects: [],
    items: [],
    ...o,
  };
}

function board(...units: UnitInstance[]): BoardState {
  return { units };
}

const hpEvents = (events: ReturnType<typeof simulateCombat>["events"], uid: number) =>
  events.filter((e): e is Extract<typeof e, { type: "hp" }> => e.type === "hp" && e.uid === uid);

// Permanent stealth so a unit never moves/attacks/is targeted — isolates the
// observable under test (mirrors abilities.test.ts).
const HIDE: AbilityDef = { name: "Hide", manaCost: 1, effect: { kind: "stealth", duration: 1_000_000 } };

const VOIDSTAFF = gameData.items.find((i) => i.id === "voidstaff")!;
const VOIDMANTLE = gameData.items.find((i) => i.id === "voidmantle")!;
const WARBLADE = gameData.items.find((i) => i.id === "warblade")!;
const WARPLATE = gameData.items.find((i) => i.id === "warplate")!;

describe("artifact pair passive: voidstaff + voidmantle → start-of-combat shield", () => {
  it("both paired items on the same unit grant the shield (early hits absorbed)", () => {
    const shieldVal =
      VOIDSTAFF.pairPassive!.effect.kind === "shield" ? VOIDSTAFF.pairPassive!.effect.value : 0;
    const defender = mk(0, 0, 0, 0, {
      hp: 5000,
      maxHp: 5000,
      ad: 0,
      armor: 0,
      items: ["voidstaff", "voidmantle"],
    });
    // Attacker chips at the shield but each hit is well under the shield value.
    const attacker = mk(10, 1, 1, 0, { hp: 1_000_000, maxHp: 1_000_000, ad: 10, armor: 0 });
    const { events } = simulateCombat(board(defender), board(attacker), 1, gameData);

    const init = events.find((e) => e.type === "init")!;
    const maxHp = init.type === "init" ? init.units.find((u) => u.uid === 0)!.maxHp : 0;
    // The base stat bundle (mr/hp from voidmantle, etc.) applies; the shield is
    // the pair bonus. The very first hp readout still sits at max — the shield ate it.
    const first = hpEvents(events, 0)[0]!;
    expect(first.value).toBe(maxHp);
    expect(shieldVal).toBeGreaterThan(0);
  });

  it("either item ALONE does not grant the pair shield (first hit lands)", () => {
    for (const items of [["voidstaff"], ["voidmantle"]]) {
      const defender = mk(0, 0, 0, 0, {
        hp: 5000,
        maxHp: 5000,
        ad: 0,
        armor: 0,
        items,
      });
      const attacker = mk(10, 1, 1, 0, { hp: 1_000_000, maxHp: 1_000_000, ad: 200, armor: 0 });
      const { events } = simulateCombat(board(defender), board(attacker), 1, gameData);

      const init = events.find((e) => e.type === "init")!;
      const maxHp = init.type === "init" ? init.units.find((u) => u.uid === 0)!.maxHp : 0;
      const first = hpEvents(events, 0)[0]!;
      // No shield (mr mitigates magic, not physical AD), so the first hit lands.
      expect(first.value, `items=${items.join("+")}`).toBeLessThan(maxHp);
    }
  });
});

describe("artifact pair passive: warblade + warplate → on-hit burn", () => {
  it("both paired items on the same unit apply a burn DoT to the struck target", () => {
    const burnVal =
      WARBLADE.pairPassive!.effect.kind === "burn" ? WARBLADE.pairPassive!.effect.value : 0;
    expect(burnVal).toBeGreaterThan(0);
    // Attacker hits once then idles (very slow as), isolating the burn ticks.
    const attacker = mk(0, 0, 0, 0, {
      ad: 1,
      as: 50,
      armor: 0,
      items: ["warblade", "warplate"],
    });
    const target = mk(10, 1, 1, 0, { hp: 1_000_000, maxHp: 1_000_000, ad: 0, armor: 0, mr: 0 });
    const { events } = simulateCombat(board(attacker), board(target), 1, gameData);

    // A burn tick = an hp drop exactly equal to the burn-per-tick on a tick with
    // no attack landing.
    const tgtHp = hpEvents(events, 10);
    let sawBurnTick = false;
    for (let i = 1; i < tgtHp.length; i++) {
      if (tgtHp[i - 1]!.value - tgtHp[i]!.value === burnVal) sawBurnTick = true;
    }
    expect(sawBurnTick).toBe(true);
  });

  it("either item ALONE applies NO on-hit burn (only the attack hp drop occurs)", () => {
    const burnVal =
      WARBLADE.pairPassive!.effect.kind === "burn" ? WARBLADE.pairPassive!.effect.value : 0;
    for (const items of [["warblade"], ["warplate"]]) {
      // Attacker permanently stealthed-equivalent: instead, give a single hit then
      // make it idle by very low as, and read the target's hp deltas.
      const attacker = mk(0, 0, 0, 0, { ad: 1, as: 50, armor: 0, items });
      const target = mk(10, 1, 1, 0, {
        hp: 1_000_000,
        maxHp: 1_000_000,
        ad: 0,
        armor: 0,
        mr: 0,
        ability: HIDE,
      });
      const { events } = simulateCombat(board(attacker), board(target), 1, gameData);
      const tgtHp = hpEvents(events, 10);
      // No standalone burn passive → no hp delta equals the pair burn-per-tick.
      const sawBurn = tgtHp.some(
        (_, i) => i > 0 && tgtHp[i - 1]!.value - tgtHp[i]!.value === burnVal
      );
      expect(sawBurn, `items=${items.join("+")}`).toBe(false);
    }
  });
});

describe("artifact base stats apply regardless of partner presence", () => {
  it("warblade's base ad/as bundle applies with or without warplate equipped", () => {
    const wbAd = WARBLADE.stats.ad ?? 0;
    expect(wbAd).toBeGreaterThan(0);
    // mitigate(ad, 0, base) === ad for armor 0; compare the clean (non-crit)
    // first-attack damage with the base ad + warblade ad.
    const firstCleanHit = (items: string[]): number => {
      const attacker = mk(0, 0, 0, 0, { ad: 50, as: 700, armor: 0, items });
      const dummy = mk(10, 1, 1, 0, { hp: 1_000_000, maxHp: 1_000_000, ad: 0, armor: 0 });
      const { events } = simulateCombat(board(attacker), board(dummy), 1, gameData);
      const hit = events.find(
        (e): e is Extract<typeof e, { type: "attack" }> =>
          e.type === "attack" && e.uid === 0 && e.crit === false
      )!;
      return hit.dmg;
    };
    const alone = firstCleanHit(["warblade"]);
    const paired = firstCleanHit(["warblade", "warplate"]);
    // 50 base ad + warblade ad; warplate grants armor/hp (no ad) so the attack
    // damage is identical with or without it — the base bundle is never gated.
    expect(alone).toBe(50 + wbAd);
    expect(paired).toBe(50 + wbAd);
  });
});

describe("pair passive determinism", () => {
  it("same seed + same paired items yields an identical event log across two runs", () => {
    const run = () => {
      const attacker = mk(0, 0, 0, 0, {
        ad: 60,
        as: 600,
        armor: 0,
        items: ["warblade", "warplate"],
      });
      const target = mk(10, 1, 1, 0, {
        hp: 4000,
        maxHp: 4000,
        ad: 40,
        armor: 0,
        mr: 0,
        items: ["voidstaff", "voidmantle"],
      });
      return JSON.stringify(simulateCombat(board(attacker), board(target), 0xabc123, gameData));
    };
    expect(run()).toBe(run());
  });
});
