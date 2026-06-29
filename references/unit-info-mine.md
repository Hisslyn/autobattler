# Unit-Info Panel — MINE (Built State Documentation)

> Documents the current rendered state of `renderUnitInfoShell` (match.ts lines 4087–4307).  
> Panel design dims: **210 × 520 px** (PANEL_W = 210, PANEL_H = 520, bible target is 220 × 520).  
> Bottom point protrusion: **POINT = 24 px** (matches bible).  
> Scale-to-fit: `fit = min(1, (designH − 20) / 544)` applied to the whole container.  
> Anchor: top-right, `x = designW − 210 × fit − 10`, `y = 10`.  
> All measurements below are in the panel's local design space (pre-`fit` scale).

---

## 1. Outer Frame

| Property | Built value |
|---|---|
| Shape | Octagonal poly: `[12,0, 198,0, 210,12, 210,520, 105,544, 0,520, 0,12]`. Top-left + top-right 45° bevel at 12 px (bible: 12 px — matches). Bottom point at center, 24 px below rect floor. |
| Fill | `C.surfaceBase` (0x0b0d13) |
| Outer stroke | 1.5 px `C.borderSubtle` (0x222840), join "round" |
| Inner gold hairline | 3 px inset poly, 0.5 px `C.accentGold` (0xf2ca58), alpha 0.9 |
| Corner treatment | True 45° bevel cuts, no rounding |

**Notes:** Frame shape structurally matches the bible spec. The inner gold hairline is correctly placed at 3 px inset with 0.5 px stroke and 0.9 alpha. The outer stroke uses `C.borderSubtle` at 1.5 px as specified.

---

## 2. Header Band

**Approximate span:** 0–55 px from panel top (not a clean 28% = 145 px as in the bible — the header content occupies much less vertical space than specified).

### 2a. Star / Level Indicator

| Property | Built value |
|---|---|
| Anchor | `x = PAD + 7 = 15`, `y = 6 + 7 = 13` (center) |
| Shape | `"star"` glyph at 14 px |
| Color | `C.starGold` (0xf0a830) |
| Stroke | `glyphStrokeWeight(14)` = 2 px |

### 2b. XP / Level Progress Bar

| Property | Built value |
|---|---|
| Anchor | `x = PAD = 8`, `y = 22` |
| Size | `innerW × 0.44` = ~85 px wide × 4 px tall |
| Track fill | `C.manaBg` (0x1a2a4e) |
| Border | none (borderW = 0), radius 2 px |
| Fill portion | None drawn — 0% fill, track only visible |

### 2c. Character Splash Art Region

| Property | Built value |
|---|---|
| Anchor | `x = 210 − PAD − splashW = 210 − 8 − 76 = 126`, `y = 6` |
| Size | `splashW = W × 0.4 − PAD = 76 px` wide × **40 px** tall |
| Fill | `C.bgInspect` (0x242a3e) |
| Border | 1 px `C.borderSubtle` (0x222840), radius 3 px |
| Glyph stub | `"orb"` at 24 px, `C.textMuted` (0x8088a0), centered in the 76 × 40 box |

**Notes:** The splash placeholder is a **40 px tall** contained box in the upper-right — far smaller than the reference's full-height corner art. This is correct per the bible's DO-NOT-REPRODUCE / placeholder rule. In the screenshot the box reads as a small dark rectangle with a faint grey circle, positioned top-right of the star.

---

## 3. Trait Rows

**Start y:** cy = 56 after the header.  
Two rows, each 36 px tall, stacked with 0 px gap between them.

| Property | Built value |
|---|---|
| Row fill | `C.bgInspectRow` (0x1c2232), no border (borderW = 0), no radius |
| Bottom divider | 1 px line `C.borderSubtle` (0x222840) at `cy + 36` |
| Icon glyph | 14 px, centered at `x = PAD + 4 + 14 = 26`, `y = cy + 18` |
| Row A glyph | `"sun"`, color `traitColor("holy")` = TRAIT_COLOR.holy = 0xf0d878 (warm yellow) |
| Row B glyph | `"shield"`, color `traitColor("knight")` = TRAIT_COLOR.knight = 0x6a90c0 (steel blue) |
| Label font | 12 px `system-ui, sans-serif`, weight 500 |
| Label color | `C.textPrimary` (0xc9cedb) |
| Label x | `PAD + 4 + 28 + 6 = 46` px from panel left |
| Row A label | "Holy Origin" |
| Row B label | "Knight Class" |

