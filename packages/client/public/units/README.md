# Unit art drop-in slot

Unit tokens render a procedural class glyph by default (no files needed). For
higher fidelity, drop a per-unit image here and the token renders it clipped
inside the tier ring instead of the glyph:

- File name: `<unitId>.png` (the unit's `id` from `packages/data/src/units.json`,
  e.g. `warrior.png`, `archmage.png`).
- Recommended size: a square **128×128** (or larger) PNG with transparency. The
  token scales it to the disc and masks it to a circle, so center the subject and
  keep important detail away from the corners.

Vite serves `public/` at the site root, so the token loads `/units/<id>.png`.
If a file is absent (or the network is locked) the token falls back to the glyph,
no-op clean — exactly like the music slot in `public/audio/`. Resolution lives in
`src/sprites.ts` (`resolveUnitTexture` + the lazy `requestUnitArt` loader); to
change the lookup path, pass a different `base` to those helpers.
