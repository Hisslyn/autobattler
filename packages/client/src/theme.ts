// All game colors in one place — muted dark palette
export const C = {
  // ─── Surface elevations (canonical depth stack, polish pass) ──────────────
  // Four principled steps; the bg* keys below alias these so the scene reads as
  // a depth stack (page < panels < chips/HUD < modal overlays).
  surfaceBase:   0x0b0d13,   // deepest: page bg, board zone bg, scrim backing
  surfaceRaise:  0x141824,   // raised: panels, cards, bench, shop cards
  surfaceFloat:  0x1c2232,   // floating: chips, HUD bands, overlays, inspect rows
  surfaceOver:   0x242a3e,   // topmost modal surfaces (inspect, scout, resolution)
  // ─── Border variants (polish pass) ────────────────────────────────────────
  borderSubtle:  0x222840,   // subdued outer edge (inactive cards/slots)
  borderActive:  0x3a4460,   // bright selected/active border
  // ─── Drag/drop state (polish pass) ────────────────────────────────────────
  bgBoardDragOver: 0x1a2a3a, // hex fill when occupied + drag over (swap hint)

  // Backgrounds (aliased to the elevation stack above)
  bgPage:      0x0b0d13,  // surfaceBase
  bgHud:       0x141824,  // surfaceRaise
  bgBoard:     0x0b0d13,  // surfaceBase
  bgBoardOpp:  0x120d0e,
  bgBench:     0x111822,
  bgShopCard:  0x141824,  // surfaceRaise
  bgShopEmpty: 0x10131c,
  bgReroll:    0x1c2232,  // surfaceFloat
  bgXp:        0x1c2232,  // surfaceFloat
  bgReady:     0x162818,
  bgReadyOff:  0x1c2232,  // surfaceFloat
  bgUnit:      0x0f1220,  // deeper token disc
  bgToast:     0x2a0a0a,
  bgOverlay:   0x000000,
  bgPanel:     0x141824,  // surfaceRaise
  bgScout:     0x242a3e,  // surfaceOver
  bgBoardSel:  0x1a3a5a,
  bgBenchSel:  0x1a3050,
  bgSellZone:  0x280808,
  bgCloseBtn:  0x1c2232,  // surfaceFloat (desaturated red tint)
  bgContinue:  0x1a3020,
  bgMenuBtn:   0x1c2232,  // surfaceFloat

  // Tier colors (visual overhaul stage 1)
  tier1: 0x8b93a6,
  tier2: 0x5dcaa5,
  tier3: 0x378add,
  tier4: 0x9b87f5,
  tier5: 0xf0a830,

  // Star colors
  star1: 0x7a7a8a,
  star2: 0x3a72aa,
  star3: 0xaa8a20,

  // HP / mana
  hpBg:    0x182a18,  // visible bar track at small sizes
  hpFill:  0x2a7a3a,
  manaBg:  0x10101e,  // visible bar track at small sizes
  manaFill: 0x2a4a88,

  // ─── Visual overhaul stage 1: board + unit tokens ─────────────────────────
  // UnitToken bars
  hpGreen:  0x5dcaa5,
  hpLow:    0xe24b4a,
  manaBlue: 0x3d8af0,
  // Hex board
  enemyHex:    0x191d2a,
  myHex:       0x1d2336,
  boardBg:     0x0d1019,  // slightly lifted from surfaceBase for the rounded panel
  boardBorder: 0x2a3048,  // legible hex grid line on the darker board surface
  // Token
  tokenBg:  0x0f1220,  // deeper token disc
  starGold: 0xf0a830,

  // ─── Visual overhaul stage 2: in-match HUD + shop chrome ──────────────────
  panelBg:      0x141824,  // surfaceRaise
  chipBorder:   0x363d58,  // legible 1px border at 2× DPR
  xpPurple:     0x9b87f5,
  streakOrange: 0xe2603a,

  // ─── Visual overhaul stage 4: DOM meta screens ───────────────────────────
  // Surface + accent tokens used by the themed menus (panel surfaces reuse
  // panelBg/chipBorder above; these add the bits the DOM needs on top).
  bgPanelRaise: 0x1c2232,  // surfaceFloat — raised inner surface (rows, inputs)
  accentGold:   0xf2ca58,  // shared bright gold accent (buttons, wordmark, coin, star pips)
  // Rank badge colors — one per ranks.json band (reuse RANK_BANDS data)
  rankBronze:   0xb87a4a,
  rankSilver:   0xaab4c4,
  rankGold:     0xf0c84a,
  rankPlatinum: 0x5fd0c0,
  rankDiamond:  0x6fb0f0,
  rankMaster:   0xe0668a,

  // Text
  textPrimary:  0xc9cedb,
  textGold:     0xd4a832,  // legible reading gold (HUD number, shop cost)
  textGoodHP:   0x5aaa6a,
  textBadHP:    0xaa4040,
  textMuted:    0x8088a0,
  textReady:    0x5aaa5a,
  textReroll:   0xa0b0c0,
  textXp:       0x70aa70,
  textShop:     0xb0bcc8,
  textSell:     0xaa3030,
  textToast:    0xcc6666,
  textCombat:   0xcc7040,
  textBanner:   0xb0c8e0,
  textLabel:    0xbbc4d0,
  textDimmed:   0x666677,

  // Combat playback fx
  fxAttackFlash: 0xd0d8e0,
  fxCastPulse:   0x8a6ad0,
  fxDeathFade:   0x3a3a4a,
  floatPhys:     0xd06050,
  floatCrit:     0xe0a030,
  floatMagic:    0x9a7ade,
  textOvertime:  0xcc4040,

  // ─── Visual overhaul stage 3: combat VFX + juice ──────────────────────────
  fxProjectile:    0xe0c060,  // ranged bolt core
  fxProjTrail:     0xa07020,  // ranged bolt trail
  fxImpact:        0xf0e0b0,  // hit-spark
  fxDamageChip:    0xf0f0f0,  // trailing white hp-loss chip
  // ability visuals per effect kind
  fxAbilityMagic:  0x9a7ade,
  fxAbilityShield: 0x6ac0e0,
  fxAbilityBuff:   0xf0c84a,
  fxAbilityBurn:   0xe2603a,
  fxAbilityStealth: 0x6a6a8a,
  // juice
  fxOvertimeEdge:  0xcc4040,  // board edge/tint cue during overtime
  fxStarUp:        0xf0d878,  // merge / star-up flourish

  // ─── Inspect / trait-detail panels + sell control (stage 5: in-match UX) ──
  bgInspect:     0x242a3e,  // surfaceOver — inspect/trait panel surface
  bgInspectRow:  0x1c2232,  // surfaceFloat — inner stat/breakpoint row
  bgScrim:       0x000000,  // dim scrim behind a panel
  bgSellChip:    0x2a1010,  // sell affordance chip fill
  bgSellArmed:   0x4a1414,  // sell zone highlighted while a unit is dragged
  benchEmpty:    0x0c1018,  // empty bench slot fill ("hole" relative to the row)
  benchEmptyRim: 0x1e2640,  // empty bench slot outline (legible)
  benchOccupied: 0x1e2840,  // occupied bench slot fill (clear elevation over empty)

  // ─── Phase 10b: items, loot orbs, PvE rounds ─────────────────────────────
  // Item inventory chips: components read distinct from completed items.
  itemComponent:   0x2a3242,  // loose-component slot fill (cooler, plainer)
  itemCompleted:   0x33304a,  // completed-item slot fill (richer)
  itemBorder:      0x3a4255,  // item chip outline
  itemCombineOk:   0x5dca6a,  // valid combine-preview highlight (recipe found)
  itemCombineNo:   0xc04a5a,  // invalid combine affordance (no recipe)
  itemSlotPip:     0x2a3142,  // empty equipped-item slot pip on a token
  // Procedural item icons (distinct per item): emblem ink + completed-item frame.
  itemEmblem:      0xd6cbb0,  // neutral emblem ink for a raw/unframed component
  itemEmblemAlt:   0xb0c0d0,  // secondary emblem ink (2nd component of a pair)
  itemFrame:       0xc9a24a,  // completed-item frame ring (gilded)
  itemShine:       0xfbf3d8,  // completed-item shine sweep (reduced-motion gated)
  // Loot orb rarity colors (loot.json rarities) — distinct hue per tier.
  lootCommon:      0xb4bece,  // distinct from textMuted
  lootUncommon:    0x5dca8a,
  lootRare:        0x4f8fe0,
  lootLegendary:   0xf0a830,
  lootOrbCore:     0xf4ecd0,  // bright orb core before it cracks open
  // PvE / mob presentation: neutral monster tint distinct from player tiers.
  mobTint:         0x7a5a4a,  // mob token ring (neutral monster brown-grey)
  mobZone:         0x1f1714,  // PvE creep board zone fill (warm-dark)
  pveLabel:        0xd0a060,  // "Creeps" stage label accent

  // ─── Phase 2: consumables (item_remover / reforger / radiant_enhancer) ────
  // Consumables must read as visually distinct from equippable item chips
  // (neither component nor completed-item fill); reuses no existing key since
  // none signals "not equippable onto an item, only onto a unit".
  itemConsumable:     0x2a1f3a,  // consumable chip fill (cool violet, distinct from itemComponent/itemCompleted)
  itemConsumableRim:  0x6a4ad0,  // consumable chip border accent (reuses the abyssal/summoner family hue)
  // Radiant (tier-4) badge tint — reuses the legendary loot rarity color so a
  // radiant item's "highest tier" reading matches the loot-rarity language
  // already established (no new tint invented for the radiant badge itself).
  radiantBadge:       0xf0a830,  // = lootLegendary

  // Trait tracker
  traitActive:  0x3a6a3a,
  traitPending: 0x1e2830,

  // HP bars in HUD
  hpBarSelf:  0x2a6a4a,
  hpBarOther: 0x2a4a7a,
  hpBarDead:  0x2a2a2a,
} as const;