**Notes:** No row border radius or left/right border — a flat fill strip. cy after both rows = 128.

---

## 4. Unit Name Bar

**y:** cy = 128, height 36 px.

| Property | Built value |
|---|---|
| Fill | `C.surfaceRaise` (0x141824), no border, no radius |
| Bottom divider | 1 px `C.borderActive` (0x3a4460) at `cy + 36` |
| Name text | "Unit Name", x = PAD + 8 = 16, y = cy + 18, 14 px, weight 700, `C.textPrimary` |
| Cost number "1" | Right anchor at `PAD + innerW − 8 = 186`, y = cy + 18, 13 px weight 600, `C.textGold` (0xd4a832), anchor [1, 0.5] |
| Coin glyph | `"coin"` at 10 px, `C.accentGold` (0xf2ca58), x = 186 − 12 − 3 − 5 = 166, centered |

cy after: 164.

---

## 5. HP Bar

**y:** cy = 164, height 22 px, then cy += 22 + 2 = 188.

| Property | Built value |
|---|---|
| Track fill | `C.hpBg` (0x182a18), no border, radius 3 px |
| Fill | `C.hpGreen` (0x5dcaa5), 100% width (full innerW), radius 3 px |
| Text overlay | "450 / 450", centered, 11 px weight 600, `C.textPrimary` |
| Segment dividers | **NOT RENDERED** — no `C.hpSegment` tick marks drawn in code |

---

## 6. Mana Bar

**y:** cy = 188, height 20 px, then cy += 20 + 6 = 214.

| Property | Built value |
|---|---|
| Track fill | `C.manaBg` (0x1a2a4e), no border, radius 3 px |
| Fill | None (0% fill — 0 / 50 mana; track only drawn) |
| Text overlay | "0 / 50", centered, 11 px weight 500, `C.textPrimary` |

---

## 7. Three Info Tiles

**y:** cy = 214, height 52 px each, gap 4 px between tiles, then cy += 52 + 6 = 272.  
Tile width = (innerW − 8) / 3 = (194 − 8) / 3 ≈ 62 px each.

### Tile A — Ability Icon

| Property | Built value |
|---|---|
| Fill | `C.bgInspectRow` (0x1c2232) |
| Border | 1 px `C.itemBorder` (0x3a4255), radius 4 px |
| Content | `"orb"` glyph at 20 px, `C.xpPurple` (0x9b87f5), centered in tile |

### Tile B — Trait-Count / Hex Cluster

| Property | Built value |
|---|---|
| Fill | `C.bgInspectRow` (0x1c2232) |
| Border | 1 px `C.chipBorder` (0x363d58), radius 4 px |
| Content | Three hexagon outlines (hexR = 5 px), stroke 1.5 px `C.traitActive` (0x3a6a3a — dark green), in 2-over-1 cluster arrangement |

### Tile C — Range Indicator

| Property | Built value |
|---|---|
| Fill | `C.bgInspectRow` (0x1c2232) |
| Border | 1 px `C.chipBorder` (0x363d58), radius 4 px |
| Content | "4" at 12 px weight 700, anchor [0.5, 0.5], x = tileCX + tileW/2 − 8; `"bow"` glyph at 14 px `C.textMuted`, x = tileCX + tileW/2 + 8 |

---

## 8. Ability Bar

**y:** cy = 272, height 44 px, then cy += 44 + 6 = 322.

| Property | Built value |
|---|---|
| Fill | `C.bgInspectRow` (0x1c2232) |
| Border | 1 px `C.itemBorder` (0x3a4255), radius 4 px |
| Width | **Full innerW = 194 px** (full panel width minus 8 px left/right PAD) |
| Glyph | `"bolt"` at 22 px, `C.fxAbilityMagic` (0x9a7ade) |
| Glyph position | `x = PAD + innerW × 0.275 = 8 + 53.4 ≈ 61 px`, `y = cy + 22` — **NOT centered; biased left at ~27.5% of innerW from left edge** |

