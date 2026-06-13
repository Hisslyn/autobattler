// The ONLY I/O-permitted entry in the whole codebase outside the server.
// Runs the sweep and writes balance-report.md + balance-report.json.
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
const outDir = resolve(arg("--out", process.cwd()));

const report = runSweep(gameData, seeds);
const mdPath = join(outDir, "balance-report.md");
const jsonPath = join(outDir, "balance-report.json");

writeFileSync(mdPath, renderMarkdown(report) + "\n");
writeFileSync(jsonPath, JSON.stringify(report, null, 2) + "\n");

console.log(`balance: ${report.totalCombats} combats over ${seeds} seeds/matchup`);
console.log(`wrote ${mdPath}`);
console.log(`wrote ${jsonPath}`);
