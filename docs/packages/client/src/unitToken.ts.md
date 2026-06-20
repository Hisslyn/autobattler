# Path & purpose

`packages/client/src/unitToken.ts` -- the single reusable Pixi component for drawing one unit (or PvE mob) token anywhere it appears: the board, the bench, in combat playback, the shop preview, and inspect panels. Pure Pixi drawing -- no game logic; all values (defId, tier, star, HP/mana fractions, equipped items) are passed in already-resolved by the caller from a snapshot/frame.

# Responsibility

Owns: the entire visual composition of a unit token -- disc background, tier-color ring (or neutral mob tint), class glyph or drop-in art (clipped to the disc), star pips, optional HP/mana bars, optional equipped-item icon dots, and the optional "checkers piece" 3D-volume rendering mode used on the tilted board/bench/combat surfaces (vs. the flat variant used on shop cards / inspect panels / drag ghosts).

# Exports

- `interface UnitTokenOpts { radius?, dimmed?, piece?, bars?, items?, reducedMotion? }`:
  - `radius?: number` -- disc radius, default `16` (board/combat); bench typically passes `~12`.
  - `dimmed?: boolean` -- renders at reduced alpha throughout (used for e.g. dead/inactive states).
  - `piece?: {foreshorten?, thickness?}` -- when present, renders the "checkers piece" 3D volume mode (foreshortened top face + extruded side wall + contact shadow) instead of a flat disc; omit entirely for flat surfaces. `foreshorten` defaults to the module constant `PIECE_FORESHORTEN=0.62`, `thickness` defaults to `max(3, radius*0.32)`.
  - `bars?: {hpFrac, manaFrac, hpChipFrac?}` -- HP/mana fill fractions (0..1, each independently clamped); `hpChipFrac` (must be `>= hpFrac`) draws a trailing white "damage chip" band from the live HP fill up to this lagging value, animated smoothly down by the combat view over time to visualize recent damage.
  - `items?: {id?, component}[]` -- equipped items to render as tiny icons along the disc's bottom-right arc; an entry with no `id` (e.g. a generic mob preview) falls back to a plain tinted pip colored by `component` (component vs completed-item tint).
  - `reducedMotion?: boolean` -- passed through to the tiny equipped-item icons' `drawItemIcon` call to skip the completed-item shine sweep animation (item dots are tiny enough that they're hardcoded to NEVER animate the shine regardless, defaulting to `true` even if unset -- see Key behavior).
- `function drawUnitToken(parent: PIXI.Container, defId: string, tier: number, star: number, x: number, y: number, opts?: UnitTokenOpts): void` -- the sole drawing entry point. Draws everything DIRECTLY into `parent` at the given center (no wrapping container returned -- callers add `parent` itself to their own layer).

# Key behavior

