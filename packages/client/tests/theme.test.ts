import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join, relative } from "path";

const SRC = join(import.meta.dirname, "../src");

function getAllTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...getAllTsFiles(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("all colors come from theme.ts", () => {
  it("no 0x color literal appears in client src outside theme.ts", () => {
    const violations: string[] = [];
    for (const file of getAllTsFiles(SRC)) {
      if (file.endsWith("theme.ts")) continue;
      const lines = readFileSync(file, "utf8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (/0x[0-9a-fA-F]+/.test(lines[i]!)) {
          violations.push(`${relative(SRC, file)}:${i + 1}: ${lines[i]!.trim()}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
