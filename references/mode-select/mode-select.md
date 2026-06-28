# Mode Select — Screen Reconstruction Bible

Source reference: `references/mode-select.png` (3840×2160 capture of a third-party game's mode-select screen; reconstructed here only as a STRUCTURAL/LAYOUT reference — see DO-NOT-REPRODUCE).

Target: our 8-player PvP auto-battler, DOM meta-screen layer (`packages/client/src/ui/app.ts` + `styles.ts`), themed entirely via `packages/client/src/theme.ts` CSS vars (`cssVar(...)`, never raw hex). This screen sits between Main Menu and Lobby in the nav stack (a new `ScreenId`, e.g. `"modeSelect"`).

Design canvas: landscape-first (this screen is reached from Play on the Main Menu, which is already landscape-oriented per `app.ts`/`styles.ts`'s landscape responsive pass). Build mobile-portrait-safe per the existing `@media (orientation: landscape)` / safe-area conventions in `styles.ts`, but the reference composition is landscape so all coordinates below are landscape-relative percentages of the screen viewport (`#ui-root` content area, safe-area-padded).

---

## TOP BAR

Full-width strip pinned to the top of the content area. Height = **9% of viewport height** (`grid-template-rows: 9% 1fr`; bumped from 8% to bank a little extra headroom for the diamond-badge overhang below the cards). Dark, flat, no border — a single horizontal `.ui-row`-style container, NOT a card (no rounded corners, spans edge-to-edge).

> **Implemented layout is fully fluid (no fixed px).** The current build sizes Mode Select entirely off the viewport: the `.ms-screen` grid is `9% 1fr` (top bar / content), the top bar fills `height:100%`, and the content region uses a nested-flex height chain so the cards derive their size from a true percentage of the viewport with no `vh`/`px` floor and no `min-width`/`min-height`. Derived proportional relationships now in use: **top bar 9% vh**; **card row height ≈ 80% of the content region** (leaving headroom for the badge overhang, `padding-block: 2%` on `.ms-content`); **card aspect 2:3** (`aspect-ratio: 2 / 3`, height-driven so card height = `100%` of the row); **gap between the two cards ≈ 6% of a card's width** (`gap: 6%` on the centered flex row); **diamond mode-glyph badge = 22% of the card box** (`width/height: 22%` against the `position:relative` card, straddling its bottom edge). Portrait fallback keeps the two cards side-by-side via the same rules (`.ms-card-row { height: 60%; gap: 4% }`). All colors via `cssVar(...)`.

### Left cluster: identity
- **Avatar circle** — anchor: far left, vertically centered in the bar, ~16px inset from the left safe-area edge. Shape: perfect circle, diameter ≈ 64% of bar height. Ring: 2px border. [REPLICATE structure]
  - States: default only (no hover/press — not interactive on this screen, it's a read-only identity chip). If made tappable in our build (e.g. opens Profile), add a hover brightness-lift + active scale-dip per the existing `.ui-btn:active { filter: brightness(0.88); transform: scale(0.98); }` convention.
- **Username text** — anchor: immediately right of the avatar, ~12px gap, vertically centered. Typography: existing DOM meta font stack (`ui-monospace, Menlo, Consolas, monospace`), ~16px, regular weight, primary text color. [REPLICATE structure — actual string is the live player profile name, not copyrighted]

### Right cluster: currency + icon row
- **Currency pill** — anchor: right side, left of the icon row, ~20px gap between pill and first icon. Shape: full-pill (fully rounded rounded-rect, height ≈ bar height × 0.55). Contents: a small diamond/gem glyph + numeric value, left-aligned glyph then number, ~8px internal padding. [COPYRIGHTED -> placeholder for the gem icon art; REPLICATE structure for the pill shape/numeric readout]
  - Default state only on this screen (display-only, not a button).
- **Icon row** — anchor: far right, ~16px inset from right safe-area edge. 4 square icon buttons in a horizontal row, each ~bar-height × 0.6 square, evenly spaced ~12px gaps, no visible button background at rest (icon-only). [COPYRIGHTED -> placeholder for the exact glyph art (profile/inventory/notifications/settings icons in the reference); REPLICATE structure for the row layout + hit-target sizing]
  - Default: icon at `textMuted` or `textPrimary` opacity, no background.
  - Hover: icon background fades in as a soft rounded-square chip (`bgPanelRaise` tint) behind the glyph.
  - Pressed: `filter: brightness(0.88); transform: scale(0.98)` (existing `.ui-btn:active` convention).
  - In our build only the rightmost icon needs to be live (Settings, navigating to the existing Settings screen); the others may render as inert placeholders or be omitted entirely if no corresponding feature exists yet — note for coder: implement only what has a real destination, never a dead-end tap target.

---

## MAIN CONTENT

Centered region beneath the top bar, occupying the bulk of the viewport (roughly the middle 75% of height, full width minus side margins).

### Left vertical rail (OPTIONAL — omit in our build)
The reference shows a column of circular category-filter icons (flag/trophy/coins/helmet) down the far left edge, vertically centered, ~3 icons visible, evenly spaced ~24px gaps, each a circle ~56px diameter with a thin ring border. **This rail has no function in our two-mode layout (Practice/PvP) — there's nothing to filter.** [REPLICATE structure — but DO NOT BUILD: explicitly omitted from our implementation since we only ever show 2 cards with no categorization need. Documented here only so a future reviewer understands why the reference's rail has no counterpart.]

### Centered card row — TWO CARDS (adapted from the reference's three)
Anchor: horizontally centered as a group in the main content region, vertically centered with a slight upward bias to leave room for the mode-glyph badges below each card. The two cards sit side by side with a fixed gap between them (~32px at this scale), NOT stretched to fill — the pair as a whole is centered, mirroring the reference's centered card cluster.

Each card:
- **Shape**: tall rounded-rect, aspect ratio **exactly 2:3** (width:height, `aspect-ratio: 2 / 3` — preserved), corner radius (fluid `1.2vmin`).
- **Size**: card height = 100% of the card row (`.ms-card-row`, itself ≈ 80% of the content region's height); width derived from the 2:3 aspect ratio. No fixed-px / `vh` / `min-*` floor — the height is a pure percentage chain down from the viewport.
- **Structure** (top to bottom, all one card body):
  1. **Art region** — top ~75% of the card height. [COPYRIGHTED -> placeholder, see PLACEHOLDER section]
  2. **Name band** — bottom ~25% of the card height, a darkened/scrim overlay strip distinct from the art region above it, containing the mode name in ALL CAPS, centered horizontally, bold weight, large size (reads as the card's primary label).
  3. **Border** — a full-card-perimeter border, see per-card color states below.
- **Mode-glyph badge** — anchor: centered horizontally below the card, vertically straddling the card's bottom edge (badge top half overlaps the card, bottom half hangs below it — diamond shape touches down past the card boundary). Shape: 45°-rotated square (diamond), ~56px point-to-point. Contains a small centered glyph representing the mode (crossed-swords for Practice, a rank/crest glyph for PvP). [COPYRIGHTED -> placeholder for exact glyph art; REPLICATE structure for diamond shape/position — same diamond-badge language already used in our trait/tier chips per `ui-diamond` in `app.ts`'s How-to-Play motifs, so reuse that existing component]

#### Card 1 — "PRACTICE"
- **Default/current state: the only selectable, enabled card.** Clicking it is the screen's primary proceed action.
- Border: `accentGold` colored border, ~2-3px width, full perimeter, fully opaque.
- **Checkmark badge: REMOVED.** The earlier circular `accentGold` checkmark badge (formerly anchored at the card's top-right corner to denote "selected") no longer exists — there is nothing to "select" on this screen now that clicking the card directly navigates forward, so the selection affordance was dropped. (`.ms-badge-check` and its DOM element are gone.)
- Name band text: "PRACTICE", ALL CAPS, `accentGold`-tinted, bold.
- Mode-glyph badge below: diamond outline in `accentGold`, fill `surfaceOver`, glyph in `textPrimary` (now sized at **22% of the card box**, fluid).
- **State behavior**:
  - Rest: gold border, normal art brightness — the resting/initial state on screen load.
  - **Hover (fine pointer only)**: gated behind `@media (hover: hover) and (pointer: fine)`. Brightness lift on the card + art (`filter: brightness(1.1)` / `1.12`) plus a soft `box-shadow` ring (35% `accentGold` ring + a `stageProgress` teal glow at 30%). Does NOT appear on touch devices.
  - **Press (mouse AND touch)**: implemented via an explicit `.ms-card--pressed` class toggle in `app.ts` (added on `pointerdown`, removed on `pointerup`/`pointerleave`/`pointercancel`) so it releases symmetrically for both input types — `:active` alone wasn't reliable across mouse+touch. Stronger glow: `brightness(1.18)` / `1.2` on art, `scale(0.985)`, ring at 55% `accentGold` + 1vh `stageProgress` glow at 50%.
  - **Click → navigate**: tapping the Practice card now sets `modeSelectChoice = "practice"` and immediately navigates to the **Lobby** (`references/lobby.md`). The card IS the proceed affordance — there is no separate confirm step.
  - No disabled state — Practice is always available.

#### Card 2 — "PVP"
- **State: PERMANENTLY DISABLED, non-interactive, never selectable.**
- Border: desaturated/dim border, `borderSubtle`, ~2px, full perimeter.
- Art region: rendered at reduced opacity (~50-60%) or with a darkening overlay to read as greyed-out, on top of the placeholder art region.
- **"COMING SOON" overlay**: a horizontal banner/ribbon centered vertically across the card's art region (roughly at the card's midpoint), full card width or slightly inset, semi-opaque dark background (`bgScrim` / `surfaceBase` at reduced alpha) with "COMING SOON" text centered, ALL CAPS, `textMuted` or `textDimmed` color, letter-spaced. [REPLICATE structure — generic banner + text, not copyrighted]
- Name band text: "PVP", ALL CAPS, but rendered in `textDimmed`/`textMuted` (not `textPrimary`) to read as inactive.
- Mode-glyph badge below: diamond outline in `borderSubtle`, fill `surfaceRaise`, glyph in `textDimmed`.
- **State behavior**:
  - Default: disabled-look as described (dim border, dimmed art, COMING SOON overlay, dimmed label) — this IS the only state; there is no hover/pressed/selected variant.
  - Hover: no change (pointer-events: none, or a hover handler that explicitly no-ops — must never show a hover affordance since it implies interactivity that doesn't exist).
  - Pressed: no change (must not be clickable at all — no command, no navigation, no toast).
  - Disabled: this is the resting/permanent state.
  - **Never transitions to selected.** No checkmark badge ever appears on this card in this build.

### Bottom-left promo banner
Anchor: bottom-left of the main content region, below/beside the card row, partially underlapping Card 1's bottom-left corner (in the reference it sits behind/under the card stack at a lower z-index). Shape: a small rounded-rect card, width ≈ 22% of viewport width, height ≈ 10% of viewport height. [COPYRIGHTED -> placeholder, see PLACEHOLDER section — the reference's "Fates Pass+" branding/art must not be reproduced]
- Content (generic structure only): a small icon/emblem on the left + two lines of text on the right (a title line + a shorter subtitle line).
- **In our build**: this banner has no current feature behind it (no battle-pass system exists). Render as an inert placeholder card with neutral filler copy (e.g. "Coming soon" or omit text entirely, just the stubbed surface) — or omit the element entirely if coder prefers a cleaner first pass. Documented here for layout completeness only; not a required interactive element.
- State: non-interactive (no hover/press) since it has no destination.

---

## BOTTOM BAR

> **PLAY button REMOVED.** The current build has **no PLAY button and no mode-indicator chip** on Mode Select — clicking the PRACTICE card itself navigates straight to the Lobby (see Card 1 "Click → navigate" above). The `.ms-play-btn` element, its handler, and all its CSS rules were deleted; `modeSelectScreen()`'s return shape is now just `[topbar, .ms-content > .ms-card-row]` with no bottom-bar control sibling. The reference's bottom-right PLAY/chevron control has no counterpart in the shipped screen. The text below is retained only as the historical reference description of the source image's bottom bar.

A slim strip-like region at the very bottom of the main content area (not a separate full-width bar like the top bar — in the reference it's just the bottom-right corner of the content region that carries the controls).

### Bottom-right: mode chip + PLAY button (reference only — not built)
- **Small mode-indicator chip** — anchor: directly left of the PLAY button, vertically aligned with it. Shape: small circle (~48px) containing a tiny replica of the selected mode's glyph, with a small circular "swap/cycle" arrow badge overlapping its bottom-right corner, and a text label ("NORMAL" in the reference) centered below the circle. [REPLICATE structure — generic glyph + cycle-arrow, not copyrighted] In our build with only one selectable mode, this chip is REDUNDANT (there's nothing to cycle to) — recommend OMITTING in our implementation, or rendering it inert/static showing "PRACTICE" with no cycle-arrow (since PvP is never selectable, cycling is meaningless). Note for coder: prefer omission for a cleaner two-mode UI; documented here for completeness against the reference only.
- **PLAY button** — anchor: far bottom-right, ~16-24px inset from the right/bottom safe-area edges. Shape: large horizontal pill/chevron-capped rect (right edge comes to a shallow outward-pointing chevron point, like an arrow button), height ≈ 9-10% of viewport height, width ≈ 22-26% of viewport width. Reuses the existing `.ui-btn-primary`/`.ui-btn-wide` button language scaled up, with an added chevron-point right edge (a CSS clip-path or an SVG/Canvas-drawn shape achieving the angled point) and a bright rim outline.
  - **Default/enabled state** (active when Practice — the only selectable card — is selected, which is always, since Practice is selected by default and PvP can never be selected): fill `accentGold`-adjacent gold/bronze gradient look using `cssVar("accentGold")` as the base, bright cyan/teal rim highlight reminiscent of the reference's glow — substitute with `cssVar("stageProgress")` or `cssVar("xpArcFill")` (closest existing bright teal/cyan accent tokens) for the rim glow since the reference's exact cyan isn't a defined token; label "PLAY", ALL CAPS, bold, large, centered, `surfaceBase`-dark text for contrast against the gold fill (or `textPrimary` if fill is darker — verify contrast ≥ 4.5:1 at build time).
  - **Hover**: brightness lift (`filter: brightness(1.08)`), rim glow intensifies slightly.
  - **Pressed**: `transform: scale(0.98)`, brightness dip (`filter: brightness(0.88)`), consistent with `.ui-btn:active`.
  - **Disabled**: N/A in practice — since Practice is always selected by default in this build, PLAY is ALWAYS enabled on this screen. (If a future state allowed deselecting Practice with nothing selected, PLAY would render at `borderSubtle` border + `textDimmed` label + reduced opacity + non-interactive — documented for completeness, not currently reachable.)
  - **Behavior**: tapping PLAY while Practice is selected (always) navigates to the Lobby screen (`references/lobby.md`). This is the PRIMARY confirm action of this screen.

---

## Navigation summary

- **Tapping the Practice card → navigates to Lobby** (`references/lobby.md`). The card click IS the proceed action (sets `modeSelectChoice = "practice"` then `navigate("lobby")`). There is no separate PLAY button anymore.
- Tapping the PvP card → no-op, never selects, never navigates (`pointer-events: none`; no listeners attached).
- Back navigation (the top-bar `metaBackBtn`) → returns to Main Menu.

---

## Color / Zone Mapping (theme.ts tokens only)

| Region / Element | Token(s) | Notes |
|---|---|---|
| Screen background | `bgPage` (= `surfaceBase`) | Base page fill behind all content; reference's painted background art is placeholder-only (see PLACEHOLDER). |
| Top bar background | `bgHud` (= `surfaceRaise`) | Flat strip, no border. |
| Avatar ring | `chipBorder` | 2px stroke. |
| Username text | `textPrimary` | |
| Currency pill background | `bgPanelRaise` (= `surfaceFloat`) | |
| Currency pill border | `chipBorder` | |
| Currency number text | `textGold` | Legible reading-gold for numeric HUD values, per existing convention (shop cost / HUD numbers use `textGold`, not `accentGold`). |
| Icon row glyphs (default) | `textMuted` | |
| Icon row hover background | `bgPanelRaise` | |
| Card body (both cards, base surface under art) | `surfaceRaise` | |
| Card 1 (Practice) border | `accentGold` | Selected-state border. |
| Card 1 selected checkmark badge fill | `accentGold` | |
| Card 1 selected checkmark glyph | `surfaceBase` | Dark ink for contrast on gold. |
| Card 1 name band text | `accentGold` or `textPrimary` | Prefer `accentGold` to reinforce selected state. |
| Card 1 name band background scrim | `bgScrim` at reduced alpha, layered over `surfaceRaise` | |
| Card 2 (PvP) border | `borderSubtle` | Dim/inactive border. |
| Card 2 art dimming overlay | `bgScrim` at ~40-50% alpha | |
| Card 2 "COMING SOON" banner background | `surfaceBase` at ~70% alpha (or `bgScrim`) | |
| Card 2 "COMING SOON" text | `textDimmed` | |
| Card 2 name band text | `textDimmed` | |
| Mode-glyph badge (Practice) border/fill | `accentGold` border, `surfaceOver` fill | |
| Mode-glyph badge (Practice) glyph ink | `textPrimary` | |
| Mode-glyph badge (PvP) border/fill | `borderSubtle` border, `surfaceRaise` fill | |
| Mode-glyph badge (PvP) glyph ink | `textDimmed` | |
| Bottom-left promo banner surface | `surfaceRaise` | Placeholder card; see PLACEHOLDER. |
| Bottom-left promo banner border | `chipBorder` | |
| Mode-indicator chip (if implemented; recommend omit) | `surfaceFloat` fill, `chipBorder` border, `textMuted` glyph/label | |
| PLAY button fill | `accentGold` | |
| PLAY button rim glow | `stageProgress` (closest existing bright teal/cyan token — **approximation**, the reference's exact glow hue isn't a defined token) | |
| PLAY button label | `surfaceBase` (dark-on-gold) — verify ≥4.5:1 contrast; fallback `textPrimary` if fill renders darker than expected | |
| PLAY button disabled (non-reachable in this build) | `borderSubtle` border, `textDimmed` label, `surfaceRaise` fill | Documented for completeness only. |

No hex literals used anywhere in implementation — all colors resolve via `cssVar(key)` per the existing DOM-layer invariant in `styles.ts`.

---

## DO-NOT-REPRODUCE (copyrighted assets visible in `references/mode-select.png`)

- The two little-legend/tactician creature character illustrations on the "NORMAL" card (the horned blue-haired figure + the white furry creature).
- The hooded ghost-like creature + golem/turtle combat illustration on the "RANKED" card.
- The penguin mascot character illustration (with the bandana) on the "TUTORIAL" card, and the second penguin/scarecrow figure beside it.
- All card splash-art backgrounds and their painted scene compositions in general (any creature/character art, regardless of which card).
- The "Fates Pass+" branding text, logo treatment, and promo banner artwork/iconography.
- The exact currency gem icon glyph (the faceted pink/red gem shape).
- The exact icon glyph art for the top-bar icon row (profile silhouette, inventory/book icon, bell/notification icon, gear/settings icon) — our build may use OUR OWN existing glyph system (`glyphs.ts` procedural vectors) for any equivalent icon, never tracing/recreating these exact shapes.
- The exact diamond mode-glyph icon art (crossed-swords emblem, ranked-crest emblem, open-book emblem) — replicate only the diamond BADGE SHAPE/position, never the internal glyph illustration style.
- Any gold filigree / ornate chrome decorative border treatment (the gilded card-corner flourishes, the ornate PLAY button bevel detailing) — our build uses flat `cssVar`-driven borders/fills per the existing theme system, not painted ornamentation.
- The left vertical rail's circular icon art (flag, trophy/coin stack, helmet) — moot since this rail is omitted from our build entirely.

## PLACEHOLDER (what to stub, and with which theme surface token)

| Reference element | Our stub | Theme token for the stub surface |
|---|---|---|
| Card 1 (Practice) art region | Flat placeholder fill, optionally a centered generic glyph (e.g. crossed-swords from our existing `glyphs.ts` set) | `surfaceFloat` |
| Card 2 (PvP) art region | Flat placeholder fill, dimmed | `surfaceRaise` at reduced opacity, overlaid with `bgScrim` |
| Top-bar currency gem icon | Generic diamond/gem glyph from our own procedural glyph set, or a simple geometric placeholder shape | rendered in `accentGold` ink |
| Top-bar icon row (4 icons) | Only build the icons with a real destination (Settings); render others as inert flat squares or omit | `bgPanelRaise` on hover, transparent at rest |
| Bottom-left promo banner | Flat stubbed card, no art, optionally placeholder copy or fully empty | `surfaceRaise` |
| Screen background (painted scene) | Flat solid fill — no painted/illustrated background in our build | `bgPage` |
| Mode-glyph badges (both cards) | Reuse our existing `ui-diamond` component with a simple procedural glyph (crossed-swords for Practice; a generic shield/crest shape for PvP) instead of bespoke art | `surfaceOver` (Practice) / `surfaceRaise` (PvP) fill, per mapping table above |
