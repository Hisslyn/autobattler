// Reusable unit token: one component rendered on the board, the bench, and
// during combat. A circular disc (token-bg) with a 2.5px ring in the unit's tier
// color, the unit's class glyph (or its drop-in PNG art, clipped to the ring),
// gold star pips above, and optional HP/mana bars below. Pure Pixi drawing —
// no game logic; callers pass already-resolved values from a snapshot or frame.
import * as PIXI from "pixi.js";
import { gameData } from "@autobattler/data";
import { C, tierColor } from "./theme.js";
import { drawGlyph, glyphForTraits } from "./glyphs.js";
import { resolveUnitTexture, unitTextureLookup, requestUnitArt } from "./sprites.js";

const RING_W = 2.5;

export interface UnitTokenOpts {
  /** Disc radius (default 16 for board/combat; pass ~12 for bench). */
  radius?: number;
  dimmed?: boolean;
  /** HP/mana fill fractions (0..1); omit for bench tokens (no bars). */
  bars?: { hpFrac: number; manaFrac: number };
}

/** Draw a unit token centered at (x, y) into `parent`. */
export function drawUnitToken(
  parent: PIXI.Container,
  defId: string,
  tier: number,
  star: number,
  x: number,
  y: number,
  opts: UnitTokenOpts = {}
): void {
  const r = opts.radius ?? 16;
  const dim = opts.dimmed ?? false;
  const ring = tierColor(tier);
  const def = gameData.units.find((u) => u.id === defId);

  // Disc
  const disc = new PIXI.Graphics();
  disc.circle(x, y, r).fill({ color: C.tokenBg, alpha: dim ? 0.5 : 1 });
  parent.addChild(disc);

  // Art (drop-in PNG) clipped to the disc, else procedural glyph.
  const tex = resolveUnitTexture(defId, unitTextureLookup);
  if (tex) {
    const sprite = new PIXI.Sprite(tex);
    sprite.anchor.set(0.5);
    sprite.width = r * 2;
    sprite.height = r * 2;
    sprite.position.set(x, y);
    sprite.alpha = dim ? 0.5 : 1;
    const mask = new PIXI.Graphics();
    mask.circle(x, y, r - RING_W / 2).fill({ color: C.tokenBg });
    sprite.mask = mask;
    parent.addChild(sprite);
    parent.addChild(mask);
  } else {
    requestUnitArt(defId); // lazy drop-in load; glyph stays until/unless it lands
    const glyph = new PIXI.Graphics();
    drawGlyph(glyph, glyphForTraits(def?.traits ?? [], def?.classes), x, y, r * 1.05, ring);
    glyph.alpha = dim ? 0.45 : 1;
    parent.addChild(glyph);
  }

  // Tier ring on top of art/glyph
  const ringG = new PIXI.Graphics();
  ringG.circle(x, y, r).stroke({ width: RING_W, color: ring, alpha: dim ? 0.4 : 0.95 });
  parent.addChild(ringG);

  // Star pips: gold diamonds above the disc
  if (star > 0) {
    const pips = new PIXI.Graphics();
    const pipR = Math.max(2, r * 0.18);
    const gap = pipR * 2.1;
    for (let i = 0; i < star; i++) {
      const px = x - ((star - 1) * gap) / 2 + i * gap;
      const py = y - r - pipR - 2;
      pips.poly([px, py - pipR, px + pipR, py, px, py + pipR, px - pipR, py]);
    }
    pips.fill({ color: C.starGold, alpha: dim ? 0.5 : 1 });
    parent.addChild(pips);
  }

  // HP/mana bars below the disc
  if (opts.bars) {
    const w = r * 2;
    const hpFrac = Math.max(0, Math.min(1, opts.bars.hpFrac));
    const manaFrac = Math.max(0, Math.min(1, opts.bars.manaFrac));
    const hpY = y + r + 2;
    const manaY = hpY + 4;
    const bars = new PIXI.Graphics();
    bars.rect(x - r, hpY, w, 3).fill({ color: C.hpBg });
    bars.rect(x - r, hpY, Math.round(w * hpFrac), 3).fill({ color: hpFrac < 0.25 ? C.hpLow : C.hpGreen });
    bars.rect(x - r, manaY, w, 2).fill({ color: C.manaBg });
    bars.rect(x - r, manaY, Math.round(w * manaFrac), 2).fill({ color: C.manaBlue });
    parent.addChild(bars);
  }
}
