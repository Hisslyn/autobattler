# Unit-Info Panel — Reconstruction Bible

> A vertical inspect card rendered in a Pixi `inspectLayer` modal.  
> Design resolution: 220 × 520 px (portrait, ~56% of 390px screen width).  
> Tapers to a pointed bottom via an octagonal clipped path.  
> All measurements are relative to the panel bounding box (W = panel width, H = panel height).

---

## 1. Outer Frame

**Tag:** `[REPLICATE structure]`

| Property | Spec |
|---|---|
| Anchor | Full panel bounds |
| Shape | Octagonal path: standard rect with top-left and top-right corners cut at 45° (~12px inset each), and the bottom edge replaced by two angled lines meeting at a centered downward point (bottom-center vertex, extends ~24px below the notional rect bottom). |
| Fill | `surfaceBase` (C.surfaceBase) — deep background behind all content |
| Border stroke | 1.5px, `borderSubtle` (C.borderSubtle) outer edge; inner offset hairline at 0.5px `accentGold` (C.accentGold) to suggest the gold filigree ridge without reproducing original ornate chrome |
| Corner treatment | Top-left / top-right: 45° bevel cuts (not rounded) |
| Bottom point | Centered, protrudes ~24px below the rect's floor; the two sides meet at ~30° total angle |

---

## 2. Header Band

**Occupies:** top 0–28% of panel height (approx. top 145px of 520px).  
Split into LEFT zone (60% of W) and RIGHT zone (40% of W).

### 2a. Star / Level Indicator (Header — top-left)

**Tag:** `[REPLICATE structure]`

| Property | Spec |
|---|---|
| Anchor | Header band, top-left; 8px from left edge, 6px from top |
| Shape | Single star glyph (`GlyphKind: "star"`) drawn at 14px size |
| Color | `starGold` (C.starGold) fill; stroke `glyphStrokeWeight(14)` |
| Note | One star = 1-star unit. Repeat glyph horizontally (gap 3px) for 2-star/3-star. |

### 2b. XP / Level Progress Bar (Header — below star, top-left)

**Tag:** `[REPLICATE structure]`

| Property | Spec |
|---|---|
| Anchor | Header band, top-left; 8px from left, 22px from top |
| Size | ~44% of W wide × 4px tall |
| Shape | Rounded-rect bar (radius 2px) |
| Track fill | `manaBg` (C.manaBg) — reuse as a generic progress track |
| Fill | `xpPurple` (C.xpPurple) — progress portion left-to-right |
| Sample value | No fill (level 1 unit, 0 xp) — track fully visible |
| Note | This bar tracks the UNIT's level/upgrade progress (not player XP). If unused at this scope, omit and leave the region blank. |

### 2c. Character Splash Art Region (Header — top-right)

**Tag:** `[COPYRIGHTED -> placeholder]`

| Property | Spec |
|---|---|
| Anchor | Header band, right 40% of W, full header height |
| Shape | Rect, clipped to the header band bounds |
| Placeholder fill | `bgInspect` (C.bgInspect) — plain dark surface |
| Placeholder border | 1px `borderSubtle` (C.borderSubtle) |
| Note | Drop real unit art here when available. Centered `"orb"` glyph at 24px in `textMuted` (C.textMuted) as a stand-in. |

---

## 3. Trait Rows

**Occupies:** 28–42% of panel height (~145–220px from top).  
Two rows, each 36px tall, stacked with 0px gap. Full panel width minus 8px horizontal padding each side.

### Row A (first trait) and Row B (second trait) — identical structure

**Tag:** `[REPLICATE structure]` (layout/structure); trait name text and icon art `[COPYRIGHTED -> placeholder]`

