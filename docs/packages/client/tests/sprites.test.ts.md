# Path & purpose

`packages/client/tests/sprites.test.ts` — unit tests for the pure pieces of the unit-art drop-in resolver (`packages/client/src/sprites.ts`): `unitArtPath` (id → path) and `resolveUnitTexture` (pure lookup-injected exists/fallback resolver), independent of Pixi/network.

# Responsibility

Verifies the path-construction convention (`/units/<id>.png`, base overridable) and the exists-vs-absent branching of `resolveUnitTexture` without touching the real async `PIXI.Assets`-backed cache (`requestUnitArt`/`unitTextureLookup`/`onUnitArtReady` are untested here — they're runtime plumbing around the pure resolver tested in this file).

# Exports

None — Vitest test file.

# Key behavior

- "builds the public/units drop-in path": `unitArtPath("warrior")` → `"/units/warrior.png"` (default base `UNIT_ART_BASE = "/units"`); `unitArtPath("mage", "/assets/units")` → `"/assets/units/mage.png"` (explicit base override).
- "returns the texture when the lookup has the file (exists branch)": constructs a fake lookup function that returns a sentinel object `TEX` only for the exact path `/units/warrior.png`, then asserts `resolveUnitTexture("warrior", lookup) === TEX` — proves `resolveUnitTexture` builds the path via `unitArtPath` internally and passes it straight to the injected lookup, returning whatever the lookup returns.
- "falls back to null when the file is absent (glyph branch)": `resolveUnitTexture("warrior", () => null)` → `null` (lookup unconditionally misses). Then verifies the `base` override threads through to the lookup KEY correctly: a lookup that only matches `/art/warrior.png` returns `"hit"` when called with `resolveUnitTexture("warrior", lookup, "/art")` but returns `null` when called WITHOUT the base override (since the default-base path `/units/warrior.png` doesn't match the lookup's expected key) — proves the `base` parameter genuinely changes which path is looked up, not just cosmetically.

# Invariants & constraints

- `resolveUnitTexture` is generic over the texture type (`<T>`) specifically so it's testable without Pixi — these tests pass plain objects/strings as fake "textures," never a real `PIXI.Texture`.
- The lookup function injected by the caller is a pure synchronous function (`(path) => T | null`) — at runtime this is `unitTextureLookup` reading the in-memory `cache` Map, but the pure resolver under test has zero knowledge of caching, network, or Pixi.

# Depends on

- `../src/sprites.js` (`unitArtPath`, `resolveUnitTexture`) — the two pure exports under test.
- `vitest` (`describe`, `it`, `expect`).

# Used by

Not imported elsewhere — standalone Vitest test file.

# Notes

- The async runtime half of `sprites.ts` (`requestUnitArt`'s fire-and-forget `PIXI.Assets.load` + cache + listener notification, `onUnitArtReady`, the module-level `cache`/`listeners` state) has NO test coverage in this file — only the pure `unitArtPath`/`resolveUnitTexture` functions are exercised. A bug in the caching/dedup/listener-notify logic would not be caught here.
- Mirrors the same drop-in-art pattern and test shape as the item-art equivalent (`itemIcon.ts`'s `resolveItemTexture`/`itemArtPath`, covered by `itemIcon.test.ts`).