**Notes:** The bar spans full innerW. The glyph is placed at 27.5% of innerW from the left edge — this is left-of-center but the bar itself is still full-width. The bible says the bar tile should span ~55% of panel width, with the right ~40% left blank (dark surfaceBase). The current code draws a full-width bar and only offsets the glyph to the left.

---

## 9. Item Slots

**y:** cy = 322, slotW = slotH = (innerW − 8) / 3 ≈ 62 px, gap 4 px, then cy += 62 + 6 = 390.

| Property | Built value |
|---|---|
| Slot fill (all 3, empty) | `C.itemComponent` (0x2a3242) |
| Slot border | 1 px `C.itemBorder` (0x3a4255), radius 4 px |
| Content | None — all three empty |

---

## 10. Stat Grid

**y:** cy = 390, two rows × 34 px each. Cells distributed across innerW / 5 = ~38.8 px each.

Each cell: glyph at 12 px at `(ccx, rowY + 11)`, value text at 11 px at `(ccx, rowY + 24)`.

### Row 1 — y = 390

| Col | GlyphKind | Value | Glyph color token |
|---|---|---|---|
| 0 (AD) | `"sword"` | "15" | `C.textMuted` (0x8088a0) |
| 1 (AP) | `"orb"` | "0%" | `C.textMuted` (0x8088a0) |
| 2 (Crit) | `"spark"` | "0%" | `C.xpPurple` (0x9b87f5) |
| 3 (Armor) | `"shield"` | "15" | `C.textMuted` (0x8088a0) — **NOT tier3** |
| 4 (MR) | `"orb"` | "15" | `C.manaBlue` (0x3d8af0) |

Row divider: 1 px `C.borderSubtle` at `rowY + 34`.

### Row 2 — y = 424

| Col | GlyphKind | Value | Glyph color token |
|---|---|---|---|
| 0 (AS) | `"bolt"` | "0.70" | `C.textMuted` |
| 1 (Lifesteal) | `"heart"` | "25%" | `C.textMuted` |
| 2 (Dodge/Crit dmg) | `"dagger"` | "0%" | `C.textMuted` |
| 3 (Range) | `"bow"` | "0%" | `C.textMuted` |
| 4 (Mana max) | `"droplet"` | "0%" | `C.textMuted` |

cy after: row2Y + 34 + 4 = 462.

---

## 11. Sell Button

**y:** `sellY = min(cy, PANEL_H − sellH − 2) = min(462, 486) = 462`, height 32 px, width = innerW = 194 px.

| Property | Built value |
|---|---|
| Fill | `C.bgSellChip` (0x2a1010 — very dark red-brown) |
| Border | 1.5 px `C.accentGold` (0xf2ca58), radius 4 px |
| Label "Sell for" | 12 px weight 500, `C.textSell` (0xaa3030 — medium red) |
| Coin glyph | `"coin"` at 10 px, `C.accentGold` (0xf2ca58) |
| Number "1" | 12 px weight 700, `C.textGold` (0xd4a832) |
| Layout | Inline group centered: label + 5px gap + coin + 5px gap + number |

---

## Layout Summary (top-to-bottom, built state)

```
┌──────────────────────────────────────────┐  ← top bevel cuts (12 px)
│  ★  ─────xp bar(85px)──     [orb 40px]  │  y 0–55  (header, MUCH shorter than bible 145px)
│  [sun]  Holy Origin                      │  y 56–92
│  [shield]  Knight Class                  │  y 92–128
│  Unit Name                    🪙 1       │  y 128–164
│  ████████████ 450 / 450 ████████████    │  y 164–186 (hp, NO segment dividers)
│  ░░░░░░░░░  0 / 50  ░░░░░░░░░░░░░░░░░  │  y 188–208 (mana)
│  [orb tile][hex tile][4 bow tile]        │  y 214–266
│  [══════════ ability bar (194px) ══════] │  y 272–316 (FULL width, bolt at ~27.5%)
│  [ item ]    [ item ]    [ item ]        │  y 322–384
│  ↑15  ⊙0%  ✦0%  ◻15  ⊙15              │  y 390–424 (stat row 1)
│  ⚡0.70  ♥25%  †0%  ↗0%  💧0%         │  y 424–458 (stat row 2)
│  [▓▓▓▓  Sell for 🪙 1  ▓▓▓▓]          │  y 462–494 (red bg)
└───────────────────▼──────────────────────┘  ← bottom point (24 px below y 520)
```

