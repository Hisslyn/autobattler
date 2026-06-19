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

/* In-match pause control + panel */
.match-pause-btn {
  position: absolute; top: 8px; left: 8px; pointer-events: auto;
  background: ${cssVar("panelBg")}; color: ${cssVar("textPrimary")};
  border: 1px solid ${cssVar("chipBorder")}; border-radius: 7px;
  font-family: inherit; font-size: 14px; padding: 6px 11px; cursor: pointer; z-index: 21;
}
.match-pause-btn:hover { border-color: ${cssVar("accentGold")}; }
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

/* Reduced motion: disable menu transitions (combat fx handled in CombatView). */
.reduced-motion * { transition: none !important; animation: none !important; }
/* Honor the OS preference even without the DOM class (button press transforms). */
@media (prefers-reduced-motion: reduce) {
  .ui-btn, .ui-btn-wide, .ui-btn-back, .ui-btn-nav { transition: none; }
  .ui-btn:active, .ui-btn-wide:active, .ui-btn-back:active, .ui-btn-nav:active { transform: none; }
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
  /* Trait rail sits at the left edge in landscape; the opponent rail (with the
     "Player N" labels) hugs the right edge and now starts at the top corner
     (Player 1 aligned to this button's row), so park the pause button just to the
     LEFT of Player 1 — reading [menu] [Player 1] across the top — with a small gap,
     not overlapping. The smaller offset hugs the rail across the supported scale
     range instead of sitting far to its left. */
  .match-pause-btn { left: auto; right: 96px; top: 12px; }
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
