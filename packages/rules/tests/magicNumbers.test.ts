import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join, basename } from "path";

// Enforces the CLAUDE.md invariant "all tuning numbers live in packages/data":
// no numeric literal above the whitelist may appear in sim or rules src.
//
// Whitelist (pragmatic, documented):
// - 0, 1, 2, 3 everywhere (loop indices, team ids, star type unions, ±1 math)
// - prng.ts: mulberry32 algorithm constants (not tuning)
// - fixed.ts: the fixed-point SCALE (1000) definition lives there by design
// - hex.ts: structural 7×8 axial grid dims
// - any line carrying a `magic-ok` comment with an inline justification
const SRC_DIRS = [
  join(import.meta.dirname, "../src"),
  join(import.meta.dirname, "../../sim/src"),
];
const SKIP_FILES = new Set(["prng.ts", "fixed.ts"]);
const EXTRA_ALLOWED: Record<string, number[]> = { "hex.ts": [7, 8] };
const ALLOWED = new Set([0, 1, 2, 3]);

function stripBlockComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

function findViolations(file: string): string[] {
  const allowed = new Set([...ALLOWED, ...(EXTRA_ALLOWED[basename(file)] ?? [])]);
  const violations: string[] = [];
  const lines = stripBlockComments(readFileSync(file, "utf8")).split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    if (raw.includes("magic-ok")) continue;
    const code = raw
      .replace(/\/\/.*$/, "")
      .replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""');
    for (const m of code.matchAll(/(?<![\w$.])(0x[0-9a-fA-F]+|\d+(?:\.\d+)?)/g)) {
      const value = Number(m[1]);
      if (!allowed.has(value)) {
        violations.push(`${file}:${i + 1} literal ${m[1]} in: ${raw.trim()}`);
      }
    }
  }
  return violations;
}

describe("no magic tuning numbers in sim/rules src", () => {
  for (const dir of SRC_DIRS) {
    for (const name of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
      if (SKIP_FILES.has(name)) continue;
      it(`${name} is free of unlisted numeric literals`, () => {
        expect(findViolations(join(dir, name))).toEqual([]);
      });
    }
  }
});
