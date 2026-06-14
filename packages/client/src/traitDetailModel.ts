// Pure derivation for the trait-detail panel. No Pixi, no game logic — read a
// trait's breakpoints and the granted effect at each from traits.json, mark the
// player's current count and which breakpoint is active.
import type { GameData, TraitDataDef } from "@autobattler/data";
import { formatStatDelta } from "./statFormat.js";

export interface TraitDetailRow {
  count: number;
  /** Human-readable description of what this breakpoint grants. */
  effect: string;
  /** True for the highest breakpoint the current count satisfies. */
  active: boolean;
  /** True once the current count reaches this breakpoint (cumulative). */
  reached: boolean;
}

export interface TraitDetailModel {
  id: string;
  name: string;
  kind: "origin" | "class";
  /** Distinct units of this trait the player fields. */
  count: number;
  rows: TraitDetailRow[];
}

const STAT_LABEL: Record<string, string> = {
  hp: "HP",
  ad: "AD",
  as: "Attack Speed",
  armor: "Armor",
  mr: "Magic Resist",
  abilityDamage: "Ability Power",
};

/** Human-readable line for one breakpoint's stat effect. */
export function breakpointEffect(effect: { stat: string; value: number }): string {
  const label = STAT_LABEL[effect.stat] ?? effect.stat;
  return `${formatStatDelta(effect.stat, effect.value)} ${label}`;
}

/**
 * Build the trait-detail model for a trait id given the player's current count.
 * `count` is the distinct-unit count from the trait strip. Returns null for an
 * unknown trait id.
 */
export function traitDetailModel(
  traitId: string,
  count: number,
  data: GameData
): TraitDetailModel | null {
  const trait: TraitDataDef | undefined = data.traits.find((t) => t.id === traitId);
  if (!trait) return null;

  const sorted = [...trait.breakpoints].sort((a, b) => a.count - b.count);
  const activeCount = sorted.reduce<number | null>(
    (acc, bp) => (bp.count <= count ? bp.count : acc),
    null
  );

  return {
    id: trait.id,
    name: trait.name,
    kind: trait.kind,
    count,
    rows: sorted.map((bp) => ({
      count: bp.count,
      effect: breakpointEffect(bp.effect),
      active: bp.count === activeCount,
      reached: bp.count <= count,
    })),
  };
}
