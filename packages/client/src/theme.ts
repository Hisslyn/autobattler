// All game colors in one place — muted dark palette
export const C = {
  // Backgrounds
  bgPage:      0x0d0d14,
  bgHud:       0x0e1018,
  bgBoard:     0x0f1520,
  bgBoardOpp:  0x14100f,
  bgBench:     0x111822,
  bgShopCard:  0x141e2a,
  bgShopEmpty: 0x0d1218,
  bgReroll:    0x1a2030,
  bgXp:        0x162018,
  bgReady:     0x162818,
  bgReadyOff:  0x1a1420,
  bgUnit:      0x151c28,
  bgToast:     0x2a0a0a,
  bgOverlay:   0x000000,
  bgPanel:     0x10151e,
  bgScout:     0x0e1420,
  bgBoardSel:  0x1a3a5a,
  bgBenchSel:  0x1a3050,
  bgSellZone:  0x280808,
  bgCloseBtn:  0x2a1a1a,
  bgContinue:  0x1a3020,
  bgMenuBtn:   0x2a2a3a,

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
  hpBg:    0x0a1a0a,
  hpFill:  0x2a7a3a,
  manaBg:  0x0a0a1a,
  manaFill: 0x2a4a88,

  // ─── Visual overhaul stage 1: board + unit tokens ─────────────────────────
  // UnitToken bars
  hpGreen:  0x5dcaa5,
  hpLow:    0xe24b4a,
  manaBlue: 0x3d8af0,
  // Hex board
  enemyHex:    0x191d2a,
  myHex:       0x1d2336,
  boardBg:     0x12151f,
  boardBorder: 0x232838,
  // Token
  tokenBg:  0x11141d,
  starGold: 0xf0a830,

  // ─── Visual overhaul stage 2: in-match HUD + shop chrome ──────────────────
  panelBg:      0x1a1e2b,
  chipBorder:   0x2c3142,
  xpPurple:     0x9b87f5,
  streakOrange: 0xe2603a,

  // Text
  textPrimary:  0xc9cedb,
  textGold:     0xc8a030,
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

export function starColor(star: number): number {
  return ([C.star1, C.star2, C.star3] as const)[star - 1] ?? C.star1;
}

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
