// Arena torch-pillar gold meter — pure, renderer-only mapping (no Pixi, no game
// logic). Each side of the board is flanked by TORCHES_PER_SIDE cylindrical
// pillars; how many are lit is purely a presentation function of that side's
// gold. The sim/rules never see this — it only decides which torches glow.
//
// Index convention used everywhere below: index 0 = the BACK (far) pillar,
// index TORCHES_PER_SIDE-1 = the FRONT (near) pillar. The two columns fill in
// opposite directions:
//   • LEFT  (player)   fills BOTTOM-UP — the front (near) pillar lights first,
//     filling toward the back.
//   • RIGHT (opponent) fills TOP-DOWN — the back (far) pillar lights first,
//     filling toward the front.

export const TORCHES_PER_SIDE = 5;
/** Gold per lit torch — 50 gold lights all five. */
export const TORCH_GOLD_PER = 10;

/** Lit torch count for an amount of gold: floor(gold/10), clamped to [0,5]. */
export function litCount(gold: number): number {
  if (!Number.isFinite(gold) || gold <= 0) return 0;
  return Math.min(TORCHES_PER_SIDE, Math.floor(gold / TORCH_GOLD_PER));
}

/**
 * Per-pillar lit flags (back→front, index 0 = back) for one side's gold.
 * `side` selects the fill direction (see the module header).
 */
export function torchLit(gold: number, side: "left" | "right"): boolean[] {
  const n = litCount(gold);
  const out: boolean[] = [];
  for (let i = 0; i < TORCHES_PER_SIDE; i++) {
    // left: front-up → the n frontmost (highest indices) are lit.
    // right: top-down → the n backmost (lowest indices) are lit.
    out.push(side === "left" ? i >= TORCHES_PER_SIDE - n : i < n);
  }
  return out;
}
