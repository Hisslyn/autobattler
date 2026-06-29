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
import { drawItemIcon } from "./itemIconDraw.js";
import { drawLayeredItemIconById } from "./itemLayerRenderer.js";

const RING_W = 2.5;

// HP-bar segment size: one divider tick per this many HP, so each chunk reads
// as a segment (e.g. a 900-maxHp unit shows three segments).
const HP_SEGMENT = 300;

// "Checkers piece" volume (board/bench/combat only — never the flat shop/inspect
// tokens). The top face is a circle foreshortened to ~this fraction of its height
// so it reads as lying on the tilted board plane; the side wall is extruded down
// by this fraction of the radius. Tuned to sit close to BOARD_TILT's foreshorten.
const PIECE_FORESHORTEN = 0.62;
const PIECE_THICKNESS_FRAC = 0.32;

export interface UnitTokenOpts {
  /** Disc radius (default 16 for board/combat; pass ~12 for bench). */
  radius?: number;
  dimmed?: boolean;
  /**
   * Render the token as a short "checkers piece" with volume: the disc/icon/ring
   * become a foreshortened top face lying on the tilted board plane, lifted above
   * a darker extruded side wall, with a soft contact shadow on the plane. HP/mana
   * bars and star pips stay upright + screen-aligned. Omit on flat surfaces
   * (shop cards, inspect panel, drag ghost) for a byte-identical flat token.
   * `foreshorten` (0..1] squashes the top face; `thickness` overrides the wall px.
   */
  piece?: { foreshorten?: number; thickness?: number };
  /**
   * HP/mana fill fractions (0..1); omit for bench tokens (no bars).
   * `hpChipFrac` (≥ hpFrac) draws a trailing white damage-chip from the live
   * fill up to the lagging value, animated by the combat view.
   * `maxHp` (absolute, display-only) places segment divider ticks every 300 HP
   * along the bar so each 300-HP chunk reads as one segment.
   */
  bars?: { hpFrac: number; manaFrac: number; hpChipFrac?: number; maxHp?: number };
  /**
   * Equipped items rendered as tiny icons along the disc base (board/bench
   * tokens). Each entry's `id` resolves its distinct emblem/composed icon (the
   * `component` flag is retained for callers that only need the tint).
   */
  items?: { id?: string; component: boolean }[];
  /** Skip the completed-item shine sweep on equipped icons. */
  reducedMotion?: boolean;
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
  const def = gameData.units.find((u) => u.id === defId);
  // A defId absent from the unit catalog is a PvE mob (mobs are never in
  // data.units) → neutral monster ring instead of a player tier color.
  const ring = def ? tierColor(tier) : C.mobTint;

  // Volume ("checkers piece"). When set, the top face is foreshortened (vertical
  // radius `ry`) and lifted by the wall thickness `th` above the contact point at
  // (x, y); when omitted, fcy=y / ry=r so every draw below is the flat token.
  const piece = opts.piece;
  const fs = piece ? piece.foreshorten ?? PIECE_FORESHORTEN : 1;
  const th = piece ? piece.thickness ?? Math.max(3, r * PIECE_THICKNESS_FRAC) : 0;
  const ry = r * fs;       // top-face vertical radius (= r when flat)
  const fcy = y - th;      // top-face center y (= y when flat)

  // Soft contact shadow + extruded side wall (piece only), under the face. The
  // shadow peeks below the base; the wall is a vertical capsule (top ellipse +
  // connecting rect + base ellipse) in the darker side color — the top face below
  // covers all but the front band, leaving visible thickness under the lower edge.
  if (piece) {
    const shadow = new PIXI.Graphics();
    shadow.ellipse(x, y + ry * 0.4, r * 1.02, ry * 0.55).fill({ color: C.tokenShadow, alpha: dim ? 0.12 : 0.3 });
    shadow.ellipse(x, y + ry * 0.4, r * 0.7, ry * 0.36).fill({ color: C.tokenShadow, alpha: dim ? 0.1 : 0.22 });
    parent.addChild(shadow);

    const wall = new PIXI.Graphics();
    wall.ellipse(x, fcy, r, ry).rect(x - r, fcy, r * 2, th).ellipse(x, y, r, ry)
      .fill({ color: C.tokenSide, alpha: dim ? 0.5 : 1 });
    parent.addChild(wall);
  }

  // Disc (top face) — circle when flat, foreshortened ellipse when a piece.
  const disc = new PIXI.Graphics();
  if (piece) disc.ellipse(x, fcy, r, ry).fill({ color: C.tokenBg, alpha: dim ? 0.5 : 1 });
  else disc.circle(x, y, r).fill({ color: C.tokenBg, alpha: dim ? 0.5 : 1 });
  parent.addChild(disc);

  // Art (drop-in PNG) clipped to the disc, else procedural glyph — foreshortened
  // with the face so the icon tilts onto the plane (no-op when flat: fs=1).
  const tex = resolveUnitTexture(defId, unitTextureLookup);
  if (tex) {
    const sprite = new PIXI.Sprite(tex);
    sprite.anchor.set(0.5);
    sprite.width = r * 2;
    sprite.height = ry * 2;
    sprite.position.set(x, fcy);
    sprite.alpha = dim ? 0.5 : 1;
    const mask = new PIXI.Graphics();
    if (piece) mask.ellipse(x, fcy, r - RING_W / 2, ry - RING_W / 2).fill({ color: C.tokenBg });
    else mask.circle(x, y, r - RING_W / 2).fill({ color: C.tokenBg });
    sprite.mask = mask;
    parent.addChild(sprite);
    parent.addChild(mask);
  } else {
    requestUnitArt(defId); // lazy drop-in load; glyph stays until/unless it lands
    const glyph = new PIXI.Graphics();
    drawGlyph(glyph, glyphForTraits(def?.traits ?? [], def?.classes), 0, 0, r * 1.05, ring);
    glyph.position.set(x, fcy);
    if (piece) glyph.scale.set(1, fs);
    glyph.alpha = dim ? 0.45 : 1;
    parent.addChild(glyph);
  }