export function tierColor(tier: number): number {
  return ([C.tier1, C.tier2, C.tier3, C.tier4, C.tier5] as const)[tier - 1] ?? C.tier1;
}

// Stable per-trait chip colors (stage 2). Grouped into rough visual families so
// the trait strip keeps a consistent hue per trait across rerenders.
export const TRAIT_COLOR: Record<string, number> = {
  // origins
  holy:      0xf0d878,
  shadow:    0x8a6ad0,
  arcane:    0xd06ad0,
  frost:     0x5fd0e0,
  forest:    0x5dca6a,
  beast:     0xd08a40,
  celestial: 0x8ab0f0,
  dragon:    0xe2603a,
  storm:     0xf0c84a,
  undead:    0x7a9a7a,
  elemental: 0x4ac0b0,
  abyssal:   0x6a4ad0,
  // classes
  knight:    0x6a90c0,
  ranger:    0x6ac06a,
  sorcerer:  0xb06ad0,
  assassin:  0xc04a5a,
  warden:    0x4ab0a0,
  berserker: 0xe07040,
  mystic:    0x7a8ad0,
  gunner:    0x90a0b0,
  duelist:   0xc7cedb,
  summoner:  0x7060c0,
};

/** Stable chip color for a trait id (family-based map); muted fallback. */
export function traitColor(traitId: string): number {
  return TRAIT_COLOR[traitId] ?? C.textMuted;
}

