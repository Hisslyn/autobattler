// Pixi renderers for the in-match inspect panels (kept in the Pixi world to
// match the existing scout overlay; the DOM overlay owns only meta screens).
// Both panels render strictly from the pure models (inspectModel /
// traitDetailModel) — no game logic here. A tap on the scrim dismisses.
import * as PIXI from "pixi.js";
import { C, tierColor, traitColor } from "./theme.js";
import { drawUnitToken } from "./unitToken.js";
import { drawGlyph, glyphForTraits } from "./glyphs.js";
import { drawItemIcon } from "./itemIconDraw.js";
import type { InspectModel } from "./inspectModel.js";
import type { TraitDetailModel } from "./traitDetailModel.js";
import type { ItemModel } from "./itemModel.js";
import { centeredModal } from "./layout.js";
import type { MatchLayout } from "./layout.js";

// Portrait fallback dims (used when no layout is supplied, e.g. tests).
const PORTRAIT_W = 390;
const PORTRAIT_H = 844;

/** Design dims of the active layout (falls back to portrait). */
function dims(layout?: MatchLayout): { w: number; h: number } {
  return layout ? { w: layout.designW, h: layout.designH } : { w: PORTRAIT_W, h: PORTRAIT_H };
}

/**
 * Center a panel of (contentW, contentH) within the design space and cap its
 * height to the safe area so short landscape never overflows. Uses centeredModal
 * when a layout is supplied, else the portrait-faithful placement.
 */
function panelRect(
  layout: MatchLayout | undefined,
  contentW: number,
  contentH: number,
  portraitY: number
): { x: number; y: number; w: number; h: number } {
  if (layout) {
    const cap = Math.min(contentH, layout.designH - 40);
    return centeredModal(layout, contentW, cap, 16);
  }
  // Portrait fallback: preserve the original placement.
  return { x: (PORTRAIT_W - contentW) / 2, y: portraitY, w: contentW, h: contentH };
}

/**
 * A wrapper container that scale-ins (0.88 → 1.0) + fades from 0 → 1 over 100ms,
 * giving the modal a sense of origin instead of appearing fully-formed. The
 * caller adds all panel children into the returned container. Reduced motion
 * snaps to the final state. Uses requestAnimationFrame so it needs no Pixi ticker.
 */
