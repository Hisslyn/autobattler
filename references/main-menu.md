# Main Menu — Build Spec (Landscape, DOM/CSS meta screen)

Status: NEW screen. Replaces/extends the current `MainMenu` screen in
`packages/client/src/ui/app.ts`. Built in the existing DOM/CSS meta-screen
layer (`#ui-root`), landscape-first, NOT a Pixi scene. Canvas underneath is
untouched; this is chrome over it, same layer family as the other themed
meta screens (Profile/Leaderboard/Settings/How-to-Play).

All positions/sizes are relative (%W/%H of the full screen container) so the
layout scales across landscape aspect ratios. Treat every numeric region as a
target, not a pixel-exact box — implement with flex/grid + the proportions
below, not hardcoded px.

---

## 1. Layout overview

Five regions divide the screen. Top bar and left nav are slim chrome strips;
the key-art stage is the large ambient backdrop everything else sits over;
promo and play cluster are the two bottom corner action groups.

```
┌─────────────────────────────────────────────────────────┐
│  TOP UTILITY BAR (full width)                            │
├───────────┬───────────────────────────────────────────────┤
│           │                                                │
│  LEFT     │   CENTER-RIGHT KEY-ART STAGE                   │
│  NAV      │   (background fill + foreground hero overlap)  │
│           │                                                │
│           │                                                │
├───────────┤                                       ┌─────────┐
│ PROMO     │                                       │  PLAY    │
│ BANNER    │                                       │  CLUSTER │
└───────────┴───────────────────────────────────────┴─────────┘
```

### Region proportion table

| Region | Anchor | Bounds (x%, y%, w%, h%) | Z-order |
|---|---|---|---|
| Top utility bar | top edge, full width | 0, 0, 100, 12 | Above key art |
| Left vertical nav | left edge, below top bar | 0, 18, 17, 50 | Above key art; below hero overlap art but above hero in interactive priority (chrome never visually occluded) |
| Center-right key-art stage | spans center to right edge, full height | 17, 0, 83, 100 | Background lowest z; foreground hero above background, below all interactive chrome |
| Bottom-left promo banner | bottom-left corner | 0, 78, 30, 22 | Above key art |
| Bottom-right play cluster | bottom-right corner | 68, 85, 32, 15 | Above key art, highest-emphasis interactive element on screen |

Reading priority (design intent, for visual weight/emphasis only): Play button → left nav → top-bar identity/currency → promo banner → key art (ambient).

---

## 2. Element-by-element anatomy

### 2.1 Top utility bar (0–100% W, 0–12% H)

Full-width strip, two clusters, opposite-aligned, vertically centered within the bar.

**Left cluster — identity (0–22% W):**
- `slot:avatarFrame` — framed circular avatar. Diameter ≈ bar height (~10% of screen H). ~1% left padding. Ring border is a permanent identity frame, not a button state.
- `slot:playerName` — name label, immediately right of avatar, vertically centered, single line, truncate with ellipsis if long.
- `slot:levelBadge` (optional, co-located) — small chip/badge attached to or overlapping the avatar's bottom-right corner, or immediately right of the name. Carries account/profile level text.
- Whole cluster (`avatarFrame` + `playerName` + `levelBadge`) = one hit-target → Profile.

**Right cluster — currency + utility (ends flush right, ~25% W):**
Single row, vertically centered, equal gutters between the 4 utility icons; the currency chip has its own larger left gutter (visually separate group, not a 5th icon).

Order left to right:
1. `slot:currencyCounter` — glyph + numeric value, one pill-shaped chip (own hit-target, own background, distinct from plain icon buttons).
2. `slot:utilityProfile` — icon-only button (person/profile glyph).
3. `slot:utilityCollection` — icon-only button (book/case glyph).
4. `slot:utilityNotifications` — icon-only button (bell glyph) + latent unread-badge-dot slot (small dot, top-right corner of the icon, empty/hidden by default).
5. `slot:utilitySettings` — icon-only button (gear glyph), rightmost, ~1% right margin.

Z-order: top bar renders above background AND above the foreground hero wherever they overlap.

### 2.2 Left vertical nav (0–17% W, 18–68% H)

Three primary-nav rows, left-anchored, each = icon + label, sharing one icon column (~3–4% W left inset). Icon size ~6–7% W each. Labels baseline-aligned to icon vertical center.

