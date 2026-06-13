// The ONLY I/O-permitted entry in the whole codebase outside the server.
// Runs the itemless + itemized sweeps and writes balance-report.md + .json.
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gameData } from "@autobattler/data";
import { runSweep } from "./sweep.js";
import { renderMarkdown } from "./report.js";

function arg(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const seeds = Math.max(1, parseInt(arg("--seeds", "300"), 10) || 300);
const items = Math.max(0, parseInt(arg("--items", "6"), 10) || 0);
const outDir = resolve(arg("--out", process.cwd()));

const itemless = runSweep(gameData, seeds, { itemsPerComp: 0 });
const itemized = runSweep(gameData, seeds, { itemsPerComp: items });

const mdPath = join(outDir, "balance-report.md");
const jsonPath = join(outDir, "balance-report.json");

writeFileSync(mdPath, renderMarkdown(itemless, itemized) + "\n");
writeFileSync(jsonPath, JSON.stringify({ itemless, itemized }, null, 2) + "\n");

console.log(`balance: ${itemless.totalCombats}+${itemized.totalCombats} combats over ${seeds} seeds/matchup`);
console.log(`wrote ${mdPath}`);
console.log(`wrote ${jsonPath}`);
