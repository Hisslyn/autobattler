// Pixi renderers for the in-match inspect panels (kept in the Pixi world to
// match the existing scout overlay; the DOM overlay owns only meta screens).
// Both panels render strictly from the pure models (inspectModel /
// traitDetailModel) — no game logic here. A tap on the scrim dismisses.
import * as PIXI from "pixi.js";
import { C, tierColor, traitColor } from "./theme.js";
import { drawUnitToken } from "./unitToken.js";
import { drawGlyph, glyphForTraits } from "./glyphs.js";
import type { InspectModel } from "./inspectModel.js";
import type { TraitDetailModel } from "./traitDetailModel.js";

const DESIGN_W = 390;
const DESIGN_H = 844;

function scrim(layer: PIXI.Container, onClose: () => void): void {
  const s = new PIXI.Graphics();
  s.beginFill(C.bgScrim, 0.6);
  s.drawRect(0, 0, DESIGN_W, DESIGN_H);
  s.endFill();
  s.eventMode = "static";
  s.cursor = "pointer";
  s.on("pointerdown", onClose);
  layer.addChild(s);
}

function panelBox(
  layer: PIXI.Container,
  x: number, y: number, w: number, h: number,
  accent: number
): void {
  const box = new PIXI.Graphics();
  box.beginFill(C.bgInspect, 0.98);
  box.lineStyle(1.5, accent, 0.9);
  box.drawRoundedRect(x, y, w, h, 10);
  box.endFill();
  box.lineStyle(0);
  box.eventMode = "static"; // swallow taps so they don't dismiss via the scrim
  layer.addChild(box);
}

function closeButton(layer: PIXI.Container, x: number, y: number, onClose: () => void): void {
  const btn = new PIXI.Graphics();
  btn.beginFill(C.bgCloseBtn, 0.95);
  btn.drawRoundedRect(x, y, 26, 22, 5);
  btn.endFill();
  btn.eventMode = "static";
  btn.cursor = "pointer";
  btn.hitArea = new PIXI.Rectangle(x, y, 26, 22);
  btn.on("pointerdown", onClose);
  layer.addChild(btn);
  const t = new PIXI.Text({ text: "✕", style: { fontSize: 12, fill: C.textMuted, fontFamily: "monospace" } });
  t.anchor.set(0.5);
  t.x = x + 13; t.y = y + 11;
  t.eventMode = "none";
  layer.addChild(t);
}

function text(
  layer: PIXI.Container, str: string, x: number, y: number,
  size: number, fill: number, anchor: [number, number] = [0, 0]
): void {
  const t = new PIXI.Text({ text: str, style: { fontSize: size, fill, fontFamily: "monospace" } });
  t.anchor.set(anchor[0], anchor[1]);
  t.x = x; t.y = y;
  t.eventMode = "none";
  layer.addChild(t);
}

/** Rotated diamond + glyph chip (shared trait motif), centered at (cx, cy). */
function traitDiamond(layer: PIXI.Container, traitId: string, cx: number, cy: number, dr = 8): void {
  const col = traitColor(traitId);
  const d = new PIXI.Graphics();
  d.poly([cx, cy - dr, cx + dr, cy, cx, cy + dr, cx - dr, cy]);
  d.fill({ color: col, alpha: 0.35 });
  d.poly([cx, cy - dr, cx + dr, cy, cx, cy + dr, cx - dr, cy]);
  d.stroke({ width: 1, color: col });
  d.eventMode = "none";
  layer.addChild(d);
  const g = new PIXI.Graphics();
  drawGlyph(g, glyphForTraits([traitId]), cx, cy, dr * 1.2, col);
  g.eventMode = "none";
  layer.addChild(g);
}

