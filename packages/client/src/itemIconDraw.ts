// Pixi drawing for procedural item icons + the runtime art cache. The pure
// resolution (component→emblem, completed→its two emblems, asset path) lives in
// itemIcon.ts; this module only paints. Every emblem is a small vector shape
// drawn with the Pixi v8 path API (circle/poly/rect/moveTo/lineTo + fill/stroke),
// the same approach as glyphs.ts. A component reads raw/unframed; a completed
// item composes its two emblems inside a gilded frame, with an optional shine
// sweep that is reduced-motion gated (static frame stays).
import * as PIXI from "pixi.js";
import { gameData } from "@autobattler/data";
import { C, rarityColor } from "./theme.js";
import {
  itemIcon,
  resolveItemTexture,
  itemArtPath,
  type ItemEmblem,
  type ItemIcon,
} from "./itemIcon.js";

// ─── Runtime art cache (mirrors sprites.ts) ──────────────────────────────────
// Empty by default → every item draws its procedural emblem. Populated lazily
// the first time an item is rendered; a missing file caches null and is never
// retried, exactly like the unit-art slot.

const cache = new Map<string, PIXI.Texture | null>();
const listeners = new Set<() => void>();

/** Sync lookup backing resolveItemTexture at runtime (cache hit or null). */
export function itemTextureLookup(path: string): PIXI.Texture | null {
  return cache.get(path) ?? null;
}