function makePanelContainer(layer: PIXI.Container, reducedMotion: boolean): PIXI.Container {
  const c = new PIXI.Container();
  layer.addChild(c);
  if (reducedMotion) { c.scale.set(1); c.alpha = 1; return c; }
  c.scale.set(0.88);
  c.alpha = 0;
  const start = performance.now();
  const step = (): void => {
    if (c.destroyed) return;
    const k = Math.min(1, (performance.now() - start) / 100);
    const s = 0.88 + 0.12 * k;
    c.scale.set(s);
    c.alpha = k;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return c;
}

function scrim(layer: PIXI.Container, onClose: () => void, layout?: MatchLayout): void {
  const d = dims(layout);
  const s = new PIXI.Graphics();
  s.beginFill(C.bgScrim, 0.6);
  s.drawRect(0, 0, d.w, d.h);
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
  // v8 path API: fill + outer accent border + a 1px inset highlight rim so the
  // panel reads as a raised modal, not a flat overlay rectangle.
  box.roundRect(x, y, w, h, 10).fill({ color: C.bgInspect, alpha: 0.98 });
  box.roundRect(x, y, w, h, 10).stroke({ width: 1.5, color: accent, alpha: 0.85 });
  box.roundRect(x + 1, y + 1, w - 2, h - 2, 9).stroke({ width: 1, color: C.surfaceFloat, alpha: 0.3 });
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
  // Expand the hit area to ~62×44px (min touch target) without changing the
  // 26×22px visual; the leftward expansion stays inside the panel interior.
  btn.hitArea = new PIXI.Rectangle(x - 18, y - 11, 26 + 36, 22 + 22);
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
  d.fill({ color: col, alpha: 0.5 });
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
  onClose: () => void,
  layout?: MatchLayout,
  reducedMotion = false
): void {
  layer.removeChildren();
  scrim(layer, onClose, layout);
  // All panel content goes into a scale-in wrapper so the panel reveals from its
  // press origin instead of appearing fully-formed.
  const panel = makePanelContainer(layer, reducedMotion);

  const d = dims(layout);
  // Grow the panel when the unit carries items so the item row never collides.
  const itemRowH = m.items.length > 0 ? 56 : 0;
  const contentH = 340 + itemRowH;
  const rect = panelRect(layout, d.w - 56, contentH, (PORTRAIT_H - contentH) / 2 - 30);
  const w = rect.w, x = rect.x, y = rect.y, h = rect.h;
  const accent = tierColor(m.tier);
  panelBox(panel, x, y, w, h, accent);
  closeButton(panel, x + w - 32, y + 8, onClose);

  // Header: token + name + tier·cost
  const tokenC = new PIXI.Container();
  tokenC.eventMode = "none";
  drawUnitToken(tokenC, m.defId, m.tier, m.star, x + 34, y + 36, { radius: 22 });
  panel.addChild(tokenC);
  text(panel, m.name, x + 64, y + 22, 14, C.textPrimary, [0, 0]);
  text(panel, `Tier ${m.tier}`, x + 64, y + 42, 9, accent, [0, 0]);
  // cost (gold)
  const coin = new PIXI.Graphics();
  drawGlyph(coin, "coin", x + 110, y + 47, 10, C.accentGold);
  coin.eventMode = "none";
  panel.addChild(coin);
  text(panel, `${m.cost}`, x + 118, y + 47, 10, C.textGold, [0, 0.5]);

  // Traits row (origin + classes) with the diamond+glyph motif
  let tx = x + 16;
  const traitY = y + 76;
  const traitChip = (id: string, name: string): void => {
    traitDiamond(panel, id, tx + 9, traitY + 8, 8);
    text(panel, name, tx + 22, traitY + 8, 9, C.textLabel, [0, 0.5]);
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
  panel.addChild(abRow);
  text(panel, m.ability.name, x + 22, abY + 8, 12, C.textPrimary, [0, 0]);
  const mcoin = new PIXI.Graphics();
  drawGlyph(mcoin, "spark", x + w - 56, abY + 13, 9, C.manaBlue);
  mcoin.eventMode = "none";
  panel.addChild(mcoin);
  text(panel, `${m.ability.manaCost}`, x + w - 48, abY + 13, 10, C.manaBlue, [0, 0.5]);
  wrapText(panel, m.ability.description, x + 22, abY + 26, w - 44, 9, C.textMuted);

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
    panel.addChild(cell);
    text(panel, stat.label, rx + 8, ry + 13, 9, C.textMuted, [0, 0.5]);
    text(panel, stat.value, rx + colW - 14, ry + 13, 11, C.textPrimary, [1, 0.5]);
  });

  // Equipped items row (only when the unit holds any). Each chip shows a small
  // item glyph + name; tapping a chip opens that item's own detail panel.
  if (m.items.length > 0) {
    const itemsY = gridY + Math.ceil(m.stats.length / 2) * 30 + 8;
    text(panel, "ITEMS", x + 16, itemsY, 9, C.textMuted, [0, 0]);
    let ix = x + 14;
    const chipY = itemsY + 14;
    for (const item of m.items) {
      const chipW = 18 + item.name.length * 5.0 + 12;
      const chip = new PIXI.Graphics();
      chip.roundRect(ix, chipY, chipW, 24, 5).fill({ color: item.color, alpha: 0.95 });
      chip.roundRect(ix, chipY, chipW, 24, 5).stroke({ width: 1, color: C.itemBorder, alpha: 0.9 });
      // Completed items get the gilded inner rim (shared with the item frame motif).
      if (!item.component) {
        chip.roundRect(ix + 2, chipY + 2, chipW - 4, 20, 3).stroke({ width: 1, color: C.itemFrame, alpha: 0.55 });
      }
      chip.eventMode = "none";
      panel.addChild(chip);
      const ig = new PIXI.Container();
      drawItemIcon(ig, item.id, ix + 12, chipY + 12, { radius: 8, reducedMotion: true });
      ig.eventMode = "none";
      panel.addChild(ig);
      text(panel, item.name, ix + 22, chipY + 12, 8, C.textPrimary, [0, 0.5]);
      ix += chipW + 6;
    }
  }
}

