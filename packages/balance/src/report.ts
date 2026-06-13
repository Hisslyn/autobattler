import type { SweepReport } from "./sweep.js";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** Pure: turn a SweepReport into the balance-report.md body. No I/O. */
export function renderMarkdown(r: SweepReport): string {
  const lines: string[] = [];
  lines.push("# Balance report");
  lines.push("");
  lines.push(`Seeds per matchup: ${r.seeds} · total combats: ${r.totalCombats}`);
  lines.push(`Avg combat length: ${r.avgGameLength.toFixed(1)} ticks · overtime rate: ${pct(r.overtimeRate)}`);
  lines.push("");

  // Comp win matrix (row comp as team 0 vs column comp as team 1).
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

  // Comp overall win rates.
  lines.push("## Comp overall win rate");
  lines.push("");
  lines.push("| comp | win rate | games |");
  lines.push("| --- | --- | --- |");
  for (const c of [...r.comps].sort((a, b) => b.winRate - a.winRate)) {
    lines.push(`| ${c.name} | ${pct(c.winRate)} | ${c.games} |`);
  }
  lines.push("");

  // Outlier units.
  lines.push("## Outlier units (global win rate >55% or <45%)");
  lines.push("");
  const outliers = r.units.filter((u) => u.winRate > 0.55 || u.winRate < 0.45);
  if (outliers.length === 0) {
    lines.push("_None — all units within [45%, 55%]._");
  } else {
    lines.push("| unit | win rate | appearances |");
    lines.push("| --- | --- | --- |");
    for (const u of outliers) {
      lines.push(`| ${u.defId} | ${pct(u.winRate)} | ${u.appearances} |`);
    }
  }
  lines.push("");

  // Trait win rates outside band.
  lines.push("## Traits outside [45%, 55%]");
  lines.push("");
  const traitOutliers = r.traits.filter((t) => t.winRate > 0.55 || t.winRate < 0.45);
  if (traitOutliers.length === 0) {
    lines.push("_None — all traits within [45%, 55%]._");
  } else {
    lines.push("| trait | win rate | comps |");
    lines.push("| --- | --- | --- |");
    for (const t of traitOutliers) {
      lines.push(`| ${t.id} | ${pct(t.winRate)} | ${t.comps} |`);
    }
  }
  lines.push("");
  return lines.join("\n");
}