| Property | Spec |
|---|---|
| Row fill | `bgInspectRow` (C.bgInspectRow) |
| Row border | 1px bottom `borderSubtle` (C.borderSubtle) |
| Icon region | Left 28px × 28px; 4px margin from left; vertically centered in row |
| Icon placeholder | Draw the trait's `GlyphKind` from `TRAIT_GLYPH` at 14px. Color = `traitColor(traitId)` via `TRAIT_COLOR` map. Example placeholder: Row A → `"sun"` glyph in `holy` hue `0xf0d878`; Row B → `"shield"` in `knight` hue `0x6a90c0`. |
| Trait name text | Left of icon's right edge + 6px gap; vertically centered. Font 12px `system-ui, sans-serif`, weight 500. Color `textPrimary` (C.textPrimary). Placeholder text: Row A = "Holy Origin", Row B = "Knight Class" |

---

## 4. Unit Name Bar

**Occupies:** 42–49% of panel height (~220–255px). Full width minus 8px padding each side. Height 36px.

**Tag:** `[REPLICATE structure]`; unit name text `[COPYRIGHTED -> placeholder]`

| Property | Spec |
|---|---|
| Background | `surfaceRaise` (C.surfaceRaise) |
| Border | 1px bottom `borderActive` (C.borderActive) |
| Unit name (LEFT) | 8px from left edge, vertically centered. Font 14px `system-ui, sans-serif`, weight 700, color `textPrimary` (C.textPrimary). Placeholder: "Unit Name" |
| Cost indicator (RIGHT) | Right-aligned, 8px from right edge. Coin glyph (`GlyphKind: "coin"`) at 10px, color `accentGold` (C.accentGold). Gap 3px. Number "1" in 13px font weight 600, color `textGold` (C.textGold). |

---

## 5. HP Bar

**Occupies:** 49–55% of panel height (~255–285px). Full width minus 8px padding. Height 22px.

**Tag:** `[REPLICATE structure]`

| Property | Spec |
|---|---|
| Background (track) | `hpBg` (C.hpBg) — visible bar track |
| Fill | `hpGreen` (C.hpGreen) — 100% fill (450/450) |
| Low-HP fill threshold | Switch fill to `hpLow` (C.hpLow) when current < 30% max |
| Shape | Rounded-rect, radius 3px |
| Segment dividers | Dark tick `hpSegment` (C.hpSegment) every 300 HP (1px wide, full bar height) |
| Text overlay | Centered, vertically centered. "450 / 450". Font 11px weight 600. Color `textPrimary` (C.textPrimary). |
| Margin | 8px left/right padding from panel edge |

---

## 6. Mana Bar

**Occupies:** 55–60% of panel height (~285–312px). Full width minus 8px padding. Height 20px.

**Tag:** `[REPLICATE structure]`

| Property | Spec |
|---|---|
| Background (track) | `manaBg` (C.manaBg) |
| Fill | `manaBlue` (C.manaBlue) — 0% fill (0/50 mana) → track fully visible |
| Shape | Rounded-rect, radius 3px |
| Text overlay | Centered, vertically centered. "0 / 50". Font 11px weight 500. Color `textPrimary` (C.textPrimary). |
| Margin | 8px left/right padding from panel edge |

---

## 7. Three Info Tiles

**Occupies:** 60–73% of panel height (~312–380px). Three equal-width tiles side by side, each (W − 20px) / 3 wide, with 4px gaps and 8px outer padding. Height 52px. Tile fill `bgInspectRow` (C.bgInspectRow), border 1px `chipBorder` (C.chipBorder), radius 4px.

### Tile A: Ability Icon

**Tag:** `[REPLICATE structure]` (tile frame); icon art `[COPYRIGHTED -> placeholder]`

| Property | Spec |
|---|---|
| Fill | `bgInspectRow` (C.bgInspectRow) |
| Border | 1px `itemBorder` (C.itemBorder) |
| Content | Centered placeholder glyph `"orb"` (GlyphKind) at 20px, color `xpPurple` (C.xpPurple) |

### Tile B: Trait-Count / Hex Cluster

