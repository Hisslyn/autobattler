// Dumb layered item-icon compositor. Takes an ordered back-to-front list of
// manifest layer paths (one item = one stack, sourced from assetStackFor) and
// alpha-composites them into a square, centered, same-size icon. The renderer
// contains NO tier logic, NO emblem/frame logic, NO game rules, and NO animation
// (the procedural renderer's shine sweep is deliberately not reproduced) — it
// only paints whatever PNG layers it is handed, in array order.
//
// The async texture load/cache + onReady-repaint pattern mirrors sprites.ts and
// itemIconDraw.ts exactly: one Map, one listener Set, one requestLayerArt, one
// layerTextureLookup, one onLayerArtReady.
import * as PIXI from "pixi.js";
import { assetStackFor } from "@autobattler/data/asset-manifest";
import { layerPathToUrl } from "./itemLayerUrl.js";

// ─── Runtime layer-texture cache (mirrors sprites.ts) ────────────────────────
// Empty by default → a call site with no art falls back via drawLayeredItemIconById
// returning false (id known) or the textures simply never resolving. Populated
// lazily the first time a layer is rendered; a missing file caches null and is
// never retried.

const layerCache = new Map<string, PIXI.Texture | null>();
const layerListeners = new Set<() => void>();

/** Sync lookup: served URL → cached Texture or null (caller skips that layer). */
export function layerTextureLookup(url: string): PIXI.Texture | null {
  return layerCache.get(url) ?? null;
}

/** Subscribe to "a layer texture finished loading" so static views can redraw. */
export function onLayerArtReady(cb: () => void): () => void {
  layerListeners.add(cb);
  return () => layerListeners.delete(cb);
}

/**
 * Try to load one layer PNG once. Idempotent (keyed by the resolved URL). On
 * success caches the texture and notifies listeners (so static boards redraw);
 * 404/decode failure caches null (the layer is silently skipped forever).
 * Fire-and-forget; safe to call every render.
 */
export function requestLayerArt(manifestPath: string): void {
  const url = layerPathToUrl(manifestPath);
  if (layerCache.has(url)) return;
  layerCache.set(url, null); // mark attempted up front (dedupe concurrent renders)
  void PIXI.Assets.load<PIXI.Texture>(url)
    .then((tex) => {
      if (!tex) return;
      layerCache.set(url, tex);
      for (const cb of layerListeners) cb();
    })
    .catch(() => {
      /* absent / decode failure → null cached, layer skipped */
    });
}

export interface LayeredIconOpts {
  /** Side length (px) of the square box. Every layer fills this square. */
  size: number;
  /** Pixi Container to add the layer Sprites into. */
  parent: PIXI.Container;
  /** Optional alpha override (e.g. dimmed = 0.5). Default 1. */
  alpha?: number;
  /**
   * scaleMode for texture rendering: "nearest" for size < 16 (crisp at small
   * bench/chip radii), "linear" (default) for size >= 16 (smooth at panel sizes).
   */
  scaleMode?: "nearest" | "linear";
}

/**
 * Composite a back-to-front ordered list of manifest layer paths into
 * `opts.parent`, centered at (cx, cy). Each loaded layer fills the full size×size
 * box (anchor 0.5, width=height=size); index 0 is drawn first (bottom), the last
 * index on top. Layers not yet loaded are skipped and appear once onLayerArtReady
 * fires and the caller redraws — same pattern as requestItemArt/onItemArtReady.
 *
 * No tier/emblem/frame logic, no animation. Pure static alpha-composite.
 */
export function drawLayeredItemIcon(
  layers: string[],
  cx: number,
  cy: number,
  opts: LayeredIconOpts
): void {
  const { size, parent, alpha = 1, scaleMode = "linear" } = opts;

  for (const manifestPath of layers) {
    requestLayerArt(manifestPath); // lazy load; notifies onLayerArtReady on arrival
    const tex = layerCache.get(layerPathToUrl(manifestPath));
    if (!tex) continue; // not yet loaded → skip; appears on the next redraw

    tex.source.scaleMode = scaleMode;
    const sprite = new PIXI.Sprite(tex);
    sprite.anchor.set(0.5);
    sprite.width = size;
    sprite.height = size;
    sprite.position.set(cx, cy);
    sprite.alpha = alpha;
    sprite.eventMode = "none";
    parent.addChild(sprite);
  }
}

/**
 * Resolve `id` via assetStackFor, then composite its stack. Returns false when
 * the id is not in the manifest (the caller then falls back to the procedural
 * drawItemIcon). A true return only means the id resolved to a stack — individual
 * layers may still be mid-load and appear on a later redraw.
 */
export function drawLayeredItemIconById(
  id: string,
  cx: number,
  cy: number,
  opts: LayeredIconOpts
): boolean {
  const stack = assetStackFor(id);
  if (!stack) return false;
  drawLayeredItemIcon(stack, cx, cy, opts);
  return true;
}
