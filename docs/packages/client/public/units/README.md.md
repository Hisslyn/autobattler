# Path & purpose

`packages/client/public/units/README.md` -- documents the unit-art "drop-in slot" convention: how to override a unit token's procedural class glyph with a real per-unit image.

# Responsibility

Specifies the file-naming contract and fallback behavior for per-unit art assets consumed by `packages/client/src/sprites.ts`. Documentation for content authors, not engine code.

# Exports

None -- markdown, not code.

# Key behavior

- States the default: unit tokens render a procedural class glyph by default (no files needed) -- see `packages/client/src/glyphs.ts`'s `TRAIT_GLYPH` map and `glyphForTraits`.
- Override convention: drop `<unitId>.png` in this directory, where `<unitId>` is the unit's `id` field exactly as it appears in `packages/data/src/units.json` -- e.g. `warrior.png`, `archmage.png`.
- Recommended image spec: square, 128x128 or larger, PNG with transparency; the token scales the image to the disc and masks it to a circle, so center the subject and keep important detail away from the corners.
- Vite serves `public/` at the site root, so the token loader fetches `/units/<id>.png`.
- Absent file (or network-locked load) falls back to the glyph cleanly, no error -- explicitly compared to the same behavior in the audio music slot (`public/audio/`).
- Points to the exact code: `src/sprites.ts` (`resolveUnitTexture` -- pure path resolution -- plus the lazy `requestUnitArt` loader/cache); notes the lookup base path can be changed by passing a different `base` argument to those helpers.

# Invariants & constraints

- Filename must be the EXACT units.json `id` string -- no fuzzy matching, no aliasing.
- A dropped-in file always wins over the procedural glyph; absence must no-op cleanly (same contract as the audio and item-art slots).

# Depends on

Nothing programmatically -- references `packages/data/src/units.json` (the id namespace) and `packages/client/src/sprites.ts` (the actual resolution/loading implementation).

# Used by

Read by content authors adding unit art. The runtime behavior described is implemented by `sprites.ts` and consumed by `packages/client/src/unitToken.ts` (the shared token component drawn on the board, bench, and in combat) -- `onUnitArtReady` lets the static planning board repaint once art finishes loading.

# Notes

- Mirrors `packages/client/public/items/README.md`'s pattern almost exactly (same size recommendation, same fallback contract, same "no files needed by default" framing) -- the unit-art slot was the original template; the item-art slot's README explicitly says it "mirrors the unit art slot."