**Tag:** `[REPLICATE structure]`

| Property | Spec |
|---|---|
| Fill | `bgInspectRow` (C.bgInspectRow) |
| Border | 1px `chipBorder` (C.chipBorder) |
| Content | Three small hexagon outlines arranged in a tight 2-over-1 cluster (each hex ~10px diameter, stroke 1.5px `traitActive` (C.traitActive)); represents trait-count dots / breakpoint pips |

### Tile C: Range Indicator

**Tag:** `[REPLICATE structure]`

| Property | Spec |
|---|---|
| Fill | `bgInspectRow` (C.bgInspectRow) |
| Border | 1px `chipBorder` (C.chipBorder) |
| Content | Number "4" left-aligned at 12px weight 700 `textPrimary` (C.textPrimary), then a directional arrow glyph (`GlyphKind: "bow"`) at 14px `textMuted` (C.textMuted), centered vertically. Whole group centered horizontally in tile. |

---

## 8. Ability Bar

**Occupies:** 73–83% of panel height (~380–432px). Full width minus 8px padding. Height 44px.

**Tag:** `[REPLICATE structure]`; ability glyph `[COPYRIGHTED -> placeholder]`

| Property | Spec |
|---|---|
| Fill | `bgInspectRow` (C.bgInspectRow) |
| Border | 1px `itemBorder` (C.itemBorder) |
| Shape | Rounded-rect, radius 4px |
| Content | Single centered glyph `"bolt"` (GlyphKind) at 22px, color `fxAbilityMagic` (C.fxAbilityMagic). This stands in for the ability icon art. |
| Note | Width spans ~55% of the panel (the reference shows it left-of-center spanning ~55%). The right ~40% of this horizontal band is left blank / dark (`surfaceBase`) — this band is the wide ability-name slot, but in the reference the name is omitted from this tile; keep the tile proportions as described. |

---

## 9. Item Slots

**Occupies:** 83–90% of panel height (~432–468px). Three equal squares side by side, each ~52px × 52px, 4px gaps, 8px outer padding.

**Tag:** `[REPLICATE structure]`

| Property | Spec |
|---|---|
| Slot fill (empty) | `itemComponent` (C.itemComponent) |
| Slot border | 1px `itemBorder` (C.itemBorder), radius 4px |
| Content (empty) | No content. Three slots all empty (no item equipped). |
| Note | When an item is present: fill switches to `itemCompleted` (C.itemCompleted) for completed items, `itemComponent` for components; item icon drawn via `itemIconDraw.ts` at 32px centered. |

---

## 10. Stat Grid

**Occupies:** 90–98% of panel height (~468–510px). Two rows × five cells. 8px outer padding, cells equally distributed. Cell height 34px.

**Tag:** `[REPLICATE structure]`; stat icons `[COPYRIGHTED -> placeholder]` → use theme glyphs

Each cell = icon glyph (12px, `textMuted` C.textMuted) stacked above a value string (11px, `textPrimary` C.textPrimary). No cell borders; row dividers via 1px line `borderSubtle` (C.borderSubtle) between row 1 and row 2.

### Row 1 — Five stats (left to right)

| Position | Stat Concept | GlyphKind placeholder | Sample Value | Value color |
|---|---|---|---|---|
| Col 1 | Attack Damage (AD) | `"sword"` | 15 | `textPrimary` |
| Col 2 | Ability Power (AP) | `"orb"` | 0% | `textPrimary` |
| Col 3 | Critical Chance | `"spark"` | 0% | `textPrimary` |
| Col 4 | Armor | `"shield"` | 15 | `textPrimary` |
| Col 5 | Magic Resist | `"orb"` (distinct tint) | 15 | `textPrimary` |

> Note: Col 3 uses `"spark"` (C.xpPurple tint) to distinguish from AD's `"sword"`. Col 5 uses `"orb"` in `manaBlue` tint to distinguish from armor's `"shield"` in `tier3`.

