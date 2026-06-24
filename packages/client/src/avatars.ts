/// <reference types="vite/client" />
// Avatar registry — cosmetic-only player portraits. Mirrors the sprites.ts
// drop-in-art pattern: a PURE path/url resolver split from a runtime async
// texture cache with a listener broadcast, plus a per-match seat→avatar
// allocation helper.
//
// The 20 PNGs live at packages/client/src/assets/avatars/ (NOT under public/),
// so each one is a BUNDLED asset: its URL comes from Vite's
// import.meta.glob (the hashed build URL), never a hand-constructed /avatars/N
// path. The registry keys entries by their parsed `num`.
//
// Cosmetic only: this never touches packages/sim/rules/data, never affects
// determinism, and is never persisted.
import * as PIXI from "pixi.js";

export type AvatarRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export interface AvatarEntry {
  num: number; // 1–20, parsed from the filename
  name: string; // Whiskers, Biscuit, …
  rarity: AvatarRarity; // cosmetic tier
  url: string; // resolved/hashed bundle URL from the glob (NOT a /avatars/N path)
}

/** Editable constant: the human seat (Player 1) always shows this avatar number. */
export const PLAYER_1_AVATAR_NUM = 1;

// ─── Glob & parse ────────────────────────────────────────────────────────────
// Eager `?url` import yields each PNG's resolved asset URL as the module value.
// Path is relative to THIS file (src/) reaching the assets/avatars dir.
const globModules = import.meta.glob<string>("./assets/avatars/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

const RARITIES: ReadonlySet<string> = new Set([
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
]);

const FILENAME_RE = /^(\d{2})_([A-Za-z]+)_([a-z]+)\.png$/;

/**
 * Parse one glob path → AvatarEntry, or null if it doesn't match the
 * `<num>_<name>_<rarity>.png` convention. Exported for the test.
 */
export function parseAvatarFilename(path: string, url: string): AvatarEntry | null {
  const file = path.split("/").pop() ?? "";
  const m = FILENAME_RE.exec(file);
  if (!m) return null;
  const rarity = m[3]!;
  if (!RARITIES.has(rarity)) return null;
  return {
    num: parseInt(m[1]!, 10),
    name: m[2]!,
    rarity: rarity as AvatarRarity,
    url,
  };
}

/** All parsed avatars, sorted by num. URLs come from the glob, not a built path. */
export const AVATARS: AvatarEntry[] = Object.entries(globModules)
  .map(([path, url]) => parseAvatarFilename(path, url))
  .filter((x): x is AvatarEntry => x !== null)
  .sort((a, b) => a.num - b.num);

const BY_NUM = new Map<number, AvatarEntry>(AVATARS.map((a) => [a.num, a]));

/** The registry entry (incl. its bundle url) for an avatar number, or null. */
export function avatarEntry(num: number): AvatarEntry | null {
  return BY_NUM.get(num) ?? null;
}

/** The bundle url for an avatar number, or null when the registry has no entry. */
export function avatarUrl(num: number): string | null {
  return BY_NUM.get(num)?.url ?? null;
}

// ─── Pure resolution (mirrors sprites.ts resolveUnitTexture) ─────────────────

/**
 * Pure resolver: returns whatever the injected `lookup` holds for this avatar's
 * url, or null (→ caller draws the glyph fallback). Generic over the texture
 * type so it is testable without Pixi: tests pass a fake lookup keyed by url.
 * Looks up by the registry url (not a constructed path), so a num with no
 * registry entry always resolves to null.
 */
export function resolveAvatarTexture<T>(
  num: number,
  lookup: (url: string) => T | null
): T | null {
  const url = avatarUrl(num);
  if (url === null) return null;
  return lookup(url);
}

// ─── Runtime cache (mirrors sprites.ts requestUnitArt) ───────────────────────
// Empty by default; populated lazily the first time an avatar is rendered (one
// load attempt per url/session). A failed load caches null (glyph stays).

const cache = new Map<string, PIXI.Texture | null>();
const listeners = new Set<() => void>();

/** Sync lookup backing resolveAvatarTexture at runtime (cache hit or null). */
export function avatarTextureLookup(url: string): PIXI.Texture | null {
  return cache.get(url) ?? null;
}

/** Subscribe to "an avatar texture finished loading" so static views redraw. */
export function onAvatarArtReady(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Load the avatar's bundled PNG once via PIXI.Assets. On success caches the
 * texture and notifies listeners (so the opponent rail redraws); a decode/404
 * failure (or an unknown num) caches null and the glyph fallback persists.
 * Fire-and-forget; safe to call every render (cache-has short-circuits).
 */
export function requestAvatarArt(num: number): void {
  const url = avatarUrl(num);
  if (url === null) return;
  if (cache.has(url)) return;
  cache.set(url, null); // mark attempted up front (dedupe concurrent renders)
  void PIXI.Assets.load<PIXI.Texture>(url)
    .then((tex) => {
      if (!tex) return;
      cache.set(url, tex);
      for (const cb of listeners) cb();
    })
    .catch(() => {
      /* absent / decode failure → null cached, glyph fallback */
    });
}

// ─── Allocation: distinct random avatars for the AI seats ────────────────────

/**
 * Assign avatars to all 8 seats for one match:
 * - Seat 0 (the human) is always PLAYER_1_AVATAR_NUM.
 * - Seats 1–7 (AI) each get a random, DISTINCT avatar drawn from the registry
 *   excluding the human's selection.
 *
 * Cosmetic only — NOT sim state. The caller (MatchScene) stores the result once
 * at match init so it's stable for the whole match (re-renders never re-roll).
 * `rng` defaults to Math.random; a test (or a future seed-from-driver) can inject
 * a deterministic one. Returns a Map seat → avatarNum.
 */
export function generateAvatarAssignment(
  rng: () => number = Math.random
): Map<number, number> {
  const assignment = new Map<number, number>();
  assignment.set(0, PLAYER_1_AVATAR_NUM);

  // Pool: every registered avatar except the human's, shuffled (Fisher–Yates).
  const pool = AVATARS.filter((a) => a.num !== PLAYER_1_AVATAR_NUM).map((a) => a.num);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }

  // Seats 1–7 take the first 7 distinct entries off the shuffled pool.
  for (let seat = 1; seat < 8; seat++) {
    const num = pool[seat - 1];
    if (num !== undefined) assignment.set(seat, num);
  }
  return assignment;
}