**Mob detection**: `gameData.units.find(u => u.id === defId)` -- if NOT found, the token is a PvE mob (mobs are never present in `data.units` per the engine invariant), and the ring color falls back to the neutral `C.mobTint` instead of a player tier color. This is the SAME defId-absent-from-units heuristic used elsewhere in the client (e.g. `sellValue.ts`'s graceful `0` fallback) to distinguish mobs from real units without a dedicated "isMob" flag being threaded through every call site.

**Checkers-piece volume mode**: when `opts.piece` is set, the disc becomes a foreshortened ELLIPSE (`ry = radius * foreshorten`) lifted by `thickness` pixels above the actual contact point `(x,y)` (`fcy = y - thickness`), with a darker extruded "side wall" (a vertical capsule: top ellipse + connecting rect + bottom ellipse in `C.tokenSide`) drawn BEHIND the top face, and a soft two-layer contact shadow (two overlapping ellipses in `C.tokenShadow` at different alphas/sizes) drawn beneath everything. The art/glyph and the tier ring are drawn as foreshortened ellipses too (matching the face), so the WHOLE token tilts consistently onto the board's perspective plane. Star pips and HP/mana bars stay upright and screen-aligned regardless (drawn relative to `fcy`/`y` but never foreshortened themselves) so they remain legible. When `opts.piece` is omitted, `fs=1`/`th=0`/`ry=radius`/`fcy=y` collapse every piece-specific branch to the byte-identical flat-token behavior -- the function has exactly ONE code path with conditionals, not two parallel implementations, which is the comment's explicit guarantee ("Omit on flat surfaces... for a byte-identical flat token").

**Art vs glyph resolution**: calls `resolveUnitTexture(defId, unitTextureLookup)` (from `sprites.ts`) -- if a texture is cached, renders a `PIXI.Sprite` sized to `(radius*2, ry*2)` and masked to an ellipse/circle matching the disc (so a rectangular PNG is clipped to the round token shape); if NOT cached, calls `requestUnitArt(defId)` (fires the lazy async load attempt, no-op if already attempted) and falls back to drawing the procedural class glyph via `drawGlyph(glyph, glyphForTraits(def?.traits, def?.classes), ...)`, scaled vertically by `fs` to match the piece's foreshortening when applicable.

**Star pips**: drawn as small gold diamonds (`PIXI.Graphics.poly` four-point diamonds) centered ABOVE the top face (`py = fcy - ry - pipR - 2`), horizontally centered as a group and evenly spaced (`gap = pipR*2.1`), count = `star` (0 stars draws nothing).

**HP/mana bars**: two thin rects below the disc (`hpY = y + radius + 2`, `manaY = hpY + 4`) -- a background track + a colored fill rect sized to the fraction, HP additionally drawing a `C.fxDamageChip` (bright white) trailing band between the current `hpFrac` and the lagging `hpChipFrac` BEFORE drawing the actual HP fill bar on top (so the chip peeks out only in the region the HP fill hasn't caught down to yet), and HP fill color switches to `C.hpLow` below 25% (`hpFrac < 0.25`) vs `C.hpGreen` otherwise.

**Equipped-item dots**: up to 3 items rendered as tiny icons (capped via `Math.min(opts.items.length, 3)` -- a 4th+ item is silently NOT shown) along the bottom-right arc of the disc, each backed by a small `C.tokenBg` disc for legibility against the art/glyph beneath, then either a real `drawItemIcon` call (if `it.id` is present) or a plain tinted+outlined pip fallback (component vs completed tint) if not. The `reducedMotion` passed to `drawItemIcon` for these tiny dots defaults to `true` (`opts.reducedMotion ?? true`) REGARDLESS of the actual app-wide reduced-motion setting -- the inline comment explains why: "tiny: never animate the shine" (the shine sweep animation isn't worth the cost/distraction at this tiny size, so it's unconditionally suppressed unless a caller explicitly passes `reducedMotion: false`, which no current call site appears to do).

# Invariants & constraints

- **Single code path, not two parallel implementations** -- the flat-token and checkers-piece modes share every line of drawing logic; the piece-specific math (`fs`, `th`, `ry`, `fcy`) is computed once at the top and naturally collapses to flat-token values when `opts.piece` is omitted. A maintainer adding a new visual element to this token MUST thread it through both modes correctly by using `fcy`/`ry` (not raw `x`/`y`/`r`) wherever the element should tilt with the piece, or `x`/`y`/`r` directly wherever it should stay screen-aligned (stars, bars) -- mixing these up would break one mode while looking fine in the other.
- The item-icon dots' max-3 cap is a SILENT truncation -- a unit with 3 items already at the cap (per `MAX_ITEMS_PER_UNIT` in rules) will always show exactly all 3 since the game-rule cap matches this rendering cap; if `MAX_ITEMS_PER_UNIT` were ever raised above 3 in rules, this file would need updating too or extra items would render with no visual indication they exist.
- `requestUnitArt(defId)` is called UNCONDITIONALLY on every glyph-fallback render (i.e. every frame a token without cached art is drawn) -- this is safe/cheap due to `sprites.ts`'s own cache-has short-circuit (one fetch attempt ever per id), but it does mean this function has a side effect (kicking off an async load) beyond pure drawing, worth knowing if a reader assumed this file was side-effect-free.
- `gameData` is imported directly (the global data singleton from `@autobattler/data`), NOT passed as a parameter -- this couples `unitToken.ts` to the single global game-data instance rather than being parameterized like most other pure/display model files in this client (`inspectModel.ts`, `itemModel.ts`, etc. take `data: GameData` explicitly). This is a minor inconsistency in the codebase's usual dependency-injection style for data, though practically harmless since there's only ever one `gameData` instance loaded.
- `RING_W = 2.5` and the piece constants (`PIECE_FORESHORTEN = 0.62`, `PIECE_THICKNESS_FRAC = 0.32`) are MODULE-LEVEL constants, not parameters -- the comment notes `PIECE_FORESHORTEN` is "Tuned to sit close to BOARD_TILT's foreshorten" (from `theme.ts`) -- if `BOARD_TILT` is ever retuned significantly, this constant should be re-checked for visual consistency (the token's foreshortening should still look like it's lying flush on the board's tilted plane), though there's no automated link enforcing they stay in sync.

# Depends on

- `pixi.js` -- `PIXI.Graphics`, `PIXI.Sprite`, `PIXI.Container`; uses the v8 path API (`circle`/`ellipse`/`rect`/`poly` + `fill`/`stroke`), not the deprecated v7 immediate-mode style.
- `@autobattler/data` (`gameData`) -- the global unit catalog, used for the mob-detection lookup and to read `traits`/`classes` for glyph selection.
- `./theme.js` (`C`, `tierColor`) -- every color used.
- `./glyphs.js` (`drawGlyph`, `glyphForTraits`) -- the procedural class-glyph fallback.
- `./sprites.js` (`resolveUnitTexture`, `unitTextureLookup`, `requestUnitArt`) -- the unit-art drop-in slot.
- `./itemIconDraw.js` (`drawItemIcon`) -- equipped-item icon rendering.

# Used by

Per CLAUDE.md, drawn on the board, the bench, and in combat (via `combat/view.ts`); also used by shop cards' portrait disc and inspect-panel unit previews (flat mode, no `piece` option) in `scenes/match.ts`/`inspectPanel.ts`.

# Notes

- This file is the canonical example of the codebase's "checkers piece" visual metaphor for board-plane perspective rendering -- a reader investigating why board/bench/combat tokens look subtly 3D (foreshortened ellipse + side wall + shadow) versus flat shop/inspect tokens should start here; the `piece` option presence/absence at each call site is the entire decision point.
- The equipped-item dots' "never animate, even tiny" comment is a notable micro-decision worth knowing if a future task is "make item icons feel more alive" -- this is the ONE place in the item-icon system where animation is unconditionally suppressed regardless of the app-wide reduced-motion setting, by deliberate design rather than oversight.