---

## Color Token Quick-Reference (built state)

| Element | Token used | Hex value |
|---|---|---|
| Panel outer fill | `C.surfaceBase` | 0x0b0d13 |
| Outer frame stroke | `C.borderSubtle` | 0x222840 |
| Inner gold hairline | `C.accentGold` | 0xf2ca58 |
| Header splash fill | `C.bgInspect` | 0x242a3e |
| Splash border | `C.borderSubtle` | 0x222840 |
| Orb stub glyph | `C.textMuted` | 0x8088a0 |
| Star glyph | `C.starGold` | 0xf0a830 |
| XP bar track | `C.manaBg` | 0x1a2a4e |
| Trait row fill | `C.bgInspectRow` | 0x1c2232 |
| Trait row divider | `C.borderSubtle` | 0x222840 |
| Trait icon — Holy | `traitColor("holy")` | 0xf0d878 |
| Trait icon — Knight | `traitColor("knight")` | 0x6a90c0 |
| Name bar fill | `C.surfaceRaise` | 0x141824 |
| Name bottom border | `C.borderActive` | 0x3a4460 |
| Name text | `C.textPrimary` | 0xc9cedb |
| Cost coin glyph | `C.accentGold` | 0xf2ca58 |
| Cost number | `C.textGold` | 0xd4a832 |
| HP track | `C.hpBg` | 0x182a18 |
| HP fill | `C.hpGreen` | 0x5dcaa5 |
| HP segment dividers | (none rendered) | — |
| HP text | `C.textPrimary` | 0xc9cedb |
| Mana track | `C.manaBg` | 0x1a2a4e |
| Mana text | `C.textPrimary` | 0xc9cedb |
| Info tile fill | `C.bgInspectRow` | 0x1c2232 |
| Tile A border | `C.itemBorder` | 0x3a4255 |
| Tile B/C border | `C.chipBorder` | 0x363d58 |
| Tile A glyph | `C.xpPurple` | 0x9b87f5 |
| Tile B hex outlines | `C.traitActive` | 0x3a6a3a |
| Tile C text | `C.textPrimary` | 0xc9cedb |
| Tile C glyph | `C.textMuted` | 0x8088a0 |
| Ability bar fill | `C.bgInspectRow` | 0x1c2232 |
| Ability bar border | `C.itemBorder` | 0x3a4255 |
| Ability bolt glyph | `C.fxAbilityMagic` | 0x9a7ade |
| Item slot fill | `C.itemComponent` | 0x2a3242 |
| Item slot border | `C.itemBorder` | 0x3a4255 |
| Stat glyph default | `C.textMuted` | 0x8088a0 |
| Stat crit glyph | `C.xpPurple` | 0x9b87f5 |
| Stat MR glyph | `C.manaBlue` | 0x3d8af0 |
| Stat value text | `C.textPrimary` | 0xc9cedb |
| Sell button fill | `C.bgSellChip` | 0x2a1010 |
| Sell button border | `C.accentGold` | 0xf2ca58 |
| Sell label text | `C.textSell` | 0xaa3030 |
| Sell number | `C.textGold` | 0xd4a832 |

---

## Discrepancies (built vs reference)

Issues ordered by visual impact (highest first).

---

### D1. Ability Bar Width — BLOCKING

**Built:** The ability bar spans the **full innerW (194 px)** via `this.chip(panel, PAD, cy, innerW, abilH, ...)`. The `"bolt"` glyph is placed at `PAD + innerW × 0.275` — offset to the left within a full-width container, but visually the bar fills the entire panel width.

**Reference (bible §8):** The ability bar tile should span **~55% of the panel width** (`0.55 × 210 ≈ 116 px`), positioned left-of-center. The right ~40% of the horizontal band remains blank (`C.surfaceBase`) — empty dark panel surface, not part of the bar.

