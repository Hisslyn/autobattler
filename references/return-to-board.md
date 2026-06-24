# Return-to-board emblem (central glyph only)

Source: `references/return-to-board.png` — a round medallion button. This note covers ONLY the
light-blue keystone/trapezoid glyph sitting in the medallion's center, not the dark disc behind it
or the gold ring around it (those exist only as anchoring context below).

## Shape

- Base form: a symmetric (isosceles) **trapezoid**, oriented like an upright keystone —
  **narrower at the top, wider at the bottom**.
- Two slanted side edges lean outward as they descend, roughly **15-20° off vertical** each
  (i.e. the bottom edge is noticeably wider than the top — about 1.5-1.6x the top edge's width).
- Top and bottom edges are both horizontal and parallel to each other.
- Corner treatment: all four corners are **softly rounded** (small radius — enough to remove sharp
  points but not enough to read as "pill" or "blob"; on the order of ~8-10% of the shape's own
  width per corner). The rounding is the same at all four corners (top two and bottom two read
  consistently).
- The shape is a single, simple solid silhouette — no notches, no concave segments, no additional
  facets beyond the 4 edges.

## Proportion

- Overall glyph footprint is roughly as **wide as it is tall**, leaning very slightly wider than
  tall (approx width:height ≈ 1.05:1 to 1.1:1 measuring the bottom edge as the full width).
- Top edge width ≈ 60-65% of bottom edge width.
- The glyph sits centered in the medallion, occupying roughly the middle 45-50% of the medallion's
  diameter — comfortable dark padding on all sides between the glyph and the gold ring.
- **Inner outline**: a second, smaller trapezoid of the exact same proportions (same taper angle,
  same corner rounding ratio) is nested concentrically inside the outer shape, inset uniformly by
  roughly **12-15% of the outer shape's narrowest dimension** (i.e. a consistent stroke-width-like
  margin all the way around — top, bottom, and both slanted sides keep the same visual gap). This
  produces a "frame within the same silhouette" look rather than a differently-shaped cutout.
- The inner outline is a **stroke only** (line), not a filled hole — the body color shows through
  on both sides of that inner line; it reads as an engraved/embossed contour line, not a window.

## Bevel / gloss treatment

- The body is lit as if from **upper-left**, giving the shape a subtle embossed/domed feel rather
  than flat color:
  - A soft lighter highlight sits along the **upper-left interior**, fading toward the lower-right.
  - The lower-right interior is very slightly darker/deeper than the upper-left, reinforcing the
    sense of a rounded (domed) surface rather than a flat painted chip.
- The inner outline stroke itself carries a faint **bevel pair**: the edge of the stroke facing
  up/left reads a touch lighter than the body, and the edge facing down/right reads a touch darker
  — like a thin groove cut into the surface, not a flat line of uniform tone.
- No hard specular dot or glossy "sticker" highlight — the lighting is soft/diffuse, consistent
  with a smooth enamel or polished-stone material rather than glass or plastic.
- Edges of the outer silhouette have a very thin, slightly darker rim where the glyph meets the
  dark disc behind it, which is what gives it edge definition against the background (this rim is
  part of the glyph's own bevel, not a separate stroke).

## Color (described as relationships, for palette mapping)

- Overall hue family: a single **light, slightly desaturated blue** (periwinkle-leaning, cool —
  not cyan, not violet) used for the entire glyph; no second hue is introduced anywhere in the
  shape.
- Value relationships within the glyph (lightest to darkest, same hue throughout):
  1. **Lightest** — the upper-left highlight zone of the body (the "lit" face of the bevel).
  2. **Mid** — the bulk of the trapezoid body (the dominant fill tone).
  3. **Slightly darker mid** — lower-right portion of the body (the "shaded" face of the bevel).
  4. **Darkest-of-the-blues** — the thin outer silhouette rim where the glyph meets the dark disc.
- The inner outline stroke sits at roughly the **same lightness as the body's highlight-to-mid
  range**, but is distinguished from the body purely by being a thin discrete line with its own
  light/dark bevel edge (see above), not by a separate color family.
- No gradient banding or texture — transitions between the light/mid/dark zones are smooth and
  soft (soft-light gradient, not a hard split), consistent with a gentle ambient-occlusion-style
  shading rather than directional cel-shading.
- Contrast against the background: the background disc is a dark, cool, low-saturation
  blue-gray/charcoal — the glyph's lightest tone has strong contrast against it (this is what
  makes the glyph read instantly as the focal point of the medallion), while the glyph's darkest
  rim tone is the transition step that softens the jump to the background rather than cutting hard.

## Implementation notes for procedural recreation (Pixi v8 path API)

- Construct as two concentric trapezoid paths sharing one center and one taper angle:
  outer silhouette (filled) and inner outline (stroked), inner inset uniformly from the outer by
  ~12-15% of outer height.
- Use `roundRect`-style corner rounding on each of the 4 trapezoid corners (equal radius all four
  corners, proportional to shape size) rather than sharp `lineTo` joins — Pixi v8's path API can
  build this via explicit `arcTo`/quadratic corners on a custom `moveTo`/`lineTo` sequence since
  there is no native "rounded trapezoid" primitive.
- Fill the outer shape with a vertical/diagonal (upper-left → lower-right) gradient or a 2-3 stop
  soft blend from light-blue highlight to mid-blue to slightly-darker-blue to approximate the
  bevel; stroke the outer edge with the darkest blue at a hairline weight for the rim.
- Stroke the inner trapezoid with a thin line (a touch lighter than mid-body tone on its upper-left
  arc, a touch darker on its lower-right arc, if a two-tone stroke is feasible — otherwise a single
  light-mid tone stroke is an acceptable simplification).
- This glyph is a strong candidate to live alongside the existing procedural glyph set
  (`packages/client/src/glyphs.ts`) as a new non-trait/non-item icon (e.g. a "return to board" /
  "back to match" navigation glyph) using the same `drawGlyph`-style vector approach and reading
  its colors from `theme.ts` rather than hardcoded hex, per the project's theme-as-CSS-vars /
  no-hex-outside-theme convention.
