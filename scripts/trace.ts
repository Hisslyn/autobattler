// Headless combat-trace harness — the ONLY I/O-permitted code in this tooling.
// Lives OUTSIDE packages/sim (which stays pure). Run via tsx:
//
//   npm run trace -- --list
//   npm run trace -- --scenario melee_1v1
//   npm run trace -- --scenario retarget_1v2 --seed 99
//   npm run trace -- --scenario mana_breakpoint --out trace.txt
//
// It runs simulateCombat(..., { trace: true }) on a fixture and prints (or
// writes) the pure formatTrace() output. console.log / writeFileSync here are
// allowed because this file is not part of packages/sim.

import { writeFileSync } from "node:fs";
import { simulateCombat } from "@autobattler/sim";
import { gameData } from "@autobattler/data";
import { SCENARIOS, scenarioByName } from "../packages/sim/tests/fixtures/scenarios.js";
import { formatTrace } from "../packages/sim/tests/fixtures/formatTrace.js";

interface Flags {
  scenario?: string;
  seed?: number;
  out?: string;
  list: boolean;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { list: false };
  const need = (i: number, name: string): string => {
    const v = argv[i];
    if (v === undefined) throw new Error(`flag ${name} requires a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--list") {
      flags.list = true;
    } else if (a === "--scenario") {
      flags.scenario = need(++i, "--scenario");
    } else if (a === "--seed") {
      flags.seed = Number(need(++i, "--seed"));
    } else if (a === "--out") {
      flags.out = need(++i, "--out");
    } else {
      throw new Error(`unknown flag: ${a}`);
    }
  }
  return flags;
}

function printList(): void {
  console.log("Available scenarios:");
  for (const s of SCENARIOS) {
    console.log(`  ${s.name.padEnd(22)} ${s.description}`);
  }
}

function main(): void {
  let flags: Flags;
  try {
    flags = parseFlags(process.argv.slice(2));
  } catch (err) {
    console.error(String(err instanceof Error ? err.message : err));
    process.exit(2);
    return;
  }

  if (flags.list) {
    printList();
    return;
  }

  if (!flags.scenario) {
    console.error("error: --scenario <name> is required (or use --list)");
    printList();
    process.exit(2);
    return;
  }

  const scenario = scenarioByName(flags.scenario);
  if (!scenario) {
    console.error(`error: unknown scenario "${flags.scenario}"`);
    printList();
    process.exit(2);
    return;
  }

  const seed = flags.seed !== undefined && Number.isFinite(flags.seed) ? flags.seed : scenario.seed;
  const result = simulateCombat(scenario.boardA, scenario.boardB, seed, gameData, { trace: true });
  // Reflect a seed override in the printed header without mutating the fixture.
  const out = formatTrace({ ...scenario, seed }, result);

  if (flags.out) {
    writeFileSync(flags.out, out + "\n", "utf8");
    console.log(`wrote ${flags.out}`);
  } else {
    console.log(out);
  }
}

main();