/** Render the unit-inspect panel (identity + traits + ability + full stats). */
export function renderUnitInspect(
  layer: PIXI.Container,
  m: InspectModel,
  onClose: () => void
): void {
  layer.removeChildren();
  scrim(layer, onClose);

  const w = DESIGN_W - 56;
  const x = 28;
  const h = 340;
  const y = (DESIGN_H - h) / 2 - 30;
  const accent = tierColor(m.tier);
  panelBox(layer, x, y, w, h, accent);
  closeButton(layer, x + w - 32, y + 8, onClose);

  // Header: token + name + tier·cost
  const tokenC = new PIXI.Container();
  tokenC.eventMode = "none";
  drawUnitToken(tokenC, m.defId, m.tier, m.star, x + 34, y + 36, { radius: 22 });
  layer.addChild(tokenC);
  text(layer, m.name, x + 64, y + 22, 14, C.textPrimary, [0, 0]);
  text(layer, `Tier ${m.tier}`, x + 64, y + 42, 9, accent, [0, 0]);
  // cost (gold)
  const coin = new PIXI.Graphics();
  drawGlyph(coin, "coin", x + 110, y + 47, 10, C.starGold);
  coin.eventMode = "none";
  layer.addChild(coin);
  text(layer, `${m.cost}`, x + 118, y + 47, 10, C.textGold, [0, 0.5]);

  // Traits row (origin + classes) with the diamond+glyph motif
  let tx = x + 16;
  const traitY = y + 76;
  const traitChip = (id: string, name: string): void => {
    traitDiamond(layer, id, tx + 9, traitY + 8, 8);
    text(layer, name, tx + 22, traitY + 8, 9, C.textLabel, [0, 0.5]);
    tx += 24 + name.length * 5.6 + 10;
  };
  if (m.origin) traitChip(m.origin.id, m.origin.name);
  for (const c of m.classes) traitChip(c.id, c.name);

  // Ability block
  const abY = y + 104;
  const abRow = new PIXI.Graphics();
  abRow.beginFill(C.bgInspectRow, 0.9);
  abRow.drawRoundedRect(x + 14, abY, w - 28, 52, 6);
  abRow.endFill();
  abRow.eventMode = "none";
  layer.addChild(abRow);
  text(layer, m.ability.name, x + 22, abY + 8, 11, C.textPrimary, [0, 0]);
  const mcoin = new PIXI.Graphics();
  drawGlyph(mcoin, "spark", x + w - 56, abY + 13, 9, C.manaBlue);
  mcoin.eventMode = "none";
  layer.addChild(mcoin);
  text(layer, `${m.ability.manaCost}`, x + w - 48, abY + 13, 10, C.manaBlue, [0, 0.5]);
  wrapText(layer, m.ability.description, x + 22, abY + 26, w - 44, 9, C.textMuted);

  // Stat grid (2 columns)
  const gridY = y + 170;
  const colW = (w - 28) / 2;
  m.stats.forEach((stat, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const rx = x + 14 + col * colW;
    const ry = gridY + row * 30;
    const cell = new PIXI.Graphics();
    cell.beginFill(C.bgInspectRow, 0.7);
    cell.drawRoundedRect(rx, ry, colW - 6, 26, 5);
    cell.endFill();
    cell.eventMode = "none";
    layer.addChild(cell);
    text(layer, stat.label, rx + 8, ry + 13, 9, C.textMuted, [0, 0.5]);
    text(layer, stat.value, rx + colW - 14, ry + 13, 11, C.textPrimary, [1, 0.5]);
  });
}

/** Render the trait-detail panel (breakpoints + what each grants). */
export function renderTraitDetail(
  layer: PIXI.Container,
  m: TraitDetailModel,
  onClose: () => void
): void {
  layer.removeChildren();
  scrim(layer, onClose);

  const accent = traitColor(m.id);
  const w = DESIGN_W - 80;
  const x = 40;
  const rowH = 34;
  const headerH = 76;
  const h = headerH + m.rows.length * (rowH + 6) + 16;
  const y = (DESIGN_H - h) / 2 - 20;
  panelBox(layer, x, y, w, h, accent);
  closeButton(layer, x + w - 32, y + 8, onClose);

  traitDiamond(layer, m.id, x + 26, y + 30, 12);
  text(layer, m.name, x + 46, y + 18, 14, C.textPrimary, [0, 0]);
  const kindLabel = m.kind === "origin" ? "Origin" : "Class";
  text(layer, `${kindLabel} · ${m.count} fielded`, x + 46, y + 40, 9, accent, [0, 0]);

  m.rows.forEach((r, i) => {
    const ry = y + headerH + i * (rowH + 6);
    const row = new PIXI.Graphics();
    row.beginFill(r.active ? C.bgInspectRow : C.bgInspect, r.reached ? 0.95 : 0.5);
    row.lineStyle(1, r.active ? accent : C.chipBorder, r.active ? 0.9 : 0.4);
    row.drawRoundedRect(x + 14, ry, w - 28, rowH, 6);
    row.endFill();
    row.lineStyle(0);
    row.eventMode = "none";
    row.alpha = r.reached ? 1 : 0.55;
    layer.addChild(row);

    // count badge ("(N)") + active checkmark, so meaning isn't color-only
    const badge = r.active ? `▸ ${r.count}` : `${r.count}`;
    text(layer, badge, x + 26, ry + rowH / 2, 11, r.reached ? accent : C.textMuted, [0, 0.5]);
    text(layer, r.effect, x + 64, ry + rowH / 2, 10, r.reached ? C.textPrimary : C.textMuted, [0, 0.5]);
  });
}

/** Simple word-wrap into a fixed width; returns lines drawn. */
function wrapText(
  layer: PIXI.Container, str: string, x: number, y: number,
  maxW: number, size: number, fill: number
): void {
  const charW = size * 0.6;
  const perLine = Math.max(1, Math.floor(maxW / charW));
  const words = str.split(" ");
  let line = "";
  let ly = y;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > perLine && line) {
      text(layer, line, x, ly, size, fill, [0, 0]);
      line = word;
      ly += size + 3;
    } else {
      line = next;
    }
  }
  if (line) text(layer, line, x, ly, size, fill, [0, 0]);
}
