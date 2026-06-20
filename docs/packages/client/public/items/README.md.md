# Path & purpose

`packages/client/public/items/README.md` -- documents the item-art "drop-in slot" convention: how to override an item's procedural icon (emblem) with a real image file.

# Responsibility

Specifies the file-naming contract and fallback behavior for per-item art assets consumed by `packages/client/src/itemIcon.ts`/`itemIconDraw.ts`. Documentation for content authors, not engine code.

# Exports

None -- markdown, not code.

# Key behavior

- States the default: every item renders a distinct procedural icon (no files needed) -- each of the 9 base components has its own emblem archetype, and each completed item composes the two emblems of its recipe (per `itemIcon.ts`'s `COMPONENT_EMBLEM` mapping and `itemIconDraw.ts`'s `drawEmblem`).
- Override convention: drop `<itemId>.png` in this directory, where `<itemId>` is the item's `id` field exactly as it appears in `packages/data/src/items.json` -- e.g. `iron_sword.png` for a base component, or `iron_sword__sorcerer_rod.png` (underscore-joined recipe pair, in the same order/format items.json uses) for a completed item.
- Recommended image spec: square, 128x128 or larger, PNG with transparency; the icon scales it to fit its slot and clips it to a disc, so center the subject and avoid important detail in the corners.
- Vite serves `public/` at the site root, so the icon loader fetches `/items/<id>.png`.
- Absent file (or network-locked load) falls back to the procedural emblem cleanly, no error -- explicitly compared to the same behavior in `public/units/`.
- Points to the exact code that implements this: `src/itemIcon.ts` (`resolveItemTexture` -- the pure path resolution, plus the asset path helper) and `src/itemIconDraw.ts` (the lazy `requestItemArt` loader + cache, and the procedural emblem-drawing fallback).

# Invariants & constraints

- Filename must be the EXACT items.json `id` string, including the `__`-joined recipe format for completed items -- no fuzzy matching.
- A dropped-in file always wins over the procedural emblem; absence must no-op cleanly (same contract as the audio and unit-art slots).

# Depends on

Nothing programmatically -- references `packages/data/src/items.json` (the id namespace), `packages/client/src/itemIcon.ts`, and `packages/client/src/itemIconDraw.ts` (the actual resolution/loading/drawing implementation).

# Used by

Read by content authors adding item art. The runtime behavior described is implemented by `itemIcon.ts`/`itemIconDraw.ts`, and consumed visually everywhere items render: inventory bar chips, loot-orb reveal contents, equipped-item icons on `UnitToken`s, and the inspect/item-detail panels (per `CLAUDE.md`'s client internals section).

# Notes

- Mirrors `packages/client/public/units/README.md`'s pattern almost exactly (same size recommendation, same fallback contract) -- the two systems were clearly built to the same design template.