/** Subscribe to "an item texture finished loading" so static views can redraw. */
export function onItemArtReady(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Try to load public/items/<id>.png once. On success caches the texture and
 * notifies listeners; 404/decode failure caches null (procedural emblem stays).
 * Fire-and-forget; safe to call every render.
 */
export function requestItemArt(itemId: string): void {
  const path = itemArtPath(itemId);
  if (cache.has(path)) return;
  cache.set(path, null); // mark attempted up front (dedupe concurrent renders)
  void PIXI.Assets.load<PIXI.Texture>(path)
    .then((tex) => {
      if (!tex) return;
      cache.set(path, tex);
      for (const cb of listeners) cb();
    })
    .catch(() => {
      /* absent / decode failure → null cached, emblem fallback */
    });
}

// ─── Emblem primitives ───────────────────────────────────────────────────────
// Each emblem is drawn centered at (cx, cy), sized ~`size` across, in `color`.

function drawEmblem(
  g: PIXI.Graphics,
  emblem: ItemEmblem,
  cx: number,
  cy: number,
  size: number,
  color: number
): void {
  const s = size / 2;
  // Same step-based stroke weight as glyphs.ts so item emblems and class glyphs
  // are visually interchangeable at the same render size.
  const lw = size <= 9 ? 1.2 : size <= 13 ? 1.5 : size <= 20 ? 2 : Math.max(2, size * 0.1);
  const stroke = (alpha = 1, w = lw): void => {
    g.stroke({ width: w, color, alpha, cap: "round", join: "round" });
  };
  const fill = (alpha = 1): void => {
    g.fill({ color, alpha });
  };

  switch (emblem) {
    case "blade": // sword: long blade + crossguard + pommel
      g.poly([
        cx, cy - s,
        cx + s * 0.16, cy - s * 0.75,
        cx + s * 0.16, cy + s * 0.45,
        cx - s * 0.16, cy + s * 0.45,
        cx - s * 0.16, cy - s * 0.75,
      ]);
      fill();
      g.moveTo(cx - s * 0.55, cy + s * 0.45).lineTo(cx + s * 0.55, cy + s * 0.45); // guard
      stroke();
      g.moveTo(cx, cy + s * 0.45).lineTo(cx, cy + s * 0.9); // grip
      stroke();
      g.circle(cx, cy + s * 0.92, s * 0.12);
      fill();
      break;
    case "vest": // chain vest: torso plate with a notch + rivets
      g.poly([
        cx - s * 0.7, cy - s * 0.6,
        cx - s * 0.25, cy - s * 0.85,
        cx + s * 0.25, cy - s * 0.85,
        cx + s * 0.7, cy - s * 0.6,
        cx + s * 0.55, cy + s * 0.9,
        cx - s * 0.55, cy + s * 0.9,
      ]);
      fill(0.92);
      g.moveTo(cx, cy - s * 0.85).lineTo(cx, cy - s * 0.35); // collar notch
      g.stroke({ width: lw * 0.8, color: C.tokenBg, alpha: 0.9, cap: "round" });
      break;
    case "crystal": // mana crystal: tall faceted gem
      g.poly([
        cx, cy - s,
        cx + s * 0.55, cy - s * 0.2,
        cx + s * 0.3, cy + s * 0.9,
        cx - s * 0.3, cy + s * 0.9,
        cx - s * 0.55, cy - s * 0.2,
      ]);
      fill(0.95);
      g.moveTo(cx, cy - s).lineTo(cx, cy + s * 0.9);
      g.stroke({ width: lw * 0.6, color: C.tokenBg, alpha: 0.7 });
      break;
    case "bow": // recurve bow: arc + string + nocked arrow
      g.arc(cx + s * 0.15, cy, s * 0.95, Math.PI * 0.62, Math.PI * 1.38);
      stroke();
      g.moveTo(cx - s * 0.42, cy - s * 0.82).lineTo(cx - s * 0.42, cy + s * 0.82); // string
      stroke(0.8, lw * 0.6);
      g.moveTo(cx - s * 0.42, cy).lineTo(cx + s * 0.85, cy); // arrow
      stroke();
      g.poly([cx + s * 0.85, cy, cx + s * 0.55, cy - s * 0.22, cx + s * 0.55, cy + s * 0.22]);
      fill();
      break;
    case "cloak": // negatron cloak: hooded mantle silhouette
      g.moveTo(cx, cy - s);
      g.bezierCurveTo(cx + s * 0.85, cy - s * 0.7, cx + s * 0.85, cy + s * 0.6, cx + s * 0.7, cy + s * 0.9);
      g.lineTo(cx - s * 0.7, cy + s * 0.9);
      g.bezierCurveTo(cx - s * 0.85, cy + s * 0.6, cx - s * 0.85, cy - s * 0.7, cx, cy - s);
      fill(0.9);
      g.moveTo(cx, cy - s * 0.55).lineTo(cx, cy + s * 0.85); // center seam
      g.stroke({ width: lw * 0.7, color: C.tokenBg, alpha: 0.8 });
      break;
    case "belt": // giant's belt: strap + square buckle
      g.rect(cx - s * 0.95, cy - s * 0.3, s * 1.9, s * 0.6);
      fill(0.85);
      g.rect(cx - s * 0.35, cy - s * 0.5, s * 0.7, s * 1.0);
      fill();
      g.rect(cx - s * 0.16, cy - s * 0.28, s * 0.32, s * 0.56);
      g.fill({ color: C.tokenBg, alpha: 0.9 });
      break;
    case "rod": // sorcerer rod: staff with an orb head + halo
      g.moveTo(cx - s * 0.45, cy + s * 0.9).lineTo(cx + s * 0.25, cy - s * 0.4);
      stroke();
      g.circle(cx + s * 0.4, cy - s * 0.6, s * 0.34);
      fill();
      g.circle(cx + s * 0.4, cy - s * 0.6, s * 0.55);
      stroke(0.5, lw * 0.6);
      break;
    case "glove": // sparring gloves: fist/gauntlet
      g.roundRect(cx - s * 0.6, cy - s * 0.35, s * 1.2, s * 1.05, s * 0.28);
      fill(0.92);
      g.roundRect(cx - s * 0.75, cy - s * 0.05, s * 0.45, s * 0.6, s * 0.16); // thumb
      fill(0.92);
      for (let i = 0; i < 3; i++) {
        const fx = cx - s * 0.4 + i * s * 0.4;
        g.moveTo(fx, cy - s * 0.35).lineTo(fx, cy - s * 0.7); // knuckle ridges
      }
      g.stroke({ width: lw * 0.7, color, alpha: 1, cap: "round" });
      break;
    case "flask": // tear flask: rounded vial with a stopper
      g.moveTo(cx - s * 0.2, cy - s * 0.85).lineTo(cx + s * 0.2, cy - s * 0.85); // neck top
      g.lineTo(cx + s * 0.2, cy - s * 0.4);
      g.bezierCurveTo(cx + s * 0.85, cy - s * 0.1, cx + s * 0.7, cy + s * 0.9, cx, cy + s * 0.9);
      g.bezierCurveTo(cx - s * 0.7, cy + s * 0.9, cx - s * 0.85, cy - s * 0.1, cx - s * 0.2, cy - s * 0.4);
      g.closePath();
      fill(0.92);
      g.rect(cx - s * 0.26, cy - s, s * 0.52, s * 0.22); // stopper
      fill();
      break;
  }
}

// ─── High-level icon draw ────────────────────────────────────────────────────

export interface ItemIconOpts {
  /** Disc/box radius (half-size) in px. */
  radius?: number;
  /** Loot rarity ("common".."legendary") → frame/shine tint. Defaults gilded. */
  rarity?: string;
  /** When true, skip the animated shine (static frame stays). */
  reducedMotion?: boolean;
  /** Dim the whole icon (e.g. eliminated/disabled). */
  dimmed?: boolean;
}

/**
 * Draw an item's icon into `parent`, centered at (x, y). Resolves the drop-in
 * PNG first (public/items/<id>.png); else draws the procedural emblem(s). A base
 * component draws one neutral-tinted emblem unframed; a completed item composes
 * its two recipe emblems inside a rarity-tinted frame (+ optional shine).
 * Returns the rarity-tint color used (so callers can match other surfaces).
 */
export function drawItemIcon(
  parent: PIXI.Container,
  itemId: string,
  x: number,
  y: number,
  opts: ItemIconOpts = {}
): number {
  const r = opts.radius ?? 14;
  const dim = opts.dimmed ?? false;
  const baseA = dim ? 0.5 : 1;
  const frameTint = opts.rarity ? rarityColor(opts.rarity) : C.itemFrame;
  const icon = itemIcon(itemId, gameData);

  // Drop-in art slot: a PNG always wins, clipped to a disc, no frame/emblem.
  const tex = resolveItemTexture(itemId, itemTextureLookup);
  if (tex) {
    const sprite = new PIXI.Sprite(tex);
    sprite.anchor.set(0.5);
    sprite.width = r * 2;
    sprite.height = r * 2;
    sprite.position.set(x, y);
    sprite.alpha = baseA;
    parent.addChild(sprite);
    return frameTint;
  }
  requestItemArt(itemId); // lazy drop-in load; emblem stays until/unless it lands

  if (!icon) {
    // Unknown id (should not happen for real items): leave to the caller's
    // generic glyph. We draw nothing so the fallback is visible.
    return frameTint;
  }

  if (icon.kind === "component") {
    const g = new PIXI.Graphics();
    drawEmblem(g, icon.emblem, x, y, r * 1.5, C.itemEmblem);
    g.alpha = baseA;
    parent.addChild(g);
    return frameTint;
  }

  // Completed item: gilded frame + the two recipe emblems side-by-side, each in
  // a distinct ink so it reads as "built from X + Y".
  drawCompletedFrame(parent, x, y, r, frameTint, baseA, opts.reducedMotion ?? false);
  const eg = new PIXI.Graphics();
  drawEmblem(eg, icon.emblems[0], x - r * 0.34, y - r * 0.1, r * 1.05, C.itemEmblem);
  drawEmblem(eg, icon.emblems[1], x + r * 0.34, y + r * 0.14, r * 1.05, C.itemEmblemAlt);
  eg.alpha = baseA;
  parent.addChild(eg);
  return frameTint;
}

/** Gilded rounded frame for completed items, with an optional shine sweep. */
function drawCompletedFrame(
  parent: PIXI.Container,
  x: number,
  y: number,
  r: number,
  tint: number,
  alpha: number,
  reducedMotion: boolean
): void {
  const frame = new PIXI.Graphics();
  frame.roundRect(x - r, y - r, r * 2, r * 2, r * 0.42).fill({ color: C.itemCompleted, alpha });
  frame.roundRect(x - r, y - r, r * 2, r * 2, r * 0.42).stroke({ width: 2, color: tint, alpha: alpha * 0.95 });
  // Corner gilding ticks so the frame reads as "completed" even color-blind.
  frame.moveTo(x - r + 3, y - r + r * 0.5).lineTo(x - r + 3, y - r + 3).lineTo(x - r + r * 0.5, y - r + 3);
  frame.stroke({ width: 1.5, color: tint, alpha: alpha * 0.8, cap: "round" });
  parent.addChild(frame);

  // Static shine glint (always present, subtle). The animated sweep is gated.
  const glint = new PIXI.Graphics();
  glint.poly([x - r * 0.5, y - r, x - r * 0.1, y - r, x - r * 0.6, y + r, x - r, y + r])
    .fill({ color: C.itemShine, alpha: alpha * (reducedMotion ? 0.1 : 0.18) });
  glint.eventMode = "none";
  parent.addChild(glint);

  if (reducedMotion) return;
  // Animated shine: the glint sweeps left→right and loops slowly.
  const sweep = new PIXI.Graphics();
  sweep.poly([-r * 0.18, -r, r * 0.18, -r, -r * 0.2, r, -r * 0.56, r])
    .fill({ color: C.itemShine, alpha: alpha * 0.4 });
  sweep.position.set(x - r, y);
  const mask = new PIXI.Graphics();
  mask.roundRect(x - r, y - r, r * 2, r * 2, r * 0.42).fill({ color: C.itemShine });
  sweep.mask = mask;
  parent.addChild(mask);
  parent.addChild(sweep);
  const start = performance.now();
  const periodMs = 2600;
  const tick = (): void => {
    if (sweep.destroyed) return;
    const k = ((performance.now() - start) % periodMs) / periodMs;
    sweep.x = x - r + k * (r * 2 + r * 0.6);
  };
  PIXI.Ticker.shared.add(tick);
  sweep.once("destroyed", () => PIXI.Ticker.shared.remove(tick));
}
