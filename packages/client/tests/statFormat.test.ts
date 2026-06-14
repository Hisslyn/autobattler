import { describe, it, expect } from "vitest";
import { formatStat, formatStatDelta } from "../src/statFormat.js";

describe("formatStat", () => {
  it("shows attack speed as fixed-point ÷1000 to 2 decimals", () => {
    expect(formatStat("as", 750)).toBe("0.75");
    expect(formatStat("as", 1100)).toBe("1.10");
    expect(formatStat("as", 600)).toBe("0.60");
  });

  it("shows hp/ad/armor/mr/range/mana/abilityDamage as raw integers", () => {
    expect(formatStat("hp", 700)).toBe("700");
    expect(formatStat("ad", 60)).toBe("60");
    expect(formatStat("armor", 40)).toBe("40");
    expect(formatStat("mr", 20)).toBe("20");
    expect(formatStat("range", 3)).toBe("3");
    expect(formatStat("mana", 100)).toBe("100");
    expect(formatStat("abilityDamage", 150)).toBe("150");
  });

  it("passes unknown stats through as their raw value", () => {
    expect(formatStat("mystery", 42)).toBe("42");
  });
});

describe("formatStatDelta", () => {
  it("signs attack-speed deltas as fixed-point", () => {
    expect(formatStatDelta("as", 280)).toBe("+0.28");
    expect(formatStatDelta("as", 120)).toBe("+0.12");
    expect(formatStatDelta("as", -280)).toBe("-0.28");
  });

  it("signs raw-integer deltas", () => {
    expect(formatStatDelta("ad", 25)).toBe("+25");
    expect(formatStatDelta("armor", 800)).toBe("+800");
    expect(formatStatDelta("hp", -100)).toBe("-100");
  });
});
