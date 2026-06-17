// Pure layout constants for the combat overlay. The combat layer is a single
// sortable Pixi container; equal-zIndex children keep insertion order, so the
// header text (added before the hex tiles for code locality) MUST carry a higher
// zIndex than the tiles or it renders behind the board.
//
// Regression guard for the "stray text behind the hexes" bug: keep
// Z_COMBAT_HEADER strictly above Z_COMBAT_TILE.

/** Board panel + hex tiles + tokens (default insertion order, zIndex 0). */
export const Z_COMBAT_TILE = 0;
/** "COMBAT · vs X" header — must sit above the tiles. */
export const Z_COMBAT_HEADER = 50;
/**
 * Resolution overlay surface (scrim + modal box + title). Ranked strictly above
 * Z_COMBAT_HEADER so the resolution screen always covers a combat header — a
 * fast PvE round can hit RESOLUTION before the planning→combat fade finishes, and
 * this guarantees the round-result modal wins instead of the two strings
 * garbling together ("PvE · …Resolution… · Creeps"). Regression-guarded.
 */
export const Z_RESOLUTION_OVERLAY = 60;
/** Resolution overlay controls (Continue button + countdown) — above the surface. */
export const Z_RESOLUTION_CONTROL = 70;
/** Resolution Continue button (interactive, above the dim scrim). */
export const Z_RESOLUTION_BUTTON = 70;
