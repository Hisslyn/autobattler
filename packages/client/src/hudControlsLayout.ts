// Pure geometry for the landscape HUD control cluster (reroll + buy-xp buttons).
// Extracted from scenes/match.ts so it can be unit-tested against the layout's
// hud region bounds — the Phase-2 region rework shrank the hud region and the
// old fixed button widths overflowed it (BUG 2). No Pixi, no game logic.
import type { Rect } from "./layout.js";

export interface HudControlsGeom {
  /** Reroll button rect. */
  reroll: Rect;
  /** Buy-XP button rect. */
  buyXp: Rect;
}

/** Vertical offset of the button sub-row within the hud region. */
export const HUD_BTN_Y_OFFSET = 26;
export const HUD_BTN_H = 20;
/** Gap between the reroll and buy-xp buttons. */
export const HUD_BTN_GAP = 6;

/**
 * Lays the reroll + buy-xp buttons side by side, splitting the hud region's
 * width (minus one gap) so BOTH buttons stay fully inside the region — never the
 * old fixed 106px-each layout that ran 58px past the right-column region edge.
 */
export function landscapeHudControls(hud: Rect): HudControlsGeom {
  const btnW = Math.floor((hud.w - HUD_BTN_GAP) / 2);
  const btnY = hud.y + HUD_BTN_Y_OFFSET;
  return {
    reroll: { x: hud.x, y: btnY, w: btnW, h: HUD_BTN_H },
    buyXp: { x: hud.x + btnW + HUD_BTN_GAP, y: btnY, w: btnW, h: HUD_BTN_H },
  };
}
