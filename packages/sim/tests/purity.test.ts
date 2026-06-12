import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const SIM_SRC = join(import.meta.dirname, "../src");

function getAllTsFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      files.push(...getAllTsFiles(join(dir, entry.name)));
    } else if (entry.name.endsWith(".ts")) {
      files.push(join(dir, entry.name));
    }
  }
  return files;
}

describe("sim purity guard", () => {
  const files = getAllTsFiles(SIM_SRC);

  it("no Math.random usage", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const matches = src.match(/Math\.random/g);
      expect(matches, `Math.random found in ${f}`).toBeNull();
    }
  });

  it("no Date.now usage", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const matches = src.match(/Date\.now/g);
      expect(matches, `Date.now found in ${f}`).toBeNull();
    }
  });

  it("no parseFloat usage", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const matches = src.match(/parseFloat/g);
      expect(matches, `parseFloat found in ${f}`).toBeNull();
    }
  });
});
