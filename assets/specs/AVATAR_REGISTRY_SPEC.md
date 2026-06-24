# Avatar Registry Implementation Spec

## Overview
Register 20 cosmetic avatar PNGs (packed with rarity-ring artwork) into a typed, seeded-deterministic allocation system. Player 1 (human) gets a designated default; AI players 2–8 each draw a random distinct avatar at match start and keep it for the entire match.

**Critical constraint:** Avatars are cosmetic-only; they never touch `packages/sim`, `packages/rules`, or `packages/data`. Client-only, presentation layer.

## Asset Inventory

All 20 files present at `packages/client/src/assets/avatars/`:
- 5 common (01–05): Whiskers, Biscuit, Squeak, Clover, Truffle
- 5 uncommon (06–10): Lily, Wooly, Pim, Pip, Mochi
- 4 rare (11–14): Ember, Bandit, Tux, Hoot
- 3 epic (15–17): Fenrir, Bruin, Bao
- 3 legendary (18–20): Rajah, Leo, Wyrm

Filename format: `<num>_<name>_<rarity>.png` (zero-padded num, lowercase rarity).

## Module: `packages/client/src/avatars.ts`

### Glob & Parse

```typescript
// Use Vite's import.meta.glob (eager mode) to load all PNG filenames at build time.
// Pattern relative to this file: ./assets/avatars/*.png
const globModules = import.meta.glob('./assets/avatars/*.png', { eager: true });

// Parse each filename into an AvatarEntry.
const AVATARS: AvatarEntry[] = Object.keys(globModules)
  .map(path => {
    const match = /(\d{2})_([A-Za-z]+)_(\w+)\.png/.exec(path.split('/').pop());
    if (!match) return null;
    return {
      num: parseInt(match[1], 10),
      name: match[2],
      rarity: match[3],
      url: `${AVATAR_ART_BASE}/${match[0]}`, // or derived from Vite path
    };
  })
  .filter((x): x is AvatarEntry => x !== null)
  .sort((a, b) => a.num - b.num);
```

### Exports

```typescript
// ─── Types ─────────────────────────────────────────────────────────────────────

export type AvatarRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface AvatarEntry {
  num: number;                // 1–20
  name: string;               // Whiskers, Biscuit, etc.
  rarity: AvatarRarity;       // Cosmetic tier
  url: string;                // Path to the PNG (served or bundled)
}

// ─── Registry ─────────────────────────────────────────────────────────────────

/** Editable constant: Player 1 always shows this avatar number (1–20). */
export const PLAYER_1_AVATAR_NUM = 1;

/** All 20 avatars, parsed from glob and sorted by num. */
export const AVATARS: AvatarEntry[] = [ /* ... */ ];

// ─── Pure resolution (mirrors sprites.ts) ─────────────────────────────────────

/** Path builder: avatar/<num>.png (default base = '/avatars'). */
export function avatarPath(num: number, base = AVATAR_ART_BASE): string {
  return `${base}/${num}.png`;
}

/**
 * Pure resolver: looks up the texture the cache holds for this avatar num.
 * Returns T (a texture) or null (→ fallback to glyph). Testable without Pixi.
 */
export function resolveAvatarTexture<T>(
  num: number,
  lookup: (path: string) => T | null,
  base = AVATAR_ART_BASE,
): T | null {
  return lookup(avatarPath(num, base));
}

// ─── Runtime loading (mirrors requestUnitArt) ─────────────────────────────────

const avatarCache = new Map<string, PIXI.Texture | null>();
const avatarListeners = new Set<() => void>();

/** Sync lookup backing resolveAvatarTexture at runtime (cache hit or null). */
export function avatarTextureLookup(path: string): PIXI.Texture | null {
  return avatarCache.get(path) ?? null;
}

/** Subscribe to "an avatar texture finished loading" so the rail redraws. */
export function onAvatarArtReady(cb: () => void): () => void {
  avatarListeners.add(cb);
  return () => avatarListeners.delete(cb);
}

/**
 * Load assets/avatars/<num>.png once. Caches the texture and notifies
 * listeners (so the opponent rail redraws); 404/decode failure caches null.
 */
export function requestAvatarArt(num: number, base = AVATAR_ART_BASE): void {
  const path = avatarPath(num, base);
  if (avatarCache.has(path)) return;
  avatarCache.set(path, null); // mark attempted up front (dedupe)
  void PIXI.Assets.load<PIXI.Texture>(path)
    .then((tex) => {
      if (!tex) return;
      avatarCache.set(path, tex);
      for (const cb of avatarListeners) cb();
    })
    .catch(() => {
      /* absent / decode failure → null cached, glyph fallback */
    });
}

// ─── Allocation: deterministic random assignment for AI players ───────────────

/**
 * Generate a stable seeded assignment of avatars to AI seats (2–8).
 * Returns a Map seatNum → avatarNum, where:
 * - Seat 0 (human) is always PLAYER_1_AVATAR_NUM.
 * - Seats 1–7 (AI) each get a random, distinct avatar from the remaining set.
 * - The assignment is stable for the match (derived from matchSeed only).
 */
export function generateAvatarAssignment(
  matchSeed: number,
  data: GameData,
): Map<number, number> {
  const assignment = new Map<number, number>();
  
  // Seat 0 (human) always uses the designated Player 1 avatar.
  assignment.set(0, PLAYER_1_AVATAR_NUM);
  
  // Pool: all avatars except Player 1's selection.
  const available = AVATARS.filter(a => a.num !== PLAYER_1_AVATAR_NUM).map(a => a.num);
  
  // Seed the PRNG from the match seed.
  const prng = data.createPrng(matchSeed);
  
  // Assign 7 random distinct avatars to seats 1–7 (AI players).
  for (let seat = 1; seat < 8; seat++) {
    const idx = Math.floor(prng.next() * available.length);
    const avatarNum = available[idx];
    assignment.set(seat, avatarNum);
    available.splice(idx, 1); // remove to ensure distinct
  }
  
  return assignment;
}
```

