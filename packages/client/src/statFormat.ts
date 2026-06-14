// Pure per-stat display formatter. The sim stores stats as integers; most are
// already the real value (hp/ad/armor/mr/range/mana/abilityDamage), but attack
// speed is fixed-point at scale 1000 (e.g. 750 = 0.75 attacks/sec). This module
// is the single source for turning a stored stat value into its display string,
// used by both the unit-inspect block and the trait-detail breakpoint lines.
// No Pixi, no game logic — pure formatting.

// Fixed-point scale (1000 = 1.0), matching packages/sim/src/fixed.ts. The sim is
// a pure package whose exports are deliberately narrow; the scale is a stable,
// documented project invariant, so the display layer mirrors the constant rather
// than widening sim's public surface for a presentation concern.
const SCALE = 1000;

/** Canonical stat keys the formatter understands. */
export type StatKey =
  | "hp"
  | "ad"
  | "as"
  | "armor"
  | "mr"
  | "range"
  | "mana"
  | "abilityDamage";

/**
 * Format a single stored stat value for display.
 * - `as` is fixed-point (scale 1000) → divided and shown to 2 decimals.
 * - everything else is stored as its real value → shown as the integer.
 */
export function formatStat(stat: StatKey | string, value: number): string {
  if (stat === "as") return (value / SCALE).toFixed(2);
  return `${value}`;
}

/**
 * Format a signed stat delta (a trait breakpoint / buff grant). Attack-speed
 * deltas are fixed-point too (e.g. +280 → "+0.28"); the rest are raw integers.
 */
export function formatStatDelta(stat: StatKey | string, value: number): string {
  const sign = value < 0 ? "-" : "+";
  const mag = Math.abs(value);
  if (stat === "as") return `${sign}${(mag / SCALE).toFixed(2)}`;
  return `${sign}${mag}`;
}