  // Tier ring on top of art/glyph (ellipse on the tilted face when a piece)
  const ringG = new PIXI.Graphics();
  if (piece) ringG.ellipse(x, fcy, r, ry).stroke({ width: RING_W, color: ring, alpha: dim ? 0.4 : 0.95 });
  else ringG.circle(x, y, r).stroke({ width: RING_W, color: ring, alpha: dim ? 0.4 : 0.95 });
  parent.addChild(ringG);

  // Star pips: gold diamonds above the top face — upright + screen-aligned.
  if (star > 0) {
    const pips = new PIXI.Graphics();
    const pipR = Math.max(2, r * 0.18);
    const gap = pipR * 2.1;
    for (let i = 0; i < star; i++) {
      const px = x - ((star - 1) * gap) / 2 + i * gap;
      const py = fcy - ry - pipR - 2;
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
    const hpH = 5;          // thicker HP bar for legibility
    const hpY = y + r + 2;
    const manaY = hpY + hpH + 1;
    const bars = new PIXI.Graphics();
    bars.rect(x - r, hpY, w, hpH).fill({ color: C.hpBg });
    const chip = Math.max(hpFrac, Math.min(1, opts.bars.hpChipFrac ?? hpFrac));
    if (chip > hpFrac) {
      bars.rect(x - r + Math.round(w * hpFrac), hpY, Math.round(w * (chip - hpFrac)), hpH).fill({ color: C.fxDamageChip });
    }
    bars.rect(x - r, hpY, Math.round(w * hpFrac), hpH).fill({ color: hpFrac < 0.25 ? C.hpLow : C.hpGreen });
    // Segment divider ticks: one per 300-HP boundary so each chunk reads as a
    // segment (900 maxHp → 3 segments, i.e. ticks at 300 and 600).
    const maxHp = opts.bars.maxHp ?? 0;
    if (maxHp > HP_SEGMENT) {
      const segTicks = new PIXI.Graphics();
      for (let hp = HP_SEGMENT; hp < maxHp; hp += HP_SEGMENT) {
        const tx = x - r + Math.round(w * (hp / maxHp));
        segTicks.rect(tx, hpY, 1, hpH);
      }
      segTicks.fill({ color: C.hpSegment, alpha: dim ? 0.5 : 0.9 });
      parent.addChild(bars);
      parent.addChild(segTicks);
    } else {
      parent.addChild(bars);
    }
    // Mana bar: always render the (empty) track, even at 0 max/value.
    const mana = new PIXI.Graphics();
    mana.rect(x - r, manaY, w, 2).fill({ color: C.manaBg });
    if (manaFrac > 0) mana.rect(x - r, manaY, Math.round(w * manaFrac), 2).fill({ color: C.manaBlue });
    parent.addChild(mana);
  }

  // Equipped items: tiny distinct icons along the bottom-right arc of the disc
  // so a glance shows which units carry which items. An item with no id (e.g. a
  // mob preview) falls back to a plain tinted pip.
  if (opts.items && opts.items.length > 0) {
    const dotR = Math.max(2.5, r * 0.2);
    const gap = dotR * 2.4;
    const n = Math.min(opts.items.length, 3);
    const baseX = x + r - dotR - 1 - (n - 1) * gap;
    const dotY = fcy + ry - dotR - 1;
    for (let i = 0; i < n; i++) {
      const it = opts.items[i]!;
      // Backing disc so the small icon stays legible over art/glyph.
      const bg = new PIXI.Graphics();
      bg.circle(baseX + i * gap, dotY, dotR + 1).fill({ color: C.tokenBg, alpha: dim ? 0.5 : 0.95 });
      parent.addChild(bg);
      if (it.id) {
        const ic = new PIXI.Container();
        const dotSize = Math.max(5, Math.round(dotR * 2));
        const layered = drawLayeredItemIconById(it.id, baseX + i * gap, dotY, {
          size: dotSize,
          parent: ic,
          alpha: dim ? 0.5 : 1,
          scaleMode: "nearest", // always nearest at this size
        });
        if (!layered) {
          drawItemIcon(ic, it.id, baseX + i * gap, dotY, {
            radius: dotR,
            dimmed: dim,
            reducedMotion: opts.reducedMotion ?? true, // tiny: never animate the shine
          });
        }
        parent.addChild(ic);
      } else {
        const pip = new PIXI.Graphics();
        pip.circle(baseX + i * gap, dotY, dotR).fill({ color: it.component ? C.itemComponent : C.itemCompleted, alpha: dim ? 0.5 : 1 });
        pip.circle(baseX + i * gap, dotY, dotR).stroke({ width: 1, color: C.accentGold, alpha: dim ? 0.4 : 0.85 });
        parent.addChild(pip);
      }
    }
  }
}