## Integration Points

### 1. Main Menu (`packages/client/src/ui/app.ts`)

**Location:** `.mm-avatar-frame` in the identity cluster (name + level badge + avatar).

**Current code:**
```typescript
el("span", { class: "mm-avatar-frame" }, [
  el("span", { class: "mm-avatar-glyph" }, [icon("person", 20)]),
  el("span", { class: "mm-level-badge", text: "1" }),
]),
```

**Change to:**
```typescript
el("span", { class: "mm-avatar-frame" }, [
  (() => {
    const frame = el("span", { class: "mm-avatar-glyph" });
    // Render Player 1's avatar or fallback glyph.
    requestAvatarArt(PLAYER_1_AVATAR_NUM);
    const tex = resolveAvatarTexture(PLAYER_1_AVATAR_NUM, avatarTextureLookup);
    if (tex) {
      // Draw the avatar texture clipped to the frame circle.
      // (See opponent-rail rendering for the Pixi pattern below.)
    } else {
      frame.appendChild(icon("person", 20)); // fallback
    }
    return frame;
  })(),
  el("span", { class: "mm-level-badge", text: "1" }),
]),
```

**Or** if the avatar is a static image drop-in: replace the glyph span with an `<img>` tag and use the avatarPath builder.

### 2. Opponent Rail (`packages/client/src/scenes/match.ts`)

**Location:** `renderOpponentRail()`, currently draws empty `panelBg` circles at 8px radius.

**Current code (simplified):**
```typescript
const av = 8; // avatar radius
for (let i = 0; i < 8; i++) {
  const p = state.players[i];
  const tile = opponentRailTile(i, cols, rows, rail);
  const { tileX, tileY, tileW, tileH, cx } = tile;
  const cy = tileY + av + 1;
  const isSelf = i === this.driver.seatIndex;
  const elim = !p.alive;

  // Draw the avatar disc:
  const avg = new PIXI.Graphics();
  avg.circle(cx, cy, av).fill({ color: C.panelBg, alpha: elim ? 0.4 : 1 });
  avg.circle(cx, cy, av).stroke({
    width: i === currentOpp ? 2.5 : 1,
    color: i === currentOpp ? C.textCombat : isSelf ? C.tier3 : C.chipBorder,
    alpha: elim ? 0.4 : 1,
  });
  this.hudLayer.addChild(avg);
  // ... seat label, level label, HP bar ...
}
```

**Change to:**

1. Store avatar assignments **once at match creation**:
   - In the MatchScene constructor (or on first render of match.ts), call `this.avatarAssignment = generateAvatarAssignment(this.driver.matchSeed, gameData)`.
   - This Map persists for the entire match so AI avatars stay consistent.

