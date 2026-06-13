// Single stylesheet for the DOM meta layer. Every color resolves to a CSS
// custom property generated from theme.ts (the single palette source), so DOM
// and the Pixi canvas never drift. No hex literals here.
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
#ui-root { background: ${cssVar("bgPage")}; overflow-y: auto; z-index: 10; }
#ui-root.hidden { display: none; }
#match-overlay { z-index: 20; pointer-events: none; }
#match-overlay.hidden { display: none; }

.ui-screen {
  min-height: 100%;
  display: flex; flex-direction: column; align-items: center;
  padding: 24px 16px 40px; gap: 14px;
  max-width: 440px; margin: 0 auto;
}
.ui-title { font-size: 26px; font-weight: 700; letter-spacing: 2px; color: ${cssVar("textLabel")}; margin: 18px 0 6px; }
.ui-subtitle { font-size: 13px; color: ${cssVar("textMuted")}; margin-bottom: 6px; }
.ui-section-title { font-size: 14px; color: ${cssVar("textLabel")}; align-self: flex-start; margin-top: 10px; }
.ui-muted { color: ${cssVar("textMuted")}; font-size: 12px; }

.ui-btn, .ui-btn-back, .ui-btn-wide {
  appearance: none; border: 1px solid ${cssVar("bgBoardSel")};
  background: ${cssVar("bgMenuBtn")}; color: ${cssVar("textLabel")};
  font-family: inherit; font-size: 15px; padding: 12px 18px; border-radius: 8px;
  cursor: pointer; width: 240px; text-align: center; transition: filter .12s;
}
.ui-btn:hover, .ui-btn-wide:hover, .ui-btn-back:hover { filter: brightness(1.3); }
.ui-btn:disabled { opacity: .45; cursor: not-allowed; }
.ui-btn-wide { width: 100%; }
.ui-btn-back { width: auto; font-size: 13px; padding: 8px 14px; align-self: flex-start; }
.ui-btn-primary { background: ${cssVar("bgContinue")}; color: ${cssVar("textReady")}; }
.ui-btn-danger { background: ${cssVar("bgSellZone")}; color: ${cssVar("textSell")}; }

.ui-card {
  width: 100%; background: ${cssVar("bgPanel")}; border: 1px solid ${cssVar("bgBoardSel")};
  border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 8px;
}
.ui-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; }
.ui-row label { font-size: 13px; color: ${cssVar("textLabel")}; }
.ui-row input[type=range] { flex: 1; accent-color: ${cssVar("manaFill")}; }
.ui-row input[type=text] {
  flex: 1; background: ${cssVar("bgPage")}; border: 1px solid ${cssVar("bgBoardSel")};
  color: ${cssVar("textPrimary")}; font-family: inherit; font-size: 14px; padding: 8px; border-radius: 6px;
}
.ui-val { font-size: 12px; color: ${cssVar("textMuted")}; min-width: 34px; text-align: right; }

.ui-toggle { cursor: pointer; user-select: none; }
.ui-toggle[data-on="true"] { color: ${cssVar("textReady")}; }
.ui-toggle[data-on="false"] { color: ${cssVar("textMuted")}; }

.ui-rank { font-weight: 700; }
.ui-bigmmr { font-size: 30px; color: ${cssVar("textGold")}; }

.ui-list { width: 100%; display: flex; flex-direction: column; gap: 4px; }
.ui-list-row {
  display: flex; justify-content: space-between; gap: 8px; font-size: 12px;
  padding: 7px 10px; background: ${cssVar("bgShopCard")}; border-radius: 5px;
}
.ui-list-row .pos { color: ${cssVar("textMuted")}; min-width: 22px; }
.ui-list-row .name { flex: 1; color: ${cssVar("textPrimary")}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ui-pos-good { color: ${cssVar("textGoodHP")}; }
.ui-pos-bad { color: ${cssVar("textBadHP")}; }

.ui-dist { display: flex; gap: 4px; width: 100%; align-items: flex-end; height: 70px; }
.ui-dist-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; gap: 3px; }
.ui-dist-bar { width: 100%; background: ${cssVar("hpBarSelf")}; border-radius: 2px 2px 0 0; min-height: 2px; }
.ui-dist-label { font-size: 9px; color: ${cssVar("textMuted")}; }

.ui-howto-body { width: 100%; font-size: 13px; line-height: 1.55; color: ${cssVar("textPrimary")}; }
.ui-howto-body h3 { color: ${cssVar("textGold")}; font-size: 15px; margin-bottom: 8px; }
.ui-howto-body p { margin-bottom: 8px; }
.ui-howto-nav { display: flex; justify-content: space-between; width: 100%; align-items: center; }
.ui-toast { color: ${cssVar("textToast")}; font-size: 12px; min-height: 16px; }

/* In-match pause control + panel */
.match-pause-btn {
  position: absolute; top: 8px; left: 8px; pointer-events: auto;
  background: ${cssVar("bgMenuBtn")}; color: ${cssVar("textLabel")};
  border: 1px solid ${cssVar("bgBoardSel")}; border-radius: 6px;
  font-family: inherit; font-size: 14px; padding: 6px 10px; cursor: pointer; z-index: 21;
}
.match-modal {
  position: absolute; inset: 0; pointer-events: auto; z-index: 22;
  background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center;
}
.match-modal .ui-card { max-width: 320px; }

/* Coachmarks */
#coach-overlay { position: absolute; inset: 0; pointer-events: auto; z-index: 23; }
.coach-dim { position: absolute; inset: 0; background: rgba(0,0,0,0.55); }
.coach-ring {
  position: absolute; border: 2px solid ${cssVar("textGold")}; border-radius: 8px;
  box-shadow: 0 0 0 2000px rgba(0,0,0,0.55); transition: all .15s;
}
.coach-card {
  position: absolute; max-width: 240px; background: ${cssVar("bgPanel")};
  border: 1px solid ${cssVar("textGold")}; border-radius: 8px; padding: 12px;
  display: flex; flex-direction: column; gap: 8px;
}
.coach-card h4 { color: ${cssVar("textGold")}; font-size: 14px; }
.coach-card p { font-size: 12px; line-height: 1.5; }
.coach-card .coach-actions { display: flex; justify-content: space-between; }
.coach-card button { font-size: 12px; padding: 5px 12px; }

/* Reduced motion: disable menu transitions (combat fx handled in CombatView). */
.reduced-motion * { transition: none !important; animation: none !important; }
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