- **Row 1 — `slot:navPrimary`** (~18–34% H): circular medallion icon + bold label. Default SELECTED/ACTIVE row (heavier weight = default landing tab). Directly beneath it, indented to the label's left edge, a sub-block:
  - `slot:navPrimaryLevelText` — "Lv. N" style line.
  - `slot:navPrimaryProgressText` — "X / Y" fraction.
  - `slot:navPrimaryProgressBar` — thin horizontal progress bar beneath the text, near-empty fill state by default (must read clearly near 0%: visible track vs fill).
- **Row 2 — `slot:navSecondary`** (~40–52% H): icon + label, no sub-block, lighter/inactive visual weight.
- **Row 3 — `slot:navTertiary`** (~55–67% H): icon + label, no sub-block, inactive visual weight.

Gap after row 1 is larger than the gap between rows 2–3 (absorbs the sub-block).

Z-order: nav chrome (icons, labels, progress bar) renders above the background AND above the foreground hero where the hero's left edge overlaps this column — nav text/icons are never visually occluded by key art.

### 2.3 Center-right key-art stage (17–100% W, 0–100% H)

Purely visual; no interactive elements in this region.

- `slot:keyArtBackground` — full-bleed background image/illustration filling the entire region, lowest z-index of the stage.
- `slot:keyArtHero` — large foreground illustration, center-right placement, vertical span ~10–88% H, horizontal span ~35–75% W. Intentionally overlaps chrome on its left edge (crosses into the nav/top-bar boundary). Renders above the background, below all interactive chrome (top bar, nav, promo, play cluster all draw on top of it where they intersect).
- `slot:keyArtAmbientAccent` — secondary atmospheric shape (glow/energy/particle wash), ~75–100% W, 0–55% H, behind the hero, decorative only, no interaction.

### 2.4 Bottom-left promo banner (0–30% W, 78–100% H)

Single angled/beveled (parallelogram-skewed) card, anchored bottom-left, flush to the screen's left edge, slightly overlapping upward into the nav column's lower whitespace. The whole card is one tappable CTA — no separate button chrome inside it.

Internal layout, left to right:
- `slot:promoThumbnail` — small icon/thumbnail swatch, bleeds to the card's left bevel edge.
- `slot:promoTitle` — title text, right of the thumbnail, top line, larger/bolder weight.
- `slot:promoSubtitle` — subtitle/CTA copy, beneath the title, smaller/lighter weight.

Z-order: above background key art; never overlapped by the hero.

### 2.5 Bottom-right play cluster (68–100% W, 85–100% H)

Two elements, horizontally adjacent, bottom-anchored, right-aligned as a group, small edge margins (~2% right, ~2–3% bottom).

- `slot:modeSelectorChip` — left of the Play button. Small rounded/circular badge: small icon + short label naming the currently selected mode. Lower visual weight than Play (secondary control). Tap opens a mode picker.
- `slot:playButton` — rightmost, the single largest and highest-emphasis CTA on the screen. Large pill/rounded-rect, width ≈ 2.5–3× its own height. Centered label + a trailing directional/arrow glyph. Carries a glow/emphasis treatment (always-on, not just on press). Tap funnels to mode confirm → matchmaking entry.

Z-order: above background key art; never overlapped by the hero.

---

## 3. Content slots

Explicit mapping of every placeholder slot to what fills it in OUR game. Items marked **(NEW — stub)** do not exist in our game yet; build the slot/UI but treat the underlying feature as aspirational/future, not wired to real data beyond a placeholder value.

