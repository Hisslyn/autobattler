// Pure derivations for the in-match HUD chrome (stage 2). No Pixi, no game
// logic — render strictly from the MatchState snapshot the renderer holds.
import type { UnitInstance } from "@autobattler/sim/src/types.js";
import type { UnitDataDef, TraitDataDef } from "@autobattler/data";
import { traitColor } from "./theme.js";

export interface TraitChip {
  traitId: string;
  name: string;
  /** Unique-defId count contributing to this trait (duplicates count once). */
  count: number;
  /** Highest breakpoint count currently satisfied, or null if none active. */
  activeBreakpoint: number | null;
  /** Next breakpoint count above the current count, or null if maxed. */
  nextBreakpoint: number | null;
  color: number;
}

/**
 * Build the trait-strip model from a board: one chip per trait present, counted
 * by unique defId vs each trait's breakpoints. Sorted active-first, then by
 * count desc, then trait id for stability.
 */
export function traitStripModel(
  board: readonly (UnitInstance | null)[],
  units: readonly UnitDataDef[],
  traits: readonly TraitDataDef[]
): TraitChip[] {
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  for (const u of board) {
    if (!u || seen.has(u.defId)) continue;
    seen.add(u.defId);
    const def = units.find((d) => d.id === u.defId);
    for (const t of def?.traits ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  }

  const chips: TraitChip[] = [];
  for (const [traitId, count] of counts) {
    const trait = traits.find((t) => t.id === traitId);
    if (!trait) continue;
    const sorted = [...trait.breakpoints].sort((a, b) => a.count - b.count);
    let activeBreakpoint: number | null = null;
    let nextBreakpoint: number | null = null;
    for (const bp of sorted) {
      if (bp.count <= count) activeBreakpoint = bp.count;
      else if (nextBreakpoint === null) nextBreakpoint = bp.count;
    }
    chips.push({
      traitId,
      name: trait.name,
      count,
      activeBreakpoint,
      nextBreakpoint,
      color: traitColor(traitId),
    });
  }

  chips.sort((a, b) => {
    const aActive = a.activeBreakpoint !== null ? 1 : 0;
    const bActive = b.activeBreakpoint !== null ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    if (a.count !== b.count) return b.count - a.count;
    return a.traitId.localeCompare(b.traitId);
  });
  return chips;
}

export interface XpProgress {
  level: number;
  /** XP earned toward the next level. */
  inLevel: number;
  /** XP span of the current level (0 when maxed). */
  needed: number;
  /** Fill fraction 0..1 (1 when maxed). */
  frac: number;
  maxed: boolean;
}

/**
 * Progress through the current level given total xp and the cumulative
 * `levelXpThresholds` table (thresholds[level-1] = xp at which that level
 * begins). At the top level returns a full, maxed bar.
 */
export function xpProgress(
  xp: number,
  level: number,
  thresholds: readonly number[]
): XpProgress {
  const maxLevel = thresholds.length;
  if (level >= maxLevel) return { level, inLevel: 0, needed: 0, frac: 1, maxed: true };
  const base = thresholds[level - 1] ?? 0;
  const next = thresholds[level] ?? base;
  const span = next - base;
  const inLevel = Math.max(0, xp - base);
  const frac = span > 0 ? Math.min(1, inLevel / span) : 1;
  return { level, inLevel, needed: span, frac, maxed: false };
}

/** Geometry for the circular level badge + arced xp progress in the hud region. */
export interface LevelBadgeGeom {
  /** Badge disc center (within the hud region). */
  cx: number;
  cy: number;
  /** Badge disc radius. */
  badgeR: number;
  /** XP progress arc radius (≥ badgeR). */
  arcR: number;
  /** Arc stroke width. */
  arcW: number;
  /** y at which the small "current/threshold" label sits. */
  labelY: number;
}

/**
 * Pure badge+arc geometry from the hud region (mirrors benchGeom). The badge
 * sits at the left of the hud region; its disc + arc + label all stay within
 * the hud bounds across the portrait/landscape hud heights.
 */
export function levelBadgeGeom(hud: { x: number; y: number; w: number; h: number }): LevelBadgeGeom {
  // Badge radius scales with hud height but is capped (≈18 portrait / ≈14 short
  // landscape); the arc is slightly larger; the label tucks just below the arc.
  const arcW = 5;
  // The arc is the outer bound; it must fit vertically within the region. Derive
  // it first, then size the badge disc strictly inside it so the invariant
  // arcR ≥ badgeR holds for every hud height (tall portrait → short landscape).
  const arcR = Math.max(8, Math.min(18, hud.h / 2 - arcW / 2));
  const badgeR = Math.max(7, arcR - 3);
  // Center the badge a little in from the left edge, vertically centered with a
  // small lift so the label fits under the arc within the region.
  const cx = hud.x + arcR + 2;
  const cy = hud.y + Math.min(arcR + arcW / 2, hud.h - 8);
  const labelY = Math.min(cy + arcR + 2, hud.y + hud.h - 4);
  return { cx, cy, badgeR, arcR, arcW, labelY };
}
