# Lobby — Screen Reconstruction Bible

Source reference: `references/lobby.png` (3840×2160 capture of a third-party game's pre-match lobby screen; reconstructed here only as a STRUCTURAL/LAYOUT reference — see DO-NOT-REPRODUCE).

Target: our 8-player PvP auto-battler, DOM meta-screen layer (`packages/client/src/ui/app.ts` + `styles.ts`), themed via `packages/client/src/theme.ts` CSS vars. Reached from Mode Select after Practice is confirmed (selecting Practice or pressing PLAY on `references/mode-select.md` navigates here). This screen represents the **solo Practice lobby** — only the local player's slot is filled; the other 7 are empty visual placeholders (no real bot-fill preview at this stage, per the adaptation note below).

Design canvas: landscape-first, same conventions as mode-select.md (safe-area-padded `#ui-root` content area, existing `@media (orientation: landscape)` responsive pass in `styles.ts`).

---

## TOP BAR

Full-width strip pinned to the top of the content area, height = **9% of viewport height** (`grid-template-rows: 9% 1fr`, matching Mode Select). Same flat dark strip language as the mode-select top bar's structural role, but with DIFFERENT left content — this is effectively a sub-header, not the identity bar.

> **Implemented layout is fully fluid (no fixed px / no `min-*` floors).** The shipped lobby sizes everything off the viewport: `.lobby-screen` grid `9% 1fr`; the content is a CSS grid `grid-template-columns: 29% 1fr 29%` with `column-gap: 5.5%` (left/right columns pinned to **29% of content width**, **5.5% gutters**); each column is a flex stack with **`gap: 4.5%`** (inter-slot vertical gap, of content-row height). Derived slot proportions: **empty "+" slot aspect 2.8:1** (tightened from 2.2:1, `aspect-ratio: 2.8/1`, `width:100%` of its column); **filled local-player card aspect 1:1.2** (shallower than the old 1:1.35 so the 2-cell center column — filled card + one empty slot — fits without clipping); the card's **avatar ring = 30% of card width**, **crown badge = 17% of the card box**. The two bottom controls stay fluid and `vh`-based: **X close button `9vh` square**, **START pill `9vh` tall × `28vh` wide**. Portrait fallback stacks the columns (`grid-template-columns: 1fr`, scrollable) with `8vh`/`26vh` bottom controls. All colors via `cssVar(...)`. This replaces the prior fixed-px / `vh`-with-`min-*`-floor scale-to-fit approach.

### Left: back-arrow button
- Anchor: far left, ~16px inset from the left safe-area edge, vertically centered in the bar. Shape: rounded-rect button (NOT circular — distinct from the mode-select identity avatar), width ≈ 2× height, height ≈ 70% of bar height. Contains a left-pointing double-chevron (‹‹) or single chevron glyph, centered.
- Reuses our existing `.ui-btn-back` component pattern (`"‹ Back"` glyph+label combo already used in `wrap(..., withBack=true)`), styled to match this bar's slightly more ornate framing (a distinguishing border/background separates it from the plain-text back link used elsewhere).
- **States**:
  - Default: glyph + button background visible, `chipBorder` outline.
  - Hover: brightness lift (`filter: brightness(1.08)`).
  - Pressed: `transform: scale(0.98)`, `filter: brightness(0.88)` (existing `.ui-btn:active` convention).
  - Always enabled on this screen (back navigation is always available).
- **Behavior**: navigates back to Mode Select (`references/mode-select.md`). Functionally identical destination to the bottom-left X button (see BOTTOM BAR) — both exit the lobby without starting a match.

### Center-left: mode title
- Anchor: immediately right of the back button, ~24px gap, vertically centered. Text: "PRACTICE", ALL CAPS, bold, large (reads as the screen's primary heading — same visual weight as the mode-select card name bands).
- Typography: existing DOM meta font stack, ~20-24px, bold, `textPrimary`.
- No interactive states — static label. [REPLICATE structure — generic mode-name heading]

### Right: currency pill + icon row
- **Identical structure and position to the mode-select top bar's right cluster** — same currency pill (gem glyph + numeric value) + 4-icon row, same spacing/sizing rules. Reuse the exact same component from mode-select for visual continuity across the two screens (per the brief's note: "SAME as mode-select").
- See mode-select.md's TOP BAR section for full state/sizing spec — do not duplicate divergent behavior here; this is the same shared component instance pattern.

---

## MAIN CONTENT

A 3×3 grid of 8 player slots (one of the 9 grid cells — center-middle — is occupied by the local-player's larger card, displacing what would be a 9th slot; the reference's grid reads as 3 columns × 3 rows = 9 cells, with the CENTER cell being the local player's filled slot and the remaining 8 cells split as: left column (3 cells), right column (3 cells), and center column's TOP and BOTTOM cells (2 cells) as empty "+" slots — totaling 3+3+2 = 8 empty slots... but the brief specifies "8 player slots" total with the local player's slot being ONE of the 8, and the layout brief explicitly states "left column 3, center column 2, right column 3." This confirms: center column has only 2 slots VISIBLE as grid cells alongside the local player's card, OR the local player's card occupies one of the center column's 3 row-slots and there are only 2 OTHER center-column slots. Matching the reference image exactly: the center column has 3 row positions total (top/middle/bottom); the MIDDLE one is the local player's filled card, top and bottom are empty "+" slots. So center column = 1 filled + 2 empty = 3 cells, matching left/right columns' 3 cells each. Total grid = 9 cells = 8 player slots... but an 8-player match has exactly 8 seats. Resolving against the reference image directly: there are 8 total rounded-rect cells visible (3 left + 2 center + 3 right), and the local player's filled card is INSET INTO the center column spanning where a slot would be, visually larger/taller than the empty slots and vertically centered in the content region — it is the 8th slot, sized larger because it's the only filled/detailed one. Use this as ground truth: 7 empty "+" slots (3 left col + 2 center col-flanking + ~~no~~, see grid spec below) + 1 filled local-player slot = 8 total seats.

**Grid ground truth (read directly off `references/lobby.png` pixel layout)**:
- **Left column**: 3 empty slots, stacked vertically, evenly spaced, anchored left third of the content width.
- **Center column**: 1 filled local-player card, vertically centered in the content region, taller than the empty slots (spans roughly the same vertical area as 1.3-1.5 empty-slot-heights to fit its richer content).
- **Right column**: 3 empty slots, stacked vertically, evenly spaced, anchored right third of the content width — mirrors the left column exactly.
- **Total empty slots**: 6 (3 left + 3 right). **Total filled slots**: 1 (center). **Grand total**: 7 visible slot cells in this specific reference frame.

Per the brief's explicit instruction ("a 3-wide grid of 8 player slots (left column 3, center column 2, right column 3)"), our BUILD targets **8 total slots**: left column 3 empty, **center column 2 cells** (one filled = local player, one empty = a remaining center slot), right column 3 empty. This reconciles the brief's "8 player slots" instruction with the reference's visual (which shows the center column's second cell implicitly, or compressed) — **follow the brief's explicit grid spec for our implementation**: left 3 / center 2 (1 filled + 1 empty) / right 3 = 8 total seats for an 8-player match.

> **Center column order: filled card on TOP.** The center column's two cells are `[localCard, emptySlot]` — the filled local-player card renders **first (top-center)** of the column, with the single empty "+" slot directly below it (this was swapped from the earlier `[emptySlot, localCard]` ordering so the player's own card sits at the top-center of the column).

