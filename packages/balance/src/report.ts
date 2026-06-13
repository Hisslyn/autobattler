import type { SweepReport, TraitStat, UnitStat } from "./sweep.js";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const modeLabel = (r: SweepReport) => (r.itemsPerComp > 0 ? `itemized (${r.itemsPerComp} items/comp)` : "itemless");

/** Comp-vs-comp win matrix (row as team 0 vs column as team 1). */
function matrixSection(r: SweepReport, lines: string[]): void {
  lines.push("## Comp win matrix (row vs column)");
  lines.push("");
  const ids = r.compOrder;
  lines.push(`| comp | ${ids.join(" | ")} |`);
  lines.push(`| --- | ${ids.map(() => "---").join(" | ")} |`);
  for (let i = 0; i < ids.length; i++) {
    const cells = ids.map((_, j) => (i === j ? "—" : pct(r.matrix[i]![j]!)));
    lines.push(`| ${ids[i]} | ${cells.join(" | ")} |`);
  }
  lines.push("");
}

function compSection(r: SweepReport, lines: string[]): void {
  lines.push("## Comp overall win rate");
  lines.push("");
  lines.push("| comp | win rate | games |");
  lines.push("| --- | --- | --- |");
  for (const c of [...r.comps].sort((a, b) => b.winRate - a.winRate)) {
    lines.push(`| ${c.name} | ${pct(c.winRate)} | ${c.games} |`);
  }
  lines.push("");
}

function tierSection(r: SweepReport, lines: string[]): void {
  lines.push("## Per-tier average win rate");
  lines.push("");
  lines.push("| tier | win rate | units |");
  lines.push("| --- | --- | --- |");
  for (const t of r.tiers) {
    lines.push(`| ${t.tier} | ${pct(t.winRate)} | ${t.units} |`);
  }
  lines.push("");
}

function traitSection(r: SweepReport, lines: string[]): void {
  lines.push(`## Trait win rate — ${modeLabel(r)}`);
  lines.push("");
  lines.push("| trait | win rate | comps |");
  lines.push("| --- | --- | --- |");
  for (const t of r.traits) {
    lines.push(`| ${t.id} | ${pct(t.winRate)} | ${t.comps} |`);
  }
  lines.push("");
}

function unitSection(r: SweepReport, lines: string[]): void {
  lines.push("## Outlier units (win rate >55% or <45%)");
  lines.push("");
  const outliers = r.units.filter((u) => u.winRate > 0.55 || u.winRate < 0.45);
  if (outliers.length === 0) {
    lines.push("_None — all units within [45%, 55%]._");
  } else {
    lines.push("| unit | win rate | appearances | variance | disagree |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const u of outliers) {
      lines.push(`| ${u.defId} | ${pct(u.winRate)} | ${u.appearances} | ${u.variance.toFixed(3)} | ${u.disagree ? "yes" : ""} |`);
    }
  }
  lines.push("");
}

/** Trait/unit signals that flip across item modes: cross 50% or move >8 points. */
function flipSection(a: SweepReport, b: SweepReport, lines: string[]): void {
  const crosses = (x: number, y: number) => Math.sign(x - 0.5) !== Math.sign(y - 0.5) || Math.abs(x - y) > 0.08;
  lines.push("## Item-mode flips (itemless ↔ itemized)");
  lines.push("");

  const bTrait = new Map<string, TraitStat>(b.traits.map((t) => [t.id, t]));
  const traitFlips = a.traits.filter((t) => bTrait.has(t.id) && crosses(t.winRate, bTrait.get(t.id)!.winRate));
  if (traitFlips.length === 0) {
    lines.push("_No traits flip between item modes._");
  } else {
    lines.push("| trait | itemless | itemized | Δ |");
    lines.push("| --- | --- | --- | --- |");
    for (const t of traitFlips) {
      const y = bTrait.get(t.id)!.winRate;
      lines.push(`| ${t.id} | ${pct(t.winRate)} | ${pct(y)} | ${((y - t.winRate) * 100).toFixed(1)} |`);
    }
  }
  lines.push("");

  const bUnit = new Map<string, UnitStat>(b.units.map((u) => [u.defId, u]));
  const unitFlips = a.units.filter((u) => bUnit.has(u.defId) && crosses(u.winRate, bUnit.get(u.defId)!.winRate));
  if (unitFlips.length === 0) {
    lines.push("_No units flip between item modes._");
  } else {
    lines.push("| unit | itemless | itemized | Δ |");
    lines.push("| --- | --- | --- | --- |");
    for (const u of [...unitFlips].sort((x, y) => bUnit.get(y.defId)!.winRate - bUnit.get(x.defId)!.winRate)) {
      const y = bUnit.get(u.defId)!.winRate;
      lines.push(`| ${u.defId} | ${pct(u.winRate)} | ${pct(y)} | ${((y - u.winRate) * 100).toFixed(1)} |`);
    }
  }
  lines.push("");
}

function reportBody(r: SweepReport, lines: string[]): void {
  lines.push(`### Mode: ${modeLabel(r)}`);
  lines.push("");
  lines.push(`Seeds per matchup: ${r.seeds} · total combats: ${r.totalCombats}`);
  lines.push(`Avg combat length: ${r.avgGameLength.toFixed(1)} ticks · overtime rate: ${pct(r.overtimeRate)}`);
  lines.push("");
  matrixSection(r, lines);
  compSection(r, lines);
  tierSection(r, lines);
  traitSection(r, lines);
  unitSection(r, lines);
}

/**
 * Pure: render a SweepReport (and, when given, an itemized counterpart with a
 * cross-mode flip table) into the balance-report.md body. No I/O.
 */
export function renderMarkdown(report: SweepReport, itemized?: SweepReport): string {
  const lines: string[] = [];
  lines.push("# Balance report");
  lines.push("");
  reportBody(report, lines);
  if (itemized) {
    lines.push("---");
    lines.push("");
    reportBody(itemized, lines);
    flipSection(report, itemized, lines);
  }
  return lines.join("\n");
}