/** Same trait color as the canvas, as a CSS color string for the DOM motifs. */
export function traitColorCss(traitId: string): string {
  return hexToCss(traitColor(traitId));
}

// Rank band id → theme color key (ranks.json bands; used by Profile/Leaderboard
// badges so the DOM and the rank-band data never diverge).
export const RANK_COLOR: Record<string, keyof typeof C> = {
  bronze:   "rankBronze",
  silver:   "rankSilver",
  gold:     "rankGold",
  platinum: "rankPlatinum",
  diamond:  "rankDiamond",
  master:   "rankMaster",
};

/** Numeric badge color for a rank band id (muted fallback). */
export function rankColor(rankId: string): number {
  return C[RANK_COLOR[rankId] ?? "textMuted"];
}

export function starColor(star: number): number {
  return ([C.star1, C.star2, C.star3] as const)[star - 1] ?? C.star1;
}

// Loot rarity id (loot.json: common/uncommon/rare/legendary) → orb color.
export const RARITY_COLOR: Record<string, keyof typeof C> = {
  common:    "lootCommon",
  uncommon:  "lootUncommon",
  rare:      "lootRare",
  legendary: "lootLegendary",
};

/** Numeric orb color for a loot rarity id (muted fallback). */
export function rarityColor(rarity: string): number {
  return C[RARITY_COLOR[rarity] ?? "textMuted"];
}

