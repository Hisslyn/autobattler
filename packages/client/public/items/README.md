# Item art drop-in slot

Items render a distinct procedural icon by default (no files needed): each base
component has its own emblem and each completed item composes the two emblems of
its recipe. For higher fidelity, drop a per-item image here and the icon renders
it instead of the procedural emblem:

- File name: `<itemId>.png` (the item's `id` from `packages/data/src/items.json`,
  e.g. `iron_sword.png`, `iron_sword__sorcerer_rod.png`). Completed items use the
  underscore-joined recipe id exactly as it appears in items.json.
- Recommended size: a square **128×128** (or larger) PNG with transparency. The
  icon scales it to the slot, so center the subject and keep important detail away
  from the corners.

Vite serves `public/` at the site root, so the icon loads `/items/<id>.png`. If a
file is absent (or the network is locked) the icon falls back to the procedural
emblem, no-op clean — exactly like the unit art slot in `public/units/`.
Resolution lives in `src/itemIcon.ts` (`resolveItemTexture` + the asset path) and
`src/itemIconDraw.ts` (the lazy `requestItemArt` loader + the emblem drawing).
