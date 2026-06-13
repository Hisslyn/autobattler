import { describe, it, expect } from "vitest";
import { simulateCombat } from "../src/engine.js";
import { gameData } from "@autobattler/data";
import type { AbilityDef, BoardState, StatusEffect, UnitInstance } from "../src/types.js";

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

describe("ability: shield (self absorb)", () => {
  it("a cast shield fully absorbs damage until it expires", () => {
    const ability: AbilityDef = { name: "Barrier", manaCost: 10000, effect: { kind: "shield", amount: 100000, duration: 40 } };
    // Defender casts immediately (mana already full), never refills in-window.
    const defender = mk(0, 0, 0, 0, { hp: 1000, maxHp: 1000, ad: 1, mana: 10000, maxMana: 10000, ability });
    const attacker = mk(10, 1, 1, 0, { hp: 1_000_000, maxHp: 1_000_000, ad: 50, armor: 0 });
    const { events } = simulateCombat(board(defender), board(attacker), 1, gameData);

    // The shield cast targets self with no damage.
    expect(events.some((e) => e.type === "cast" && e.uid === 0 && e.targetUid === 0 && e.dmg === 0)).toBe(true);
    // While the shield is up, every hp readout for the defender stays at max.
    const early = hpEvents(events, 0).filter((e) => e.tick < 35);
    expect(early.length).toBeGreaterThan(0);
    expect(early.every((e) => e.value === 1000)).toBe(true);
    // After the shield expires the defender finally takes damage.
    const all = hpEvents(events, 0);
    expect(all[all.length - 1]!.value).toBeLessThan(1000);
  });
});

describe("status: burn DoT (true damage)", () => {
  it("a pre-seeded burn deals exactly value per tick for its duration", () => {
    const burn: StatusEffect = { type: "burn", value: 50, duration: 10 };
    const hide: AbilityDef = { name: "Hide", manaCost: 1, effect: { kind: "stealth", duration: 100000 } };
    // Both permanently untargetable, so neither moves or attacks: burn is isolated.
    const burned = mk(0, 0, 0, 0, { hp: 5000, maxHp: 5000, ad: 0, statusEffects: [burn], ability: hide });
    const other = mk(10, 1, 6, 7, { hp: 5000, maxHp: 5000, ad: 0, ability: hide });
    const { events } = simulateCombat(board(burned), board(other), 1, gameData);

    const burnHp = hpEvents(events, 0).filter((e) => e.tick <= 10);
    expect(burnHp.length).toBe(10);
    // 10 ticks of 50 true damage, no other source.
    expect(burnHp[burnHp.length - 1]!.value).toBe(5000 - 500);
    for (let i = 0; i < burnHp.length; i++) {
      expect(burnHp[i]!.value).toBe(5000 - 50 * (i + 1));
    }
    // No hp loss after the burn ends (within the no-contact window).
    const post = hpEvents(events, 0).filter((e) => e.tick > 10 && e.tick < 20);
    expect(post.every((e) => e.value === 5000 - 500)).toBe(true);
  });
});

describe("ability: buff (self stat buff)", () => {
  it("a cast buff raises the unit's AD by exactly its value", () => {
    const ability: AbilityDef = { name: "Empower", manaCost: 40, effect: { kind: "buff", stat: "ad", value: 100, duration: 200 } };
    const caster = mk(0, 0, 0, 0, { ad: 60, armor: 0, mana: 0, maxMana: 40, ability });
    const dummy = mk(10, 1, 1, 0, { hp: 1_000_000, maxHp: 1_000_000, ad: 0, armor: 0 });
    const { events } = simulateCombat(board(caster), board(dummy), 1, gameData);

    const castTick = events.find((e) => e.type === "cast" && e.uid === 0)!.tick;
    const cleanHits = events.filter(
      (e): e is Extract<typeof e, { type: "attack" }> => e.type === "attack" && e.uid === 0 && e.crit === false
    );
    const before = cleanHits.find((e) => e.tick < castTick);
    const after = cleanHits.find((e) => e.tick > castTick);
    expect(before!.dmg).toBe(60); // mitigate(60, 0)
    expect(after!.dmg).toBe(160); // mitigate(60 + 100, 0)
  });
});

describe("ability: start-of-combat stealth", () => {
  it("a stealthed unit cannot be targeted until its stealth ends", () => {
    const ability: AbilityDef = { name: "Vanish", manaCost: 100, effect: { kind: "stealth", duration: 30 } };
    const stealthed = mk(0, 0, 0, 0, { ad: 80, mana: 0, maxMana: 100000, ability });
    const attacker = mk(10, 1, 1, 0, { hp: 1_000_000, maxHp: 1_000_000, ad: 50 });
    const { events } = simulateCombat(board(stealthed), board(attacker), 1, gameData);

    const hitsOnStealth = events.filter(
      (e) => (e.type === "attack" || e.type === "cast") && e.targetUid === 0
    );
    expect(hitsOnStealth.every((e) => e.tick >= 30)).toBe(true);
    // The stealthed unit still attacks the (targetable) enemy during stealth.
    expect(events.some((e) => e.type === "attack" && e.uid === 0 && e.tick < 30)).toBe(true);
  });
});

describe("item passives", () => {
  it("a start-of-combat shield passive absorbs the first hit", () => {
    const shieldItem = gameData.items.find((i) => i.passive?.kind === "shield")!;
    const defender = mk(0, 0, 0, 0, { hp: 5000, maxHp: 5000, ad: 0, armor: 0, items: [shieldItem.id] });
    const attacker = mk(10, 1, 1, 0, { hp: 1_000_000, maxHp: 1_000_000, ad: 10, armor: 0 });
    const { events } = simulateCombat(board(defender), board(attacker), 1, gameData);
    // First hit (<= 15 with crit) is well under the shield value, so hp holds at
    // the (item-boosted) max — no damage gets through.
    const init = events.find((e) => e.type === "init")!;
    const maxHp = init.type === "init" ? init.units.find((u) => u.uid === 0)!.maxHp : 0;
    const first = hpEvents(events, 0)[0]!;
    expect(first.value).toBe(maxHp);
  });

  it("an on-hit burn passive applies a DoT to the struck target", () => {
    const burnItem = gameData.items.find((i) => i.passive?.kind === "burn")!;
    const burnVal = burnItem.passive!.kind === "burn" ? burnItem.passive!.value : 0;
    // Attacker hits once then idles (very slow), isolating the burn ticks.
    const attacker = mk(0, 0, 0, 0, { ad: 1, as: 50, armor: 0, items: [burnItem.id] });
    const target = mk(10, 1, 1, 0, { hp: 1_000_000, maxHp: 1_000_000, ad: 0, armor: 0, mr: 0 });
    const { events } = simulateCombat(board(attacker), board(target), 1, gameData);
    // Some hp drop on the target equals exactly the burn-per-tick (no attack that tick).
    const tgtHp = hpEvents(events, 10);
    let sawBurnTick = false;
    for (let i = 1; i < tgtHp.length; i++) {
      if (tgtHp[i - 1]!.value - tgtHp[i]!.value === burnVal) sawBurnTick = true;
    }
    expect(sawBurnTick).toBe(true);
  });
});