/** Render the item-detail panel (identity + stat bundle + passive line). */
export function renderItemDetail(
  layer: PIXI.Container,
  m: ItemModel,
  onClose: () => void,
  reducedMotion = false,
  layout?: MatchLayout
): void {
  layer.removeChildren();
  scrim(layer, onClose, layout);
  const panel = makePanelContainer(layer, reducedMotion);

  const d = dims(layout);
  const statLines = m.stats.length;
  const passiveH = m.passive ? 44 : 0;
  const contentH = 96 + statLines * 24 + passiveH + 16;
  const rect = panelRect(layout, d.w - 90, contentH, (PORTRAIT_H - contentH) / 2 - 20);
  const w = rect.w, x = rect.x, y = rect.y;
  const accent = m.component ? C.itemComponent : C.accentGold;
  panelBox(panel, x, y, w, rect.h, accent);
  closeButton(panel, x + w - 32, y + 8, onClose);

  // Header: item icon disc (distinct procedural emblem / composed completed icon)
  // + name + kind.
  const disc = new PIXI.Graphics();
  disc.circle(x + 32, y + 34, 20).fill({ color: C.bgInspectRow, alpha: 0.95 });
  disc.circle(x + 32, y + 34, 20).stroke({ width: 1.5, color: C.itemBorder });
  disc.eventMode = "none";
  panel.addChild(disc);
  const g = new PIXI.Container();
  drawItemIcon(g, m.id, x + 32, y + 34, { radius: 16, reducedMotion });
  g.eventMode = "none";
  panel.addChild(g);
  text(panel, m.name, x + 60, y + 22, 13, C.textPrimary, [0, 0]);
  text(panel, m.component ? "Component" : "Completed Item", x + 60, y + 42, 9, accent, [0, 0]);

  // Stat bundle rows
  let ry = y + 70;
  for (const s of m.stats) {
    const row = new PIXI.Graphics();
    row.beginFill(C.bgInspectRow, 0.8);
    row.drawRoundedRect(x + 14, ry, w - 28, 20, 5);
    row.endFill();
    row.eventMode = "none";
    panel.addChild(row);
    text(panel, s.label, x + 22, ry + 10, 9, C.textMuted, [0, 0.5]);
    text(panel, s.value, x + w - 22, ry + 10, 11, C.textPrimary, [1, 0.5]);
    ry += 24;
  }

  // Passive line (completed items only)
  if (m.passive) {
    const pb = new PIXI.Graphics();
    pb.beginFill(C.bgInspectRow, 0.9);
    pb.lineStyle(1, accent, 0.6);
    pb.drawRoundedRect(x + 14, ry, w - 28, 38, 6);
    pb.endFill();
    pb.lineStyle(0);
    pb.eventMode = "none";
    panel.addChild(pb);
    text(panel, "Passive", x + 22, ry + 8, 9, accent, [0, 0]);
    wrapText(panel, m.passive, x + 22, ry + 20, w - 44, 9, C.textMuted);
  }
}

/** Render the trait-detail panel (breakpoints + what each grants). */
export function renderTraitDetail(
  layer: PIXI.Container,
  m: TraitDetailModel,
  onClose: () => void,
  layout?: MatchLayout,
  reducedMotion = false
): void {
  layer.removeChildren();
  scrim(layer, onClose, layout);
  const panel = makePanelContainer(layer, reducedMotion);

  const accent = traitColor(m.id);
  const d = dims(layout);
  const rowH = 34;
  const headerH = 76;
  const contentH = headerH + m.rows.length * (rowH + 6) + 16;
  const rect = panelRect(layout, d.w - 80, contentH, (PORTRAIT_H - contentH) / 2 - 20);
  const w = rect.w, x = rect.x, y = rect.y, h = rect.h;
  panelBox(panel, x, y, w, h, accent);
  closeButton(panel, x + w - 32, y + 8, onClose);

  traitDiamond(panel, m.id, x + 26, y + 30, 12);
  text(panel, m.name, x + 46, y + 18, 14, C.textPrimary, [0, 0]);
  const kindLabel = m.kind === "origin" ? "Origin" : "Class";
  text(panel, `${kindLabel} · ${m.count} fielded`, x + 46, y + 40, 9, accent, [0, 0]);

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
    panel.addChild(row);

    // count badge ("(N)") + active checkmark, so meaning isn't color-only
    const badge = r.active ? `▸ ${r.count}` : `${r.count}`;
    text(panel, badge, x + 26, ry + rowH / 2, 11, r.reached ? accent : C.textMuted, [0, 0.5]);
    text(panel, r.effect, x + 64, ry + rowH / 2, 10, r.reached ? C.textPrimary : C.textMuted, [0, 0.5]);
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
