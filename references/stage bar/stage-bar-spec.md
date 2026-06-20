# Stage Bar — Implementation Spec

Replaces `renderRoundDots` + the stage-caption/dial cluster inside `renderHud`
(match.ts lines ~739–918) with ONE unified bar component, `renderStageBar`.
`renderSkipButton` stays, repositioned beneath the new bar. No sim/rules
changes — this is a pure render-from-state component. Data bindings already
exist and are reused as-is: `stageForRound(state.round)` (from
`@autobattler/rules/src/rounds.js`), `isPveRound(round)`, `state.round`,
`this.driver.getPlanningTimeLeft()`, `PLANNING_TIMER_MS` (from `driver.ts`).

Reference: `/Users/azat/Desktop/autobattler/references/stage-bar.png`.

---

## 1. Reference read

Single compact horizontal bar, top-center, floating over the board/scene (not
a full-width HUD band). Dark desaturated teal-green glass panel, trapezoidal
(wider at top, narrower at bottom — same `\___/`-style taper the current dots
banner already uses, just applied to the WHOLE bar instead of a small plaque
above it), with a thin warm gold/bronze border that's most visible along the
bottom edge. Three zones left→right, separated by faint vertical gaps (no hard
dividers visible — spacing alone separates them):

1. **Stage marker** (far left): small white humanoid/standard-bearer glyph +
   bold white "6-2" text immediately to its right.
2. **Round schedule strip** (center, widest zone): 7 small icons in a row,
   tightly spaced, one per round of the current stage — crossed-swords for
   PvP, hexagonal gem for PvE, a distinct monster glyph for the stage's final
   PvE/boss round. All neutral grey EXCEPT the current round's icon, which is
   rendered larger, in gold, with a small upward-pointing chevron/caret
   centered directly beneath it (the "you are here" pointer). Icons before the
   current one read dimmer/duller than the icons after it (completed vs
   upcoming), though the contrast is subtle — gold-vs-everything-else is the
   dominant signal, not a 3-way value ramp.
3. **Timer** (far right): small clock-face glyph + bold white seconds number
   ("5"), then a small up-chevron after it (this chevron is decorative /
   matches the caret motif, not interactive — treat it as an end-cap flourish,
   optional to omit, see §7).

Beneath the entire bar, a separate thin horizontal capsule: near-black track,
filled from the LEFT with a bright teal/cyan bar that's mostly full in the
reference screenshot (i.e. it depletes left→right as the timer counts down —
fill shrinks from the right end while the left edge stays pinned). It reads as
a distinct widget docked directly under the bar, same width, small gap between
them.

---

## 2. Layout

All values in design-space px (390-wide portrait baseline; landscape reuses
the same component centered over `regions.board`, see §6).

### 2.1 Overall bar

- **Width**: 184px (fits 7 round-icons at the reference's density without
  crowding "6-2" or the clock; see §2.3 for the icon math that drives this).
