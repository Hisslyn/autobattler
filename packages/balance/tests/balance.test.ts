import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gameData } from "@autobattler/data";
import { runMatchup } from "../src/runner.js";
import { runSweep } from "../src/sweep.js";
import { renderMarkdown } from "../src/report.js";
import { COMPOSITIONS, buildBoard } from "../src/compositions.js";

describe("runner determinism", () => {
  it("identical boards + seeds produce identical matchup stats", () => {
    const a = buildBoard(COMPOSITIONS[0]!, 0, gameData);
    const b = buildBoard(COMPOSITIONS[1]!, 1, gameData);
    const r1 = runMatchup(a, b, 8, gameData);
    const r2 = runMatchup(a, b, 8, gameData);
    expect(r1).toEqual(r2);
  });
});

describe("sweep determinism", () => {
  it("same comps + seeds yield identical win rates", () => {
    const subset = COMPOSITIONS.slice(0, 4);
    const s1 = runSweep(gameData, 5, subset);
    const s2 = runSweep(gameData, 5, subset);
    expect(JSON.stringify(s1)).toBe(JSON.stringify(s2));
    // Win rates are bounded probabilities.
    for (const c of s1.comps) {
      expect(c.winRate).toBeGreaterThanOrEqual(0);
      expect(c.winRate).toBeLessThanOrEqual(1);
    }
  });
});

describe("smoke report", () => {
  it("a small sweep writes a well-formed md + json report", () => {
    const dir = mkdtempSync(join(tmpdir(), "balance-"));
    try {
      const report = runSweep(gameData, 3, COMPOSITIONS.slice(0, 4));
      const md = renderMarkdown(report);
      writeFileSync(join(dir, "balance-report.md"), md + "\n");
      writeFileSync(join(dir, "balance-report.json"), JSON.stringify(report, null, 2) + "\n");

      const mdOut = readFileSync(join(dir, "balance-report.md"), "utf8");
      expect(mdOut).toContain("# Balance report");
      expect(mdOut).toContain("Comp win matrix");
      expect(mdOut).toContain("Outlier units");
      expect(mdOut).toContain("Traits outside");

      const parsed = JSON.parse(readFileSync(join(dir, "balance-report.json"), "utf8"));
      expect(parsed.comps.length).toBe(4);
      expect(parsed.matrix.length).toBe(4);
      expect(parsed.matrix[0].length).toBe(4);
      expect(typeof parsed.overtimeRate).toBe("number");
      expect(parsed.totalCombats).toBeGreaterThan(0);
      expect(Array.isArray(parsed.units)).toBe(true);
      expect(Array.isArray(parsed.traits)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
