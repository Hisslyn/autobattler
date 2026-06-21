// Single stylesheet for the DOM meta layer. Every color resolves to a CSS
// custom property generated from theme.ts (the single palette source), so the
// menus share one art direction with the Pixi match scene and never drift.
// No hex literals here — reference theme tokens via cssVar(key) only.
import { applyThemeVars, cssVar, themeCssVars } from "../theme.js";

const STYLE_ID = "ab-ui-styles";

function css(): string {
  return `
:root {
${themeCssVars()}
}
#ui-root, #match-overlay {
  position: absolute; inset: 0;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  color: ${cssVar("textPrimary")};
}
#ui-root {
  background:
    radial-gradient(120% 80% at 50% -10%, ${cssVar("panelBg")} 0%, ${cssVar("bgPage")} 60%),
    ${cssVar("bgPage")};
  overflow-y: auto; z-index: 10;
  /* Clear notches / home indicators on the meta screens (both orientations). */
  padding:
    env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px)
    env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
}
#ui-root.hidden { display: none; }
#match-overlay { z-index: 20; pointer-events: none; }
#match-overlay.hidden { display: none; }

.ui-screen {
  min-height: 100%;
  display: flex; flex-direction: column; align-items: center;
  padding: 24px 16px 40px; gap: 12px;
  max-width: 440px; margin: 0 auto;
}

/* Wordmark / titles */
.ui-title {
  font-size: 26px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase;
  margin: 16px 0 4px; color: ${cssVar("textLabel")};
}
.ui-wordmark {
  font-size: 34px; letter-spacing: 5px; font-weight: 800;
  background: linear-gradient(180deg, ${cssVar("accentGold")} 0%, ${cssVar("streakOrange")} 120%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  text-shadow: 0 2px 18px rgba(0,0,0,0.5);
}
.ui-subtitle { font-size: 13px; color: ${cssVar("textMuted")}; margin-bottom: 8px; }
.ui-section-title {
  font-size: 12px; letter-spacing: 1px; text-transform: uppercase; font-weight: 700;
  color: ${cssVar("textMuted")}; align-self: flex-start; margin-top: 8px;
}
.ui-muted { color: ${cssVar("textMuted")}; font-size: 12px; }

/* Buttons — shared component set, panel surface + tier/gold accents */
.ui-btn, .ui-btn-back, .ui-btn-wide {
  appearance: none; border: 1px solid ${cssVar("chipBorder")};
  background: ${cssVar("panelBg")}; color: ${cssVar("textPrimary")};
  font-family: inherit; font-size: 15px; padding: 13px 18px; border-radius: 9px;
  cursor: pointer; width: 260px; text-align: center; letter-spacing: 0.5px;
  transition: filter .12s, border-color .12s, transform .08s;
}
.ui-btn:hover, .ui-btn-wide:hover, .ui-btn-back:hover {
  filter: brightness(1.25); border-color: ${cssVar("accentGold")};
}
/* Press mirrors the Pixi alpha-dip + scale-pop model (darker + scale 0.98). */
.ui-btn:active, .ui-btn-wide:active, .ui-btn-back:active {
  filter: brightness(0.88); transform: scale(0.98); transform-origin: center;
}
.ui-btn:focus-visible, .ui-btn-wide:focus-visible, .ui-btn-back:focus-visible {
  outline: 2px solid ${cssVar("accentGold")}; outline-offset: 2px;
}
.ui-btn:disabled, .ui-btn-wide:disabled { opacity: .4; cursor: not-allowed; filter: none; border-color: ${cssVar("chipBorder")}; }
.ui-btn-wide { width: 100%; }
.ui-btn-back {
  width: auto; font-size: 13px; padding: 7px 13px; align-self: flex-start;
  background: transparent; border-color: ${cssVar("chipBorder")}; color: ${cssVar("textMuted")};
}
/* How-to-Play nav — a proper 44px touch target (vs the small back button). */
.ui-btn-nav {
  appearance: none; border: 1px solid ${cssVar("chipBorder")};
  background: ${cssVar("panelBg")}; color: ${cssVar("textPrimary")};
  font-family: inherit; font-size: 14px; padding: 12px 20px; border-radius: 9px;
  cursor: pointer; min-height: 44px; letter-spacing: 0.5px;
  transition: filter .12s, border-color .12s, transform .08s;
}
.ui-btn-nav:hover { filter: brightness(1.25); border-color: ${cssVar("accentGold")}; }
.ui-btn-nav:active { filter: brightness(0.88); transform: scale(0.98); transform-origin: center; }
.ui-btn-nav:focus-visible { outline: 2px solid ${cssVar("accentGold")}; outline-offset: 2px; }
.ui-btn-nav:disabled { opacity: .4; cursor: not-allowed; filter: none; }
.ui-btn-primary {
  border-color: ${cssVar("accentGold")}; color: ${cssVar("bgPage")}; font-weight: 700;
  background: linear-gradient(180deg, ${cssVar("accentGold")} 0%, ${cssVar("starGold")} 100%);
}
.ui-btn-primary:hover { filter: brightness(1.08); }
.ui-btn-danger { background: ${cssVar("bgSellZone")}; border-color: ${cssVar("textSell")}; color: ${cssVar("textSell")}; }

/* Tap-target cards (Play submenu): title + subtitle */
.ui-playcard {
  width: 100%; text-align: left; display: flex; flex-direction: column; gap: 4px;
  padding: 16px 18px;
}
.ui-playcard .pc-title { font-size: 16px; color: ${cssVar("textPrimary")}; font-weight: 700; }
.ui-playcard .pc-desc { font-size: 12px; color: ${cssVar("textMuted")}; }

/* Panels */
.ui-card {
  width: 100%; background: ${cssVar("panelBg")}; border: 1px solid ${cssVar("chipBorder")};
  border-radius: 10px; padding: 14px; display: flex; flex-direction: column; gap: 9px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.35);
}
.ui-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; min-height: 44px; }
.ui-row label { font-size: 13px; color: ${cssVar("textLabel")}; }
.ui-row input[type=range] { flex: 1; accent-color: ${cssVar("accentGold")}; }
.ui-row input[type=text] {
  flex: 1; background: ${cssVar("bgPanelRaise")}; border: 1px solid ${cssVar("chipBorder")};
  color: ${cssVar("textPrimary")}; font-family: inherit; font-size: 14px; padding: 9px; border-radius: 7px;
}
.ui-row input[type=text]:focus { outline: none; border-color: ${cssVar("accentGold")}; }
.ui-val { font-size: 12px; color: ${cssVar("textMuted")}; min-width: 34px; text-align: right; }

/* Toggle pill */
.ui-toggle {
  cursor: pointer; user-select: none; font-size: 12px; font-weight: 700;
  padding: 10px 16px; border-radius: 999px; border: 1px solid ${cssVar("chipBorder")};
}
.ui-toggle[data-on="true"] { color: ${cssVar("bgPage")}; background: ${cssVar("hpGreen")}; border-color: ${cssVar("hpGreen")}; }
.ui-toggle[data-on="false"] { color: ${cssVar("textMuted")}; background: ${cssVar("bgPanelRaise")}; }

/* Rank badge — colored by ranks.json band (rankCssVar) via inline --rank var */
.ui-rank-badge {
  display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
  padding: 3px 9px; border-radius: 999px;
  color: var(--rank, ${cssVar("textMuted")}); border: 1px solid var(--rank, ${cssVar("chipBorder")});
  background: ${cssVar("bgPanelRaise")};
}
.ui-bigmmr { font-size: 30px; color: ${cssVar("accentGold")}; font-weight: 700; letter-spacing: 1px; }

/* Lists (history + leaderboard) */
.ui-list { width: 100%; display: flex; flex-direction: column; gap: 4px; }
.ui-list-row {
  display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px;
  letter-spacing: 0.3px;
  padding: 8px 10px; background: ${cssVar("bgPanelRaise")}; border: 1px solid ${cssVar("chipBorder")}; border-radius: 6px;
}
.ui-list-row .pos { color: ${cssVar("textMuted")}; min-width: 24px; font-weight: 700; }
.ui-list-row .name { flex: 1; color: ${cssVar("textPrimary")}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ui-list-row.me { border-color: ${cssVar("accentGold")}; background: ${cssVar("panelBg")}; }
.ui-list-row.me .name { color: ${cssVar("accentGold")}; }
.ui-pos-good { color: ${cssVar("hpGreen")}; }
.ui-pos-bad { color: ${cssVar("hpLow")}; }
.ui-mmr-col { color: ${cssVar("accentGold")}; min-width: 44px; text-align: right; }

/* Placement distribution bars */
.ui-dist { display: flex; gap: 4px; width: 100%; align-items: flex-end; height: 72px; }
.ui-dist-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; gap: 3px; }
.ui-dist-bar { width: 100%; border-radius: 3px 3px 0 0; min-height: 2px; background: ${cssVar("hpBarOther")}; transition: height .2s; }
.ui-dist-col.top .ui-dist-bar { background: ${cssVar("hpGreen")}; }
.ui-dist-label { font-size: 9px; color: ${cssVar("textMuted")}; }

/* Diamond + tier motifs (shared with the canvas trait chips / tier rings) */
.ui-diamond {
  width: 13px; height: 13px; flex: 0 0 auto; transform: rotate(45deg);
  border: 2px solid var(--dia, ${cssVar("textMuted")}); border-radius: 2px; background: ${cssVar("tokenBg")};
}
.ui-tier-legend { display: flex; flex-wrap: wrap; gap: 10px; width: 100%; }
.ui-tier-chip { display: flex; align-items: center; gap: 6px; font-size: 11px; color: ${cssVar("textMuted")}; }
.ui-trait-legend { display: flex; flex-wrap: wrap; gap: 8px; width: 100%; margin-top: 4px; }
.ui-trait-chip {
  display: flex; align-items: center; gap: 6px; font-size: 11px; color: ${cssVar("textLabel")};
  padding: 4px 9px; border-radius: 999px; background: ${cssVar("bgPanelRaise")};
  border: 1px solid var(--dia, ${cssVar("chipBorder")});
}

/* How to play */
.ui-howto-body { width: 100%; font-size: 13px; line-height: 1.6; color: ${cssVar("textPrimary")}; }
.ui-howto-body h3 { color: ${cssVar("accentGold")}; font-size: 15px; letter-spacing: 1px; margin-bottom: 10px; }
.ui-howto-body p { margin-bottom: 8px; line-height: 1.6; }
.ui-howto-nav { display: flex; justify-content: space-between; width: 100%; align-items: center; }
.ui-toast { color: ${cssVar("textToast")}; font-size: 12px; min-height: 16px; }

/* In-match pause panel (the ☰ button itself lives in the Pixi HUD layer) */
.match-modal {
  position: absolute; inset: 0; pointer-events: auto; z-index: 22;
  background: rgba(0,0,0,0.62); display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(2px);
}
.match-modal .ui-card { max-width: 320px; }

/* Coachmarks */
#coach-overlay { position: absolute; inset: 0; pointer-events: auto; z-index: 23; }
.coach-dim { position: absolute; inset: 0; background: rgba(0,0,0,0.55); }
.coach-ring {
  position: absolute; border: 2px solid ${cssVar("accentGold")}; border-radius: 8px;
  box-shadow: 0 0 0 2000px rgba(0,0,0,0.55); transition: all .15s;
}
.coach-card {
  position: absolute; max-width: 240px; background: ${cssVar("panelBg")};
  border: 1px solid ${cssVar("accentGold")}; border-radius: 9px; padding: 12px;
  display: flex; flex-direction: column; gap: 8px;
}
.coach-card h4 { color: ${cssVar("accentGold")}; font-size: 14px; }
.coach-card p { font-size: 12px; line-height: 1.5; }
.coach-card .coach-actions { display: flex; justify-content: space-between; }
.coach-card button { font-size: 12px; padding: 5px 12px; }

/* ══════════════════════════════════════════════════════════════════════════
   MAIN MENU — landscape-first DOM/CSS shell (references/main-menu.md).
   Five regions over the full #ui-root box: top bar, left nav, key-art stage,
   promo banner, play cluster. %-based positioning so it scales across
   landscape aspect ratios; treat the spec's regions as targets, not px boxes.
   ══════════════════════════════════════════════════════════════════════════ */
.ui-mainmenu {
  position: absolute; inset: 0;
  display: grid;
  grid-template-columns: 17% 1fr;
  grid-template-rows: 12% 1fr;
  overflow: hidden;
}
.ui-icon { display: inline-flex; align-items: center; justify-content: center; line-height: 0; color: inherit; }
.ui-icon svg { display: block; }

/* ── 2.1 Top utility bar ──────────────────────────────────────────────────── */
.mm-topbar {
  grid-column: 1 / -1; grid-row: 1;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 14px; gap: 12px;
  background: ${cssVar("surfaceRaise")}; border-bottom: 1px solid ${cssVar("borderSubtle")};
  position: relative; z-index: 5;
  min-height: 52px;
}
.mm-identity {
  appearance: none; border: none; background: transparent; cursor: pointer;
  display: flex; align-items: center; gap: 10px; padding: 4px 6px 4px 2px; border-radius: 999px;
  transition: filter .12s, transform .08s; color: inherit; font-family: inherit;
  max-width: 46%; min-width: 0;
}
.mm-identity:hover { filter: brightness(1.15); }
.mm-identity:active { filter: brightness(0.88); transform: scale(0.98); transform-origin: left center; }
.mm-avatar-frame {
  position: relative; flex: 0 0 auto; width: 38px; height: 38px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: ${cssVar("bgUnit")}; border: 2px solid ${cssVar("chipBorder")};
  color: ${cssVar("textPrimary")};
}
.mm-avatar-glyph { display: flex; }
.mm-level-badge {
  position: absolute; right: -3px; bottom: -3px; min-width: 16px; height: 16px; padding: 0 3px;
  border-radius: 999px; background: ${cssVar("rankGold")}; color: ${cssVar("surfaceBase")};
  font-size: 9px; font-weight: 800; line-height: 16px; text-align: center;
  border: 1px solid ${cssVar("surfaceRaise")};
}
.mm-identity-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; align-items: flex-start; }
.mm-player-name {
  font-size: 13px; font-weight: 700; color: ${cssVar("textPrimary")};
  max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mm-identity .ui-rank-badge { padding: 1px 7px; font-size: 9px; }

.mm-topbar-right { display: flex; align-items: center; gap: 10px; flex: 0 0 auto; }
.mm-currency-chip {
  appearance: none; border: 1px solid ${cssVar("chipBorder")}; cursor: pointer;
  background: ${cssVar("bgPanelRaise")}; color: ${cssVar("textGold")};
  display: flex; align-items: center; gap: 6px; padding: 6px 12px 6px 8px; border-radius: 999px;
  font-family: inherit; font-size: 13px; font-weight: 700; margin-right: 4px;
  transition: filter .12s, transform .08s;
}
.mm-currency-chip:hover { filter: brightness(1.2); }
.mm-currency-chip:active { filter: brightness(0.88); transform: scale(0.96); transform-origin: center; }
.mm-currency-chip .ui-icon { color: ${cssVar("accentGold")}; }
.mm-util-btn {
  appearance: none; border: none; background: transparent; cursor: pointer;
  width: 36px; height: 36px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: ${cssVar("textPrimary")}; position: relative;
  transition: background .12s, transform .08s;
}
.mm-util-btn:hover { background: ${cssVar("surfaceFloat")}; }
.mm-util-btn:active { background: ${cssVar("surfaceFloat")}; transform: scale(0.92); transform-origin: center; }
.mm-notif-dot {
  position: absolute; top: 5px; right: 6px; width: 7px; height: 7px; border-radius: 50%;
  background: ${cssVar("textBadHP")}; border: 1px solid ${cssVar("surfaceRaise")};
}
.mm-notif-dot.hidden { display: none; }

/* ── 2.2 Left vertical nav ────────────────────────────────────────────────── */
.mm-leftnav {
  grid-column: 1; grid-row: 2;
  display: flex; flex-direction: column;
  padding: 5% 0 0 0;
  position: relative; z-index: 5;
}
.mm-nav-row {
  appearance: none; border: none; background: transparent; cursor: pointer;
  display: flex; align-items: flex-start; gap: 10px;
  padding: 8px 6px 8px 4%; margin-bottom: 6%;
  text-align: left; font-family: inherit; color: inherit;
  transition: filter .12s, transform .08s;
}
.mm-nav-row:hover { filter: brightness(1.2); }
.mm-nav-row:active { filter: brightness(0.85); transform: scale(0.98); transform-origin: left center; }
.mm-nav-row:nth-child(1) { margin-bottom: 9%; }
.mm-nav-icon {
  flex: 0 0 auto; width: 30px; height: 30px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: ${cssVar("textDimmed")}; background: transparent;
}
.mm-nav-medallion {
  border: 2px solid ${cssVar("borderSubtle")};
}
.mm-nav-active .mm-nav-medallion {
  border-color: ${cssVar("accentGold")}; color: ${cssVar("accentGold")};
  box-shadow: 0 0 0 2px color-mix(in srgb, ${cssVar("accentGold")} 25%, transparent);
}
.mm-nav-col { display: flex; flex-direction: column; gap: 6px; min-width: 0; padding-top: 4px; }
.mm-nav-label {
  font-size: 12px; font-weight: 600; color: ${cssVar("textMuted")};
  letter-spacing: 0.3px; white-space: nowrap;
}
.mm-nav-active .mm-nav-label { font-weight: 800; font-size: 13px; color: ${cssVar("accentGold")}; }
.mm-nav-active .mm-nav-icon { color: ${cssVar("accentGold")}; }
.mm-nav-subblock { display: flex; flex-direction: column; gap: 3px; margin-top: 2px; }
.mm-nav-sub-text { font-size: 10px; color: ${cssVar("textMuted")}; white-space: nowrap; }
.mm-nav-progress-track {
  width: 92px; height: 5px; border-radius: 999px; overflow: hidden;
  background: ${cssVar("bgPanelRaise")}; border: 1px solid ${cssVar("borderSubtle")};
}
.mm-nav-progress-fill {
  height: 100%; min-width: 2px; border-radius: 999px;
  background: ${cssVar("xpPurple")};
}

/* ── 2.3 Center-right key-art stage (placeholder art slots) ─────────────────
   Neutral labeled boxes; drop a background-image/<img> in later — see the
   class names below (swap seam). Purely decorative, no interaction. */
.mm-keyart-stage {
  grid-column: 2; grid-row: 1 / -1;
  position: relative; overflow: hidden;
  background: ${cssVar("surfaceBase")};
  z-index: 1;
}
.mm-keyart-bg {
  position: absolute; inset: 0; z-index: 1;
  display: flex; align-items: center; justify-content: center;
  background:
    linear-gradient(180deg, color-mix(in srgb, ${cssVar("surfaceBase")} 70%, transparent) 0%, ${cssVar("surfaceBase")} 100%),
    repeating-linear-gradient(135deg, ${cssVar("surfaceRaise")} 0 18px, ${cssVar("surfaceBase")} 18px 36px);
  color: ${cssVar("textDimmed")}; font-size: 11px; letter-spacing: 1px; text-transform: uppercase;
}
.mm-keyart-ambient {
  position: absolute; right: 0; top: 0; width: 60%; height: 60%; z-index: 2;
  display: flex; align-items: flex-start; justify-content: flex-end; padding: 3% 4%;
  background: radial-gradient(60% 60% at 70% 30%, color-mix(in srgb, ${cssVar("accentGold")} 22%, transparent) 0%, transparent 70%);
  color: ${cssVar("textDimmed")}; font-size: 9px; letter-spacing: 1px; text-transform: uppercase;
  opacity: 0.8;
}
.mm-keyart-hero {
  position: absolute; right: 8%; top: 6%; bottom: 6%; width: 42%; z-index: 3;
  display: flex; align-items: flex-end; justify-content: center; padding-bottom: 6%;
  background: linear-gradient(180deg, transparent 0%, color-mix(in srgb, ${cssVar("surfaceFloat")} 55%, transparent) 100%);
  border-radius: 16px;
  color: ${cssVar("textMuted")}; font-size: 11px; letter-spacing: 1px; text-transform: uppercase;
  outline: 1px dashed ${cssVar("borderSubtle")}; outline-offset: -1px;
}

/* ── 2.4 Bottom-left promo banner ─────────────────────────────────────────── */
.mm-promo-card {
  position: absolute; left: 0; bottom: 0; width: 30%; height: 22%;
  z-index: 4;
  appearance: none; border: none; cursor: pointer; font-family: inherit; color: inherit;
  display: flex; align-items: center; gap: 10px; padding: 0 14px 0 18px;
  background: ${cssVar("surfaceRaise")};
  border-top: 1px solid ${cssVar("itemFrame")}; border-right: 1px solid ${cssVar("itemFrame")};
  clip-path: polygon(0 0, 100% 0, 88% 100%, 0 100%);
  transition: filter .12s, transform .08s;
}
.mm-promo-card:hover { filter: brightness(1.15); }
.mm-promo-card:active { filter: brightness(0.88); transform: scale(0.98); transform-origin: left bottom; }
.mm-promo-thumb {
  flex: 0 0 auto; width: 34px; height: 34px; border-radius: 7px;
  display: flex; align-items: center; justify-content: center;
  background: ${cssVar("bgPanelRaise")}; border: 1px solid ${cssVar("itemFrame")};
  color: ${cssVar("itemFrame")};
}
.mm-promo-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.mm-promo-title {
  font-size: 13px; font-weight: 800; color: ${cssVar("textGold")};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mm-promo-subtitle {
  font-size: 10px; color: ${cssVar("textMuted")};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* ── 2.5 Bottom-right play cluster ────────────────────────────────────────── */
.mm-play-cluster {
  position: absolute; right: 2%; bottom: 3%;
  z-index: 6;
  display: flex; align-items: center; gap: 10px;
}
.mm-mode-chip {
  appearance: none; border: 1px solid ${cssVar("chipBorder")}; cursor: pointer;
  background: ${cssVar("bgPanelRaise")}; color: ${cssVar("textLabel")};
  display: flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 999px;
  font-family: inherit; font-size: 12px; font-weight: 600;
  transition: filter .12s, transform .08s;
}
.mm-mode-chip:hover { filter: brightness(1.2); border-color: ${cssVar("accentGold")}; }
.mm-mode-chip:active { filter: brightness(0.88); transform: scale(0.96); transform-origin: center; }
.mm-mode-icon { display: flex; color: ${cssVar("textMuted")}; }
.mm-play-btn {
  appearance: none; border: 1px solid ${cssVar("accentGold")}; cursor: pointer;
  background: linear-gradient(180deg, ${cssVar("accentGold")} 0%, ${cssVar("starGold")} 100%);
  color: ${cssVar("surfaceBase")};
  display: flex; align-items: center; justify-content: center; gap: 8px;
  height: 56px; width: 168px; border-radius: 999px;
  font-family: inherit; font-size: 17px; font-weight: 800; letter-spacing: 1px;
  position: relative; overflow: hidden;
  box-shadow: 0 0 0 4px color-mix(in srgb, ${cssVar("accentGold")} 18%, transparent), 0 8px 24px rgba(0,0,0,0.45);
  transition: filter .12s, transform .08s, box-shadow .12s;
}
/* Top highlight band — the project's established primary-CTA treatment. */
.mm-play-btn::before {
  content: ""; position: absolute; top: 0; left: 6%; right: 6%; height: 38%;
  border-radius: 999px 999px 0 0;
  background: linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 100%);
  pointer-events: none;
}
.mm-play-btn:hover {
  filter: brightness(1.08);
  box-shadow: 0 0 0 6px color-mix(in srgb, ${cssVar("accentGold")} 24%, transparent), 0 8px 24px rgba(0,0,0,0.45);
}
.mm-play-btn:active {
  filter: brightness(0.92); transform: scale(0.97); transform-origin: center;
}
.mm-play-label { position: relative; z-index: 1; }
.mm-play-btn .ui-icon { position: relative; z-index: 1; }

/* Reduced motion: disable menu transitions (combat fx handled in CombatView). */
.reduced-motion * { transition: none !important; animation: none !important; }
/* Honor the OS preference even without the DOM class (button press transforms). */
@media (prefers-reduced-motion: reduce) {
  .ui-btn, .ui-btn-wide, .ui-btn-back, .ui-btn-nav { transition: none; }
  .ui-btn:active, .ui-btn-wide:active, .ui-btn-back:active, .ui-btn-nav:active { transform: none; }
  .mm-identity, .mm-currency-chip, .mm-util-btn, .mm-nav-row, .mm-promo-card, .mm-mode-chip, .mm-play-btn { transition: none; }
  .mm-identity:active, .mm-currency-chip:active, .mm-util-btn:active, .mm-nav-row:active,
  .mm-promo-card:active, .mm-mode-chip:active, .mm-play-btn:active { transform: none; }
}

/* ── Landscape meta-screen comfort (additive; portrait unaffected) ──────────── */
@media (orientation: landscape) {
  /* Wider, scrollable screens; comfortable bottom safe-area padding. */
  .ui-screen {
    max-width: 760px; padding: 16px 24px;
    padding-bottom: max(16px, env(safe-area-inset-bottom, 0px));
    gap: 9px;
  }
  /* Compress the vertical title space and shrink the wordmark/title. */
  .ui-wordmark { font-size: 28px; margin: 6px 0 2px; }
  .ui-title { font-size: 22px; margin: 8px 0 2px; }
  .ui-subtitle { margin-bottom: 4px; }
  /* Lay the Main Menu primary actions in two columns to use the wide viewport. */
  .ui-btn { width: 300px; }
  /* Modal cards (pause, etc.) never exceed the short viewport — scroll inside. */
  .ui-card { max-height: calc(100vh - 32px); overflow-y: auto; }
  .match-modal .ui-card { max-width: 420px; }
}

/* Extra compression for very short landscape viewports. */
@media (orientation: landscape) and (max-height: 420px) {
  .ui-screen { padding-top: 8px; gap: 7px; }
  .ui-wordmark { font-size: 24px; }
  .ui-title { font-size: 19px; margin: 4px 0 2px; }
  .ui-btn, .ui-btn-wide { padding: 9px 14px; font-size: 14px; }
  .ui-card { padding: 10px; gap: 7px; }
  .ui-dist { height: 56px; }
}

/* Main-menu compression for short landscape viewports (phones in landscape). */
@media (max-height: 420px) {
  .mm-topbar { min-height: 44px; padding: 0 10px; }
  .mm-avatar-frame { width: 32px; height: 32px; }
  .mm-util-btn { width: 30px; height: 30px; }
  .mm-currency-chip { padding: 5px 10px 5px 7px; font-size: 12px; }
  .mm-nav-row { margin-bottom: 4%; padding: 5px 6px 5px 4%; }
  .mm-nav-row:nth-child(1) { margin-bottom: 6%; }
  .mm-nav-icon { width: 26px; height: 26px; }
  .mm-nav-progress-track { width: 72px; }
  .mm-play-btn { height: 46px; width: 140px; font-size: 15px; }
  .mm-promo-card { height: 24%; }
}

/* Portrait fallback: stack the regions instead of the landscape grid so the
   shell stays usable if a phone is held upright (main menu is landscape-first
   per spec; this only prevents clipping, not a designed portrait layout). */
@media (orientation: portrait) {
  .ui-mainmenu {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto 1fr auto auto;
    overflow-y: auto;
  }
  .mm-leftnav { grid-column: 1; grid-row: 2; flex-direction: row; flex-wrap: wrap; gap: 12px; padding: 10px; }
  .mm-nav-row { margin-bottom: 0; }
  .mm-keyart-stage { grid-column: 1; grid-row: 3; min-height: 160px; }
  .mm-promo-card { position: static; width: 100%; height: auto; grid-column: 1; grid-row: 4; clip-path: none; padding: 12px 16px; }
  .mm-play-cluster { position: static; grid-column: 1; grid-row: 5; justify-content: center; padding: 12px; }
}
`;
}

/** Inject the stylesheet (idempotent) and apply theme custom properties to :root. */
export function injectStyles(): void {
  applyThemeVars();
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = css();
  document.head.appendChild(style);
}