| Slot | Our content | Status |
|---|---|---|
| `slot:keyArtBackground` | Our game's environment/atmosphere art (arena, hex-board motif, or thematic backdrop) — OUR ASSET, not the reference's art | New asset needed |
| `slot:keyArtHero` | Our own hero illustration — a representative unit/champion from our roster (no mascot identity from the reference) — OUR ASSET | New asset needed |
| `slot:keyArtAmbientAccent` | Generic glow/particle wash consistent with our palette | New asset needed |
| `slot:avatarFrame` | Player's profile avatar (current placeholder avatar system, or initials) — links to Profile screen | Existing data: account profile |
| `slot:playerName` | `profile.name` (guest-auth display name, same as shown today in MainMenu subtitle) | Existing |
| `slot:levelBadge` | Player level — **(NEW — stub)**; our game currently has account MMR/rank, not an account "level/XP" system. Render as a placeholder badge (e.g. static or absent until a leveling system exists); do not block on this | New (stub) |
| `slot:currencyCounter` | Premium currency — **(NEW — stub)**; we have no premium currency. Render a counter chip with a placeholder glyph + 0 (or hide until implemented) | New (stub) |
| `slot:utilityProfile` | Navigates to existing **Profile** screen (`app.ts` `navigate("profile")`) | Existing destination |
| `slot:utilityCollection` | No direct existing equivalent — **(NEW — stub)**. Closest future mapping: a unit/item "collection" browser. Until built, route to a placeholder/disabled state or to How-to-Play's roster reference | New (stub) |
| `slot:utilityNotifications` | **(NEW — stub)** — no notification system exists. Render icon + dormant badge-dot slot, non-functional (no-op tap or simple "coming soon" toast) | New (stub) |
| `slot:utilitySettings` | Navigates to existing **Settings** screen (`navigate("settings")`) | Existing destination |
| `slot:navPrimary` | Maps to **Leaderboard** (our existing "rewards/progression"-adjacent screen — shows rank/MMR standing) — default landing tab, matches the reference's row-1 emphasis pattern | Existing destination |
| `slot:navPrimaryLevelText` / `ProgressText` / `ProgressBar` | **(NEW — stub)** — no leveling/XP-bar concept at the account level. Reuse the rank badge + `mmrToRank` band visually instead: show current rank label + a progress-style bar toward next rank's `minMmr` threshold (derive from `ranks.json` data, purely presentational) | New (derived from existing rank data) |
| `slot:navSecondary` | Maps to **How-to-Play** (closest existing "reference/store-of-information" destination; we have no in-game store) | Existing destination |
| `slot:navTertiary` | Maps to **Play mode select** (Practice/Online) — our "team-planner/roster" equivalent is choosing a match mode before queueing, since we have no persistent roster-builder outside a match | Existing destination (reuses existing Practice/Online flow) |
| `slot:promoThumbnail` / `Title` / `Subtitle` | Battle-pass-style promo — **(NEW — stub)**; we have no pass/season system. Render the card with a generic seasonal/placeholder title (e.g. "Season placeholder") and disable or no-op the tap until a real pass feature exists | New (stub) |
| `slot:modeSelectorChip` | Currently selected match mode (Practice or Online) — maps to existing mode toggle; tapping opens the existing Practice/Online choice (currently two side-by-side cards on MainMenu's Play screen — this chip becomes the compact selector for that same choice) | Existing destination |
| `slot:playButton` | Primary CTA — starts the currently selected mode (`onStartMatch("local")` or `onStartMatch("online")`, same calls used today by the Practice/Online cards) | Existing destination |

Net new screens/components to build: the menu shell itself (top bar, left nav, key-art stage, promo card, play cluster). No new backend/state is required except where flagged **(NEW — stub)** above — those are presentational placeholders only.

---

## 4. Chrome style tokens

Describes FRAMING/TREATMENT only — never copy the reference's exact colors or art. Map each chrome token to existing `theme.ts` CSS vars (via `cssVar(key)`) first; only introduce a new token where noted.

| Chrome token | Treatment (form, not color) | Existing theme key to use | New token needed? |
|---|---|---|---|
| Top-bar surface | Flat strip, slightly elevated above the key-art stage, subtle bottom edge separation | `cssVar("surfaceRaise")` (background) + `cssVar("borderSubtle")` (bottom edge) | No |
| Identity avatar ring | Circular frame, 2–3px ring, permanent (not a button state) | `cssVar("accentGold")` or `cssVar("chipBorder")` for a quieter ring | No |
| Level/rank badge chip | Small filled disc/pill, sits on or beside the avatar | Use `rankCssVar(bandId)` (existing per-rank colors `rankBronze`..`rankMaster` via `rankColor`/`rankCssVar`) | No |
| Currency counter chip | Pill-shaped chip, icon + number, distinct fill from plain icon buttons | `cssVar("bgPanelRaise")` (fill) + `cssVar("textGold")` (number text) + `cssVar("chipBorder")` (outline) | No |
| Utility icon buttons | Icon-only, circular or minimal-bg hit targets, no persistent frame (frame is reserved for nav/avatar) | `cssVar("surfaceFloat")` for press/hover bg only (transparent at rest); icon stroke `cssVar("textPrimary")` | No |
| Notification badge dot | Tiny filled circle, top-right corner overlay on the bell icon | `cssVar("textBadHP")` or a new alert tone if this needs to differ from "bad" semantics | Possible new: `notifyBadge` (alias to an existing red-family key is acceptable; only add new if none reads as "alert" cleanly) |
| Left-nav row (inactive) | Icon + label, no border, no fill, dimmed text | `cssVar("textMuted")` (label), `cssVar("textDimmed")` for the icon if unfilled | No |
| Left-nav row (active/selected) | Bold label weight, brighter icon fill/stroke, attached sub-block | `cssVar("textPrimary")` or `cssVar("accentGold")` for the active label; `cssVar("borderActive")` if an active-row accent edge is desired | No |
| Nav progress sub-block bar | Thin horizontal track + fill, rounded ends | Track: `cssVar("bgPanelRaise")` or a neutral dark; Fill: `cssVar("xpPurple")` (reuse — already the project's "progress" hue for the in-match XP bar) | No |
| Promo banner card | Angled/beveled (parallelogram-skewed) card shape, gilded or accented rim distinguishing it as a "special/premium" CTA | Fill: `cssVar("surfaceRaise")`; Rim: `cssVar("itemFrame")` (existing gilded-frame token, reused for "premium" framing) | No |
| Promo title/subtitle text | Title bold/bright, subtitle smaller/muted | Title: `cssVar("textGold")`; Subtitle: `cssVar("textMuted")` | No |
| Mode selector chip | Small rounded/circular badge, icon + short label, lower emphasis than Play | Fill: `cssVar("bgPanelRaise")`; Border: `cssVar("chipBorder")`; Text: `cssVar("textLabel")` | No |
| Primary Play button | Large pill/rounded-rect, glow/emphasis treatment (soft outer glow, brightest element on screen), top highlight band consistent with the project's existing "primary CTA" treatment (the in-match Ready button already uses a top highlight band + bold — reuse that pattern here) | Fill: `cssVar("accentGold")` or a dedicated bright fill; Label text: dark-on-gold or `cssVar("surfaceBase")`; Glow: soft box-shadow using `accentGold` at low alpha | Possible new: `playGlow` if a dedicated glow-alpha color separate from `accentGold` is wanted; otherwise reuse `accentGold` with CSS `box-shadow` alpha — no new theme key required |
| Key-art stage background dim/vignette (optional, for chrome legibility) | Soft gradient/vignette behind the top-bar and left-nav columns only, so chrome text stays legible over busy key art | `cssVar("surfaceBase")` at low alpha, as a CSS gradient overlay (no new token — alpha-modulated existing var) | No |

General rule: every fill/border/text color in this screen must resolve through `cssVar(key)` against an existing or newly-added `theme.ts` key — no hex literals in the DOM/CSS layer (project convention, test-enforced for the canvas; apply the same discipline here).

---

## 5. States / affordances

- **Nav selection**: exactly one of the three left-nav rows is "active" at a time (default: `slot:navPrimary`). Active state = bold/brighter label + (for row 1 only) the attached level/progress sub-block. Inactive rows show no sub-block, dimmed label/icon. Selection follows whichever destination screen is current (if the menu ever needs to reflect "you came from Leaderboard," highlight that row — otherwise row 1 stays default-active on first load).
- **Press/hover feedback**: every interactive element (avatar/identity cluster, 4 utility icons, currency chip, all 3 nav rows, promo card, mode selector chip, Play button) uses the project's established press-feedback convention: instant alpha-dip + a quick scale-pop on press, action fires on release (pointerup / click, consistent with slide-off-to-cancel), gated behind reduced-motion (alpha-dip still applies instantly when reduced-motion is on; the scale-pop is skipped).
- **Notification badge**: empty/zero state by default (dot hidden); only shown when an unread count is real — currently always hidden since no notification system exists yet (NEW — stub).
- **Avatar ring**: permanent decorative identity frame at all times — never used as a selection/active indicator.
- **Progress bar (nav sub-block)**: must render a visible track even at 0% fill (track color distinct from fill color so "near-empty" reads correctly, not as "broken/missing").
- **Back-navigation**: this screen IS the landing/back-stop — back-nav from any destination screen (Profile, Leaderboard, Settings, How-to-Play, Practice/Online mode pick) returns here, consistent with the existing `app.ts` `navigate()` back-stack pattern already used by the other meta screens.
- **Screen family consistency**: build this screen as a themed DOM/CSS panel inside the existing `#ui-root` meta-screen layer (same stylesheet/theme-var system as Profile/Leaderboard/Settings/How-to-Play) — no new chrome system, no default HTML control styling.
