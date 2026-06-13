// Unit-art drop-in slot — the fidelity path for UnitToken. Mirrors the audio
// music-slot pattern: drop a PNG at public/units/<unitId>.png and the token
// renders it (clipped inside the tier ring) instead of the procedural glyph; if
// the file is absent the token falls back to the glyph, no-op clean.
//
// The pure resolver (path/id → texture | null) is the unit under test; runtime
// texture loading is a thin async cache around PIXI.Assets layered on top.
import * as PIXI from "pixi.js";

export const UNIT_ART_BASE = "/units";

/** `units/<id>.png` lookup path (Vite serves public/ at the site root). */
export function unitArtPath(unitId: string, base = UNIT_ART_BASE): string {
  return `${base}/${unitId}.png`;
}

/**
 * Pure art resolver: returns the texture the lookup holds for this unit, or null
 * (→ caller draws the glyph). Generic over the texture type so it is testable
 * without Pixi. This is the exists/fallback branch the tests exercise.
 */
export function resolveUnitTexture<T>(
  unitId: string,
  lookup: (path: string) => T | null,
  base = UNIT_ART_BASE
): T | null {
  return lookup(unitArtPath(unitId, base));
}

// ─── Runtime cache ───────────────────────────────────────────────────────────
// Empty by default, so with no PNGs present every token glyphs. Populated
// lazily the first time a unit is rendered (one fetch attempt per id/session);
// a missing file caches as null and is never retried.

const cache = new Map<string, PIXI.Texture | null>();
const listeners = new Set<() => void>();

/** Sync lookup backing resolveUnitTexture at runtime (cache hit or null). */
export function unitTextureLookup(path: string): PIXI.Texture | null {
  return cache.get(path) ?? null;
}

/** Subscribe to "a unit texture finished loading" so static views can redraw. */
export function onUnitArtReady(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Try to load public/units/<id>.png once. On success caches the texture and
 * notifies listeners (so the planning board redraws); 404/decode failure caches
 * null (glyph stays). Fire-and-forget; safe to call every render.
 */
export function requestUnitArt(unitId: string, base = UNIT_ART_BASE): void {
  const path = unitArtPath(unitId, base);
  if (cache.has(path)) return;
  cache.set(path, null); // mark attempted up front (dedupe concurrent renders)
  void PIXI.Assets.load<PIXI.Texture>(path)
    .then((tex) => {
      if (!tex) return;
      cache.set(path, tex);
      for (const cb of listeners) cb();
    })
    .catch(() => {
      /* absent / decode failure → null cached, glyph fallback */
    });
}
