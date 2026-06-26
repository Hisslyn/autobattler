import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gameData } from "@autobattler/data";
import { runMatchup } from "../src/runner.js";
import { runSweep } from "../src/sweep.js";
import { renderMarkdown } from "../src/report.js";
import {
  COMPOSITIONS,
  buildBoard,
  compGold,
  BUDGET,
  BUDGET_TOLERANCE,
  LEVEL,
} from "../src/compositions.js";

describe("runner determinism", () => {
  it("identical boards + seeds produce identical matchup stats", () => {
    const a = buildBoard(COMPOSITIONS[0]!, 0, gameData);
    const b = buildBoard(COMPOSITIONS[1]!, 1, gameData);
    const r1 = runMatchup(a, b, 8, gameData);
    const r2 = runMatchup(a, b, 8, gameData);
    expect(r1).toEqual(r2);
  });
});

describe("equal-budget invariant", () => {
  it("every comp fields LEVEL units at equal gold (within tolerance)", () => {
    for (const c of COMPOSITIONS) {
      expect(c.units.length).toBe(LEVEL);
      expect(Math.abs(compGold(c, gameData) - BUDGET)).toBeLessThanOrEqual(BUDGET_TOLERANCE);
    }
  });
});

describe("coverage invariant", () => {
  it("every unit appears in >=3 distinct comps", () => {
    const counts = new Map<string, number>();
    for (const c of COMPOSITIONS) {
      for (const cu of c.units) counts.set(cu.defId, (counts.get(cu.defId) ?? 0) + 1);
    }
    for (const def of gameData.units) {
      expect(counts.get(def.id) ?? 0, `unit ${def.id}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("matrix determinism", () => {
  it("same comps + seeds + config yield an identical matrix and report", () => {
    const subset = COMPOSITIONS.slice(0, 5);
    const cfg = { itemsPerComp: 6 };
    const s1 = runSweep(gameData, 5, cfg, subset);
    const s2 = runSweep(gameData, 5, cfg, subset);
    expect(JSON.stringify(s1.matrix)).toBe(JSON.stringify(s2.matrix));
    expect(JSON.stringify(s1)).toBe(JSON.stringify(s2));
    for (const c of s1.comps) {
      expect(c.winRate).toBeGreaterThanOrEqual(0);
      expect(c.winRate).toBeLessThanOrEqual(1);
    }
    // Sticky targeting makes individual combats run longer (chase-to-resolution),
    // so a full sweep exceeds the 5s default timeout; determinism is unaffected.
  }, 60000);

  it("itemless and itemized sweeps differ", () => {
    const subset = COMPOSITIONS.slice(0, 5);
    const itemless = runSweep(gameData, 5, { itemsPerComp: 0 }, subset);
    const itemized = runSweep(gameData, 5, { itemsPerComp: 6 }, subset);
    expect(JSON.stringify(itemless.matrix)).not.toBe(JSON.stringify(itemized.matrix));
  }, 60000);
});

describe("smoke report", () => {
  it("a small sweep writes a well-formed md + json report for both item modes", () => {
    const dir = mkdtempSync(join(tmpdir(), "balance-"));
    try {
      const subset = COMPOSITIONS.slice(0, 5);
      const itemless = runSweep(gameData, 3, { itemsPerComp: 0 }, subset);
      const itemized = runSweep(gameData, 3, { itemsPerComp: 6 }, subset);
      const md = renderMarkdown(itemless, itemized);
      writeFileSync(join(dir, "balance-report.md"), md + "\n");
      writeFileSync(join(dir, "balance-report.json"), JSON.stringify({ itemless, itemized }, null, 2) + "\n");

      const mdOut = readFileSync(join(dir, "balance-report.md"), "utf8");
      expect(mdOut).toContain("# Balance report");
      expect(mdOut).toContain("Comp win matrix");
      expect(mdOut).toContain("Per-tier average win rate");
      expect(mdOut).toContain("Trait win rate — itemless");
      expect(mdOut).toContain("Trait win rate — itemized (6 items/comp)");
      expect(mdOut).toContain("Outlier units");
      expect(mdOut).toContain("Item-mode flips");

      const parsed = JSON.parse(readFileSync(join(dir, "balance-report.json"), "utf8"));
      for (const r of [parsed.itemless, parsed.itemized]) {
        expect(r.comps.length).toBe(5);
        expect(r.matrix.length).toBe(5);
        expect(r.matrix[0].length).toBe(5);
        expect(typeof r.overtimeRate).toBe("number");
        expect(r.totalCombats).toBeGreaterThan(0);
        expect(Array.isArray(r.units)).toBe(true);
        expect(Array.isArray(r.tiers)).toBe(true);
        expect(Array.isArray(r.traits)).toBe(true);
      }
      expect(parsed.itemless.itemsPerComp).toBe(0);
      expect(parsed.itemized.itemsPerComp).toBe(6);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