// ─── Glyph rendering constants (FIX 1: small-token legibility) ──────────────
/**
 * Step-based stroke weight for procedural glyphs and item emblems.
 * Single source shared by glyphs.ts and itemIconDraw.ts.
 * - size > 20: proportional (10% of size, min 2)
 * - size 14–20: 2px (standard board token)
 * - size 10–13: 1.8px (was 1.5 — boosted for bench/shop legibility)
 * - size ≤ 9:   1.5px (was 1.2 — boosted for chip/rail sizes)
 *
 * Intentional change from the prior inline formula:
 *   Old: ≤9→1.2, ≤13→1.5, ≤20→2, else proportional
 *   New: ≤9→1.5, ≤13→1.8, ≤20→2, else proportional
 * The large-token band (≤20, ≤20→2) is byte-identical; only the two small
 * bands are heavier, improving ink density at 2× DPR without thickening
 * board or combat tokens.
 */
export function glyphStrokeWeight(size: number): number {
  if (size <= 9)  return 1.5;
  if (size <= 13) return 1.8;
  if (size <= 20) return 2;
  return Math.max(2, size * 0.1);
}

// ─── Trait-chip text constants (FIX 2: chip label legibility) ───────────────
// The chip label was 8px monospace — at the legibility floor. Switching to
// 9px sans-serif makes letterforms cleaner at sub-10px and gains one pixel of
// cap height for free. Pull these from theme so all call sites stay consistent.
export const CHIP_TEXT_SIZE = 9;
export const CHIP_TEXT_FONT = "system-ui, -apple-system, sans-serif";

// ─── CSS bridge ──────────────────────────────────────────────────────────────
// theme.ts is the single palette source: the same numeric colors the Pixi layer
// uses are exported to the DOM as CSS custom properties, so menus and canvas
// never drift. DOM/CSS must reference these via cssVar(key), never hex literals.

/** `0x0d0d14` → `#0d0d14`. */
export function hexToCss(n: number): string {
  return `#${(n >>> 0).toString(16).padStart(6, "0").slice(-6)}`;
}

/** camelCase key → kebab-case CSS variable name, e.g. `bgPage` → `--bg-page`. */
function cssVarName(key: string): string {
  return `--${key.replace(/[A-Z0-9]/g, (m) => `-${m.toLowerCase()}`)}`;
}

/** Reference a theme color from DOM/CSS as a CSS variable, e.g. cssVar("bgPage"). */
export function cssVar(key: keyof typeof C): string {
  return `var(${cssVarName(key)})`;
}

/** CSS-var reference for a rank band id's badge color (DOM rank badges). */
export function rankCssVar(rankId: string): string {
  return cssVar(RANK_COLOR[rankId] ?? "textMuted");
}

/** `:root { --bg-page: #0d0d14; ... }` body text, generated from C. */
export function themeCssVars(): string {
  return (Object.keys(C) as Array<keyof typeof C>)
    .map((k) => `  ${cssVarName(k)}: ${hexToCss(C[k])};`)
    .join("\n");
}

/** Apply every theme color as a CSS custom property on the given element (default :root). */
export function applyThemeVars(root: HTMLElement = document.documentElement): void {
  for (const k of Object.keys(C) as Array<keyof typeof C>) {
    root.style.setProperty(cssVarName(k), hexToCss(C[k]));
  }
}