### Row 2 — Five stats (left to right)

| Position | Stat Concept | GlyphKind placeholder | Sample Value | Value color |
|---|---|---|---|---|
| Col 1 | Attack Speed | `"bolt"` | 0.70 | `textPrimary` |
| Col 2 | Lifesteal | `"heart"` | 25% | `textPrimary` |
| Col 3 | Dodge / Crit Damage | `"dagger"` | 0% | `textPrimary` |
| Col 4 | Range | `"bow"` | 0% | `textPrimary` |
| Col 5 | Mana (max) | `"droplet"` | 0% | `textPrimary` |

> Glyph tints in the row are all `textMuted` (C.textMuted) unless the stat is active/non-zero, in which case nudge to `textLabel` (C.textLabel).

---

## 11. Sell Button

**Occupies:** Bottom ~2% of panel height before the point (~510–528px). Full width minus 8px padding. Height ~32px.

**Tag:** `[REPLICATE structure]`

| Property | Spec |
|---|---|
| Fill (default) | `bgSellChip` (C.bgSellChip) |
| Fill (armed / hover) | `bgSellArmed` (C.bgSellArmed) |
| Border | 1.5px `accentGold` (C.accentGold), radius 4px |
| Label text | "Sell for" in 12px weight 500 `textSell` (C.textSell), then coin glyph `"coin"` at 10px `accentGold` (C.accentGold), then " 1" in 12px weight 700 `textGold` (C.textGold). All inline, centered horizontally. |
| Note | The button sits within the tapered bottom region; clip to the octagonal frame path so it never overflows the pointed tip. |

---

## Layout Summary (top-to-bottom stack)

```
┌─────────────────────────────────────────┐  ← top bevel cuts
│  ★ ─────────xp bar──────  [ SPLASH ]   │  0–28% (header band)
│  [trait icon]  Trait Name A             │  28–35%
│  [trait icon]  Trait Name B             │  35–42%
│  Unit Name                  🪙 1        │  42–49%
│  ████████████ 450 / 450 ████████████   │  49–55% (hp bar)
│  ░░░░░░░░░░░░  0 / 50  ░░░░░░░░░░░░░  │  55–60% (mana bar)
│  [ability tile] [hex tile] [range tile] │  60–73% (info tiles)
│  [══════════ ability bar ══════════]    │  73–83%
│  [ item ]     [ item ]     [ item ]     │  83–90%
│  ⚔15  ✦0%  ✧0%  🛡15  ◉15            │  90–94% (stat row 1)
│  ⚡0.70  ♥25%  †0%  ↗0%  💧0%         │  94–98% (stat row 2)
│         [ Sell for 🪙 1 ]              │  98–100%+point
└────────────────────▼───────────────────┘  ← bottom point
```

---

## Color Token Quick-Reference

