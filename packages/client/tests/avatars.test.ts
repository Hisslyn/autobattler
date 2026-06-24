import { describe, it, expect } from "vitest";
import {
  AVATARS,
  PLAYER_1_AVATAR_NUM,
  parseAvatarFilename,
  resolveAvatarTexture,
  generateAvatarAssignment,
  type AvatarRarity,
} from "../src/avatars.js";

// The expected (num, name, rarity) of every shipped avatar, from the manifest.
const EXPECTED: { num: number; name: string; rarity: AvatarRarity }[] = [
  { num: 1, name: "Whiskers", rarity: "common" },
  { num: 2, name: "Biscuit", rarity: "common" },
  { num: 3, name: "Squeak", rarity: "common" },
  { num: 4, name: "Clover", rarity: "common" },
  { num: 5, name: "Truffle", rarity: "common" },
  { num: 6, name: "Lily", rarity: "uncommon" },
  { num: 7, name: "Wooly", rarity: "uncommon" },
  { num: 8, name: "Pim", rarity: "uncommon" },
  { num: 9, name: "Pip", rarity: "uncommon" },
  { num: 10, name: "Mochi", rarity: "uncommon" },
  { num: 11, name: "Ember", rarity: "rare" },
  { num: 12, name: "Bandit", rarity: "rare" },
  { num: 13, name: "Tux", rarity: "rare" },
  { num: 14, name: "Hoot", rarity: "rare" },
  { num: 15, name: "Fenrir", rarity: "epic" },
  { num: 16, name: "Bruin", rarity: "epic" },
  { num: 17, name: "Bao", rarity: "epic" },
  { num: 18, name: "Rajah", rarity: "legendary" },
  { num: 19, name: "Leo", rarity: "legendary" },
  { num: 20, name: "Wyrm", rarity: "legendary" },
];

describe("avatar registry parse", () => {
  it("parses each filename to the correct {num,name,rarity}", () => {
    for (const e of EXPECTED) {
      const num = String(e.num).padStart(2, "0");
      const file = `${num}_${e.name}_${e.rarity}.png`;
      const parsed = parseAvatarFilename(`./assets/avatars/${file}`, "/x.png");
      expect(parsed).toEqual({ num: e.num, name: e.name, rarity: e.rarity, url: "/x.png" });
    }
  });

  it("rejects a non-matching filename", () => {
    expect(parseAvatarFilename("./assets/avatars/readme.txt", "/x")).toBeNull();
    expect(parseAvatarFilename("./assets/avatars/1_Foo_common.png", "/x")).toBeNull(); // not zero-padded
    expect(parseAvatarFilename("./assets/avatars/21_Foo_mythic.png", "/x")).toBeNull(); // unknown rarity
  });

  it("the glob-built registry holds all 20 avatars sorted by num with a url each", () => {
    expect(AVATARS).toHaveLength(20);
    expect(AVATARS.map((a) => a.num)).toEqual(EXPECTED.map((e) => e.num));
    for (let i = 0; i < EXPECTED.length; i++) {
      expect(AVATARS[i]!.name).toBe(EXPECTED[i]!.name);
      expect(AVATARS[i]!.rarity).toBe(EXPECTED[i]!.rarity);
      expect(typeof AVATARS[i]!.url).toBe("string");
      expect(AVATARS[i]!.url.length).toBeGreaterThan(0);
    }
  });
});

describe("pure avatar texture resolver", () => {
  it("returns the texture when the lookup has the avatar's url (exists branch)", () => {
    const TEX = { id: "tex" };
    const url = AVATARS.find((a) => a.num === 5)!.url;
    const lookup = (u: string): typeof TEX | null => (u === url ? TEX : null);
    expect(resolveAvatarTexture(5, lookup)).toBe(TEX);
  });

  it("falls back to null when the lookup misses (glyph branch)", () => {
    expect(resolveAvatarTexture(5, () => null)).toBeNull();
  });

  it("returns null (no lookup call) for a num absent from the registry", () => {
    let called = false;
    const lookup = (): string | null => {
      called = true;
      return "hit";
    };
    expect(resolveAvatarTexture(999, lookup)).toBeNull();
    expect(called).toBe(false);
  });
});

describe("avatar allocation", () => {
  it("assigns seat 0 to the human avatar and 7 distinct others, none equal to the human", () => {
    const map = generateAvatarAssignment(() => 0.5); // deterministic injected rng
    expect(map.size).toBe(8);
    expect(map.get(0)).toBe(PLAYER_1_AVATAR_NUM);

    const registry = new Set(AVATARS.map((a) => a.num));
    const ai = [1, 2, 3, 4, 5, 6, 7].map((s) => map.get(s)!);
    expect(ai).toHaveLength(7);
    for (const num of ai) {
      expect(registry.has(num)).toBe(true); // drawn from the registry
      expect(num).not.toBe(PLAYER_1_AVATAR_NUM); // never the human's avatar
    }
    expect(new Set(ai).size).toBe(7); // all distinct
  });

  it("is a function of the injected rng (different rng → potentially different draw, same shape)", () => {
    const seq = [0.1, 0.9, 0.3, 0.7, 0.2, 0.8, 0.4, 0.6, 0.0, 0.5];
    let i = 0;
    const rng = (): number => seq[i++ % seq.length]!;
    const map = generateAvatarAssignment(rng);
    expect(map.get(0)).toBe(PLAYER_1_AVATAR_NUM);
    const ai = [1, 2, 3, 4, 5, 6, 7].map((s) => map.get(s)!);
    expect(new Set(ai).size).toBe(7);
    expect(ai).not.toContain(PLAYER_1_AVATAR_NUM);
  });
});