**Fix:** Change the chip width from `innerW` to `Math.round(innerW * 0.55)` (≈ 107 px). Keep `x = PAD`. Center the `"bolt"` glyph inside that 107 px sub-bar: `x = PAD + 107 / 2`. The remaining right portion needs no explicit fill (the frame's `surfaceBase` shows through).

```
// line ~4246
const abilBarW = Math.round(innerW * 0.55);
this.chip(panel, PAD, cy, abilBarW, abilH, { fill: C.bgInspectRow, border: C.itemBorder, borderW: 1, radius: 4 });
this.glyph(panel, "bolt", PAD + abilBarW / 2, cy + abilH / 2, 22, C.fxAbilityMagic);
```

---

### D2. Sell Button Color — BLOCKING

**Built:** Fill is `C.bgSellChip` (0x2a1010, very dark red-brown). Label text uses `C.textSell` (0xaa3030, medium red). The screenshot confirms a red "Sell for" label on a deep-red background — a dark crimson danger-state read.

**Reference:** The TFT sell button shows **light-blue/teal text on a blue-tinted background** with a tan/gold border. The bible correctly specifies `C.bgSellChip` / `C.textSell` as the tokens, but those token VALUES in theme.ts are currently dark-red (bgSellChip = 0x2a1010, textSell = 0xaa3030). Editing theme.ts token values is out of scope per task instructions.

**Assessment:** The token names in `renderUnitInfoShell` are correct per the bible (`C.bgSellChip`, `C.textSell`). The mismatch is that the theme.ts VALUES for these tokens are red-family, not blue/teal as the reference shows. This is a **theme.ts value-level issue**, not a `match.ts` token-selection issue. The coder should flag this to the team as a design-token value change needed in theme.ts:
- `bgSellChip` should target a **dark teal-blue** surface (analogous to `C.bgInspect` or `C.manaBg` family, e.g. something near 0x0e2030).
- `textSell` should target a **light teal/cyan** text color (analogous to `C.fxAbilityShield` family, e.g. something near 0x5fd0c0 or `C.manaBlue`).

Since theme.ts edits are out of scope, the coder must defer this to the token-value update ticket. No match.ts change can fix D2 without either editing theme.ts or overriding with a different existing token. Closest existing blue-family tokens for a temporary override, if approved: fill → `C.bgInspect` (dark blue-grey, 0x242a3e) + text → `C.manaBlue` (0x3d8af0). These deviate from the token name semantics but move the color family toward the reference. Flag for product decision.

---

### D3. HP Bar — Missing Segment Dividers — MAJOR

**Built:** No segment divider ticks are drawn. The code at lines 4196–4201 draws only the track chip + fill chip + text overlay. `C.hpSegment` is never used in `renderUnitInfoShell`.

**Reference:** The bible (§5) specifies dark tick marks (`C.hpSegment`, 0x0b150b) every 300 HP, 1 px wide, full bar height. The reference image shows visible segment separators on the HP bar.

**Fix:** After drawing the HP fill chip, add a tick-drawing pass. For a 450 HP unit with 300 HP per segment, ticks appear at 300/450 ≈ 66.7% from the left. In general, iterate from 300 to maxHp step 300, draw a 1 px wide × hpH tall rect at `PAD + innerW × (segment / maxHp)`:

```
// after line 4200 (after drawing the fill chip and before the text):
const maxHp = 450;
const segmentHp = 300;
const seg = new PIXI.Graphics();
for (let s = segmentHp; s < maxHp; s += segmentHp) {
  const tx = PAD + innerW * (s / maxHp);
  seg.rect(tx, cy, 1, hpH).fill({ color: C.hpSegment });
}
panel.addChild(seg);
```

---

### D4. Frame Border Weight / Saturation — MAJOR

**Built:** Outer stroke is 1.5 px `C.borderSubtle` (0x222840). Inner hairline is 0.5 px `C.accentGold` (0xf2ca58) at alpha 0.9. In the screenshot the gold hairline reads quite prominently — bright and saturated — and the overall frame reads heavier/more ornate than the reference.

**Reference:** The reference card has a very **subtle, thin, dark frame** with a barely-visible thin highlight. The inner gold line looks near-invisible in normal lighting. The reference does not have an obvious bright gold border.

**Fix:** Reduce the inner gold hairline alpha from 0.9 to **0.35–0.45** to match the barely-there filigree in the reference. The outer stroke is correctly thin (1.5 px) but `borderSubtle` at 0x222840 may need to read less saturated — no token change needed; just adjust the alpha on the inner hairline:

```
// line ~4148
frame.poly(innerPts).stroke({ width: 0.5, color: C.accentGold, alpha: 0.35, join: "round" });
```

---

### D5. Header / Splash Region — MAJOR

**Built:** The splash placeholder is a **76 × 40 px** contained box in the upper-right corner of the panel, showing a small dark rectangle with a centered orb glyph. The header band overall spans only ~55 px vertically (star at y=6, xp bar at y=22, splash box top at y=6 bottom at y=46, trait rows begin at y=56).

**Reference (bible §2):** Header band should occupy 0–28% of panel height = **~145 px**. The splash region (right 40% of W) should span the **full header height** (145 px), not just 40 px. The bible says `splashH = full header height` with the placeholder `bgInspect` rect clipped to the header band bounds.

**Fix:** Increase `splashH` from 40 to match the full header region height. The trait rows begin at y = 56 (`cy = 56` after the header glyph/xp bar). The bible's header band ends at ~145 px. The splash placeholder should span from y = 0 (or y = 6) down to y ≈ 145 — approximately 139 px tall — running from the top of the panel to the start of the trait rows. Adjust:

```
// line ~4162
const splashH = cy; // match the height of the header region up to where traits begin
```

This requires moving the traitRow `cy` setup so the splash height is computed after all header elements are placed. A simpler approach: hardcode `splashH = 50` (still a stub, slightly taller, matching the bevel area) — but the full fix per the bible is to make it span the full header band. Since the bible permits the placeholder box, the primary fix is making the splash placeholder fill the right 40% of the panel from y=0 down to y=56 (the actual current header height), not just 40 px:

```
// replace splashH = 40 with:
const splashH = cy; // will be 56 at time of rendering (after star+xp bar placed)
// but cy is set to 56 only after traitRow calls, so compute it ahead of time:
// header ends at y=56 (first traitRow start). Use 56 directly.
const splashH = 56;
```

Even at 56 px this is significantly more representative than 40 px.

---

### D6. Three Info Tiles — Hex Color and Tile A/B Divider — MAJOR

**Built:**
- Tile B hex cluster: outlines use `C.traitActive` = 0x3a6a3a (dark forest green). In the screenshot they read as **muted green hexagons**.
- No vertical divider line between Tile A and Tile B.

**Reference:** The reference shows **white/light hexagon outlines** (not green) for the hex cluster pips in Tile B. The bible specifies `C.traitActive` but the reference uses a visually neutral/white treatment. Additionally, the reference shows a thin **vertical divider line** between Tile A and Tile B (the ability tile and the hex tile are separated by a 1 px dark line).

**Fix 1 — Hex color:** Change `C.traitActive` (0x3a6a3a, dark green) to `C.textMuted` (0x8088a0) or `C.borderActive` (0x3a4460) for a more neutral/visible read. The bible says `C.traitActive` — if that token value is to remain, this is a token-value issue. However, in match.ts alone, swapping the hex outline color to `C.chipBorder` (0x363d58) would produce a more visible, less green hex. The closest faithful fix without touching theme.ts: use `C.textLabel` (0xbbc4d0) for the hex outlines so they read light/neutral:

```
// line ~4231
g.poly(pts).stroke({ width: 1.5, color: C.textLabel, join: "round" });
```

**Fix 2 — Tile A/B divider:** Add a 1 px vertical line between tileAX+tileW and tileBX (i.e., at x = PAD + tileW) spanning the tile height:

```
const tileDiv = new PIXI.Graphics();
tileDiv.moveTo(tileAX + tileW + tileGap / 2, cy).lineTo(tileAX + tileW + tileGap / 2, cy + tileH)
  .stroke({ width: 1, color: C.borderSubtle });
panel.addChild(tileDiv);
```

---

### D7. Stat Grid — Armor Glyph Missing Tier3 Tint — MINOR

**Built:** Col 3 (Armor, `"shield"`) uses `C.textMuted` (0x8088a0). Per the bible (§10): "Col 4 armor 'shield' should be tier3 tint" — `C.tier3` = 0x378add (blue).

**Fix:** Change the armor row1 entry from `C.textMuted` to `C.tier3`:

```
// line ~4271, row1 array entry index 3:
["shield", "15", C.tier3],   // was C.textMuted
```

The crit spark (col 2) already uses `C.xpPurple` and MR orb (col 4) uses `C.manaBlue` — those are correct per the bible.

---

### D8. Trait Rows — Row Fill Flatness vs Reference — MINOR

**Built:** Row fill is `C.bgInspectRow` (0x1c2232) with no border, no radius. The rows render as flat dark strips blending into the panel.

**Reference:** The reference trait rows have a visible darker-background row treatment with the text reading clearly above it and a faint bottom rule. The built version is close but the lack of any left/right border means the rows bleed edge-to-edge — while the reference rows have subtle left/right framing.

**Fix:** Add a 1 px left and right `C.borderSubtle` border to each trait row by drawing it as an outlined rect rather than a borderless chip, or add explicit left/right divider lines. Low priority — the contrast is already readable.

---

### D9. Tile C Range Glyph — Bow vs Arrow — MINOR

**Built:** Tile C uses `"bow"` GlyphKind for the range arrow. The bible specifies `"bow"` — this matches. However in the reference the arrow appears as a simpler **diagonal arrow** shape (more like a range/compass arrow) distinct from a drawn bow. The `"bow"` glyph in `glyphs.ts` should be verified to render as an arrow-like shape readable as "range direction". Visual only — no token change needed; glyph kind is correct per bible.

---

### D10. Overall Spacing / Proportions — MINOR

**Built:** The header band spans only ~56 px (star at y=6, trait rows begin at y=56) vs the bible's target of 145 px (28% of 520). This makes the trait rows and name bar appear very close to the top, with the bottom half (info tiles → sell) occupying the same space as the reference but the top section being significantly compressed.

The total content stack: 56 (header) + 72 (traits) + 36 (name) + 24 (hp) + 26 (mana) + 58 (tiles) + 50 (ability) + 68 (items) + 72 (stats) + 36 (sell) = 498 px — fits within 520 with only 22 px spare, so there is no room to expand the header to 145 px without compressing other regions.

**Recommendation:** The header compression is a consequence of proportional decisions made early. The biggest single improvement is item D5 (taller splash placeholder). Expanding the header to 145 px while keeping all regions would require either increasing PANEL_H above 520 or compressing the trait rows (currently 36 px each) and stat rows (34 px each). This is a layout restructure — medium complexity. The most pragmatic fix is D5 alone (splash height to ~56–70 px) without changing PANEL_H.

---

### Summary of Prioritized Fixes for Coder

| Priority | ID | Region | Fix |
|---|---|---|---|
| 1 | D1 | Ability bar | Width from `innerW` → `Math.round(innerW * 0.55)` ≈ 107 px; center glyph inside sub-bar |
| 2 | D2 | Sell button | Token values in theme.ts need changing (bgSellChip → dark teal, textSell → light teal/cyan); match.ts token selection is correct per bible; flag as theme.ts value ticket |
| 3 | D3 | HP bar | Add `C.hpSegment` tick marks every 300 HP (loop + 1 px rect per segment boundary) |
| 4 | D4 | Frame | Reduce inner gold hairline alpha from 0.9 to 0.35–0.45 |
| 5 | D5 | Splash header | Increase `splashH` from 40 to 56 (or match `cy` at trait-row start) |
| 6 | D6a | Tile B hexes | Change hex outline color from `C.traitActive` to `C.textLabel` (neutral/light) |
| 7 | D6b | Tile A/B | Add 1 px `C.borderSubtle` vertical divider between Tile A and Tile B |
| 8 | D7 | Stat grid | Armor glyph (row1 col 3 "shield") → `C.tier3` instead of `C.textMuted` |
| 9 | D8 | Trait rows | Optional: add 1 px side borders to trait row chips for framing |
| 10 | D10 | Proportions | Header expansion is a layout restructure; defer unless PANEL_H is increased |
