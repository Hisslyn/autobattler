# Path & purpose

`packages/client/src/glyphs.ts` -- procedural vector glyph library: maps every origin/class trait id (plus a set of non-trait HUD/item icon kinds) to a hand-drawn shape, painted directly with the Pixi v8 `Graphics` path API, because Tabler's icon webfont cannot render inside a canvas/WebGL context.

# Responsibility

Owns the canonical glyph-kind taxonomy (`GlyphKind`), the trait-id-to-glyph mapping (`TRAIT_GLYPH`, completeness test-enforced), the per-unit glyph resolution rule (`glyphForTraits`), and the actual vector drawing routine for every glyph kind (`drawGlyph`). This is the sole source of "what shape represents trait/icon X" for the entire client render layer.

# Exports

- `type GlyphKind` -- the closed union of every drawable shape: trait shapes (`sword`, `swords`, `dagger`, `axe`, `bow`, `shield`, `crosshair`, `flame`, `bolt`, `droplet`, `snowflake`, `leaf`, `claw`, `star`, `sun`, `moon`, `spark`, `skull`, `eye`, `orb`, `heart`), non-trait HUD icons added in "stage 2" (`coin`, `refresh`, `levelUp`, `helmet`, `clock`, `monster`, `banner` -- explicitly NOT in `TRAIT_GLYPH`), and non-trait item icons added in "phase 10b" (`gem`, `component`, `bag` -- also not in `TRAIT_GLYPH`).
- `const TRAIT_GLYPH: Record<string, GlyphKind>` -- maps every origin (`holy`->sun, `shadow`->moon, `arcane`->spark, `frost`->snowflake, `forest`->leaf, `beast`->claw, `celestial`->star, `dragon`->flame, `storm`->bolt, `undead`->skull, `elemental`->droplet, `abyssal`->eye) and every class (`knight`->shield, `ranger`->bow, `sorcerer`->orb, `assassin`->dagger, `warden`->heart, `berserker`->axe, `mystic`->spark, `gunner`->crosshair, `duelist`->sword, `summoner`->swords) trait id from `traits.json` to its glyph kind. A test enforces this map has an entry for every trait id actually present in `traits.json` -- adding a new trait to data WITHOUT adding it here would fail that test.
- `function glyphForTraits(traits: readonly string[], classes?: readonly string[]): GlyphKind` -- resolves which glyph a unit should render: prefers `classes[0]` (the unit's first class trait) over `traits[0]` (its full flattened trait list, which mixes origin+classes) if `classes` is supplied; falls back to `"orb"` if neither resolves to a known glyph.
- `function drawGlyph(g: Graphics, kind: GlyphKind, cx: number, cy: number, size: number, color: number): void` -- paints `kind` centered at `(cx, cy)`, sized to roughly `size` px across, in `color`, directly onto the passed Pixi `Graphics` object using the v8 path API (`moveTo`/`lineTo`/`arc`/`poly`/`circle`/`rect`/`roundRect`/`bezierCurveTo` + `fill()`/`stroke()`).

# Key behavior

- `drawGlyph` is one large `switch (kind)`, each case building one or more sub-paths then calling either `fillIt()` (solid fill) or `strokeIt()` (stroked outline) or both, per shape: e.g. `sword`/`swords`/`dagger`/`claw`/`snowflake`/`crosshair`/`bow`/`refresh`/`levelUp`/`banner`(pole)/`helmet`(visor lines)/`clock` are stroke-based line shapes; `axe`(head)/`shield`/`flame`/`bolt`/`droplet`/`leaf`/`star`/`spark`/`skull`/`heart`/`gem`/`bag`/`monster`/`banner`(flag)/`sun`(disc)/`moon`(crescent) are fill-based polygon/bezier shapes; some combine both (e.g. `sun` fills a disc then strokes 8 rays; `eye` strokes the almond outline then fills a pupil circle; `coin` fills a disc then conditionally adds a faint inner stroke; `gem`/`component`/`bag` fill/stroke a base shape then add a thin secondary detail stroke at reduced alpha).
- **Stroke weight is shared/centralized**: `lw = glyphStrokeWeight(size)` (imported from `theme.ts`) determines the line width for every stroke call in this file -- "heavier at small sizes so glyphs stay legible on bench/shop tokens at 2x DPR." Several shapes deliberately use a FRACTION of `lw` for secondary/detail strokes (`lw*0.8` for the coin's inner halo, `lw*0.7` for gem/component detail lines) to visually de-emphasize them relative to the primary outline.
- `coin`'s inner depth-stroke is explicitly gated `if (size > 10)` -- "The depth self-stroke reads as a muddy halo at small sizes; gate it" -- below that threshold the coin renders as a flat filled disc only.
- All shapes are computed from `s = size / 2` (half-extent) and parametrized entirely in terms of `s`-relative offsets from `(cx, cy)` -- no shape uses absolute pixel constants, so every glyph scales cleanly to any `size`.
- The default case (`orb` and any unrecognized kind) draws a filled inner disc (`s*0.55`) plus a stroked outer ring (`s`) -- this is both the literal `orb` glyph (used for `sorcerer`/`mystic` classes) AND the universal fallback shape for any `GlyphKind` value the switch doesn't otherwise handle (defensive default, though TypeScript's exhaustiveness over the union should make an unhandled real `GlyphKind` impossible at compile time -- this fallback is reachable only via a value that bypasses type checking, e.g. data corruption or a future enum addition not yet wired into the switch).

# Invariants & constraints

- **`TRAIT_GLYPH` completeness is test-enforced** -- every origin + class trait id in `traits.json` MUST have an entry; adding a new trait to data without a corresponding glyph mapping breaks a test (per the file's own header comment and `CLAUDE.md`'s "Class glyphs" section).
- This file exists specifically BECAUSE Tabler's webfont icons (rendered via `<i>` tags in DOM) cannot render inside Pixi's canvas/WebGL surface -- any future attempt to "simplify" by reusing webfont icon glyphs directly inside the Pixi layer would not work; vector path drawing is the only option for in-canvas icons.
- `glyphForTraits` always returns SOME valid `GlyphKind` (never undefined/null) -- the `|| "orb"` fallback guarantees a renderable result even for an empty/unknown trait list.
- Stroke weight must be obtained via the shared `glyphStrokeWeight(size)` helper, not computed ad hoc per call site -- this keeps glyph line weight visually consistent with `itemIconDraw.ts`'s emblem strokes (per `CLAUDE.md`: "`glyphs.ts`/`itemIconDraw.ts` share one step-based stroke-weight formula").
- The non-trait icon kinds (`coin`, `refresh`, `levelUp`, `helmet`, `clock`, `monster`, `banner`, `gem`, `component`, `bag`) are deliberately EXCLUDED from `TRAIT_GLYPH` and from the completeness test -- they are HUD/item icons drawn via direct `drawGlyph(g, "coin", ...)` calls elsewhere, not resolved through the trait-lookup path.
- `helmet` is explicitly marked in its own inline comment as a "Placeholder for a future per-player character icon on the opponent rail" -- not yet wired up to any real per-player feature as of this writing.

# Depends on

`pixi.js` (type-only: `Graphics`). `./theme.js` (`glyphStrokeWeight` -- the shared stroke-weight formula, single source for stroke widths across glyphs and item icons).

# Used by

`packages/client/src/unitToken.ts` (renders a unit's primary class glyph via `glyphForTraits` + `drawGlyph` when no drop-in unit-art PNG is present, per `CLAUDE.md`'s art drop-in slot behavior). `packages/client/src/scenes/match.ts` and `packages/client/src/inspectPanel.ts` likely draw HUD icons (coin/refresh/levelUp/clock/etc) directly via `drawGlyph` for buttons/chips/labels (gold display, reroll button, buy-xp button, planning timer, PvE stage labels, etc). Any trait-strip/trait-chip rendering (`renderTraitStrip`, `drawTraitChip`) resolves a trait's glyph via `TRAIT_GLYPH`/`drawGlyph` for the chip's icon.

# Notes

- The `monster` glyph's inline comment describes it as a "Bat silhouette" -- used presumably for PvE/mob-related UI (stage chip, PvE label icon), distinct from the unit-token mob tint (`mobTint`) which is a color treatment, not an icon.
- Several shapes (`axe`, `shield`, `flame`, `bolt`) use `g.poly([...])` with an inline flat array of alternating x/y coordinates rather than an array of point objects -- this is the Pixi v8 path API convention used consistently throughout the file.
- The file is one of the "fully v8 path API" files called out in `CLAUDE.md`'s standardization note ("the deprecated v7 immediate-mode style... has been fully removed... `unitToken.ts`/`glyphs.ts`/`itemIconDraw.ts`/`combat/view.ts` were already v8") -- this file was never part of the v7-to-v8 migration debt; it was written v8-native from the start.
