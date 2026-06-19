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

/** Geometry for the circular Buy XP button (econ cluster), pure of any Pixi. */
export interface BuyXpGeom {
  /** Main circle center + radius. */
  cx: number;
  cy: number;
  r: number;
  /** Ornate outer-rim stroke width. */
  rimW: number;
  /** XP progress arc hugging the outer-right edge (90°, fills bottom → top). */
  arcR: number;
  arcW: number;
  arcStart: number;
  arcEnd: number;
  /** Small dark level badge overlapping the button's bottom-right. */
  badgeCx: number;
  badgeCy: number;
  badgeR: number;
  /** Stacked-content y positions (level-up glyph / "Buy XP" / coin+cost). */
  glyphY: number;
  labelY: number;
  costY: number;
  /** Floating current/needed xp text, just ABOVE the button (outside it). */
  fracY: number;
  /** Base content font size, derived from the radius. */
  fontSize: number;
}

/**
 * Pure geometry for the circular Buy XP control from its econ-cluster region
 * (mirrors benchGeom: render strictly off this, no Pixi/game logic here). The
 * circle is anchored to the left of the region and vertically centered; the
 * radius scales with the region but is clamped so it fits the thin portrait HUD
 * band and the taller landscape cluster alike.
 */
export function buyXpGeom(region: { x: number; y: number; w: number; h: number }): BuyXpGeom {
  // Cap lifted from 30 → 56 so the landscape econ cluster (a full-height
  // bottom-left square) can render the button at ~2× the portrait size; the
  // thin portrait HUD band stays bound by its own region.h / 2 - 1.
  const r = Math.max(16, Math.min(region.h / 2 - 1, region.w * 0.34, 56));
  const rimW = Math.max(2.5, r * 0.16);
  const cx = region.x + r + rimW;
  const cy = region.y + region.h / 2;

  // Progress arc: a 90° sweep centered on 3 o'clock (the outer-right edge).
  // The track runs arcStart (top) → arcEnd (bottom); the fill is anchored at
  // arcEnd and rises toward arcStart, so it fills from the bottom up.
  const arcR = r + rimW * 0.5 + 3;
  const arcW = Math.max(3, r * 0.14);
  const arcStart = -Math.PI / 4;
  const arcEnd = Math.PI / 4;

  // Level badge overlapping bottom-right at ~45°.
  const badgeR = Math.max(7, r * 0.44);
  const bd = r + rimW * 0.3;
  const badgeCx = cx + bd * Math.cos(Math.PI / 4);
  const badgeCy = cy + bd * Math.sin(Math.PI / 4);

  const fontSize = Math.max(6, Math.round(r * 0.32));
  return {
    cx, cy, r, rimW,
    arcR, arcW, arcStart, arcEnd,
    badgeCx, badgeCy, badgeR,
    glyphY: cy - r * 0.46,
    labelY: cy - r * 0.02,
    costY: cy + r * 0.44,
    fracY: cy - r - rimW - 7,
    fontSize,
  };
}