2. Replace the avatar-disc rendering:
```typescript
const avatarNum = this.avatarAssignment.get(i) ?? PLAYER_1_AVATAR_NUM;
requestAvatarArt(avatarNum);
const avatarTex = resolveAvatarTexture(avatarNum, avatarTextureLookup);

const avg = new PIXI.Graphics();
if (avatarTex) {
  // Draw the avatar texture clipped to a circle.
  const sprite = new PIXI.Sprite(avatarTex);
  sprite.position.set(cx, cy);
  sprite.scale.set((av * 2) / avatarTex.width); // scale to fit 16px diameter
  sprite.anchor.set(0.5, 0.5);
  
  // Clip to circle.
  const mask = new PIXI.Graphics();
  mask.circle(cx, cy, av).fill({ color: 0xffffff });
  sprite.mask = mask;
  this.hudLayer.addChild(sprite, mask);
} else {
  // Fallback: empty panelBg circle (current behavior).
  avg.circle(cx, cy, av).fill({ color: C.panelBg, alpha: elim ? 0.4 : 1 });
}

// NO SECOND RING: PNGs include rarity artwork. Remove the stroke entirely.
// If a colored outline is still desired for visual clarity (e.g., current opponent),
// it should be drawn underneath the avatar sprite, not on top.

// Seat label and level label as before:
this.text(this.hudLayer, `${i + 1}`, cx, cy - 1, 10, elim ? C.textMuted : C.textPrimary, [0.5, 0.5]);
this.text(this.hudLayer, `L${p.level}`, cx, cy + av + 5, 8, elim ? C.textMuted : C.textMuted, [0.5, 0.5]);
// ...
```

**Avatar assignment caching:**
```typescript
private avatarAssignment: Map<number, number> | null = null;

private getAvatarAssignment(): Map<number, number> {
  if (!this.avatarAssignment) {
    this.avatarAssignment = generateAvatarAssignment(
      this.driver.matchSeed,
      this.gameData,
    );
  }
  return this.avatarAssignment;
}
```

### 3. Profile System (Future)

When a real profile system is added, store the player's selected avatar in the `Profile` interface (packages/server/src/db/repo.ts):
```typescript
export interface Profile {
  accountId: string;
  name: string;
  mmr: number;
  avatarNum?: number; // optional cosmetic choice (1–20)
}
```

Then override PLAYER_1_AVATAR_NUM at match start:
```typescript
const player1Avatar = authState?.profile?.avatarNum ?? PLAYER_1_AVATAR_NUM;
```

(This is optional for the initial impl; hardcoding PLAYER_1_AVATAR_NUM = 1 is fine.)

## Testing Checklist

- [ ] Glob parse: all 20 avatars resolve to AvatarEntry with correct num/name/rarity.
- [ ] Pure resolver: `resolveAvatarTexture(15, mockLookup)` returns null if lookup(avatarPath(15)) → null.
- [ ] Async loader: `requestAvatarArt(1)` loads the PNG, cache hits on the second call.
- [ ] Main menu: Player 1 avatar displays (or falls back to glyph if asset not loaded).
- [ ] Match start: `generateAvatarAssignment(seed, data)` produces a deterministic map with seat 0 = PLAYER_1_AVATAR_NUM and 7 distinct others.
- [ ] Opponent rail: AI players show their assigned avatars; avatars persist across all rounds of one match.
- [ ] Fallback: if a PNG is missing, the glyph (or panelBg circle) appears instead, match is not broken.
- [ ] No double-ring: the PNG rarity ring is visible; no secondary ring is drawn on top.

## Code Ownership & Constraints

- **avatars.ts:** pure module, no game logic, no I/O except at runtime via PIXI.Assets (same as sprites.ts).
- **UI integration (app.ts, match.ts):** call only the public exports from avatars.ts (types, constants, functions). No parsing or allocation logic in the UI layer.
- **MatchScene (match.ts):** store the avatar assignment once at match init; use it consistently for every render. Never re-roll or re-derive avatars mid-match.
- **No profile persistence yet:** if a player selects a different avatar in a future UI, hardcode it or store it in localStorage for the session. The server-side Profile schema is not touched in this phase.

## Asset Path Resolution

**Glob import path:** `./assets/avatars/*.png` (from `packages/client/src/avatars.ts`)

**Runtime path:** `/avatars/<num>.png` (set `AVATAR_ART_BASE = '/avatars'`; adjust if needed based on your Vite asset config and where the bundled PNGs are served).

**Verification:** Check Vite build output to confirm where the PNG files end up after bundling. If they're placed at `dist/assets/avatars/` and served at `/{root}/assets/avatars/`, use `/assets/avatars/<num>.png` instead.

## Summary

- **Registry module:** `avatars.ts` with glob, parse, pure resolver, async loader, and deterministic allocation.
- **Player 1:** hardcoded default (PLAYER_1_AVATAR_NUM = 1), editable constant.
- **AI players:** seeded random distinct avatars, stable per match.
- **Rendering:** minimal frame (no double-ring), fallback to glyph if not loaded.
- **Tests:** pure resolver testable; allocation stable across seeds; UI gracefully handles missing assets.