| Element | Token Name | C key |
|---|---|---|
| Panel outer surface | `surfaceBase` | C.surfaceBase |
| Panel inner elevated rows | `bgInspectRow` | C.bgInspectRow |
| Panel modal surface | `bgInspect` | C.bgInspect |
| Frame outer border | `borderSubtle` | C.borderSubtle |
| Frame gold hairline | `accentGold` | C.accentGold |
| Header splash placeholder | `bgInspect` | C.bgInspect |
| Trait row fill | `bgInspectRow` | C.bgInspectRow |
| Trait row divider | `borderSubtle` | C.borderSubtle |
| Trait icon color | `traitColor(id)` | TRAIT_COLOR[id] |
| Name bar fill | `surfaceRaise` | C.surfaceRaise |
| Name bar bottom border | `borderActive` | C.borderActive |
| Unit name text | `textPrimary` | C.textPrimary |
| Cost coin glyph | `accentGold` | C.accentGold |
| Cost number | `textGold` | C.textGold |
| HP bar track | `hpBg` | C.hpBg |
| HP bar fill (normal) | `hpGreen` | C.hpGreen |
| HP bar fill (low) | `hpLow` | C.hpLow |
| HP segment dividers | `hpSegment` | C.hpSegment |
| HP text | `textPrimary` | C.textPrimary |
| Mana bar track | `manaBg` | C.manaBg |
| Mana bar fill | `manaBlue` | C.manaBlue |
| Mana text | `textPrimary` | C.textPrimary |
| Info tile fill | `bgInspectRow` | C.bgInspectRow |
| Info tile border | `chipBorder` | C.chipBorder |
| Ability tile border | `itemBorder` | C.itemBorder |
| Ability glyph placeholder | `fxAbilityMagic` | C.fxAbilityMagic |
| Trait-hex pips (active) | `traitActive` | C.traitActive |
| Ability bar fill | `bgInspectRow` | C.bgInspectRow |
| Ability bar border | `itemBorder` | C.itemBorder |
| Item slot (empty) | `itemComponent` | C.itemComponent |
| Item slot border | `itemBorder` | C.itemBorder |
| Item slot (completed) | `itemCompleted` | C.itemCompleted |
| Stat glyph (inactive) | `textMuted` | C.textMuted |
| Stat glyph (active) | `textLabel` | C.textLabel |
| Stat value text | `textPrimary` | C.textPrimary |
| Sell button fill | `bgSellChip` | C.bgSellChip |
| Sell button fill (armed) | `bgSellArmed` | C.bgSellArmed |
| Sell button border | `accentGold` | C.accentGold |
| Sell label text | `textSell` | C.textSell |
| Sell coin glyph | `accentGold` | C.accentGold |
| Sell number | `textGold` | C.textGold |
| Star pip | `starGold` | C.starGold |
| XP / level bar fill | `xpPurple` | C.xpPurple |

---

## DO-NOT-REPRODUCE

Placeholder these — copyrighted in the reference:

- The champion name ("Teemo") → use generic placeholder "Unit Name"
- The trait names ("Space Groove", "Shepherd") and their icons (lantern, flame) → use placeholder trait names "Holy Origin" / "Knight Class" with theme glyphs `"sun"` / `"shield"` from `TRAIT_GLYPH`
- The character splash art in the header corner → plain `bgInspect` fill or omit; center a small `"orb"` glyph at `textMuted` as a stub
- The ability icon art → placeholder glyph `"bolt"` in `fxAbilityMagic`
- The specific stat icon art → theme `GlyphKind` glyphs as listed in the stat grid above (keep the stat concept, not the original art)
- The gold filigree frame chrome → a theme-styled border replicating only the octagonal tapered SHAPE; no scrollwork, no original ornamental art
- The coin / gold icon art → `"coin"` GlyphKind from `glyphs.ts`

Replicate structure and layout only. Never reproduce the original art.

---

## PLACEHOLDER

Stub these with theme tokens:

| Element | Placeholder |
|---|---|
| Splash region (header right 40%) | `bgInspect` fill; `"orb"` glyph at 24px `textMuted` centered |
| Ability icon (Tile A + Ability Bar) | `"bolt"` GlyphKind at indicated size, color `fxAbilityMagic` |
| Trait icons (rows A and B) | `"sun"` and `"shield"` from `TRAIT_GLYPH`; color from `traitColor("holy")` / `traitColor("knight")` |
| Item slots (all three) | Empty; fill `itemComponent`, border `itemBorder` |
| All numeric stat values | Row 1: 15 / 0% / 0% / 15 / 15; Row 2: 0.70 / 25% / 0% / 0% / 0% |
| HP values | 450 / 450 |
| Mana values | 0 / 50 |
| Cost | 1 |
| Level/star | 1-star (one `"star"` glyph) |
| Unit name | "Unit Name" |
| Trait name A | "Holy Origin" |
| Trait name B | "Knight Class" |
| Range value (Tile C) | 4 |