### Empty slot ("+") — 7 instances (3 left, 1 center, 3 right)
- **Anchor**: per-column vertical stack, evenly spaced with consistent gaps (~16-24px) between cells in the same column; columns spaced evenly across the content width with generous gutters on either side of the center column.
- **Shape**: rounded-rect, corner radius (fluid `0.8vmin`), aspect ratio **2.8:1** (wide, short — tightened from the earlier 2.2:1) — same shape for every empty slot regardless of column.
- **Size**: `width: 100%` of its column (≈29% of content width, so 3 columns + 5.5% gutters fit); height derives from the 2.8:1 aspect ratio. Inter-slot vertical gap within a column = 4.5% of the content-row height. No fixed-px / `min-*` floor.
- **Visual**: faint/translucent rounded-rect outline + very subtle fill (barely-there surface, reads as "empty container" not "card"), with a centered "+" glyph (plus sign), medium size, low-opacity.
- **States**:
  - Default: faint outline + faint "+" glyph as described — this is the ONLY state in our solo-Practice build, since these slots are PURE VISUAL PLACEHOLDERS (per the adaptation note: "the 7 '+' slots are visual placeholders"). They represent the other 7 seats that AI bots will fill once the match starts, but no bot identity/avatar is shown here pre-match.
  - Hover/Pressed: **none** — not interactive. These slots must not respond to pointer input in our build (no tap target, no cursor change, no tooltip). Document explicitly for coder: do not wire any click handler to these cells.
  - Disabled: N/A (same as "no interactive state" — there's nothing to disable since there was never an enabled state).

### Filled slot — local player (1 instance, center)
- **Anchor**: center column, **TOP cell** (renders first, above the column's single empty "+" slot). The column is flex-centered, so the filled-card + empty-slot pair sits centered in the content region as a unit.
- **Shape**: rounded-rect card, larger/taller than the empty slots — width = 100% of the center column (≈29% of content width, same as an empty slot's width) with **aspect ratio 1:1.2** (shallower than the old 1:1.35 so the 2-cell center column fits without clipping), corner radius (fluid `0.8vmin`), with a visible `accentGold` border (distinct from the empty slots' faint outline — this one reads as a populated, designed card). Internal sizing is fluid: avatar ring 30% of card width, crown badge 17% of the card box, board preview 78% of card width.
- **Internal structure** (top to bottom):
  1. **Circular avatar** — anchor: top-center of the card, ~12-16px inset from the card's top edge. Shape: perfect circle, diameter ≈ 28-32% of the card's width. Ring: visible colored border (gold/accent ring in the reference). [REPLICATE structure + use a REAL existing asset, see below]
     - **Use an existing avatar asset** from `packages/client/src/assets/avatars/` rather than recreating the reference's creature avatar. Recommend `01_Whiskers_common.png` (the first/common-tier registry entry, a neutral default-feeling choice for "local player, no selection made yet") — or, if a neutral non-creature placeholder is preferred instead of a themed avatar, a flat circle filled with `surfaceFloat` and a generic silhouette glyph. **Coder's call between these two options; both are spec-compliant.**
     - States: default only (static display on this screen; avatar selection, if it exists as a feature, would be a different screen/flow not in scope here).
  2. **Username text** — anchor: directly below the avatar, centered, ~8px gap. Typography: existing DOM meta font stack, ~14-16px, regular/medium weight, `textPrimary`. Shows the live player profile name (or "Guest" for an unauthenticated/offline session per the existing auth model). [REPLICATE structure — live data, not copyrighted]
  3. **Arena/board preview thumbnail** — anchor: below the username, centered, occupying the lower portion of the card. Shape: rounded-rect (smaller corner radius, ~4-6px), aspect ratio ≈ 16:10 (wide), width ≈ 75-80% of the card's width. Contains, per the reference, a SPLIT composition: left half shows a small creature/board-icon thumbnail with a small grid/menu glyph overlapping its bottom-right corner, right half shows a separate texture/terrain swatch. [COPYRIGHTED -> placeholder, see PLACEHOLDER section — this entire thumbnail's content (board skin preview + companion/creature preview) is third-party art]
     - In our build: this thumbnail has no corresponding feature yet (no board-skin/cosmetic system exists in our data model). Stub as a single flat placeholder rect with a neutral icon (e.g. a simple hex-grid glyph suggesting "board preview") — do NOT split it into two halves with distinct creature/terrain art since neither concept exists in our game yet. Simplify to ONE flat stubbed thumbnail.
     - States: default only, non-interactive (no tap target — purely decorative/informational in our build, since there's no cosmetic system to open).
  4. **Crown/leader badge** — anchor: top-left corner of the card, overlapping the corner (badge center sits ON the corner, like the mode-select checkmark badge convention). Shape: small badge, ~32-40px, containing a crown glyph. [COPYRIGHTED -> placeholder for the exact crown art; REPLICATE structure for badge position/role]
     - **Meaning in our build**: since this is solo Practice (no real lobby leader concept — there's only one human seat), this badge is decorative/optional. If kept, it should read as "this is you / the host" rather than a competitive-leader signal. Recommend keeping it as a simple generic crown-or-star glyph in `accentGold`, OR omitting it entirely if it implies a multiplayer-lobby-host mechanic we don't have. **Coder's call**; if kept, use our own procedural glyph, never the reference's exact crown art.
     - States: default only, non-interactive, purely a badge/label.
- **States for the filled slot card as a whole**:
  - Default: as fully described above — this is the ONLY state shown/needed in solo Practice (the local player's slot is always present and always "ready," there's no toggle-ready mechanic visible in the reference for this slot).
  - Hover/Pressed: not applicable — the card is not a button (no navigation/action happens from tapping your own lobby card). If a future feature (e.g. avatar picker) hangs off this card, add hover/press affordance then; out of scope now.

---

## BOTTOM BAR

A slim region at the very bottom of the content area, holding two large circular/pill controls at opposite corners.

### Bottom-left: X (close/cancel) button
- **Anchor**: far bottom-left, ~16-24px inset from the left/bottom safe-area edges.
- **Shape**: perfect circle, diameter ≈ 9-10% of viewport height (a large, easily-tappable circular button — well above the 44px touch-target minimum already established as this codebase's floor for HUD controls).
- **Visual**: dark fill, visible ring border (gold/bronze accent ring in the reference), centered "X" glyph.
- **States**:
  - Default: dark fill + accent ring + X glyph as described.
  - Hover: brightness lift (`filter: brightness(1.08)`), ring brightens slightly.
  - Pressed: `transform: scale(0.98)`, `filter: brightness(0.88)`.
  - Always enabled.
- **Behavior**: returns to Mode Select (`references/mode-select.md`) — same destination as the top-bar back-arrow button. Cancels the lobby without starting a match.

### Bottom-right: START button
- **Anchor**: far bottom-right, ~16-24px inset from the right/bottom safe-area edges.
- **Shape**: large horizontal pill/chevron-capped rect (right edge comes to a shallow outward-pointing chevron point), height ≈ 9-10% of viewport height, width ≈ 22-26% of viewport width — same component family as the mode-select PLAY button (reuse that component, different label).
- **Visual**: dark/saturated blue-toned fill with a bright cyan glow rim outline (per the reference's glow treatment) — substitute with our existing closest token (see mapping below, this is an approximation note).
- **States**:
  - **Default/enabled**: ALWAYS enabled in our solo-Practice build (no "waiting for other players" gate exists — Practice starts immediately against AI bots filled server/client-side at match start, not a real lobby-ready-check). Fill + glow rim + "START" label, ALL CAPS, bold, centered, bright/legible text color.
  - Hover: brightness lift.
  - Pressed: `transform: scale(0.98)`, brightness dip.
  - Disabled: N/A in this build (always enabled the moment the lobby renders, since it's solo).
- **Behavior**: launches the Practice match — navigates into the actual `MatchScene` (Pixi canvas takes over via `UiApp.enterMatch(...)`, per `app.ts`). This is the terminal action of the pre-match flow; the 7 "+" placeholder slots become AI-bot seats once the match's `LocalDriver` constructs the real `MatchState` (the lobby screen itself never queries/displays bot identity — that's out of scope for this static pre-match screen).

---

## Navigation summary

- Top-bar back-arrow → Mode Select.
- Bottom-left X → Mode Select (same destination, alternate affordance).
- Bottom-right START → launches Practice match (Pixi `MatchScene`, via `onStartMatch("local")`).
- The 7 empty "+" slots and the local-player filled card are non-interactive display elements; no navigation hangs off any grid cell.

---

## Color / Zone Mapping (theme.ts tokens only)

| Region / Element | Token(s) | Notes |
|---|---|---|
| Screen background | `bgPage` (= `surfaceBase`) | Reference's painted sky/cherry-blossom background is placeholder-only (see PLACEHOLDER). |
| Top bar background | `bgHud` (= `surfaceRaise`) | Same flat strip as mode-select. |
| Back-arrow button fill | `bgPanelRaise` (= `surfaceFloat`) | |
| Back-arrow button border | `chipBorder` | |
| Back-arrow glyph | `textPrimary` | |
| Mode title text ("PRACTICE") | `textPrimary` | Bold heading weight. |
| Currency pill / icon row | Same as mode-select.md mapping | Shared component instance. |
| Empty slot outline | `borderSubtle` | Faint/translucent. |
| Empty slot fill | `surfaceRaise` at reduced opacity (or `bgShopEmpty`-equivalent feel — closest literal token is `surfaceRaise`, dimmed via CSS opacity since there's no separate "empty slot" token defined) | **Approximation**: no dedicated "empty lobby slot" token exists; `surfaceRaise` + opacity reduction is the closest real-token match. |
| Empty slot "+" glyph | `textDimmed` | |
| Filled (local player) card surface | `surfaceOver` | Topmost/most-prominent card surface, consistent with modal/featured-card usage elsewhere (`bgInspect`/`bgScout` alias `surfaceOver`). |
| Filled card border | `accentGold` or `chipBorder` | Recommend `accentGold` to read as "this is you" / the active seat, echoing the Practice card's selected-gold-border language from mode-select. |
| Avatar ring | `accentGold` | |
| Username text | `textPrimary` | |
| Arena/board preview thumbnail surface (stub) | `surfaceFloat` | Single flat placeholder, no split composition. |
| Arena preview placeholder glyph | `textMuted` | |
| Crown/leader badge fill (if kept) | `accentGold` | |
| Crown/leader badge glyph ink | `surfaceBase` | Dark-on-gold contrast, mirrors mode-select's checkmark badge convention. |
| Bottom-left X button fill | `bgCloseBtn` (= `surfaceFloat`, desaturated red tint per its existing definition) | Closest existing "close/cancel" themed token. |
| Bottom-left X button ring | `accentGold` | |
| Bottom-left X glyph | `textPrimary` | |
| Bottom-right START button fill | `bgContinue` | Existing dark-green "continue/confirm" surface token — **approximation**: the reference's fill reads blue-toned, but `bgContinue` is this codebase's only existing "primary forward-progress button" surface token outside `accentGold`; using it keeps the action legible as "confirm/proceed" without inventing a new token. Alternative: use `accentGold` fill to match the PLAY button on mode-select for stronger visual continuity between the two primary CTAs — **coder's call**, both are real-token-compliant. |
| Bottom-right START button glow rim | `stageProgress` | Closest existing bright teal/cyan token (same approximation as mode-select's PLAY button rim). |
| Bottom-right START label | `textPrimary` (if fill is dark) or `surfaceBase` (if fill is `accentGold`) | Verify ≥4.5:1 contrast against whichever fill is chosen. |

No hex literals anywhere in implementation — all colors resolve via `cssVar(key)`.

---

## DO-NOT-REPRODUCE (copyrighted assets visible in `references/lobby.png`)

- The little-legend/tactician creature avatar shown in the local-player slot's circular avatar AND in the arena-preview thumbnail (the blue horned spirit-fox creature, "cherwood").
- The penguin mascot character (if/where it recurs in this screen's surrounding chrome).
- The arena/board-skin preview art — specifically the cherry-blossom sky scene, the desert/rocky terrain swatch shown split inside the local-player card's preview thumbnail, and any other skin/cosmetic background art.
- The exact currency gem icon glyph (shared with mode-select — same DO-NOT-REPRODUCE entry applies).
- The exact icon glyph art for the top-bar icon row (shared with mode-select).
- The exact crown badge icon art on the local-player card's top-left corner.
- The exact grid/menu glyph overlapping the avatar-preview thumbnail's bottom-right corner.
- Any gold filigree/ornate chrome decorative treatment (gilded card corners, ornate button bevels, the textured/painted parchment-style background wash) — our build uses flat `cssVar`-driven surfaces, never painted ornamentation.
- The cherry-blossom tree branches and pink-flower particle decoration framing the lobby's edges.

## PLACEHOLDER (what to stub, and with which theme surface token)

| Reference element | Our stub | Theme token for the stub surface |
|---|---|---|
| Screen background (painted arena scene) | Flat solid fill, no illustrated background | `bgPage` |
| Local-player avatar | Real existing asset `packages/client/src/assets/avatars/01_Whiskers_common.png` (or a flat placeholder circle with a generic silhouette glyph — coder's choice) | `surfaceFloat` (if using the flat-circle option) |
| Arena/board preview thumbnail | Single flat placeholder rect with a generic hex-grid glyph (no split creature/terrain composition) | `surfaceFloat` |
| Crown/leader badge (if kept) | Generic crown or star glyph from our own procedural glyph set | `accentGold` fill |
| Top-bar currency gem icon | Shared stub with mode-select (generic diamond/gem glyph) | rendered in `accentGold` ink |
| Top-bar icon row | Shared stub with mode-select (only build icons with real destinations) | `bgPanelRaise` on hover |
| 7 empty "+" slots | Flat faint rounded-rect, no art, no asset needed | `surfaceRaise` at reduced opacity |
