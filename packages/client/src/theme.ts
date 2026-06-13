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

  // Tier colors — desaturated
  tier1: 0x7a7a8a,
  tier2: 0x3a72aa,
  tier3: 0x5a9a3a,
  tier4: 0x9a3a6a,
  tier5: 0xaa8a20,

  // Star colors
  star1: 0x7a7a8a,
  star2: 0x3a72aa,
  star3: 0xaa8a20,

  // HP / mana
  hpBg:    0x0a1a0a,
  hpFill:  0x2a7a3a,
  manaBg:  0x0a0a1a,
  manaFill: 0x2a4a88,

  // Text
  textPrimary:  0xc0c8d8,
  textGold:     0xc8a030,
  textGoodHP:   0x5aaa6a,
  textBadHP:    0xaa4040,
  textMuted:    0x606878,
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

export function starColor(star: number): number {
  return ([C.star1, C.star2, C.star3] as const)[star - 1] ?? C.star1;
}