- **Height**: 22px (the trapezoid's tall/top edge; bottom edge is the same
  height position, only the side SLANT changes the silhouette — height is
  measured top-to-bottom of the shape's bounding box).
- **Position**: horizontally centered over the board's center X
  (`boardCenterX = board.x + board.w/2`, exactly as the current cluster
  centers itself). Vertically: top of the bar sits at
  `Math.max(1, status.y - 1)` — pinned to the very top of the status row,
  same anchor the current `roundDotsTopY` uses.
- **Trapezoid geometry**: bottom edge width = bar width (184px); each side
  slants outward by `slant = 7px` going up, so the top edge is
  `184 + 2*7 = 198px` wide. Flat top and flat bottom, straight slanted sides
  (a 4-point polygon, same construction as the current `renderRoundDots`
  banner poly, just resized to wrap the full bar instead of only the dots).
- **Corner treatment**: none needed — keep the 4-point polygon's corners
  sharp (the reference shows a very slight bevel at the top corners, but at
  this size a sharp corner reads identically; do not add radius complexity).
- **Fill**: `C.stageBarBg` (new constant, see §4) at alpha 0.93.
- **Border**: 1.5px stroke, `C.stageBarBorder` (new constant, see §4), alpha
  1, drawn on the full polygon outline — but emphasize the BOTTOM edge: draw
  a second short stroke 2px wide along just the bottom edge in the same
  color at alpha 1 (the reference's border reads heaviest along the bottom).
  Implementation: stroke the full poly at 1px/alpha 0.6, then `moveTo`
  bottom-left → `lineTo` bottom-right at 2px/alpha 1 on top.

### 2.2 Internal padding & the three zones

- Internal horizontal padding: 8px each side.
- Content width: `184 - 16 = 168px`.
- **Zone A — Stage marker**: x = `barX + 8`, width 40px (glyph 13px + 3px gap
  + "6-2" text at 12px bold, ~24px wide for two digits + hyphen).
- **Zone B — Round schedule strip**: x = end of Zone A + 6px gap, width
  = `7 icons × 14px pitch − (pitch − iconSize) = ` see §2.3 for exact pitch;
  budget 96px.
- **Zone C — Timer**: x = end of Zone B + 6px gap, right-aligned to
  `barX + 184 - 8`; width ~22px (clock glyph 11px + 2px gap + seconds text
  ~14px for 1-2 digits, optional chevron appended after, +6px if included).
- These three widths (40 + 96 + 22 = 158) plus two 6px gaps (12) = 170,
  ~= the 168px content width — close enough; treat the 168 as the budget and
  let the schedule strip (Zone B) be the flexible one if stage counts ever
  changed (they don't structurally — always 3 or 7 — so this is a one-time
  fit, not a runtime-responsive calc).

### 2.3 Round schedule strip (Zone B) — icon geometry

- One icon per round in the current stage. Count = `stage === 1 ? 3 : 7`
  (mirrors `STAGE1_LEN`/`STAGE_LEN` from rounds.ts — read via
  `stageForRound`, do not hardcode a different number).
- **Pitch** (center-to-center spacing): 13px for neutral icons. The CURRENT
  icon's slot gets 16px of pitch on each side (it's visually bigger), so
  total strip width = `(count - 1) * 13 + extra`, where `extra` accounts for
  the current icon's wider slot — simplest correct implementation: lay out
  all `count` icons at a uniform 13px pitch first (centers
  `startX + i*13`), then when drawing, only the CURRENT icon's draw size
  increases (geometry below) — neighboring icons are unaffected since they're
  drawn at their own center regardless of a neighbor's render size. This
  keeps the strip width constant and simple: `stripW = (count-1) * 13`,
  e.g. 78px for 7 icons (fits the 96px Zone B budget with room either side).
- **Neutral icon size** (upcoming or completed): 9px (matches `drawGlyph`'s
  `size` param convention — passed straight to `this.glyph(...)`).
- **Current icon size**: 13px (drawn ~1.4× larger — the focal element).
- **Vertical center**: all icons share the same `cy` = bar vertical center
  (`barY + barH/2`), EXCEPT the current icon is nudged up 1px
  (`cy - 1`) to leave clean room for the chevron beneath it without
  shrinking the chevron's gap to the bar's bottom edge.
- **Chevron** (current-round "you are here" marker): a small upward caret
  centered under the current icon, 5px wide × 3px tall, drawn as a simple
  2-segment stroke (`moveTo(cx-2.5, cy+2.5) → lineTo(cx, cy) → lineTo(cx+2.5,
  cy+2.5)`, relative to the chevron's own anchor point — i.e. an open "^"
  shape, NOT filled), 1.2px stroke weight, color `C.accentGold`. Positioned
  with its top point 2px below the current icon's bottom edge.
- **Icon color per round state** (see §5 for the exact mapping + theme
  constants):
  - Completed round (`roundNo < roundInStage`): dim grey-blue,
    `C.textMuted` at alpha 0.55.
  - Current round (`roundNo === roundInStage`): `C.accentGold`, alpha 1,
    size 13px (see above), with the chevron.
  - Upcoming round (`roundNo > roundInStage`): neutral, `C.textMuted` at
    alpha 0.85 (slightly brighter than "completed" — this is the subtle
    2-tier dimming the reference shows; both are clearly duller than gold).

### 2.4 Progress bar (beneath the stage bar)

- Separate Graphics object, NOT part of the trapezoid poly.
- Width: same as the stage bar's BOTTOM edge width, 184px, same x-origin
  (`barX`).
- Height: 4px.
- Position: `y = barY + barH + 3` (3px gap beneath the bar).
- Track: a flat rect (no taper), fill `C.stageBarTrack` (new constant)
  alpha 0.9, no border.
- Fill: a flat rect of the same height, anchored to the LEFT edge, width
  = `184 * frac` where `frac = timeLeft / PLANNING_TIMER_MS` (clamped
  [0,1] — same frac math the current radial dial already computes,
  reused verbatim). Fill color `C.stageProgress` (new constant) at alpha
  1, EXCEPT tint to `C.hpLow` when `secs <= 5` (reuse the existing
  "urgent" threshold/variable from the current dial code).
- Both track and fill use a slightly rounded end-cap only on the LEFT
  side isn't needed (it's pinned flush left) — use `roundRect` with a 2px
  radius on all corners for visual consistency with other HUD chips; at
  4px height the rounding is barely visible and harmless either way.
