# Path & purpose

`packages/client/src/sprites.ts` -- the unit-art drop-in slot: a pure path resolver + an async runtime texture cache that lets a designer drop `public/units/<unitId>.png` to replace a unit's procedural glyph with real art, with zero code changes and clean no-op fallback when the file is absent.

# Responsibility

Owns: the unit-art file-naming convention (`unitArtPath`), the pure exists-or-null resolution logic (`resolveUnitTexture`, generic over the texture type so it's unit-testable without Pixi), and the actual runtime texture cache + lazy-load-once-per-id behavior (`requestUnitArt`/`unitTextureLookup`/`onUnitArtReady`) that backs `UnitToken`'s rendering decision (art vs. glyph).

# Exports

- `const UNIT_ART_BASE = "/units"` -- the base URL path (Vite serves `public/` at the site root, so this resolves to `public/units/`).
- `function unitArtPath(unitId: string, base = UNIT_ART_BASE): string` -- builds `"${base}/${unitId}.png"`.
- `function resolveUnitTexture<T>(unitId: string, lookup: (path:string) => T|null, base = UNIT_ART_BASE): T | null` -- the PURE resolver: calls `lookup(unitArtPath(unitId, base))` and returns whatever it returns. Generic over `T` specifically so tests can inject a fake `lookup` function (e.g. a plain object map) instead of needing real `PIXI.Texture` instances -- "this is the exists/fallback branch the tests exercise."
- `function unitTextureLookup(path: string): PIXI.Texture | null` -- the REAL runtime lookup function (the `lookup` callback `resolveUnitTexture` is meant to be called with in production): returns `cache.get(path) ?? null` -- a cache miss and an explicitly-cached-null both resolve to `null`.
- `function onUnitArtReady(cb: () => void): () => void` -- subscribes a callback fired every time ANY unit texture finishes loading (not unitId-specific); returns an unsubscribe function.
- `function requestUnitArt(unitId: string, base = UNIT_ART_BASE): void` -- fire-and-forget: if `path` is already in the cache (success OR a prior failed/absent attempt), does nothing (`cache.has` short-circuits, so this is safe to call on every render with no thundering-herd risk). Otherwise immediately marks the cache as attempted (`cache.set(path, null)`, deduping concurrent calls within the same tick before the async load resolves), then calls `PIXI.Assets.load<PIXI.Texture>(path)`: on success, overwrites the cache entry with the real texture and synchronously notifies every `onUnitArtReady` listener; on failure (404, decode error, anything), the catch silently does nothing -- the cache stays `null` (already set above), so the glyph fallback persists and the failed load is NEVER retried for that id/session.

# Key behavior

The two-tier design separates PURE resolution logic (testable, no Pixi) from the STATEFUL runtime cache (a `Map<string, PIXI.Texture|null>` + a `Set` of listener callbacks, both module-level singletons shared across the whole client session). The render path is: a caller (`UnitToken`) calls `requestUnitArt(unitId)` unconditionally on every render (cheap due to the cache-has short-circuit) to kick off a lazy load if one hasn't started, then separately calls `resolveUnitTexture(unitId, unitTextureLookup)` to get whatever's currently cached (`null` if still loading or confirmed absent) and decides synchronously whether to draw the texture or the glyph for THIS frame. When a deferred load later succeeds, `onUnitArtReady`'s listeners fire, and the consumer (the static planning board, since combat already repaints every tick) re-renders to pick up the now-cached texture.

# Invariants & constraints

- **One fetch attempt per unitId per page session** -- a missing/failed PNG is cached as `null` and never retried; a developer who drops in a PNG file mid-session (e.g. during local dev) would need a page reload for `requestUnitArt` to attempt loading it (the cache doesn't expire or get invalidated).
- The cache and listener set are MODULE-LEVEL (not instance-scoped) -- there is exactly one shared cache for the entire client runtime, regardless of how many `UnitToken`s or scenes exist. This is deliberate (art is global per unitId, not per-token) but means tests must be careful about cross-test cache pollution if they import this module directly (vs. injecting a fake lookup via `resolveUnitTexture`'s generic parameter).
- `cache.set(path, null)` happens SYNCHRONOUSLY before the async `PIXI.Assets.load` call -- this is the dedup mechanism: if `requestUnitArt` is called twice for the same unitId before the first load resolves, the second call's `cache.has(path)` check sees the already-set `null` and returns immediately without issuing a second `PIXI.Assets.load` call.
- `onUnitArtReady`'s notification is GLOBAL (fires for ANY successful unit texture load, not just a specific id) -- a listener must re-render its entire view rather than assuming the notification is about one particular unit; this matches its actual usage (`match.ts`'s `onUnitArtReady` callback re-renders the whole static planning board, not a targeted single-token repaint).
- No-op-clean is an explicit design goal: with zero PNGs present in `public/units/`, every `requestUnitArt` call attempts-then-fails-silently exactly once per id, and every `resolveUnitTexture` call returns `null` forever after -- the glyph fallback is permanent and the system imposes no visible cost beyond one network request per unit id ever rendered.

# Depends on

- `pixi.js` (`PIXI.Assets.load`, `PIXI.Texture`) -- the actual async texture loader; this is the ONLY Pixi-coupled part of the file (the pure resolver/path functions have zero Pixi dependency, by design, so they're testable without it).

# Used by

- `packages/client/src/unitToken.ts` -- per CLAUDE.md's unit-art-slot description, calls `requestUnitArt`/`resolveUnitTexture` (via `unitTextureLookup`) to decide whether to clip-render a drop-in PNG inside the tier ring instead of the procedural class glyph.
- `packages/client/src/scenes/match.ts` -- subscribes via `this.unsubArt = onUnitArtReady(() => { ...repaint the static planning board... })` in the constructor, unsubscribing in `destroy()`.
- `packages/client/public/units/README.md` -- documents the naming/size convention this file implements (`<unitId>.png`).

# Notes

- This file is structurally near-identical to `itemIcon.ts`/`itemIconDraw.ts`'s item-art drop-in slot (`resolveItemTexture`/`requestItemArt`/`onItemArtReady`) and to the audio drop-in music-file pattern described in CLAUDE.md -- all three follow the same "pure resolver + lazy async cache + ready-listener" shape; a reader familiar with one understands the others immediately.
- There is no cache-busting / cache-invalidation API exposed -- if hot-swapping art at runtime (without a page reload) is ever needed (e.g. a future in-game art-pack switcher), this module would need a new `invalidateUnitArt(unitId)` export to delete the cache entry and allow a re-attempt.
