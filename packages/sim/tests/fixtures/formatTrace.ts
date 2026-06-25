// Pure, deterministic, human-readable trace formatter — one line per tick per
// unit, plus an explicit retarget line per target change. Integers only.
//
// PURE: no I/O. Importable by both the harness (scripts/trace.ts) and the qa
// tests. Given the same (scenario, result) it always returns byte-identical text.

import type { CombatResult } from "@autobattler/sim/src/types.js";
import type { Scenario } from "./scenarios.js";

function hex(h: { q: number; r: number }): string {
  return `(${h.q},${h.r})`;
}

function pad(s: string | number, width: number): string {
  const str = String(s);
  return str.length >= width ? str : str + " ".repeat(width - str.length);
}

function padNum(n: number, width: number): string {
  const str = String(n);
  return str.length >= width ? str : " ".repeat(width - str.length) + str;
}

/**
 * Render a CombatResult's trace into a deterministic block of text.
 * Requires the result to have been produced with { trace: true } — throws
 * (rather than silently producing nothing) if the trace is absent, so a
 * misconfigured harness/test fails loudly.
 */
export function formatTrace(scenario: Scenario, result: CombatResult): string {
  const trace = result.trace;
  if (!trace) {
    throw new Error(
      `formatTrace: result has no trace — call simulateCombat(..., { trace: true })`
    );
  }

  const lines: string[] = [];
  lines.push(`# scenario: ${scenario.name}`);
  lines.push(`# description: ${scenario.description}`);
  lines.push(`# seed: ${scenario.seed}`);
  lines.push(`# winner: ${String(result.winner)}`);
  lines.push(`# ticks: ${result.ticks}`);
  lines.push(`# traceTicks: ${trace.ticks.length}`);
  lines.push("");

  for (const t of trace.ticks) {
    lines.push(`tick ${t.tick}`);
    for (const u of t.units) {
      const target = u.targetUid === null ? "-" : String(u.targetUid);
      lines.push(
        `  uid=${padNum(u.uid, 4)} side=${u.side} ${pad(u.defId, 14)} ` +
          `hex=${pad(hex(u.hex), 7)} hp=${padNum(u.hp, 5)} mana=${padNum(u.mana, 4)} ` +
          `act=${pad(u.action, 6)} tgt=${pad(target, 4)} dmg=${padNum(u.damageDealt, 5)}`
      );
    }
    for (const rt of t.retargets) {
      const from = rt.fromUid === null ? "-" : String(rt.fromUid);
      const to = rt.toUid === null ? "-" : String(rt.toUid);
      lines.push(`  retarget uid=${padNum(rt.uid, 4)} ${from} -> ${to} reason=${rt.reason}`);
    }
  }

  return lines.join("\n");
}