- During non-PLANNING phases (no countdown), render the track only at
  alpha 0.5, no fill (mirrors how the old dial showed a neutral readout).

---

## 3. Glyph plan

### 3.1 Reuse existing glyphs (no changes needed)

- **PvP round icon**: `"swords"` (existing `GlyphKind`, crossed-swords —
  already visually correct per the reference).
- **PvE (non-final) round icon**: `"gem"` (existing `GlyphKind`, faceted
  hex-diamond — already visually correct per the reference's hexagon).

### 3.2 New glyphs to add to `glyphs.ts`

Three new `GlyphKind` entries are needed: `"clock"`, `"monster"`, and
`"banner"`. Add all three to the `GlyphKind` union (in the "non-trait HUD
icons" group, alongside `coin`/`refresh`/`levelUp`/`helmet`) and to the
`drawGlyph` switch. None go in `TRAIT_GLYPH` (they're not traits).

**`"clock"`** (timer icon, Zone C):
```
case "clock":
  g.circle(cx, cy, s * 0.85);
  strokeIt();
  // hour hand (short, ~11 o'clock) + minute hand (long, ~2 o'clock)
  g.moveTo(cx, cy).lineTo(cx - s * 0.05, cy - s * 0.45);
  g.moveTo(cx, cy).lineTo(cx + s * 0.5, cy - s * 0.15);
  strokeIt();
  break;
```
Rationale: circle + two hands is the lowest-effort recognizable clock,
consistent stroke-only style with `crosshair`/`eye`. Reuses `strokeIt()`
exactly like neighboring cases.

**`"monster"`** (final-PvE/boss round icon, Zone B):
A small bat/imp silhouette — pick the bat reading (closer to the
reference's winged-creature glyph than a skull, and skull is already used
elsewhere for the `undead` trait, so reusing it here would blur two
different meanings onto one shape). Filled silhouette, no stroke, in the
same "single filled poly" style as `flame`/`bolt`/`spark`:
```
case "monster":
  // Bat silhouette: body + two swept wings, simple symmetric poly.
  g.poly([
    cx, cy - s * 0.35,                    // head top
    cx + s * 0.25, cy - s * 0.55,         // right ear
    cx + s * 0.15, cy - s * 0.25,
    cx + s,        cy - s * 0.15,         // right wingtip
    cx + s * 0.4,  cy + s * 0.1,
    cx + s * 0.55, cy + s * 0.6,          // right wing lower tip
    cx + s * 0.15, cy + s * 0.3,
    cx, cy + s * 0.55,                    // body bottom
    cx - s * 0.15, cy + s * 0.3,
    cx - s * 0.55, cy + s * 0.6,          // left wing lower tip
    cx - s * 0.4,  cy + s * 0.1,
    cx - s,        cy - s * 0.15,         // left wingtip
    cx - s * 0.15, cy - s * 0.25,
    cx - s * 0.25, cy - s * 0.55,         // left ear
  ]);
  fillIt();
  break;
```
Rationale: this is a brand-new silhouette distinct from every existing
glyph (no collision with `claw`/`eye`/`skull`), reads at 9-13px as a
compact creature shape, and matches the reference's "distinct monster
glyph" requirement without reusing a trait-owned shape.

**`"banner"`** (stage marker, Zone A) — pick the lowest-effort fit per the
prompt's own suggestion rather than inventing a fourth shape:
```
case "banner":
  // Standard-bearer pennant: a vertical pole + a small triangular flag.
  g.moveTo(cx - s * 0.55, cy - s * 0.9).lineTo(cx - s * 0.55, cy + s * 0.9);
  strokeIt();
  g.poly([
    cx - s * 0.55, cy - s * 0.8,
    cx + s * 0.75, cy - s * 0.45,
    cx - s * 0.55, cy - s * 0.1,
  ]);
  fillIt();
  break;
```
Rationale: cheapest possible new shape (one line + one small triangle),
reads instantly as "stage marker/banner" at 13px, and avoids overloading
`helmet` (already reserved per its own comment for a future per-player
icon — repurposing it here would conflict with that documented intent).

All three follow the file's existing conventions exactly: `s = size/2`,
`strokeIt()`/`fillIt()` closures, Pixi v8 path API only (`poly`/`circle`/
`moveTo`/`lineTo`), no new helper functions needed.

### 3.3 Round → glyph mapping (data-driven, no new rules logic)

For `roundNo` in `1..roundsInStage` (where `roundsInStage = stage === 1 ? 3
: 7`, matching `STAGE1_LEN`/`STAGE_LEN`):
- Compute the absolute match round this slot represents:
  `absRound = roundNo` when `stage === 1`, else
  `absRound = STAGE2_START + (stage - 2) * STAGE_LEN + (roundNo - 1)`
  — i.e. reuse the inverse of `stageForRound`'s own arithmetic (the bar
  needs to know each slot's PvE-ness, and `isPveRound` takes an absolute
  round). Simplest robust implementation: don't hand-roll the inverse —
  iterate `for (let r = stageStartRound; r <= stageStartRound + roundsInStage
  - 1; r++)` where `stageStartRound` is derived once by walking
  `stageForRound` backward from the CURRENT round
  (`state.round - (roundInStage - 1)`), then call `isPveRound(r)` per slot.
  This is still a pure read of existing exports, zero new rules code.
- icon kind per slot:
  - `!isPveRound(absRound)` → `"swords"`.
  - `isPveRound(absRound) && roundNo !== roundsInStage` → `"gem"`.
  - `isPveRound(absRound) && roundNo === roundsInStage` → `"monster"`
    (the LAST round of the stage; in stage 2+ this is roundInStage 7,
    always PvE per the structural formula, so this condition is
    equivalent to but more robust than hardcoding `roundInStage === 7`).
- This reproduces swords,swords,swords,gem,swords,swords,monster for any
  stage 2+ (7 rounds: PvP×3, PvE, PvP×2, PvE-final) and
  gem,gem,monster for stage 1 (3 rounds, all PvE, last one boss-flavored) —
  matching the reference's swords/swords/swords/gem/swords/swords/boss
  layout exactly for a 7-round stage.

---

## 4. New theme constants

Add to `theme.ts` inside the `C` object (no hex anywhere else — these are
the ONLY new literals this feature introduces). Suggested placement: a new
"Stage bar (top-center round/timer indicator)" section near the stage-2 HUD
block.

```ts
// ─── Stage bar (top-center round/timer indicator) ─────────────────────────
stageBarBg:      0x16302c,  // dark translucent teal-green glass panel
stageBarBorder:  0xc9a24a,  // gold/bronze rim — reuses the itemFrame hue family
stageBarTrack:   0x0a1210,  // near-black progress-bar track
stageProgress:   0x4fd6c8,  // bright teal/cyan progress fill (distinct from accentGold)
```

Rationale:
- `stageBarBg` is a new dark teal distinct from the existing blue-leaning
  `panelBg`/`surfaceFloat` — the reference's panel reads distinctly
  green-teal, not the cool blue-grey used elsewhere in the HUD, so reusing
  `panelBg` would mismatch the reference's color identity.
- `stageBarBorder` intentionally reuses the SAME hue family as `itemFrame`
  (`0xc9a24a`, the gilded item-frame gold) rather than `accentGold`
  (`0xf2ca58`, the brighter UI-accent gold) — the reference's border is a
  duller bronze, not the bright accent gold used for buttons/CTAs, and
  reusing `itemFrame`'s exact value keeps the project's "two golds" split
  (per the legibility-pass notes in CLAUDE.md: `accentGold` vs `textGold`)
  from growing a third near-duplicate. `accentGold` is still correctly
  reused for the current-round icon + chevron (a UI-accent highlight, not
  a panel border).
- `stageProgress` is a new teal/cyan distinct from `xpArcFill`
  (`0x36c8b4`) and `manaBlue`/`fxAbilityShield` — close in hue to
  `xpArcFill` intentionally (both are "progress fill" cyans) but kept
  separate so the stage bar's color isn't silently coupled to the XP
  button's and can be retuned independently later.
- `stageBarTrack` is a near-black distinct from `xpArcTrack`/`bgOverlay`
  for the same reason — independent retunability, not a hidden dependency.

Existing constants reused as-is (no additions): `C.accentGold` (current
icon + chevron + clock-glyph hands... see §5 below for exact assignment),
`C.textMuted` (dim/neutral icons), `C.textPrimary` (the "6-2" label,
seconds number), `C.hpLow` (urgent-timer tint, reused exactly as the old
dial did).

---

## 5. State → color/scale mapping (per round icon)

| Round state | Color | Alpha | Size | Chevron |
|---|---|---|---|---|
| Completed (`roundNo < roundInStage`) | `C.textMuted` | 0.55 | 9px | none |
| Current (`roundNo === roundInStage`) | `C.accentGold` | 1.0 | 13px | yes, `C.accentGold` |
| Upcoming (`roundNo > roundInStage`) | `C.textMuted` | 0.85 | 9px | none |

Stage marker (Zone A): glyph `"banner"` always `C.textPrimary` (matches the
reference's plain white), size 13px; "6-2" text 12px bold-weight via
`fontWeight: "700"` in the `PIXI.Text` style override (the shared `text()`
helper doesn't expose a weight param — either add an optional weight arg to
`text()` defaulting to `"400"`, or construct the Text node inline here; the
former is preferred for consistency, see §7), color `C.textPrimary`.

Timer (Zone C): clock glyph `"clock"` always `C.textPrimary` (not gold —
the reference shows it in the same white as the stage label, only the
progress-bar fill and current-round icon get the accent treatment); seconds
text 12px bold, `C.textPrimary` normally, `C.hpLow` when `secs <= 5`
(reuse the existing `urgent` boolean verbatim from the current dial code).

---

## 6. Component placement: replaces, layout, Skip button

- **Removes entirely**: `renderRoundDots` (the dots/diamond banner) and the
  stage-caption + radial-dial block inside `renderHud` (lines ~855–918:
  the `stage`/`roundInStage` derivation stays — same `stageForRound` call —
  but everything drawing the caption text, the dial circle/arc, and the
  dial's m:ss text is deleted and replaced by one call to the new
  `renderStageBar(boardCenterX, status.y, state)` method).
- **New method** `renderStageBar(centerX, statusY, state)` draws, in order,
  into `this.hudLayer` (same layer the old cluster used): trapezoid bg →
  border → Zone A (banner glyph + "6-2") → Zone B (7 round icons + current
  chevron) → Zone C (clock glyph + seconds [+ optional end-cap chevron]) →
  progress-bar track + fill underneath. Keep the existing
  `this.planningTimerText` field assignment (pointing at the new seconds
  `PIXI.Text` node) since other code may reference it for live ticker
  updates (`startPlanningTimerTick` — verify this call site and repoint it
  at the new text node; do not leave it null).
- **Static layout helpers**: replace `roundDotsTopY`/`roundDotsClusterY`
  with two equivalents sized to the new bar: `stageBarTopY(statusY) =
  Math.max(1, statusY - 1)` and `stageBarBottomY(statusY) = stageBarTopY +
  22 (bar) + 3 (gap) + 4 (progress bar)` = `stageBarTopY + 29`. The Skip
  button (`renderSkipButton`) repositions to
  `y = MatchScene.stageBarBottomY(status.y) + 4` (4px gap below the
  progress-bar capsule) — same x-centering over the board it already uses,
  unchanged width/height/styling.
- **Landscape**: the bar is NOT full-width-status-row bound; it's a
  fixed-width (184px) floating component centered over
  `regions.board`'s center X, same as portrait — so no separate landscape
  variant is needed beyond reusing the same `boardCenterX` the landscape
  layout already computes for its own status cluster. Confirm at
  implementation time that 184px fits inside the landscape status row's
  available width (it does — landscape's status row spans the full
  center-column width above the board, which is ≥390px in every supported
  landscape design size).
- **Pause button** (`renderPauseButton`) is unaffected — it's anchored to
  `status.x + 6`, independent of this component, and sits far enough left
  of the centered 184px bar to never overlap at any supported width down
  to the 360px floor (184/2 = 92px half-width from center; on a 360-wide
  portrait design the bar's left edge is at `180 - 92 = 88px`, comfortably
  clear of the pause button's `6..36px` span).

---

## 7. Implementation notes / open calls (resolve in code review, not blocking)

- The reference's trailing chevron after the timer number (end-cap
  flourish) is decorative and adds no information; implement it only if
  trivial (one more 5×3px caret using the same draw code as the
  current-round chevron) — omitting it is an acceptable simplification and
  does not deviate from the spec's intent.
- `text()` helper needs an optional bold-weight param (or a sibling
  `boldText()` wrapper) for "6-2" and the seconds readout — both must be
  visually bold per the reference. Cheapest path: add a 6th optional param
  `weight: string = "400"` to the existing `text()` signature (default
  preserves every existing call site) rather than introducing a new
  method.
- Per-frame rebuild: like the old dial, rebuild the whole bar every
  `render()` pass (driven by `startPlanningTimerTick`) — it's cheap
  Graphics/Text recreation already proven by the existing dial code, no
  new perf concern.
- Reduced-motion: this component has no animation (no tweening — it's a
  data-driven redraw exactly like the dial it replaces), so it needs no
  reduced-motion branch.
- No new game logic anywhere: every value drawn (`stage`, `roundInStage`,
  `roundsInStage`, per-slot PvE-ness, `timeLeft`, `frac`, `urgent`) is
  either already computed in the current code or a direct pass-through of
  `stageForRound`/`isPveRound`/`getPlanningTimeLeft`/`PLANNING_TIMER_MS`.

---

## 8. Handoff

→ coder: implement `renderStageBar` per §2–6 in
`/Users/azat/Desktop/autobattler/packages/client/src/scenes/match.ts`
(replacing `renderRoundDots` + the dial/caption block in `renderHud`,
repositioning `renderSkipButton`); add `"clock"`/`"monster"`/`"banner"` to
`/Users/azat/Desktop/autobattler/packages/client/src/glyphs.ts` per §3.2;
add the four new constants to
`/Users/azat/Desktop/autobattler/packages/client/src/theme.ts` per §4.
→ state-scribe: record spec completion.
