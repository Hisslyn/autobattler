// Pure resolver from an assetManifest layer path (relative to ASSET_BASE_DIR) to
// a URL fetchable by PIXI.Assets at runtime. The art source-of-truth lives in the
// repo's "placeholder for the future ideas/items" folder; it is exposed at the
// Vite-served root via a symlink at packages/client/public/item-layers/, so a
// manifest path like "tier 1/iron_sword.png" maps to "/item-layers/tier%201/...".
//
// This is the ONLY place that knows ITEM_LAYERS_PUBLIC. No Pixi dependency, so it
// is unit-testable in isolation.

/** Served root for the layered item-icon art (mirrors the symlinked subfolders). */
export const ITEM_LAYERS_PUBLIC = "/item-layers";

/**
 * Convert an assetManifest layer path (relative to ASSET_BASE_DIR) to a URL the
 * client can fetch. Each path segment is encoded so spaces ("tier 1") and other
 * special characters survive the request. Pure.
 */
export function layerPathToUrl(manifestPath: string, base = ITEM_LAYERS_PUBLIC): string {
  return base + "/" + manifestPath.split("/").map(encodeURIComponent).join("/");
}
