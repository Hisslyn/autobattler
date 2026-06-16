import * as PIXI from "pixi.js";
import { gameData } from "@autobattler/data";
import type { MatchState, PlayerState } from "@autobattler/rules/src/state.js";
import type { MatchStats } from "@autobattler/protocol";
import type { UnitInstance, CombatEvent } from "@autobattler/sim/src/types.js";
import type { HexCoord } from "@autobattler/sim/src/hex.js";
import type { IDriver } from "../driver.js";
import { CombatPlayer, toDisplayHex } from "../combat/player.js";
import type { PlaybackSpeed } from "../combat/player.js";
import { CombatView } from "../combat/view.js";
import { C, tierColor, CHIP_TEXT_SIZE, CHIP_TEXT_FONT } from "../theme.js";
import { drawUnitToken } from "../unitToken.js";
import { drawGlyph, glyphForTraits } from "../glyphs.js";
import type { GlyphKind } from "../glyphs.js";
import { traitStripModel, xpProgress } from "../hudModel.js";
import type { TraitChip } from "../hudModel.js";
import { inspectModel } from "../inspectModel.js";
import { traitDetailModel } from "../traitDetailModel.js";
import { sellValue } from "../sellValue.js";
import { renderUnitInspect, renderTraitDetail, renderItemDetail } from "../inspectPanel.js";
import { inventoryModel, itemModel } from "../itemModel.js";
import type { InventoryEntry } from "../itemModel.js";
import { combinePreview } from "../combinePreview.js";
import { lootRevealModel } from "../lootReveal.js";
import type { RevealStep } from "../lootReveal.js";
import { onUnitArtReady } from "../sprites.js";
import { drawItemIcon, onItemArtReady } from "../itemIconDraw.js";
import { Z_COMBAT_HEADER, Z_RESOLUTION_BUTTON, Z_RESOLUTION_CONTROL } from "../combatLayout.js";
import { benchGeom, benchSlotAtX } from "../benchLayout.js";
import type { SettingsStore } from "../settings.js";
import type { AudioManager } from "../audio/manager.js";
import { phaseToMusicState } from "../audio/director.js";

import type { MatchLayout } from "../layout.js";
import { centeredModal, landscapeBenchSlotCenter, landscapeBenchSlotAt, opponentRailTile } from "../layout.js";

export interface MatchSceneOptions {
  settings: SettingsStore;
  audio: AudioManager;
  /** Called to leave the match and return to the menu (pause panel or match-over). */
  onLeave: () => void;
  /** Active orientation-aware layout (design dims + named region rects). */
  layout: MatchLayout;
}
import {
  HEX_R, HEX_W, HEX_H, BOARD_COLS, BOARD_ROWS, BOARD_SLOTS,
  hexToPixel, hexFromPointer,
} from "../hexUtils.js";

// Item chip sizing (orientation-independent).
const ITEM_SLOT = 30;          // item chip size
const ITEM_GAP = 5;

// Match the driver/server resolution window (data-driven) so the visible
// countdown can never drift from the real auto-advance.
const RESOLUTION_AUTO_ADVANCE_MS = gameData.economy.resolutionSeconds * 1000;

interface HexStyle {
  /** Border stroke (thin tile outline / drag highlight). */
  border?: { color: number; width: number; alpha?: number };
}

/** Flat-top hex tile centered at (x, y). */
function drawHex(
  g: PIXI.Graphics,
  x: number,
  y: number,
  r: number,
  fill: number,
  alpha = 1,
  style: HexStyle = {}
): void {
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    pts.push(x + r * Math.cos(angle), y + r * Math.sin(angle));
  }
  g.poly(pts).fill({ color: fill, alpha });
  if (style.border) g.poly(pts).stroke({ width: style.border.width, color: style.border.color, alpha: style.border.alpha ?? 1 });
}

/** Render a unit token (board/combat with bars, bench without) at (x, y). */
function drawUnit(
  container: PIXI.Container,
  unit: UnitInstance,
  x: number,
  y: number,
  r = 16,
  dimmed = false,
  withBars = true
): void {
  const bars = withBars
    ? {
        hpFrac: unit.maxHp > 0 ? unit.hp / unit.maxHp : 0,
        manaFrac: unit.maxMana > 0 ? unit.mana / unit.maxMana : 0,
      }
    : undefined;
  // Equipped items rendered as tiny distinct icons — display only.
  const items =
    unit.items.length > 0
      ? unit.items.map((id) => ({ id, component: gameData.items.find((d) => d.id === id)?.component === true }))
      : undefined;
  const opts: import("../unitToken.js").UnitTokenOpts = { radius: r, dimmed };
  if (bars) opts.bars = bars;
  if (items) opts.items = items;
  drawUnitToken(container, unit.defId, unit.tier, unit.star, x, y, opts);
}

export class MatchScene {
  readonly container: PIXI.Container;
  private app: PIXI.Application;
  private driver: IDriver;
  private boardLayer: PIXI.Container;
  private benchLayer: PIXI.Container;
  private shopLayer: PIXI.Container;
  private hudLayer: PIXI.Container;
  private toastLayer: PIXI.Container;
  private combatLayer: PIXI.Container;
  private traitLayer: PIXI.Container;
  private scoutLayer: PIXI.Container;
  /** Item inventory bar (loose components + completed items). */
  private itemLayer: PIXI.Container;
  /** Loot-orb reveal overlay (PvE resolution). */
  private lootLayer: PIXI.Container;
  /** Inspect / trait-detail panels (topmost, modal). */
  private inspectLayer: PIXI.Container;
  /** Planning-phase juice (star-up flourish, buy/sell pops); not cleared by render(). */
  private planningFxLayer: PIXI.Container;

  private selectedBenchIdx: number | null = null;
  private selectedBoardIdx: number | null = null;
  private isDragging = false;
  private dragUnit: { uid: number; fromBench: boolean; fromIdx: number } | null = null;
  private dragSprite: PIXI.Container | null = null;
  private scoutTargetId: number | null = null;
  /** Active item drag (inventory chip → unit EQUIP or item COMBINE). */
  private dragItem: { id: string; index: number } | null = null;
  /** True once an item drag has moved past the tap threshold (vs a tap). */
  private itemDragMoved = false;
  /** Loot reveal in progress (PvE resolution). */
  private lootRevealActive = false;
  /** Active loot-reveal ticker fns + timers, for clean teardown. */
  private lootTickers: Array<(t: PIXI.Ticker) => void> = [];
  private lootTimers: Array<ReturnType<typeof setTimeout>> = [];

  private dragCatcher!: PIXI.Graphics;
  private resolutionAutoTimer: ReturnType<typeof setTimeout> | null = null;
  /** Drives the visible Continue countdown without a per-second re-render of the box. */
  private resolutionCountdownFn: ((t: PIXI.Ticker) => void) | null = null;
  /** Long-press timer for opening the inspect panel; cleared if a drag/tap wins. */
  private pressTimer: ReturnType<typeof setTimeout> | null = null;
  private pressStart: { x: number; y: number } | null = null;
  /** Gold at the last planning start, to voice income gain (no game logic). */
  private prevGold = 0;
  /** Active toast bookkeeping: dedupe identical messages + manage its dismiss timer. */
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private toastMsg: string | null = null;

  private playback: {
    player: CombatPlayer;
    view: CombatView;
    tickerFn: (ticker: PIXI.Ticker) => void;
  } | null = null;
  private playbackSpeed: PlaybackSpeed = 1;
  private speedBtnLabel: PIXI.Text | null = null;
  private opts: MatchSceneOptions;
  /** Active orientation-aware layout (design dims + named region rects). */
  private layout: MatchLayout;
  private unsub: () => void = () => {};
  private unsubArt: () => void = () => {};
  private unsubItemArt: () => void = () => {};

  constructor(app: PIXI.Application, driver: IDriver, opts: MatchSceneOptions) {
    this.container = new PIXI.Container();
    this.app = app;
    this.driver = driver;
    this.opts = opts;
    this.layout = opts.layout;
    this.playbackSpeed = opts.settings.get().defaultSpeed;

    this.hudLayer = new PIXI.Container();
    this.boardLayer = new PIXI.Container();
    this.benchLayer = new PIXI.Container();
    this.shopLayer = new PIXI.Container();
    this.traitLayer = new PIXI.Container();
    this.combatLayer = new PIXI.Container();
    this.combatLayer.sortableChildren = true;
    this.scoutLayer = new PIXI.Container();
    this.toastLayer = new PIXI.Container();
    this.planningFxLayer = new PIXI.Container();
    this.inspectLayer = new PIXI.Container();
    this.itemLayer = new PIXI.Container();
    this.lootLayer = new PIXI.Container();

    this.container.addChild(this.hudLayer);
    this.container.addChild(this.boardLayer);
    this.container.addChild(this.benchLayer);
    this.container.addChild(this.shopLayer);
    this.container.addChild(this.itemLayer);
    this.container.addChild(this.traitLayer);
    this.container.addChild(this.planningFxLayer);
    this.container.addChild(this.combatLayer);
    this.container.addChild(this.lootLayer);
    this.container.addChild(this.scoutLayer);
    this.container.addChild(this.toastLayer);
    this.container.addChild(this.inspectLayer);

    // Invisible full-screen drag target for pointer-up — only active while dragging
    const dragCatcher = new PIXI.Graphics();
    dragCatcher.eventMode = "none"; // disabled until drag starts
    dragCatcher.on("pointermove", (e: PIXI.FederatedPointerEvent) => this.onDragMove(e));
    dragCatcher.on("pointerup", (e: PIXI.FederatedPointerEvent) => this.onDragEnd(e));
    dragCatcher.on("pointerupoutside", (e: PIXI.FederatedPointerEvent) => this.onDragEnd(e));
    this.container.addChild(dragCatcher);
    this.dragCatcher = dragCatcher;
    this.sizeDragCatcher();

    this.unsub = driver.on((e) => {
      if (e.type === "state") this.render(e.state);
      if (e.type === "phase_change") {
        if (e.phase === "PLANNING") this.onPlanningStart();
        if (e.phase === "COMBAT") this.onCombatPhase();
        if (e.phase === "RESOLUTION") this.onResolutionPhase();
      }
      if (e.type === "match_over") this.onMatchOver(e.placements, e.mmr, e.stats);
    });

    // A drop-in PNG finishing its lazy load: repaint the static planning board
    // so the glyph swaps to the sprite (combat repaints every tick already).
    this.unsubArt = onUnitArtReady(() => {
      const s = this.driver.getState();
      if (s.phase === "PLANNING") this.render(s);
    });
    this.unsubItemArt = onItemArtReady(() => {
      const s = this.driver.getState();
      if (s.phase === "PLANNING") this.render(s);
    });

    this.render(driver.getState());
    driver.startPlanning();
  }

  // ─── LAYOUT GEOMETRY (derived from this.layout) ──────────────────────────────

  private get designW(): number { return this.layout.designW; }
  private get designH(): number { return this.layout.designH; }
  private get isLandscape(): boolean { return this.layout.orientation === "landscape"; }

  /**
   * Board hex-grid scale. Portrait renders the grid at native size (1). The full
   * 7×4 grid spans BOARD_COLS*HEX_W × (BOARD_ROWS*HEX_H*2+12) = 336×348; in
   * landscape that won't fit the shorter board region alongside the bottom shop,
   * so the grid is scaled-to-fit its board region (capped at 1, never enlarged
   * past native). The scaled mapping is fed to every hex call site + combat view.
   */
  private get boardScale(): number {
    if (!this.isLandscape) return 1;
    const b = this.layout.regions.board;
    const gridW = BOARD_COLS * HEX_W;
    const gridH = BOARD_ROWS * HEX_H * 2 + 12;
    return Math.min(1, (b.w - 16) / gridW, (b.h - 12) / gridH);
  }
  /** Scaled hex radius for drawHex / drag highlight (portrait = HEX_R). */
  private get hexR(): number {
    return HEX_R * this.boardScale;
  }
  /** Scaled unit-token radius on the board (portrait = 16). */
  private get boardTokenR(): number {
    return Math.round(16 * this.boardScale);
  }

  /** Hex-board horizontal offset (centers the scaled 7-col grid in the board panel). */
  private get boardOffsetX(): number {
    const b = this.layout.regions.board;
    const s = this.boardScale;
    return b.x + (b.w - BOARD_COLS * HEX_W * s) / 2 + HEX_R * s;
  }
  /** Player-zone top hex row center y (lower half of the board panel). */
  private get boardOffsetY(): number {
    const b = this.layout.regions.board;
    const s = this.boardScale;
    // Portrait keeps the original half-gap nudge (its board region is tall
    // enough). Landscape scales the grid to fit, so center the full scaled grid
    // (both 4-row halves + the 12px inter-zone gap) vertically in the board
    // region — the +6 nudge alone would ride the opponent back row off the top.
    if (!this.isLandscape) return b.y + b.h / 2 + 6;
    return b.y + b.h / 2 + (HEX_H + 12) * s / 2;
  }
  /** Opponent-zone top hex row center y (mirrored above the player zone). */
  private get oppBoardOffsetY(): number {
    const s = this.boardScale;
    return this.boardOffsetY - BOARD_ROWS * HEX_H * s - 12 * s;
  }

  /** Item bar geometry derived from the itemBar region (chips offset past bag glyph). */
  private get itemBar(): { x: number; y: number; chipStartX: number } {
    const r = this.layout.regions.itemBar;
    return { x: r.x, y: r.y, chipStartX: r.x + 18 };
  }

  /** Resize the invisible drag-catcher to the current design space. */
  private sizeDragCatcher(): void {
    const g = this.dragCatcher;
    g.clear();
    g.rect(0, 0, this.designW, this.designH).fill({ color: C.bgOverlay, alpha: 0 });
    g.hitArea = new PIXI.Rectangle(0, 0, this.designW, this.designH);
  }

  /**
   * Re-resolve layout (orientation/scale change) and re-render the current phase
   * so the scene follows the new design space. Presentation only.
   */
  onLayoutChange(layout: MatchLayout): void {
    this.layout = layout;
    this.sizeDragCatcher();
    const state = this.driver.getState();
    if (state.phase === "PLANNING") {
      this.render(state);
    } else if (state.phase === "COMBAT") {
      this.renderCombat(state);
    } else if (state.phase === "RESOLUTION") {
      this.renderResolution(state);
    }
  }

  private render(state: MatchState): void {
    const me = state.players[this.driver.seatIndex];
    if (!me) return;
    this.renderHud(state, me);
    if (state.phase === "PLANNING") {
      this.renderBoard(me);
      this.renderBench(me);
      this.renderTraitStrip(me);
      this.renderShop(state, me);
      this.renderItemBar(me);
    } else {
      this.itemLayer.removeChildren();
    }
  }

  // ─── CHROME HELPERS ────────────────────────────────────────────────────────

  /** Rounded panel-bg chip with a chip-border outline; returns it for wiring. */
  private chip(
    layer: PIXI.Container,
    x: number, y: number, w: number, h: number,
    opts: { fill?: number; fillAlpha?: number; border?: number; borderW?: number; radius?: number } = {}
  ): PIXI.Graphics {
    const g = new PIXI.Graphics();
    g.roundRect(x, y, w, h, opts.radius ?? 5).fill({ color: opts.fill ?? C.panelBg, alpha: opts.fillAlpha ?? 1 });
    g.roundRect(x, y, w, h, opts.radius ?? 5).stroke({ width: opts.borderW ?? 1, color: opts.border ?? C.chipBorder, alpha: 1 });
    layer.addChild(g);
    return g;
  }

  private text(
    layer: PIXI.Container, str: string, x: number, y: number,
    size: number, fill: number, anchor: [number, number] = [0, 0]
  ): PIXI.Text {
    const t = new PIXI.Text(str, { fontSize: size, fill, fontFamily: "monospace" });
    t.anchor.set(anchor[0], anchor[1]);
    t.x = x; t.y = y;
    t.eventMode = "none";
    layer.addChild(t);
    return t;
  }

  /**
   * Trait-chip label text: 9px sans (CHIP_TEXT_SIZE/FONT) instead of the 8px
   * monospace `text()` — cleaner letterforms at sub-10px and one more pixel of
   * cap height, so the diamond+glyph+count chip stays legible without clipping.
   */
  private chipText(
    layer: PIXI.Container, str: string, x: number, y: number,
    fill: number, anchor: [number, number] = [0, 0]
  ): PIXI.Text {
    const t = new PIXI.Text(str, { fontSize: CHIP_TEXT_SIZE, fill, fontFamily: CHIP_TEXT_FONT });
    t.anchor.set(anchor[0], anchor[1]);
    t.x = x; t.y = y;
    t.eventMode = "none";
    layer.addChild(t);
    return t;
  }

  private glyph(layer: PIXI.Container, kind: GlyphKind, x: number, y: number, size: number, color: number): void {
    const g = new PIXI.Graphics();
    drawGlyph(g, kind, x, y, size, color);
    g.eventMode = "none";
    layer.addChild(g);
  }

  /**
   * Wire a tap handler with quick press feedback for perceived responsiveness.
   * The visual pressed look (alpha dip + scale pop) fires on pointerdown for
   * instant tactile feedback, but the ACTION fires on pointerup — so a finger
   * can slide off to cancel (the standard button escape path, matching the shop
   * cards + DOM buttons). pointerupoutside is the cancel path (no action).
   *
   * `pivot` is the button's center in its own local space; passing it avoids a
   * per-press getLocalBounds() (a synchronous bounds recalc that can stutter on
   * low-end devices). The geometry is stable between renders so it's computed once.
   */
  private pressFeedback(g: PIXI.Graphics, onTap: () => void, pivot?: { cx: number; cy: number }): void {
    const reduced = this.opts.settings.get().reducedMotion;
    if (!reduced && pivot) {
      // Pivot about the button center once, at wire-up time.
      g.pivot.set(pivot.cx, pivot.cy);
      g.position.set(pivot.cx, pivot.cy);
    }
    const press = (): void => {
      g.alpha = 0.7;
      if (!reduced && pivot) g.scale.set(0.94);
    };
    const restore = (): void => {
      g.alpha = 1;
      g.scale.set(1);
    };
    g.on("pointerdown", press);
    // Action fires on pointerup only (slide-off-to-cancel = pointerupoutside).
    g.on("pointerup", () => { restore(); onTap(); });
    g.on("pointerupoutside", restore);
    // Safety: if no release arrives shortly, restore the visual (e.g. re-render
    // swaps the node) — without firing the action.
    g.on("pointerdown", () => setTimeout(restore, 200));
  }

  // ─── HUD: status row + opponent rail ─────────────────────────────────────────

  private renderHud(state: MatchState, me: PlayerState): void {
    this.hudLayer.removeChildren();
    const { designW, regions } = this.layout;
    const status = regions.statusRow;
    const rail = regions.opponentRail;

    // Status band (full design width across the status row).
    const bg = new PIXI.Graphics();
    // Portrait keeps the original 58px top band that visually backs status + rail;
    // landscape backs only the status row (rail lives in the right column).
    bg.rect(0, 0, designW, this.isLandscape ? status.h + 2 : 58).fill({ color: C.bgHud });
    this.hudLayer.addChild(bg);

    // ── A. Status row ──────────────────────────────────────────────────────
    // Stage chip (left): swords glyph + "Stage X-Y" derived from the round.
    const stage = Math.floor((state.round - 1) / 5) + 1;
    const sub = ((state.round - 1) % 5) + 1;
    const stageW = 96;
    const sy = status.y;
    this.chip(this.hudLayer, 6, sy, stageW, 20, { fillAlpha: 0.9 });
    this.glyph(this.hudLayer, "swords", 17, sy + 10, 13, C.starGold);
    this.text(this.hudLayer, `Stage ${stage}-${sub}`, 28, sy + 10, 10, C.textPrimary, [0, 0.5]);

    // Planning timer (center): m:ss, muted; tint toward hp-low under 5s.
    const timeLeft = this.driver.getPlanningTimeLeft();
    if (state.phase === "PLANNING" && timeLeft > 0) {
      const secs = Math.ceil(timeLeft / 1000);
      const m = Math.floor(secs / 60);
      const ss = (secs % 60).toString().padStart(2, "0");
      this.text(
        this.hudLayer, `${m}:${ss}`, designW / 2, sy + 10, 12,
        secs <= 5 ? C.hpLow : C.textMuted, [0.5, 0.5]
      );
    } else {
      // Same 12px as the timer so phase transitions don't jitter the slot.
      this.text(this.hudLayer, state.phase, designW / 2, sy + 10, 12, C.textMuted, [0.5, 0.5]);
    }
    // Right slot reserved for the DOM ☰ pause button (existing hook).

    // ── B. Opponent rail: 8 seat tiles ──────────────────────────────────────
    // Portrait: a single horizontal row of 8 tiles. Landscape: a 4×2 grid in
    // the right-column rail region.
    const myPairing = this.driver.getMyPairing();
    const currentOpp = myPairing && !myPairing.isGhost ? myPairing.opponentId : -1;
    const cols = this.isLandscape ? 4 : 8;
    const rows = this.isLandscape ? 2 : 1;
    const av = 8; // avatar radius
    for (let i = 0; i < 8; i++) {
      const p = state.players[i];
      if (!p) continue;
      const tile = opponentRailTile(i, cols, rows, rail);
      const { tileX, tileY, tileW, tileH, cx } = tile;
      const cy = tileY + av + 1;
      const isSelf = i === this.driver.seatIndex;
      const elim = !p.alive;

      const scoutable = !isSelf && p.alive && state.phase === "PLANNING";

      const avg = new PIXI.Graphics();
      avg.circle(cx, cy, av).fill({ color: C.panelBg, alpha: elim ? 0.4 : 1 });
      // Current opponent uses the combat-header color (not gold — gold means
      // economy here), self stays tier3, others the neutral chip border.
      avg.circle(cx, cy, av).stroke({
        width: i === currentOpp ? 2.5 : 1,
        color: i === currentOpp ? C.textCombat : isSelf ? C.tier3 : C.chipBorder,
        alpha: elim ? 0.4 : 1,
      });
      this.hudLayer.addChild(avg);

      // Seat number inside the disc; level label below the disc (legible at 8px,
      // no longer stacked inside the 16px disc).
      this.text(this.hudLayer, `${i + 1}`, cx, cy - 1, 10, elim ? C.textMuted : C.textPrimary, [0.5, 0.5]);
      this.text(this.hudLayer, `L${p.level}`, cx, cy + av + 5, 8, elim ? C.textMuted : C.textMuted, [0.5, 0.5]);

      // HP bar below the avatar — baseline leaves room for the level label above.
      const hpFrac = Math.max(0, Math.min(1, p.hp / 100));
      const barW = tileW - 10;
      const barX = cx - barW / 2;
      const barY = cy + av + (this.isLandscape ? 16 : 12);
      const hb = new PIXI.Graphics();
      hb.rect(barX, barY, barW, 3).fill({ color: C.hpBg, alpha: elim ? 0.4 : 1 });
      hb.rect(barX, barY, Math.round(barW * hpFrac), 3)
        .fill({ color: hpFrac < 0.25 ? C.hpLow : C.hpGreen, alpha: elim ? 0.4 : 1 });
      this.hudLayer.addChild(hb);

      // Tap-to-scout: alive opponents during planning, with a clear visible
      // affordance (an eye badge on the tile corner) so scouting is discoverable.
      if (scoutable) {
        const badge = new PIXI.Graphics();
        badge.circle(cx + av - 1, cy - av + 1, 5).fill({ color: C.bgScout });
        badge.circle(cx + av - 1, cy - av + 1, 5).stroke({ width: 1, color: C.tier3, alpha: 0.9 });
        badge.eventMode = "none";
        this.hudLayer.addChild(badge);
        this.glyph(this.hudLayer, "eye", cx + av - 1, cy - av + 1, 6, C.tier3);

        const hit = new PIXI.Graphics();
        hit.rect(tileX, tileY, tileW, tileH).fill({ color: C.bgOverlay, alpha: 0.001 });
        hit.eventMode = "static";
        hit.cursor = "pointer";
        const capturedId = i;
        hit.on("pointerdown", () => this.openScout(capturedId, state));
        this.hudLayer.addChild(hit);
      }
    }
  }

  // ─── BOARD ───────────────────────────────────────────────────────────────

  /** Board-bg panel behind the hex tiles (shared by planning + combat). */
  private drawBoardPanel(layer: PIXI.Container): void {
    const b = this.layout.regions.board;
    const panel = new PIXI.Graphics();
    // v8 path API: fill, outer border, then a faint inset rim so the board reads
    // as a raised panel above the page rather than a flat rectangle.
    panel.roundRect(b.x, b.y, b.w, b.h, 10).fill({ color: C.boardBg, alpha: 0.92 });
    panel.roundRect(b.x, b.y, b.w, b.h, 10).stroke({ width: 1, color: C.boardBorder, alpha: 0.9 });
    panel.roundRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2, 9).stroke({ width: 1, color: C.surfaceFloat, alpha: 0.25 });
    panel.eventMode = "none";
    layer.addChild(panel);
  }

  private renderBoard(me: PlayerState): void {
    this.boardLayer.removeChildren();
    this.drawBoardPanel(this.boardLayer);
    const offX = this.boardOffsetX;
    const playerY = this.boardOffsetY;
    const oppY = this.oppBoardOffsetY;
    const s = this.boardScale;
    const hexR = this.hexR - 2 * s;
    const tokR = this.boardTokenR;

    // Only a UNIT drag (not an item drag) makes player hexes valid drop targets.
    const unitDragging = this.isDragging && this.dragItem === null;

    // Enemy zone (top 4 rows) — darker tint, untargetable during planning. While
    // dragging a unit, dim it so it reads as "not a valid drop zone".
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let q = 0; q < BOARD_COLS; q++) {
        const { x, y } = hexToPixel(q, r, offX, oppY, s);
        const g = new PIXI.Graphics();
        drawHex(g, x, y, hexR, C.enemyHex, unitDragging ? 0.4 : 1, {
          border: { color: C.boardBorder, width: 1, alpha: unitDragging ? 0.4 : 0.8 },
        });
        this.boardLayer.addChild(g);
      }
    }

    // Player zone (bottom 4 rows) — lighter tint; valid drop hexes glow green
    // while dragging a unit; an occupied hex (a valid swap) gets a lighter fill.
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let q = 0; q < BOARD_COLS; q++) {
        const slotIdx = r * BOARD_COLS + q;
        const { x, y } = hexToPixel(q, r, offX, playerY, s);
        const isSelected = this.selectedBoardIdx === slotIdx && me.board[slotIdx] != null;
        const occupied = me.board[slotIdx] != null;
        const fill = isSelected
          ? C.bgBoardSel
          : unitDragging && occupied ? C.bgBoardDragOver : C.myHex;
        const g = new PIXI.Graphics();
        drawHex(g, x, y, hexR, fill, 1, {
          border: unitDragging
            ? { color: C.hpGreen, width: 2, alpha: 0.6 }
            : { color: C.boardBorder, width: 1, alpha: 0.8 },
        });
        g.eventMode = "static";
        g.cursor = "pointer";
        g.on("pointerdown", () => this.onHexPointerDown(slotIdx, me, x, y));
        this.boardLayer.addChild(g);
      }
    }

    // Draw units
    for (let idx = 0; idx < BOARD_SLOTS; idx++) {
      const unit = me.board[idx];
      if (!unit) continue;
      if (this.dragUnit?.uid === unit.uid) continue; // being dragged
      const q = idx % BOARD_COLS;
      const r = Math.floor(idx / BOARD_COLS);
      const { x, y } = hexToPixel(q, r, offX, playerY, s);
      // Selected (tap-to-move) unit gets a halo ring OUTSIDE its tier ring so it
      // reads as "this unit is selected" — the hex fill alone is hidden behind it.
      if (this.selectedBoardIdx === idx && !this.isDragging) {
        const halo = new PIXI.Graphics();
        halo.circle(x, y, tokR + 4).stroke({ width: 2, color: C.tier3, alpha: 0.75 });
        halo.eventMode = "none";
        this.boardLayer.addChild(halo);
      }
      const uc = new PIXI.Container();
      uc.eventMode = "static";
      uc.cursor = "grab";
      uc.on("pointerdown", (e: PIXI.FederatedPointerEvent) => this.startDragBoard(idx, unit, e));
      uc.on("pointerup", () => this.clearPress());
      uc.on("pointerupoutside", () => this.clearPress());
      drawUnit(uc, unit, x, y, tokR, this.selectedBenchIdx !== null || (this.selectedBoardIdx !== null && this.selectedBoardIdx !== idx));
      this.boardLayer.addChild(uc);
    }
  }

  /** Geometry for the 9 bench slots and the sell control beside them (pure, portrait). */
  private benchGeom() {
    // Slot height tracks the bench region height (E3) — portrait bench is now 36px.
    return benchGeom(this.designW, this.benchCenterY, this.layout.regions.bench.h);
  }

  /** Portrait single-row bench center y (also reused for portrait sell/pops). */
  private get benchCenterY(): number {
    const r = this.layout.regions.bench;
    return r.y + r.h / 2;
  }

  /** Pixel center of bench slot `i` (orientation-aware). */
  private benchSlotCenter(i: number): { x: number; y: number } {
    if (this.isLandscape) return landscapeBenchSlotCenter(i, this.layout.regions.bench);
    const { slotW, startCx } = this.benchGeom();
    return { x: startCx + i * slotW, y: this.benchCenterY };
  }

  /** Bench slot index under a pointer, or null (orientation-aware). */
  private benchSlotAt(px: number, py: number): number | null {
    if (this.isLandscape) return landscapeBenchSlotAt(px, py, this.layout.regions.bench);
    const r = this.layout.regions.bench;
    if (py < r.y - 7 || py > r.y + r.h + 7) return null; // forgiving vertical band
    return benchSlotAtX(px, this.benchGeom());
  }

  private renderBench(me: PlayerState): void {
    this.benchLayer.removeChildren();

    // Landscape: a subtle column-bg behind the whole left column (trait rail →
    // bench → sell → item bar) so the three-column structure reads at a glance
    // (chips/slots no longer float against the bare page color). Drawn first.
    if (this.isLandscape) {
      const regions = this.layout.regions;
      const colBg = new PIXI.Graphics();
      const colW = regions.bench.x + regions.bench.w + 4;
      colBg.rect(0, regions.statusRow.h, colW, this.designH - regions.statusRow.h)
        .fill({ color: C.bgHud, alpha: 0.4 });
      colBg.eventMode = "none";
      this.benchLayer.addChild(colBg);
    }

    for (let i = 0; i < 9; i++) {
      const { x: cx, y: cy } = this.benchSlotCenter(i);
      const unit = me.bench[i];
      const isSelected = this.selectedBenchIdx === i && unit != null;
      const occupied = unit != null;

      // Cell rect: portrait uses the benchGeom slot height; landscape divides
      // the bench rect into a 3×3 grid.
      let cellW: number, cellH: number, cellX: number, cellY: number;
      if (this.isLandscape) {
        const r = this.layout.regions.bench;
        cellW = r.w / 3;
        cellH = r.h / 3;
        cellX = cx - cellW / 2;
        cellY = cy - cellH / 2;
      } else {
        const { slotH, slotW } = this.benchGeom();
        cellW = slotW;
        cellH = slotH;
        cellX = cx - slotW / 2;
        cellY = cy - slotH / 2;
      }

      const g = new PIXI.Graphics();
      // Clear occupied-vs-empty distinction: solid elevated cell when occupied,
      // a darker "hole" when empty; selection gets the blue highlight. Max the
      // alpha contrast (1.0 vs 0.5) so the reading is pre-attentive.
      g.roundRect(cellX + 1, cellY, cellW - 2, cellH, 4).fill({
        color: isSelected ? C.bgBenchSel : occupied ? C.benchOccupied : C.benchEmpty,
        alpha: occupied ? 1.0 : 0.5,
      });
      g.roundRect(cellX + 1, cellY, cellW - 2, cellH, 4).stroke({
        width: 1,
        color: isSelected ? C.tier3 : occupied ? C.chipBorder : C.benchEmptyRim,
        alpha: occupied ? 0.9 : 0.5,
      });
      // Forgiving hit area covers the whole slot cell.
      g.eventMode = "static";
      g.cursor = "pointer";
      g.hitArea = new PIXI.Rectangle(cellX, cellY, cellW, cellH);
      g.on("pointerdown", () => this.onBenchSlotClick(i, me));
      this.benchLayer.addChild(g);

      if (unit) {
        if (this.dragUnit?.uid === unit.uid) continue;
        const uc = new PIXI.Container();
        uc.eventMode = "static";
        uc.cursor = "grab";
        // Generous hit rect so a thumb anywhere on the slot grabs the unit.
        uc.hitArea = new PIXI.Rectangle(cellX, cellY, cellW, cellH);
        uc.on("pointerdown", (e: PIXI.FederatedPointerEvent) => this.startDragBench(i, unit, e));
        uc.on("pointerup", () => this.clearPress());
        uc.on("pointerupoutside", () => this.clearPress());
        drawUnit(uc, unit, cx, cy, 13, false, false);
        this.benchLayer.addChild(uc);
      }
    }

    this.renderSellControl(me);
  }

  /**
   * Sell affordance beside the bench (its own layout region). When a unit is
   * selected (tap) or being dragged, it lights up and shows the exact gold refund
   * (reusing the rules sell formula); tapping it sells the selected unit. Always
   * shows "Sell" as a discoverable drop-target hint otherwise.
   */
  private renderSellControl(me: PlayerState): void {
    const r = this.layout.regions.sellControl;
    const x = r.x, top = r.y, w = r.w, h = r.h;
    const cx = x + w / 2;
    const midY = top + h / 2;
    const selected = this.selectedUnit(me);
    const armed = selected != null || this.isDragging;
    const refund = selected ? sellValue(selected, gameData) : null;

    const g = new PIXI.Graphics();
    // Armed (a unit selected/dragged) lights up at full alpha for clarity; the
    // resting state stays dim so the control reads as quiet, not an instruction.
    g.roundRect(x, top, w, h, 4).fill({ color: armed ? C.bgSellArmed : C.bgSellChip, alpha: armed ? 1.0 : 0.7 });
    g.roundRect(x, top, w, h, 4).stroke({ width: 1, color: C.textSell, alpha: armed ? 1.0 : 0.5 });
    g.eventMode = "static";
    g.cursor = "pointer";
    g.hitArea = new PIXI.Rectangle(x, top, w, h);
    g.on("pointerdown", () => this.onSellZoneClick(me));
    this.benchLayer.addChild(g);

    if (refund != null) {
      // Refund amount front-and-center with the gold coin glyph.
      this.glyph(this.benchLayer, "coin", cx - 8, midY - 5, 9, C.accentGold);
      this.text(this.benchLayer, `${refund}`, cx + 3, midY - 5, 11, C.textGold, [0.5, 0.5]);
      this.text(this.benchLayer, "Sell", cx, midY + 7, 7, C.textSell, [0.5, 0.5]);
    } else if (armed) {
      // Dragging but no selection yet: show the "Sell" drop-target label.
      this.text(this.benchLayer, "Sell", cx, midY, 9, C.textSell, [0.5, 0.5]);
    } else {
      // Resting: only the dagger glyph at low alpha (no permanent label noise).
      const ig = new PIXI.Graphics();
      drawGlyph(ig, "dagger", cx, midY, 11, C.textSell);
      ig.alpha = 0.35;
      ig.eventMode = "none";
      this.benchLayer.addChild(ig);
    }
  }

  /** Pixel center of the sell control (for sell pops). */
  private sellCenter(): { x: number; y: number } {
    const r = this.layout.regions.sellControl;
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }

  /** Currently selected bench/board unit, if any. */
  private selectedUnit(me: PlayerState): UnitInstance | null {
    if (this.selectedBenchIdx !== null) return me.bench[this.selectedBenchIdx] ?? null;
    if (this.selectedBoardIdx !== null) return me.board[this.selectedBoardIdx] ?? null;
    return null;
  }

  // ─── ITEM INVENTORY BAR (phase 10b) ──────────────────────────────────────

  /**
   * Item inventory bar: one chip per loose component / completed item. Drag a
   * chip onto a board/bench unit to EQUIP, or onto another item to COMBINE
   * (preview shown on drag-over); tap to open its info panel. Components read
   * distinct from completed items (tint + glyph).
   */
  private renderItemBar(me: PlayerState): void {
    this.itemLayer.removeChildren();
    const inv = inventoryModel(me.items, gameData);
    const bar = this.itemBar;
    const midY = bar.y + ITEM_SLOT / 2;

    // Inventory label (bag glyph) so the bar reads as your item stash.
    this.glyph(this.itemLayer, "bag", bar.x + 7, midY, 13, C.textMuted);
    if (inv.length === 0) {
      // Smaller + nudged past the bag glyph so it reads as clearly secondary.
      this.text(this.itemLayer, "No items", bar.x + 26, midY, 8, C.textDimmed, [0, 0.5]);
      return;
    }

    // Chips wrap to a second row past the row cap (portrait item bar is 2 rows).
    for (let i = 0; i < inv.length; i++) {
      const entry = inv[i]!;
      if (this.dragItem?.index === i) continue; // being dragged
      const pos = this.itemBarPos(i);
      this.drawItemChip(this.itemLayer, entry, pos.x, pos.y, ITEM_SLOT, () =>
        this.openItemDetail(entry.id)
      , (e) => this.startDragItem(entry, e));
    }
  }

  /** Draw one item chip centered at (cx, cy); wires tap (info) + drag start. */
  private drawItemChip(
    layer: PIXI.Container,
    entry: { id: string; name: string; component: boolean; color: number },
    cx: number,
    cy: number,
    size: number,
    onTap: () => void,
    onDragStart?: (e: PIXI.FederatedPointerEvent) => void
  ): void {
    const half = size / 2;
    const g = new PIXI.Graphics();
    g.roundRect(cx - half, cy - half, size, size, 6).fill({ color: entry.color, alpha: 0.95 });
    g.roundRect(cx - half, cy - half, size, size, 6).stroke({ width: 1.5, color: C.itemBorder, alpha: 0.95 });
    // Completed items carry the gilded inner rim (same motif as the full icon
    // frame) so the chip reads as a finished item, not a loose component.
    if (!entry.component) {
      g.roundRect(cx - half + 2, cy - half + 2, size - 4, size - 4, 4).stroke({ width: 1, color: C.itemFrame, alpha: 0.55 });
    }
    // Only the inventory chips are interactive; the floating drag sprite (no
    // onDragStart) is display-only so it never captures the pointer.
    if (onDragStart) {
      g.eventMode = "static";
      g.cursor = "grab";
      g.hitArea = new PIXI.Rectangle(cx - half, cy - half, size, size);
      // pointerdown starts a drag immediately (so a clear drag works) and arms a
      // long-press → info panel; a quick tap (no move) opens info, resolved by
      // onDragEnd which reliably owns the pointerup (mirrors the unit-token idiom).
      g.on("pointerdown", (e: PIXI.FederatedPointerEvent) => {
        this.armItemTap(onTap, e);
        onDragStart(e);
      });
    } else {
      g.eventMode = "none";
    }
    layer.addChild(g);

    // Distinct procedural item icon (component emblem / composed completed icon),
    // or the drop-in PNG if present. Reduced motion skips the shine sweep.
    const ig = new PIXI.Container();
    drawItemIcon(ig, entry.id, cx, cy, {
      radius: size * 0.34,
      reducedMotion: this.opts.settings.get().reducedMotion,
    });
    ig.eventMode = "none";
    layer.addChild(ig);
  }

  /** Long-press an item chip → open its info panel (tap fires the drag instead). */
  private armItemTap(onTap: () => void, e: PIXI.FederatedPointerEvent): void {
    this.clearPress();
    this.pressStart = { x: e.globalX, y: e.globalY };
    this.pressTimer = setTimeout(() => {
      this.pressTimer = null;
      this.abortItemDrag();
      onTap();
    }, 360);
  }

  private startDragItem(entry: InventoryEntry, e: PIXI.FederatedPointerEvent): void {
    if (this.inspectOpen) return;
    this.dragItem = { id: entry.id, index: entry.index };
    this.itemDragMoved = false;
    this.isDragging = true;
    this.dragCatcher.eventMode = "static";
    // Floating drag sprite (item chip).
    if (this.dragSprite) this.container.removeChild(this.dragSprite);
    const c = new PIXI.Container();
    c.zIndex = 999; // magic-ok: drag sprite stays on top
    this.drawItemChip(c, entry, 0, 0, ITEM_SLOT, () => {});
    c.eventMode = "none";
    c.x = e.globalX; c.y = e.globalY;
    this.container.addChild(c);
    this.container.sortChildren();
    this.dragSprite = c;
    this.renderItemBar(this.driver.getState().players[this.driver.seatIndex]!);
  }

  /** Cancel an in-progress item drag without issuing a command. */
  private abortItemDrag(): void {
    if (!this.dragItem) return;
    if (this.dragSprite) { this.container.removeChild(this.dragSprite); this.dragSprite = null; }
    this.dragItem = null;
    this.isDragging = false;
    this.dragCatcher.eventMode = "none";
    this.itemLayer.alpha = 1;
    this.closeCombineHint();
    this.render(this.driver.getState());
  }

  /** Resolve an item drag-drop: EQUIP on a unit, COMBINE on another item, else no-op. */
  private onItemDragEnd(px: number, py: number, me: PlayerState): void {
    const drag = this.dragItem!;
    this.closeCombineHint();
    const midY = this.itemBar.y + ITEM_SLOT / 2;

    // 1) Dropped on a board hex with a unit → EQUIP.
    const boardSlot = hexFromPointer(px, py, this.boardOffsetX, this.boardOffsetY, this.boardScale);
    if (boardSlot >= 0 && me.board[boardSlot]) {
      this.tryEquip(me.board[boardSlot]!.uid);
      return;
    }
    // 2) Dropped on a bench unit → EQUIP.
    const benchIdx = this.benchSlotAt(px, py);
    if (benchIdx !== null && me.bench[benchIdx]) {
      this.tryEquip(me.bench[benchIdx]!.uid);
      return;
    }
    // 3) Dropped on another inventory item → COMBINE (if a recipe exists).
    const inv = inventoryModel(me.items, gameData);
    const overIdx = this.itemSlotAtBar(px, py, inv.length);
    if (overIdx !== null && overIdx !== drag.index) {
      const other = me.items[overIdx]!;
      const preview = combinePreview(drag.id, drag.index, other, overIdx, gameData);
      if (preview.ok) {
        const result = this.driver.playerCommand({ type: "COMBINE_ITEMS", itemIdA: drag.id, itemIdB: other });
        if (result.ok) {
          this.opts.audio.play("buy");
          this.spawnPlanningPop(this.itemBarCx(overIdx, inv.length), midY, C.itemCombineOk);
        } else {
          this.showToast(result.error);
        }
      } else {
        // No recipe: clear "no combine" feedback, send no command.
        this.showToast("NO_RECIPE");
        this.spawnPlanningPop(this.itemBarCx(overIdx, inv.length), midY, C.itemCombineNo);
      }
      return;
    }
    // else: dropped nowhere valid — item stays put (no-op).
  }

  private tryEquip(unitUid: number): void {
    const drag = this.dragItem!;
    // Snapshot the unit's slot count to detect an in-place auto-combine (rules
    // fuse a completing component without growing the slot count).
    const before = this.unitItemCount(unitUid);
    const result = this.driver.playerCommand({ type: "EQUIP", unitUid, itemId: drag.id });
    if (!result.ok) { this.showToast(result.error); return; }
    const after = this.unitItemCount(unitUid);
    const combined = after <= before; // net slots unchanged → an auto-combine
    this.opts.audio.play(combined ? "starUp" : "buy");
    const pos = this.unitPixel(unitUid);
    if (pos) this.spawnPlanningPop(pos.x, pos.y, combined ? C.itemCombineOk : C.starGold);
  }

  /** Current equipped-item count for a unit on my board/bench (0 if not found). */
  private unitItemCount(uid: number): number {
    const me = this.driver.getState().players[this.driver.seatIndex];
    if (!me) return 0;
    const u = me.board.find((x) => x?.uid === uid) ?? me.bench.find((x) => x.uid === uid);
    return u?.items.length ?? 0;
  }

  /** Pixel center of a unit on my board/bench, or null. */
  private unitPixel(uid: number): { x: number; y: number } | null {
    const me = this.driver.getState().players[this.driver.seatIndex];
    if (!me) return null;
    const bIdx = me.board.findIndex((x) => x?.uid === uid);
    if (bIdx >= 0) {
      return hexToPixel(bIdx % BOARD_COLS, Math.floor(bIdx / BOARD_COLS), this.boardOffsetX, this.boardOffsetY, this.boardScale);
    }
    const benchIdx = me.bench.findIndex((x) => x.uid === uid);
    if (benchIdx >= 0) {
      return this.benchSlotCenter(benchIdx);
    }
    return null;
  }

  /** Chips that fit on one row before wrapping (pure from the item bar width). */
  private itemRowCap(): number {
    const w = this.layout.regions.itemBar.w;
    return Math.max(1, Math.floor((w - 18) / (ITEM_SLOT + ITEM_GAP)));
  }

  /** Pixel center of inventory chip `i`, wrapping to a second row past the cap. */
  private itemBarPos(i: number): { x: number; y: number } {
    const cap = this.itemRowCap();
    const col = i % cap;
    const row = Math.floor(i / cap);
    return {
      x: this.itemBar.chipStartX + ITEM_SLOT / 2 + col * (ITEM_SLOT + ITEM_GAP),
      y: this.itemBar.y + ITEM_SLOT / 2 + row * (ITEM_SLOT + ITEM_GAP + 2),
    };
  }

  /** x-center of inventory chip `i` (row-0 x; kept for x-only callers). */
  private itemBarCx(i: number, _count: number): number {
    return this.itemBarPos(i).x;
  }

  /** Inventory slot under a pixel within the (offset) item bar, or null. */
  private itemSlotAtBar(px: number, py: number, count: number): number | null {
    for (let i = 0; i < count; i++) {
      const c = this.itemBarPos(i);
      if (
        px >= c.x - ITEM_SLOT / 2 - ITEM_GAP / 2 && px <= c.x + ITEM_SLOT / 2 + ITEM_GAP / 2 &&
        py >= c.y - ITEM_SLOT / 2 - 6 && py <= c.y + ITEM_SLOT / 2 + 6
      ) return i;
    }
    return null;
  }

  /** Live combine-preview hint shown while dragging one item over another. */
  private combineHint: PIXI.Container | null = null;
  private updateCombineHint(px: number, py: number, me: PlayerState): void {
    if (!this.dragItem) return;
    const inv = inventoryModel(me.items, gameData);
    const overIdx = this.itemSlotAtBar(px, py, inv.length);
    this.closeCombineHint();
    if (overIdx === null || overIdx === this.dragItem.index) return;
    const other = me.items[overIdx]!;
    const preview = combinePreview(this.dragItem.id, this.dragItem.index, other, overIdx, gameData);
    const cx = this.itemBarCx(overIdx, inv.length);
    // Landscape: the item bar is at the bottom of the short left column, so a
    // hint above it would overlap the board; place it above the bench (in the
    // trait-rail space) instead. Portrait: just above the item bar.
    const hintY = this.isLandscape
      ? this.layout.regions.bench.y - 30
      : Math.max(this.layout.regions.statusRow.h + 6, this.itemBar.y - 26);
    const midY = this.itemBar.y + ITEM_SLOT / 2;
    const hint = new PIXI.Container();
    if (preview.ok) {
      // "→ Result name" chip above the target.
      const w = 18 + preview.result.name.length * 5.0 + 14;
      const hx = Math.max(6, Math.min(this.designW - w - 6, cx - w / 2));
      const bg = new PIXI.Graphics();
      bg.roundRect(hx, hintY, w, 20, 5).fill({ color: C.panelBg, alpha: 0.97 });
      bg.roundRect(hx, hintY, w, 20, 5).stroke({ width: 1.5, color: C.itemCombineOk, alpha: 0.95 });
      hint.addChild(bg);
      const g = new PIXI.Graphics();
      drawGlyph(g, "gem", hx + 11, hintY + 10, 11, C.itemCombineOk);
      hint.addChild(g);
      this.text(hint, preview.result.name, hx + 20, hintY + 10, 8, C.textPrimary, [0, 0.5]);
    } else {
      const ring = new PIXI.Graphics();
      ring.circle(cx, midY, ITEM_SLOT / 2 + 3).stroke({ width: 2, color: C.itemCombineNo, alpha: 0.9 });
      hint.addChild(ring);
    }
    hint.eventMode = "none";
    this.lootLayer.addChild(hint); // reuse the top overlay layer for the hint
    this.combineHint = hint;
  }

  private closeCombineHint(): void {
    if (this.combineHint) { this.lootLayer.removeChild(this.combineHint); this.combineHint.destroy({ children: true }); this.combineHint = null; }
  }

  private openItemDetail(itemId: string): void {
    const m = itemModel(itemId, gameData);
    if (!m) return;
    this.opts.audio.play("tap");
    renderItemDetail(this.inspectLayer, m, () => this.closeInspect(), this.opts.settings.get().reducedMotion, this.layout);
  }

  private renderShop(state: MatchState, me: PlayerState): void {
    this.shopLayer.removeChildren();
    this.renderControls(me);

    // ── E. Shop cards (5) ────────────────────────────────────────────────────
    const shop = this.layout.regions.shop;
    const shopY = shop.y;
    const cardH = shop.h;
    // Portrait keeps the existing 71px card width; landscape spreads 5 cards
    // across the shop region.
    const gap = 4;
    const cardW = this.isLandscape ? Math.floor(shop.w / 5) - gap : 71;
    for (let i = 0; i < 5; i++) {
      const x = shop.x + i * (cardW + gap);
      const slot = me.shop[i];

      if (!slot) {
        // Empty slots read as non-interactive: dimmer fill + subdued border.
        this.chip(this.shopLayer, x, shopY, cardW, cardH, {
          fill: C.bgShopEmpty, fillAlpha: 0.4, border: C.borderSubtle,
        });
        continue;
      }

      const def = gameData.units.find((u) => u.id === slot.defId);
      const tc = tierColor(slot.tier);
      const cardCx = x + cardW / 2;

      const card = this.chip(this.shopLayer, x, shopY, cardW, cardH, {
        fill: C.bgShopCard,
      });
      // Tier-colored top accent bar — top corners rounded to tuck inside the
      // card's rounded top edge, bottom corners square so it reads as a band.
      // Inset 1px each side to sit within the card border.
      const top = new PIXI.Graphics();
      const tcr = 4, tcx = x + 1, tcy = shopY + 1, tcw = cardW - 2, tch = 5;
      top.moveTo(tcx, tcy + tch);
      top.lineTo(tcx, tcy + tcr);
      top.arcTo(tcx, tcy, tcx + tcr, tcy, tcr);
      top.lineTo(tcx + tcw - tcr, tcy);
      top.arcTo(tcx + tcw, tcy, tcx + tcw, tcy + tcr, tcr);
      top.lineTo(tcx + tcw, tcy + tch);
      top.closePath();
      top.fill({ color: tc });
      top.eventMode = "none";
      this.shopLayer.addChild(top);

      card.eventMode = "static";
      card.hitArea = new PIXI.Rectangle(x, shopY, cardW, cardH);
      card.cursor = "pointer";
      const ci = i;
      // Tap to buy; long-press to inspect the offered unit (no live instance).
      card.on("pointerdown", (e: PIXI.FederatedPointerEvent) => this.armInspect(slot.defId, null, e));
      card.on("pointerup", () => {
        if (this.pressTimer === null) return; // long-press already opened inspect
        this.clearPress();
        this.onShopBuy(ci);
      });
      card.on("pointerupoutside", () => this.clearPress());

      // portrait disc (token glyph/art, no bars); non-interactive so taps reach the card
      const tokenC = new PIXI.Container();
      tokenC.eventMode = "none";
      drawUnitToken(tokenC, slot.defId, slot.tier, 0, cardCx, shopY + 26, { radius: 17 });
      this.shopLayer.addChild(tokenC);

      this.text(this.shopLayer, def?.name ?? slot.defId, cardCx, shopY + 48, 8, C.textPrimary, [0.5, 0]);

      const traitNames = [def?.origin, ...(def?.classes ?? [])]
        .map((tid) => gameData.traits.find((t) => t.id === tid)?.name)
        .filter((n): n is string => !!n);
      // Truncate (not wrap) at 7px so the line stays legible inside the 71px card.
      const traitStr = traitNames.length > 1
        ? `${traitNames[0]!.slice(0, 6)}·${traitNames[1]!.slice(0, 6)}`
        : (traitNames[0] ?? "");
      this.text(this.shopLayer, traitStr, cardCx, shopY + 60, 7, C.textMuted, [0.5, 0]);

      this.glyph(this.shopLayer, "coin", x + 12, shopY + cardH - 9, 9, C.accentGold);
      this.text(this.shopLayer, `${slot.tier}`, x + 20, shopY + cardH - 9, 11, C.textGold, [0, 0.5]);
    }

    // ── Ready button (its own layout region) — primary CTA identity ──────────
    const rb = this.layout.regions.readyButton;
    const isPlanning = state.phase === "PLANNING";
    const ready = this.chip(this.shopLayer, rb.x, rb.y, rb.w, rb.h, {
      fill: isPlanning ? C.bgReady : C.bgReadyOff, border: isPlanning ? C.hpGreen : C.chipBorder,
      borderW: isPlanning ? 1.5 : 1, radius: 7,
    });
    ready.eventMode = isPlanning ? "static" : "none";
    ready.hitArea = new PIXI.Rectangle(rb.x, rb.y, rb.w, rb.h);
    ready.cursor = isPlanning ? "pointer" : "default";
    if (isPlanning) {
      // Top highlight band: a light-source-from-above rim so it reads pressable.
      // Top corners rounded to follow the button radius (7), bottom square; inset
      // 1.5px so it tucks just inside the rounded top edge.
      const highlightH = Math.round(rb.h * 0.3);
      const hl = new PIXI.Graphics();
      const hr = 6, hx = rb.x + 1.5, hy = rb.y + 1.5, hw = rb.w - 3;
      hl.moveTo(hx, hy + highlightH);
      hl.lineTo(hx, hy + hr);
      hl.arcTo(hx, hy, hx + hr, hy, hr);
      hl.lineTo(hx + hw - hr, hy);
      hl.arcTo(hx + hw, hy, hx + hw, hy + hr, hr);
      hl.lineTo(hx + hw, hy + highlightH);
      hl.closePath();
      hl.fill({ color: C.hpGreen, alpha: 0.12 });
      hl.eventMode = "none";
      this.shopLayer.addChild(hl);
      this.pressFeedback(ready, () => this.driver.ready(), { cx: rb.x + rb.w / 2, cy: rb.y + rb.h / 2 });
    }
    const readyTxt = new PIXI.Text(isPlanning ? "Ready" : state.phase, {
      fontSize: isPlanning ? 14 : 13, fill: isPlanning ? C.textReady : C.textMuted,
      fontFamily: "monospace", fontWeight: isPlanning ? "bold" : "normal",
    });
    readyTxt.anchor.set(0.5, 0.5);
    readyTxt.x = rb.x + rb.w / 2;
    readyTxt.y = rb.y + rb.h / 2;
    readyTxt.eventMode = "none";
    this.shopLayer.addChild(readyTxt);
  }

  // ─── D. HUD row: level / gold / streak / reroll / buy-xp ──────────────────────

  private renderControls(me: PlayerState): void {
    if (this.isLandscape) { this.renderControlsLandscape(me); return; }
    this.renderControlsPortrait(me);
  }

  /**
   * Landscape HUD: two sub-rows so the economy display (level/gold/streak) reads
   * separately from the action buttons (reroll/XP), instead of one crammed band.
   * Sub-row A = top half (compressed text); sub-row B = the two wide buttons.
   */
  private renderControlsLandscape(me: PlayerState): void {
    const hud = this.layout.regions.hud;
    const x0 = hud.x;
    const y = hud.y;

    // ── Sub-row A: level chip | gold | streak (compressed) ──────────────────
    // Level chip + xp bar
    const levelW = 50, levelH = 22;
    this.chip(this.shopLayer, x0, y, levelW, levelH);
    this.text(this.shopLayer, `Lv ${me.level}`, x0 + 6, y + 8, 10, C.textPrimary, [0, 0.5]);
    const xp = xpProgress(me.xp, me.level, gameData.economy.levelXpThresholds);
    const xpBarX = x0 + 6, xpBarW = levelW - 12, xpBarY = y + levelH - 5;
    const xpb = new PIXI.Graphics();
    xpb.rect(xpBarX, xpBarY, xpBarW, 3).fill({ color: C.bgShopEmpty });
    xpb.rect(xpBarX, xpBarY, Math.round(xpBarW * xp.frac), 3).fill({ color: C.xpPurple });
    xpb.eventMode = "none";
    this.shopLayer.addChild(xpb);

    // Gold (coin glyph + compressed number)
    this.glyph(this.shopLayer, "coin", x0 + 52, y + 11, 10, C.accentGold);
    this.text(this.shopLayer, `${me.gold}`, x0 + 64, y + 11, 15, C.textGold, [0, 0.5]);

    // Streak (flame + signed value)
    const streak = me.winStreak > 0 ? me.winStreak : me.loseStreak > 0 ? -me.loseStreak : 0;
    if (streak !== 0) {
      this.glyph(this.shopLayer, "flame", x0 + 110, y + 11, 11, C.streakOrange);
      this.text(this.shopLayer, `${streak > 0 ? "+" : ""}${streak}`, x0 + 120, y + 11, 11, C.streakOrange, [0, 0.5]);
    }

    // ── Sub-row B: reroll | XP buttons (each half the remaining width) ───────
    const btnY = y + 26, btnH = 20, btnW = 106;
    const rrX = x0;
    const rr = this.chip(this.shopLayer, rrX, btnY, btnW, btnH, { fill: C.bgReroll });
    rr.eventMode = "static";
    rr.hitArea = new PIXI.Rectangle(rrX, btnY, btnW, btnH);
    rr.cursor = "pointer";
    this.pressFeedback(rr, () => this.onReroll(), { cx: rrX + btnW / 2, cy: btnY + btnH / 2 });
    this.glyph(this.shopLayer, "refresh", rrX + 12, btnY + btnH / 2, 11, C.textPrimary);
    this.glyph(this.shopLayer, "coin", rrX + 28, btnY + btnH / 2, 8, C.accentGold);
    this.text(this.shopLayer, `${gameData.economy.rerollCost}g`, rrX + 36, btnY + btnH / 2, 10, C.textGold, [0, 0.5]);

    const xpX = x0 + 110;
    const xpBtn = this.chip(this.shopLayer, xpX, btnY, btnW, btnH, { fill: C.bgXp });
    xpBtn.eventMode = "static";
    xpBtn.hitArea = new PIXI.Rectangle(xpX, btnY, btnW, btnH);
    xpBtn.cursor = "pointer";
    this.pressFeedback(xpBtn, () => this.onBuyXp(), { cx: xpX + btnW / 2, cy: btnY + btnH / 2 });
    this.text(this.shopLayer, "XP", xpX + 8, btnY + btnH / 2, 10, C.textPrimary, [0, 0.5]);
    this.glyph(this.shopLayer, "coin", xpX + 30, btnY + btnH / 2, 8, C.accentGold);
    this.text(this.shopLayer, `${gameData.economy.xpBuyCost}g`, xpX + 38, btnY + btnH / 2, 10, C.textGold, [0, 0.5]);
  }

  /** Portrait HUD: the prior single horizontal band (unchanged). */
  private renderControlsPortrait(me: PlayerState): void {
    const hud = this.layout.regions.hud;
    const y = hud.y;
    const h = hud.h;
    const x0 = hud.x;
    const off = { goldG: 83, goldT: 95, streakG: 147, streakT: 159, rrX: 233, rrW: 62, xpX: 303, xpW: 70, levelW: 66 };

    // Level chip + xp-purple progress bar
    this.chip(this.shopLayer, x0, y, off.levelW, h);
    this.text(this.shopLayer, `Lv ${me.level}`, x0 + 8, y + 12, 11, C.textPrimary, [0, 0.5]);
    const xp = xpProgress(me.xp, me.level, gameData.economy.levelXpThresholds);
    const xpBarX = x0 + 8;
    const xpBarW = off.levelW - 16;
    const xpBarY = y + h - 10;
    const xpb = new PIXI.Graphics();
    xpb.rect(xpBarX, xpBarY, xpBarW, 4).fill({ color: C.bgShopEmpty });
    xpb.rect(xpBarX, xpBarY, Math.round(xpBarW * xp.frac), 4).fill({ color: C.xpPurple });
    xpb.eventMode = "none";
    this.shopLayer.addChild(xpb);

    // Gold (large, gold + coin glyph)
    this.glyph(this.shopLayer, "coin", x0 + off.goldG, y + h / 2, 13, C.accentGold);
    this.text(this.shopLayer, `${me.gold}`, x0 + off.goldT, y + h / 2, 18, C.textGold, [0, 0.5]);

    // Streak (flame + signed value, streak-orange)
    const streak = me.winStreak > 0 ? me.winStreak : me.loseStreak > 0 ? -me.loseStreak : 0;
    if (streak !== 0) {
      this.glyph(this.shopLayer, "flame", x0 + off.streakG, y + h / 2, 12, C.streakOrange);
      this.text(
        this.shopLayer, `${streak > 0 ? "+" : ""}${streak}`, x0 + off.streakT, y + h / 2, 12,
        C.streakOrange, [0, 0.5]
      );
    }

    // Reroll button (refresh glyph + cost)
    const btnY = y + 2;
    const btnH = h - 4;
    const rrX = x0 + off.rrX, rrW = off.rrW;
    const rr = this.chip(this.shopLayer, rrX, btnY, rrW, btnH, { fill: C.bgReroll });
    rr.eventMode = "static";
    rr.hitArea = new PIXI.Rectangle(rrX, btnY, rrW, btnH);
    rr.cursor = "pointer";
    this.pressFeedback(rr, () => this.onReroll(), { cx: rrX + rrW / 2, cy: btnY + btnH / 2 });
    this.glyph(this.shopLayer, "refresh", rrX + 13, btnY + btnH / 2, 13, C.textPrimary);
    this.glyph(this.shopLayer, "coin", rrX + 30, btnY + btnH / 2, 8, C.accentGold);
    this.text(this.shopLayer, `${gameData.economy.rerollCost}`, rrX + 38, btnY + btnH / 2, 11, C.textGold, [0, 0.5]);

    // Buy XP button (label + cost)
    const xpX = x0 + off.xpX, xpW = off.xpW;
    const xpBtn = this.chip(this.shopLayer, xpX, btnY, xpW, btnH, { fill: C.bgXp });
    xpBtn.eventMode = "static";
    xpBtn.hitArea = new PIXI.Rectangle(xpX, btnY, xpW, btnH);
    xpBtn.cursor = "pointer";
    this.pressFeedback(xpBtn, () => this.onBuyXp(), { cx: xpX + xpW / 2, cy: btnY + btnH / 2 });
    this.text(this.shopLayer, "XP", xpX + 8, btnY + btnH / 2, 11, C.textPrimary, [0, 0.5]);
    this.glyph(this.shopLayer, "coin", xpX + 36, btnY + btnH / 2, 8, C.accentGold);
    this.text(this.shopLayer, `${gameData.economy.xpBuyCost}`, xpX + 44, btnY + btnH / 2, 11, C.textGold, [0, 0.5]);
  }

  // ─── C. TRAIT STRIP (horizontal, wraps) ──────────────────────────────────────

  private renderTraitStrip(me: PlayerState): void {
    this.traitLayer.removeChildren();
    const chips = traitStripModel(me.board, gameData.units, gameData.traits);
    const rail = this.layout.regions.traitRail;
    const chipH = 18;

    if (this.isLandscape) {
      // Vertical stack down the left rail: one chip per row.
      const gapY = 4;
      let rowY = rail.y;
      for (const c of chips) {
        if (rowY + chipH > rail.y + rail.h) break; // clip to the rail
        this.drawTraitChip(this.traitLayer, c, rail.x, rowY);
        rowY += chipH + gapY;
      }
      return;
    }

    // Portrait: horizontal wrap within the trait rail.
    const padX = rail.x;
    const gapX = 5;
    const gapY = 4;
    const maxRowW = rail.w;
    let x = padX;
    let rowY = rail.y;

    for (const c of chips) {
      const chipW = this.traitChipWidth(c);
      if (x + chipW > padX + maxRowW) { x = padX; rowY += chipH + gapY; }
      this.drawTraitChip(this.traitLayer, c, x, rowY);
      x += chipW + gapX;
    }
  }

  /** Width of a trait chip for the given chip model (shared by strip + scout). */
  private traitChipWidth(c: TraitChip): number {
    const active = c.activeBreakpoint !== null;
    const countStr = active ? `${c.count}` : `${c.count}/${c.nextBreakpoint ?? c.count}`;
    const label = `${c.name} ${countStr}`;
    // Width budgeted from the chip-label type size so the chip never clips.
    return 26 + label.length * (CHIP_TEXT_SIZE * 0.6);
  }

  /**
   * Draw one trait-strip chip (diamond+glyph + label, active colored / inactive
   * dimmed) at (x, rowY); tapping opens the shared trait-detail panel. Returns
   * its width. Shared by the HUD trait strip and the scout overlay so a scouted
   * board's traits look identical to your own.
   */
  private drawTraitChip(layer: PIXI.Container, c: TraitChip, x: number, rowY: number): number {
    const chipH = 18;
    const active = c.activeBreakpoint !== null;
    const countStr = active ? `${c.count}` : `${c.count}/${c.nextBreakpoint ?? c.count}`;
    const label = `${c.name} ${countStr}`;
    const chipW = this.traitChipWidth(c);

    const bg = new PIXI.Graphics();
    bg.roundRect(x, rowY, chipW, chipH, 4).fill({ color: C.panelBg, alpha: active ? 0.95 : 0.5 });
    bg.roundRect(x, rowY, chipW, chipH, 4).stroke({ width: 1, color: active ? c.color : C.chipBorder, alpha: active ? 0.9 : 0.5 });
    bg.alpha = active ? 1 : 0.5;
    bg.eventMode = "static";
    bg.cursor = "pointer";
    bg.hitArea = new PIXI.Rectangle(x, rowY, chipW, chipH);
    const tid = c.traitId;
    const tcount = c.count;
    bg.on("pointertap", () => this.openTraitDetail(tid, tcount));
    layer.addChild(bg);

    // 14px rotated diamond holding the glyph
    const cy = rowY + chipH / 2;
    const dcx = x + 12;
    const diamond = new PIXI.Graphics();
    const dr = 7;
    diamond.poly([dcx, cy - dr, dcx + dr, cy, dcx, cy + dr, dcx - dr, cy]);
    diamond.fill({ color: active ? c.color : C.chipBorder, alpha: active ? 0.5 : 0.25 });
    diamond.poly([dcx, cy - dr, dcx + dr, cy, dcx, cy + dr, dcx - dr, cy]);
    diamond.stroke({ width: 1, color: active ? c.color : C.textMuted });
    layer.addChild(diamond);
    this.glyph(layer, this.traitGlyph(c.traitId), dcx, cy, 8, active ? c.color : C.textMuted);

    this.chipText(layer, label, x + 22, cy, active ? C.textPrimary : C.textMuted, [0, 0.5]);
    return chipW;
  }

  private traitGlyph(traitId: string): GlyphKind {
    return glyphForTraits([traitId]);
  }

  // ─── DRAG & DROP ─────────────────────────────────────────────────────────

  private startDragBoard(idx: number, unit: UnitInstance, e: PIXI.FederatedPointerEvent): void {
    if (this.inspectOpen) return;
    this.selectedBenchIdx = null;
    this.selectedBoardIdx = null;
    this.isDragging = true;
    this.dragCatcher.eventMode = "static";
    this.dragUnit = { uid: unit.uid, fromBench: false, fromIdx: idx };
    this.armInspect(unit.defId, unit, e); // long-press still opens inspect
    this.createDragSprite(unit, e.globalX, e.globalY);
    this.renderBoard(this.driver.getState().players[this.driver.seatIndex]!);
    this.renderBench(this.driver.getState().players[this.driver.seatIndex]!);
  }

  private startDragBench(idx: number, unit: UnitInstance, e: PIXI.FederatedPointerEvent): void {
    if (this.inspectOpen) return;
    this.selectedBenchIdx = null;
    this.selectedBoardIdx = null;
    this.isDragging = true;
    this.dragCatcher.eventMode = "static";
    this.dragUnit = { uid: unit.uid, fromBench: true, fromIdx: idx };
    this.armInspect(unit.defId, unit, e); // long-press still opens inspect
    this.createDragSprite(unit, e.globalX, e.globalY);
    this.renderBoard(this.driver.getState().players[this.driver.seatIndex]!);
    this.renderBench(this.driver.getState().players[this.driver.seatIndex]!);
  }

  private createDragSprite(unit: UnitInstance, gx: number, gy: number): void {
    if (this.dragSprite) {
      this.container.removeChild(this.dragSprite);
    }
    const c = new PIXI.Container();
    c.zIndex = 999;
    drawUnit(c, unit, 0, 0, 16);
    c.x = gx;
    c.y = gy;
    this.container.addChild(c);
    this.container.sortChildren();
    this.dragSprite = c;
  }

  private onDragMove(e: PIXI.FederatedPointerEvent): void {
    if (!this.isDragging || !this.dragSprite) return;
    // Movement beyond a small threshold cancels the long-press (it's a drag).
    if (this.pressStart) {
      const dx = e.globalX - this.pressStart.x;
      const dy = e.globalY - this.pressStart.y;
      if (dx * dx + dy * dy > 36) this.clearPress();
    }
    this.dragSprite.x = e.globalX;
    this.dragSprite.y = e.globalY;
    // Item drag: live combine-preview hint over inventory targets.
    if (this.dragItem) {
      if (this.pressStart) {
        const dx = e.globalX - this.pressStart.x;
        const dy = e.globalY - this.pressStart.y;
        if (dx * dx + dy * dy > 36) { this.itemDragMoved = true; this.clearPress(); } // magic-ok: 6px tap slop
      } else {
        this.itemDragMoved = true;
      }
      const me = this.driver.getState().players[this.driver.seatIndex];
      if (me) this.updateCombineHint(e.globalX, e.globalY, me);
    }
  }

  private onDragEnd(e: PIXI.FederatedPointerEvent): void {
    this.clearPress();
    if (!this.isDragging) return;

    const px = e.globalX;
    const py = e.globalY;

    // Remove drag sprite
    if (this.dragSprite) {
      this.container.removeChild(this.dragSprite);
      this.dragSprite = null;
    }
    this.isDragging = false;
    this.dragCatcher.eventMode = "none";

    const state = this.driver.getState();
    const me = state.players[this.driver.seatIndex];

    // Item drag resolves to EQUIP / COMBINE / no-op — or, if it never moved,
    // a tap that opens the item's info panel.
    if (this.dragItem) {
      const tapped = this.pressTimer !== null && !this.itemDragMoved;
      this.clearPress();
      const id = this.dragItem.id;
      if (tapped) {
        this.dragItem = null;
        this.itemLayer.alpha = 1;
        this.closeCombineHint();
        this.render(this.driver.getState());
        this.openItemDetail(id);
        return;
      }
      if (me) this.onItemDragEnd(px, py, me);
      this.dragItem = null;
      this.itemLayer.alpha = 1;
      this.render(this.driver.getState());
      return;
    }

    if (!this.dragUnit) return;
    if (!me) { this.dragUnit = null; return; }

    // Check if dropped on board area
    const boardSlot = hexFromPointer(px, py, this.boardOffsetX, this.boardOffsetY, this.boardScale);
    if (boardSlot >= 0) {
      const result = this.driver.playerCommand({
        type: "MOVE",
        unitUid: this.dragUnit.uid,
        toBench: false,
        toIndex: boardSlot,
      });
      if (!result.ok) this.showToast(result.error);
    } else {
      // Check if dropped on bench / sell area (orientation-aware hit testing)
      const benchIdx = this.benchSlotAt(px, py);
      if (benchIdx !== null) {
        const result = this.driver.playerCommand({
          type: "MOVE",
          unitUid: this.dragUnit.uid,
          toBench: true,
          toIndex: benchIdx,
        });
        if (!result.ok) this.showToast(result.error);
      } else if (this.inSellZone(px, py)) {
        // Dropped on sell zone — spawn the refund pop at the zone
        const dragged = me.bench.concat(me.board.filter((u): u is UnitInstance => u != null))
          .find((u) => u.uid === this.dragUnit!.uid) ?? null;
        const refund = dragged ? sellValue(dragged, gameData) : 0;
        const result = this.driver.playerCommand({ type: "SELL", unitUid: this.dragUnit.uid });
        const sc = this.sellCenter();
        if (result.ok) { this.opts.audio.play("sell"); this.spawnSellPop(sc.x, sc.y, refund); }
        else this.showToast(result.error);
      }
      // else: dropped nowhere valid — unit stays put (no-op)
    }

    this.dragUnit = null;
    this.render(this.driver.getState());
  }

  /** True if (px, py) falls within the sell control's (forgiving) bounds. */
  private inSellZone(px: number, py: number): boolean {
    const r = this.layout.regions.sellControl;
    return px >= r.x - 6 && px <= r.x + r.w + 6 && py >= r.y - 8 && py <= r.y + r.h + 8;
  }

  // ─── CLICK-TO-SELECT fallback (tap-tap placement) ────────────────────────

  private onHexPointerDown(slotIdx: number, me: PlayerState, _x: number, _y: number): void {
    // If dragging, hex pointer events are handled by drag-end
    if (this.isDragging) return;

    const unit = me.board[slotIdx];
    if (this.selectedBenchIdx !== null) {
      const src = me.bench[this.selectedBenchIdx];
      if (src) {
        const result = this.driver.playerCommand({ type: "MOVE", unitUid: src.uid, toBench: false, toIndex: slotIdx });
        if (!result.ok) this.showToast(result.error);
      }
      this.selectedBenchIdx = null;
    } else if (this.selectedBoardIdx !== null) {
      const src = me.board[this.selectedBoardIdx];
      if (src) {
        const result = this.driver.playerCommand({ type: "MOVE", unitUid: src.uid, toBench: false, toIndex: slotIdx });
        if (!result.ok) this.showToast(result.error);
      }
      this.selectedBoardIdx = null;
    } else if (unit) {
      this.selectedBoardIdx = slotIdx;
    }
    this.render(this.driver.getState());
  }

  private onBenchSlotClick(idx: number, me: PlayerState): void {
    if (this.isDragging) return;

    if (this.selectedBoardIdx !== null) {
      const src = me.board[this.selectedBoardIdx];
      if (src) {
        const result = this.driver.playerCommand({ type: "MOVE", unitUid: src.uid, toBench: true, toIndex: idx });
        if (!result.ok) this.showToast(result.error);
      }
      this.selectedBoardIdx = null;
      this.render(this.driver.getState());
      return;
    }

    const unit = me.bench[idx];
    if (this.selectedBenchIdx === idx) {
      this.selectedBenchIdx = null;
    } else if (this.selectedBenchIdx !== null) {
      // Swap bench slots
      const src = me.bench[this.selectedBenchIdx];
      if (src) {
        const result = this.driver.playerCommand({ type: "MOVE", unitUid: src.uid, toBench: true, toIndex: idx });
        if (!result.ok) this.showToast(result.error);
      }
      this.selectedBenchIdx = null;
    } else if (unit) {
      this.selectedBenchIdx = idx;
    }
    this.render(this.driver.getState());
  }

  private onSellZoneClick(me: PlayerState): void {
    if (this.isDragging) return;
    const sel = this.selectedUnit(me);
    this.selectedBenchIdx = null;
    this.selectedBoardIdx = null;
    if (sel) {
      const refund = sellValue(sel, gameData);
      const result = this.driver.playerCommand({ type: "SELL", unitUid: sel.uid });
      if (result.ok) {
        this.opts.audio.play("sell");
        const sc = this.sellCenter();
        this.spawnSellPop(sc.x, sc.y, refund);
      } else {
        this.showToast(result.error);
      }
    }
    this.render(this.driver.getState());
  }

  /** Sell feedback: a "+N" gold floater rising from the sell zone. */
  private spawnSellPop(x: number, y: number, refund: number): void {
    this.spawnPlanningPop(x, y, C.textSell);
    if (this.opts.settings.get().reducedMotion) return;
    const node = new PIXI.Container();
    node.position.set(x, y - 18);
    this.glyph(node, "coin", -8, 0, 9, C.accentGold);
    this.text(node, `+${refund}`, 3, 0, 11, C.textGold, [0, 0.5]);
    this.planningFxLayer.addChild(node);
    let age = 0;
    const ttl = 620;
    const fn = (ticker: PIXI.Ticker): void => {
      age += ticker.deltaMS;
      node.y -= ticker.deltaMS * 0.02;
      node.alpha = Math.max(0, 1 - age / ttl);
      if (age >= ttl) {
        this.app.ticker.remove(fn);
        this.planningFxLayer.removeChild(node);
        node.destroy({ children: true });
      }
    };
    this.app.ticker.add(fn);
  }

  private onShopBuy(idx: number): void {
    const before = this.starSnapshot();
    const result = this.driver.playerCommand({ type: "BUY", shopSlotIndex: idx });
    if (!result.ok) { this.showToast(result.error); return; }
    // Derive a merge/star-up purely from the planning state change (no game logic).
    const up = this.findStarUp(before);
    if (up) {
      this.opts.audio.play("starUp");
      this.spawnPlanningPop(up.x, up.y, C.fxStarUp, { star: true });
    } else {
      this.opts.audio.play("buy");
      const center = this.shopCardCenter(idx);
      this.spawnPlanningPop(center.x, center.y, C.starGold);
    }
  }

  /** Pixel center of shop card `idx` (mirrors renderShop's card layout). */
  private shopCardCenter(idx: number): { x: number; y: number } {
    const shop = this.layout.regions.shop;
    const gap = 4;
    const cardW = this.isLandscape ? Math.floor(shop.w / 5) - gap : 71;
    return { x: shop.x + idx * (cardW + gap) + cardW / 2, y: shop.y + shop.h / 2 };
  }

  /** uid → star across board + bench, for detecting a merge after a command. */
  private starSnapshot(): Map<number, number> {
    const m = new Map<number, number>();
    const me = this.driver.getState().players[this.driver.seatIndex];
    if (!me) return m;
    for (const u of me.board) if (u) m.set(u.uid, u.star);
    for (const u of me.bench) m.set(u.uid, u.star);
    return m;
  }

  /** First board/bench unit at ≥2 star that is new or higher than `before`, with its pixel. */
  private findStarUp(before: Map<number, number>): { x: number; y: number } | null {
    const me = this.driver.getState().players[this.driver.seatIndex];
    if (!me) return null;
    for (let idx = 0; idx < me.board.length; idx++) {
      const u = me.board[idx];
      if (u && u.star >= 2 && (before.get(u.uid) ?? 0) < u.star) {
        const { x, y } = hexToPixel(idx % BOARD_COLS, Math.floor(idx / BOARD_COLS), this.boardOffsetX, this.boardOffsetY, this.boardScale);
        return { x, y };
      }
    }
    for (let i = 0; i < me.bench.length; i++) {
      const u = me.bench[i]!;
      if (u.star >= 2 && (before.get(u.uid) ?? 0) < u.star) {
        return this.benchSlotCenter(i);
      }
    }
    return null;
  }

  /** Brief expanding ring (+ star pips for a star-up). Reduced-motion → no-op. */
  private spawnPlanningPop(x: number, y: number, color: number, opts: { star?: boolean } = {}): void {
    if (this.opts.settings.get().reducedMotion) return;
    const node = new PIXI.Container();
    node.position.set(x, y);
    const ring = new PIXI.Graphics();
    ring.circle(0, 0, opts.star ? 22 : 16).stroke({ width: opts.star ? 3 : 2, color, alpha: 0.95 });
    node.addChild(ring);
    if (opts.star) {
      const pips = new PIXI.Graphics();
      for (let i = -1; i <= 1; i++) pips.poly([i * 9, -26, i * 9 + 3, -23, i * 9, -20, i * 9 - 3, -23]);
      pips.fill({ color });
      node.addChild(pips);
    }
    this.planningFxLayer.addChild(node);
    const ttl = opts.star ? 520 : 260;
    let age = 0;
    const fn = (ticker: PIXI.Ticker): void => {
      age += ticker.deltaMS;
      const k = age / ttl;
      node.scale.set(1 + k * (opts.star ? 0.8 : 0.5));
      node.alpha = Math.max(0, 1 - k);
      if (age >= ttl) {
        this.app.ticker.remove(fn);
        this.planningFxLayer.removeChild(node);
        node.destroy({ children: true });
      }
    };
    this.app.ticker.add(fn);
  }

  private onReroll(): void {
    const result = this.driver.playerCommand({ type: "REROLL" });
    if (result.ok) this.opts.audio.play("reroll");
    else this.showToast(result.error);
  }

  private onBuyXp(): void {
    const before = this.driver.getState().players[this.driver.seatIndex]?.level ?? 0;
    const result = this.driver.playerCommand({ type: "BUY_XP" });
    if (result.ok) {
      const after = this.driver.getState().players[this.driver.seatIndex]?.level ?? before;
      this.opts.audio.play(after > before ? "levelUp" : "buy");
    } else {
      this.showToast(result.error);
    }
  }

  // ─── SCOUTING ─────────────────────────────────────────────────────────────

  private openScout(playerId: number, state: MatchState): void {
    this.scoutTargetId = playerId;
    this.renderScout(playerId, state);
  }

  private renderScout(playerId: number, state: MatchState): void {
    this.scoutLayer.removeChildren();

    const target = state.players[playerId];
    if (!target) return;

    // Panel sits below the status row and fills the design space, clamped so it
    // works in short landscape (designH=390) as well as portrait.
    const { designW, designH, regions } = this.layout;
    const pad = 20;
    const panelX = pad;
    const panelY = regions.statusRow.h + pad;
    const panelW = designW - 2 * pad;
    const panelH = designH - panelY - pad;
    const panelCx = panelX + panelW / 2;

    // Scrim below the panel — tap outside to dismiss (consistent with inspect).
    const scrim = new PIXI.Graphics();
    scrim.rect(0, 0, designW, designH).fill({ color: C.bgScrim, alpha: 0.001 });
    scrim.eventMode = "static";
    scrim.cursor = "pointer";
    scrim.on("pointerdown", () => this.closeScout());
    this.scoutLayer.addChild(scrim);

    const overlay = new PIXI.Graphics();
    overlay.roundRect(panelX, panelY, panelW, panelH, 8).fill({ color: C.bgScout, alpha: 0.92 });
    overlay.eventMode = "static"; // swallow taps so they don't dismiss via the scrim
    this.scoutLayer.addChild(overlay);

    // Name (left) + a small HP bar with a numeric label (right) — separated, so
    // the two facts read as a clear hierarchy rather than one concatenated string.
    const nameTxt = new PIXI.Text(this.seatName(state, playerId), {
      fontSize: 13, fill: C.textBanner, fontFamily: "monospace",
    });
    nameTxt.anchor.set(0, 0);
    nameTxt.x = panelX + 10;
    nameTxt.y = panelY + 8;
    this.scoutLayer.addChild(nameTxt);

    const hp = Math.max(0, target.hp);
    const hpFrac = Math.max(0, Math.min(1, hp / 100));
    const hpBarW = 60, hpBarX = panelX + panelW - 90, hpBarY = panelY + 12;
    const hpBar = new PIXI.Graphics();
    hpBar.rect(hpBarX, hpBarY, hpBarW, 5).fill({ color: C.hpBg });
    hpBar.rect(hpBarX, hpBarY, Math.round(hpBarW * hpFrac), 5)
      .fill({ color: hpFrac < 0.25 ? C.hpLow : C.hpGreen });
    hpBar.eventMode = "none";
    this.scoutLayer.addChild(hpBar);
    this.text(this.scoutLayer, `${hp} HP`, panelX + panelW - 28, panelY + 14, 9, C.textMuted, [0, 0.5]);

    // Board units — long-press any token to open the SAME unit-inspect panel as
    // your own board, so a scouted board reads identically to your inspect view.
    // Inner board offset is derived from the panel width so the grid stays centered.
    const boardOffX = panelX + (panelW - BOARD_COLS * HEX_W) / 2 + HEX_R;
    const boardOffY = panelY + 50;
    for (let idx = 0; idx < BOARD_SLOTS; idx++) {
      const unit = target.board[idx];
      if (!unit) continue;
      const q = idx % BOARD_COLS;
      const r = Math.floor(idx / BOARD_COLS);
      const { x, y } = hexToPixel(q, r, boardOffX, boardOffY);
      const uc = new PIXI.Container();
      uc.eventMode = "static";
      uc.cursor = "pointer";
      const u = unit;
      uc.on("pointerdown", (e: PIXI.FederatedPointerEvent) => this.armInspect(u.defId, u, e));
      uc.on("pointerup", () => this.clearPress());
      uc.on("pointerupoutside", () => this.clearPress());
      drawUnit(uc, unit, x, y, 14);
      this.scoutLayer.addChild(uc);
    }

    // Trait strip — same diamond+glyph chips as your own board (traitStripModel),
    // each tappable to open the shared trait-detail panel.
    const chips = traitStripModel(target.board, gameData.units, gameData.traits);
    const padX = panelX + 10;
    const rowRight = panelX + panelW - 10;
    let cx = padX;
    let rowY = boardOffY + BOARD_ROWS * HEX_H + 16;
    for (const c of chips) {
      const w = this.traitChipWidth(c);
      if (cx + w > rowRight) { cx = padX; rowY += 24; }
      this.drawTraitChip(this.scoutLayer, c, cx, rowY);
      cx += w + 5;
    }

    // Close button — visual stays 30×24, hit area expands to a 44px min target.
    const closeBtn = new PIXI.Graphics();
    closeBtn.roundRect(panelX + panelW - 30, panelY + 4, 30, 24, 4).fill({ color: C.bgCloseBtn, alpha: 0.9 });
    closeBtn.eventMode = "static";
    closeBtn.cursor = "pointer";
    closeBtn.hitArea = new PIXI.Rectangle(panelX + panelW - 44, panelY, 44, 36);
    closeBtn.on("pointerdown", () => this.closeScout());
    this.scoutLayer.addChild(closeBtn);
    const closeX = new PIXI.Text("X", { fontSize: 11, fill: C.textMuted, fontFamily: "monospace" });
    closeX.anchor.set(0.5, 0.5);
    closeX.x = panelX + panelW - 15;
    closeX.y = panelY + 16;
    this.scoutLayer.addChild(closeX);
  }

  private closeScout(): void {
    this.scoutTargetId = null;
    this.scoutLayer.removeChildren();
  }

  // ─── INSPECT (unit + trait detail panels) ────────────────────────────────

  /** Long-press affordance: open the unit-inspect panel after a hold. */
  private armInspect(defId: string, unit: UnitInstance | null, e: PIXI.FederatedPointerEvent): void {
    this.clearPress();
    this.pressStart = { x: e.globalX, y: e.globalY };
    this.pressTimer = setTimeout(() => {
      this.pressTimer = null;
      this.openUnitInspect(defId, unit);
    }, 360);
  }

  /** Cancel a pending long-press (a drag started or the press lifted/moved). */
  private clearPress(): void {
    if (this.pressTimer !== null) { clearTimeout(this.pressTimer); this.pressTimer = null; }
    this.pressStart = null;
  }

  /** If the long-press fired, the tap action should be suppressed. */
  private get inspectOpen(): boolean {
    return this.inspectLayer.children.length > 0;
  }

  private openUnitInspect(defId: string, unit: UnitInstance | null): void {
    const m = inspectModel(defId, unit, gameData);
    if (!m) return;
    this.abortDrag(); // a long-press supersedes any in-progress drag
    this.opts.audio.play("tap");
    renderUnitInspect(this.inspectLayer, m, () => this.closeInspect(), this.layout, this.opts.settings.get().reducedMotion);
  }

  /** Cancel an in-progress drag without issuing a move (long-press took over). */
  private abortDrag(): void {
    if (!this.isDragging) return;
    if (this.dragSprite) { this.container.removeChild(this.dragSprite); this.dragSprite = null; }
    this.isDragging = false;
    this.dragCatcher.eventMode = "none";
    this.dragUnit = null;
    this.render(this.driver.getState());
  }

  private openTraitDetail(traitId: string, count: number): void {
    const m = traitDetailModel(traitId, count, gameData);
    if (!m) return;
    this.opts.audio.play("tap");
    renderTraitDetail(this.inspectLayer, m, () => this.closeInspect(), this.layout, this.opts.settings.get().reducedMotion);
  }

  private closeInspect(): void {
    this.inspectLayer.removeChildren();
  }

  // ─── PHASE TRANSITIONS ───────────────────────────────────────────────────

  private onPlanningStart(): void {
    this.teardownPlayback();
    this.clearResolutionTimer();
    this.clearLootReveal();
    this.clearPress();
    this.combatLayer.removeChildren();
    this.closeScout();
    this.closeInspect();
    const state = this.driver.getState();
    void this.opts.audio.setMusicState(phaseToMusicState("PLANNING"));
    // Round-start cue + income coins (income lands entering planning).
    this.opts.audio.play("roundStart");
    const me = state.players[this.driver.seatIndex];
    if (me) {
      if (state.round > 1 && me.gold > this.prevGold) this.opts.audio.play("goldGain", 0.18);
      this.prevGold = me.gold;
    }
    this.render(state);
  }

  private onCombatPhase(): void {
    const state = this.driver.getState();
    void this.opts.audio.setMusicState(phaseToMusicState("COMBAT"));
    // Bridge planning → combat with a brief cross-fade so the cut isn't a hard
    // single-frame flash. Reduced-motion skips straight to the combat render.
    if (this.opts.settings.get().reducedMotion) {
      this.renderCombat(state);
      return;
    }
    const planning = [this.boardLayer, this.benchLayer, this.shopLayer, this.traitLayer, this.itemLayer];
    let t = 0;
    const fade = (ticker: PIXI.Ticker): void => {
      t += ticker.deltaMS;
      const k = Math.min(1, t / 120);
      for (const l of planning) l.alpha = 1 - k;
      if (k >= 1) {
        this.app.ticker.remove(fade);
        this.renderCombat(this.driver.getState());
        for (const l of planning) l.alpha = 1;
      }
    };
    this.app.ticker.add(fade);
  }

  private renderCombat(state: MatchState): void {
    this.teardownPlayback();
    this.clearPress();
    this.closeScout();
    this.closeInspect();
    this.combatLayer.removeChildren();
    // Hide planning UI
    this.boardLayer.removeChildren();
    this.benchLayer.removeChildren();
    this.shopLayer.removeChildren();
    this.traitLayer.removeChildren();
    this.itemLayer.removeChildren();
    this.closeCombineHint();
    this.clearLootReveal();
    this.dragItem = null;

    const me = state.players[this.driver.seatIndex];
    if (!me) return;

    // Board-bg panel first so banners/tiles/tokens layer on top of it.
    this.drawBoardPanel(this.combatLayer);

    const pairing = this.driver.getMyPairing();
    const isGhost = pairing?.isGhost ?? false;
    const opponentId = pairing ? pairing.opponentId : null;
    const isPve = this.driver.isPveRound();
    const pveStage = this.driver.getPveStageName();

    // "vs" banner / PvE label
    let opponentName = "Ghost";
    if (isPve) {
      opponentName = `${pveStage ?? "Creeps"} · Creeps`;
    } else if (opponentId !== null && !isGhost && opponentId >= 0) {
      opponentName = `Player ${opponentId + 1}`;
    } else if (isGhost) {
      opponentName = "Ghost (eliminated)";
    } else if (opponentId === null) {
      opponentName = "Bye (PvE)";
    }

    // Combat header is rendered AFTER the tiles (see below) with an explicit
    // zIndex so it never bleeds behind the board.

    // Full combat field: opponent half (top) + own half (bottom). PvE rounds
    // tint the enemy zone with the warm mobZone so a creep round reads as PvE.
    const offX = this.boardOffsetX;
    const playerY = this.boardOffsetY;
    const oppY = this.oppBoardOffsetY;
    const s = this.boardScale;
    const hexR = this.hexR - 2 * s;
    const tokR = this.boardTokenR;
    const enemyZone = isPve ? C.mobZone : C.enemyHex;
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let q = 0; q < BOARD_COLS; q++) {
        const opp = hexToPixel(q, r, offX, oppY, s);
        const og = new PIXI.Graphics();
        drawHex(og, opp.x, opp.y, hexR, enemyZone, 1, {
          border: { color: C.boardBorder, width: 1, alpha: 0.8 },
        });
        this.combatLayer.addChild(og);

        const own = hexToPixel(q, r, offX, playerY, s);
        const g = new PIXI.Graphics();
        drawHex(g, own.x, own.y, hexR, C.myHex, 1, {
          border: { color: C.boardBorder, width: 1, alpha: 0.8 },
        });
        this.combatLayer.addChild(g);
      }
    }

    const result = this.driver.getMyCombatResult();
    if (result && result.events.length > 0) {
      // PvE: my board is side 0 (the mob board is side 1) — same playback path.
      this.startPlayback(result.events, isPve ? 0 : pairing?.side ?? 0);
      this.renderPlaybackControls();
    } else {
      // No event log (PvE/bye round): static own board, release the driver
      for (let idx = 0; idx < BOARD_SLOTS; idx++) {
        const unit = me.board[idx];
        if (!unit) continue;
        const q = idx % BOARD_COLS;
        const r = Math.floor(idx / BOARD_COLS);
        const { x, y } = hexToPixel(q, r, offX, playerY, s);
        const uc = new PIXI.Container();
        drawUnit(uc, unit, x, y, tokR);
        this.combatLayer.addChild(uc);
      }
      this.driver.combatPlaybackDone();
    }

    // Single combat header, placed in the clear band just below the board panel
    // (outside both hex zones) and given a high zIndex so the sortable
    // combatLayer always draws it above the tiles/tokens — never behind them.
    // Clamp into view for short landscape (board panel nearly fills designH).
    const b = this.layout.regions.board;
    const headerY = Math.min(b.y + b.h + 12, this.designH - 10);
    const headerText = isPve ? `PvE  ·  ${opponentName}` : `COMBAT  ·  vs ${opponentName}`;
    const header = new PIXI.Text(headerText, {
      fontSize: 13, fill: isPve ? C.pveLabel : C.textCombat, fontFamily: "monospace",
    });
    header.anchor.set(0.5, 0.5);
    header.x = this.designW / 2;
    header.y = headerY;
    header.zIndex = Z_COMBAT_HEADER;
    header.eventMode = "none";
    this.combatLayer.addChild(header);
  }

  // ─── COMBAT PLAYBACK ─────────────────────────────────────────────────────

  private startPlayback(events: CombatEvent[], side: 0 | 1): void {
    // Display rows 0-3 = opponent half, 4-7 = my half (toDisplayHex keeps my
    // units on the bottom regardless of pairing side).
    const offX = this.boardOffsetX;
    const playerY = this.boardOffsetY;
    const oppY = this.oppBoardOffsetY;
    const s = this.boardScale;
    const toPixel = (hex: HexCoord): { x: number; y: number } => {
      const d = toDisplayHex(hex, side);
      return d.r < BOARD_ROWS
        ? hexToPixel(d.q, d.r, offX, oppY, s)
        : hexToPixel(d.q, d.r - BOARD_ROWS, offX, playerY, s);
    };

    const reducedMotion = this.opts.settings.get().reducedMotion;
    const player = new CombatPlayer(events, gameData.gameplay.ticksPerSec, gameData, { reducedMotion });
    player.setSpeed(this.playbackSpeed);
    const view = new CombatView(toPixel, {
      x: this.designW / 2,
      y: playerY - BOARD_ROWS * HEX_H * s + 10,
    }, { reducedMotion, scale: s, edge: { w: this.designW, h: this.designH } });
    this.combatLayer.addChild(view.container);

    const tickerFn = (ticker: PIXI.Ticker): void => {
      const frame = player.advance(ticker.deltaMS);
      view.renderFrame(frame, ticker.deltaMS);
      this.opts.audio.handleCombatFx(frame.fx);
      if (frame.done) this.finishPlayback();
    };
    this.app.ticker.add(tickerFn);
    this.playback = { player, view, tickerFn };
  }

  /** Natural completion or explicit skip: final frame stays on screen. */
  private finishPlayback(): void {
    if (!this.playback) return;
    this.app.ticker.remove(this.playback.tickerFn);
    this.playback = null;
    this.driver.combatPlaybackDone();
  }

  /** Abandon playback (phase moved on, e.g. server advanced first). */
  private teardownPlayback(): void {
    if (!this.playback) return;
    this.app.ticker.remove(this.playback.tickerFn);
    this.playback.player.skipToEnd();
    this.playback = null;
  }

  private skipPlayback(): void {
    if (!this.playback) return;
    const { player, view } = this.playback;
    const frame = player.skipToEnd();
    view.renderFrame(frame, 0);
    this.finishPlayback();
  }

  private toggleSpeed(): void {
    this.playbackSpeed = this.playbackSpeed === 1 ? 2 : 1;
    this.playback?.player.setSpeed(this.playbackSpeed);
    if (this.speedBtnLabel) this.speedBtnLabel.text = `${this.playbackSpeed}x`;
  }

  private renderPlaybackControls(): void {
    // Sized to the 44px min touch target and styled with the shared chip set so
    // the controls read as part of the HUD, not detached overlay buttons.
    const btnW = 52;
    const btnH = 44;
    const gap = 6;
    // Just below the status row, top-right (planning chrome is hidden in combat).
    const btnY = this.layout.regions.statusRow.h + 6;
    const mkBtn = (x: number, label: string, onTap: () => void): PIXI.Text => {
      const g = this.chip(this.combatLayer, x, btnY, btnW, btnH, { fill: C.bgReroll, radius: 7 });
      g.eventMode = "static";
      g.hitArea = new PIXI.Rectangle(x, btnY, btnW, btnH);
      g.cursor = "pointer";
      g.zIndex = Z_COMBAT_HEADER;
      this.pressFeedback(g, onTap, { cx: x + btnW / 2, cy: btnY + btnH / 2 });
      const t = this.text(this.combatLayer, label, x + btnW / 2, btnY + btnH / 2, 12, C.textPrimary, [0.5, 0.5]);
      t.zIndex = Z_COMBAT_HEADER;
      return t;
    };
    const skipX = this.designW - btnW - 6;
    const speedX = skipX - btnW - gap;
    this.speedBtnLabel = mkBtn(speedX, `${this.playbackSpeed}x`, () => this.toggleSpeed());
    mkBtn(skipX, "Skip", () => this.skipPlayback());
    this.combatLayer.sortChildren();
  }

  private onResolutionPhase(): void {
    // Online the server may advance before playback ends: auto-skip to end.
    this.teardownPlayback();
    const state = this.driver.getState();
    this.renderResolution(state);
    // PvE rounds drop loot: animate the seeded orbs revealing their contents
    // over the resolution panel (presentation only — rules already decided them).
    if (this.driver.isPveRound()) this.startLootReveal();
  }

  private renderResolution(state: MatchState): void {
    this.combatLayer.removeChildren();

    const me = state.players[this.driver.seatIndex];
    if (!me) return;

    // Win/loss comes from the driver's normalized perspective, never winner === 0
    const outcome = this.driver.getMyOutcome();
    const won = outcome === "win";
    const drew = outcome === "draw";

    const { designW, designH } = this.layout;
    const cx = designW / 2;

    const bg = new PIXI.Graphics();
    bg.rect(0, 0, designW, designH).fill({ color: C.bgOverlay, alpha: 0.72 });
    // Must NOT swallow pointer events — we need the Continue button to work
    bg.eventMode = "none";
    this.combatLayer.addChild(bg);

    // Centered + clamped modal (fits short landscape, designH=390).
    const modal = centeredModal(this.layout, designW - 80, 240);

    // Outcome cue: a player elimination overrides the round win/loss sting.
    if (!me.alive) this.opts.audio.play("elimination");
    else if (won) this.opts.audio.play("roundWin");
    else if (!drew) this.opts.audio.play("roundLoss");

    const resultStr = drew ? "Draw" : won ? "Victory" : "Defeat";
    const resultColor = drew ? C.textGold : won ? C.textGoodHP : C.textBadHP;

    // Brighter modal surface (surfaceOver) + an outcome-tinted accent rim so the
    // panel pops off the scrim instead of blending into it.
    const box = new PIXI.Graphics();
    box.roundRect(modal.x, modal.y, modal.w, modal.h, 8).fill({ color: C.bgInspect, alpha: 0.97 });
    box.roundRect(modal.x, modal.y, modal.w, modal.h, 8).stroke({ width: 1.5, color: resultColor, alpha: 0.6 });
    box.eventMode = "none";
    this.combatLayer.addChild(box);
    const title = new PIXI.Text(`Round ${state.round} — ${resultStr}`, {
      fontSize: 13, fill: C.textPrimary, fontFamily: "monospace",
    });
    title.eventMode = "none";
    title.anchor.set(0.5, 0);
    title.x = cx;
    title.y = modal.y + 12;
    this.combatLayer.addChild(title);

    const resultLabel = new PIXI.Text(resultStr, {
      fontSize: 20, fill: resultColor, fontFamily: "monospace",
    });
    resultLabel.eventMode = "none";
    resultLabel.anchor.set(0.5, 0);
    resultLabel.x = cx;
    resultLabel.y = modal.y + 34;
    this.combatLayer.addChild(resultLabel);

    const hpText = new PIXI.Text(`HP: ${Math.max(0, me.hp)}`, {
      fontSize: 12, fill: me.alive ? C.textGoodHP : C.textBadHP, fontFamily: "monospace",
    });
    hpText.eventMode = "none";
    hpText.anchor.set(0.5, 0);
    hpText.x = cx;
    hpText.y = modal.y + 68;
    this.combatLayer.addChild(hpText);

    // Round damage detail (real numbers decided by rules; we only display them).
    // PvE/bye take no HP damage; a win shows damage dealt.
    const rr = this.driver.getMyRoundResult();
    if (rr) {
      let detail: string;
      let detailColor: number;
      if (rr.status === "pve") {
        detail = "PvE — no damage taken";
        detailColor = C.textMuted;
      } else if (rr.status === "bye") {
        detail = "Bye — no combat";
        detailColor = C.textMuted;
      } else if (rr.status === "won") {
        detail = rr.damageDealt > 0 ? `Dealt ${rr.damageDealt} damage` : "No damage dealt";
        detailColor = C.textGoodHP;
      } else {
        detail = `−${rr.damageTaken} HP`;
        detailColor = C.textBadHP;
      }
      const detailText = new PIXI.Text(detail, {
        fontSize: 12, fill: detailColor, fontFamily: "monospace",
      });
      detailText.eventMode = "none";
      detailText.anchor.set(0.5, 0);
      detailText.x = cx;
      detailText.y = modal.y + 86;
      this.combatLayer.addChild(detailText);
    }

    // Continue button + countdown pinned to the modal's bottom edge.
    const btnW = Math.min(200, modal.w - 24), btnH = 44;
    const btnX = cx - btnW / 2, btnY = modal.y + modal.h - btnH - 14;
    const continueBtn = new PIXI.Graphics();
    continueBtn.roundRect(btnX, btnY, btnW, btnH, 8).fill({ color: C.bgContinue, alpha: 0.95 });
    continueBtn.roundRect(btnX, btnY, btnW, btnH, 8).stroke({ width: 1.5, color: C.hpGreen, alpha: 0.8 });
    continueBtn.eventMode = "static";
    continueBtn.hitArea = new PIXI.Rectangle(btnX, btnY, btnW, btnH);
    continueBtn.cursor = "pointer";
    continueBtn.zIndex = Z_RESOLUTION_BUTTON;
    continueBtn.on("pointerdown", () => this.advanceFromResolution());
    this.combatLayer.addChild(continueBtn);

    const continueText = new PIXI.Text("Continue", {
      fontSize: 14, fill: C.textReady, fontFamily: "monospace",
    });
    continueText.anchor.set(0.5, 0.5);
    continueText.x = cx;
    continueText.y = btnY + btnH / 2;
    continueText.eventMode = "none";
    continueText.zIndex = Z_RESOLUTION_CONTROL + 1;
    this.combatLayer.addChild(continueText);

    // Visible auto-advance countdown: a thin draining bar across the button base
    // + a seconds label, so the wait never feels stuck. Driven by the ticker
    // (reduced-motion still updates the second count, just no smooth drain).
    const countLabel = new PIXI.Text("", {
      fontSize: 10, fill: C.textMuted, fontFamily: "monospace",
    });
    countLabel.anchor.set(0.5, 1);
    countLabel.x = cx;
    countLabel.y = btnY - 4;
    countLabel.eventMode = "none";
    countLabel.zIndex = Z_RESOLUTION_CONTROL + 1;
    this.combatLayer.addChild(countLabel);

    const barW = btnW - 16;
    const barX = cx - barW / 2;
    const barY = btnY + btnH - 6;
    const drain = new PIXI.Graphics();
    drain.zIndex = Z_RESOLUTION_CONTROL + 1;
    drain.eventMode = "none";
    this.combatLayer.addChild(drain);
    this.combatLayer.sortChildren();

    // Auto-advance fallback (the canonical timer) + a synced visible countdown.
    this.clearResolutionTimer();
    const total = RESOLUTION_AUTO_ADVANCE_MS;
    let remaining = total;
    this.resolutionAutoTimer = setTimeout(() => this.advanceFromResolution(), total);
    const reduced = this.opts.settings.get().reducedMotion;
    const tick = (ticker: PIXI.Ticker): void => {
      remaining = Math.max(0, remaining - ticker.deltaMS);
      const frac = remaining / total;
      countLabel.text = `Auto in ${Math.ceil(remaining / 1000)}s`;
      drain.clear();
      drain.rect(barX, barY, Math.round(barW * frac), 2).fill({ color: C.hpGreen, alpha: 0.7 });
    };
    if (reduced) {
      countLabel.text = `Auto in ${Math.ceil(total / 1000)}s`;
    }
    tick(this.app.ticker); // paint immediately so it's never blank
    this.resolutionCountdownFn = tick;
    this.app.ticker.add(tick);
  }

  // ─── LOOT ORB REVEAL (phase 10b) ─────────────────────────────────────────

  /**
   * Animate the round's loot orbs revealing their already-decided contents.
   * Orbs pop in by ascending rarity (distinct color + shape), crack open, then
   * the reward flies toward the gold counter / item bar. Reduced-motion shows an
   * instant summary chip instead. Purely presentational — no game logic.
   */
  private startLootReveal(): void {
    if (this.lootRevealActive) return; // a reveal is already playing
    this.clearLootReveal();
    const model = lootRevealModel(this.driver.getMyLootOrbs(), gameData);
    if (model.empty) return;
    this.lootRevealActive = true;
    this.opts.audio.play("goldGain", 0.1);

    const cx = this.designW / 2;
    // Header band above the orbs. Portrait keeps the original y; landscape centers
    // the band on the board so it reads over the playfield.
    const b = this.layout.regions.board;
    const bandY = this.isLandscape ? b.y + b.h / 2 : 150;
    this.text(this.lootLayer, "LOOT", cx, bandY - 22, 12, C.accentGold, [0.5, 0.5]);

    if (this.opts.settings.get().reducedMotion) {
      // Instant summary: one compact line, no animation.
      const parts: string[] = [];
      if (model.totalGold > 0) parts.push(`+${model.totalGold} gold`);
      if (model.itemCount > 0) parts.push(`${model.itemCount} item${model.itemCount > 1 ? "s" : ""}`);
      const summary = parts.join("  ·  ") || "—";
      const bg = new PIXI.Graphics();
      const w = 40 + summary.length * 7;
      bg.roundRect(cx - w / 2, bandY - 12, w, 30, 8).fill({ color: C.bgInspect, alpha: 0.96 });
      bg.roundRect(cx - w / 2, bandY - 12, w, 30, 8).stroke({ width: 1.5, color: C.accentGold, alpha: 0.9 });
      bg.eventMode = "none";
      this.lootLayer.addChild(bg);
      this.text(this.lootLayer, summary, cx, bandY + 3, 11, C.textPrimary, [0.5, 0.5]);
      this.lootRevealActive = false;
      return;
    }

    // Lay orbs out in a centered row; reveal them one at a time on a timeline.
    const n = model.steps.length;
    const gap = 56;
    const startX = cx - ((n - 1) * gap) / 2;
    model.steps.forEach((step, i) => {
      const ox = startX + i * gap;
      // Stagger the reveal so orbs cascade rather than pop all at once.
      this.scheduleReveal(step, ox, bandY, i * 360);
    });
    // Mark the reveal finished once the last orb has flown out (+ a little tail).
    const done = setTimeout(() => { this.lootRevealActive = false; }, n * 360 + 900);
    this.lootTimers.push(done);
  }

  /** Spawn one orb that pops in, cracks open, and flies its reward out. */
  private scheduleReveal(step: RevealStep, x: number, y: number, delayMs: number): void {
    const orb = new PIXI.Container();
    orb.position.set(x, y);
    orb.scale.set(0);
    orb.eventMode = "none";
    this.lootLayer.addChild(orb);
    // Orb shell: rarity-colored disc with a bright core.
    const shell = new PIXI.Graphics();
    shell.circle(0, 0, 18).fill({ color: step.color, alpha: 0.95 });
    shell.circle(0, 0, 18).stroke({ width: 2, color: C.lootOrbCore, alpha: 0.6 });
    shell.circle(0, 0, 7).fill({ color: C.lootOrbCore, alpha: 0.9 });
    orb.addChild(shell);

    const start = performance.now() + delayMs;
    const popMs = 260, holdMs = 320, flyMs = 420;
    let revealed = false;
    let finished = false;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      this.app.ticker.remove(fn);
      this.lootTickers = this.lootTickers.filter((t) => t !== fn);
      if (orb.parent) this.lootLayer.removeChild(orb);
      orb.destroy({ children: true });
    };
    const fn = (ticker: PIXI.Ticker): void => {
      void ticker;
      if (finished) return;
      const t = performance.now() - start;
      if (t < 0) return;
      if (t < popMs) {
        // Pop in with a slight overshoot.
        const k = t / popMs;
        orb.scale.set(1.15 * k);
      } else if (t < popMs + holdMs) {
        orb.scale.set(1);
        if (!revealed) {
          revealed = true;
          this.opts.audio.play("starUp", 0);
          this.attachRevealContent(orb, step);
        }
      } else if (t < popMs + holdMs + flyMs) {
        // Fly the orb toward its destination, fading + shrinking.
        const k = (t - popMs - holdMs) / flyMs;
        const hud = this.layout.regions.hud;
        const bar = this.itemBar;
        const target = step.destination === "gold"
          ? { x: hud.x + (this.isLandscape ? 18 : 95), y: hud.y + hud.h / 2 } // gold counter
          : { x: bar.x + 30, y: bar.y + ITEM_SLOT / 2 };                       // item bar
        orb.x = x + (target.x - x) * k;
        orb.y = y + (target.y - y) * k;
        orb.alpha = 1 - k;
        orb.scale.set(1 - 0.4 * k);
      } else {
        if (step.destination === "gold") this.opts.audio.play("goldGain", 0);
        finish();
      }
    };
    this.lootTickers.push(fn);
    this.app.ticker.add(fn);
  }

  /** Draw the revealed reward (gold value / item glyph + name) onto the orb. */
  private attachRevealContent(orb: PIXI.Container, step: RevealStep): void {
    const label = new PIXI.Container();
    label.position.set(0, -30);
    if (step.content.kind === "gold") {
      this.glyph(label, "coin", -10, 0, 11, C.accentGold);
      this.text(label, step.content.label, 2, 0, 11, C.textGold, [0, 0.5]);
    } else {
      // Distinct item icon, tinted by the orb's rarity for a consistent read.
      const ic = new PIXI.Container();
      drawItemIcon(ic, step.content.id, -10, 0, {
        radius: 8,
        rarity: step.rarity,
        reducedMotion: this.opts.settings.get().reducedMotion,
      });
      label.addChild(ic);
      this.text(label, step.content.name, 4, 0, 8, C.textPrimary, [0, 0.5]);
    }
    label.eventMode = "none";
    orb.addChild(label);
    // Small burst ring on reveal.
    const burst = new PIXI.Graphics();
    burst.circle(0, 0, 20).stroke({ width: 2, color: step.color, alpha: 0.8 });
    orb.addChild(burst);
  }

  private clearLootReveal(): void {
    for (const fn of this.lootTickers) this.app.ticker.remove(fn);
    this.lootTickers = [];
    for (const t of this.lootTimers) clearTimeout(t);
    this.lootTimers = [];
    this.lootLayer.removeChildren();
    this.lootRevealActive = false;
  }

  private advanceFromResolution(): void {
    this.clearLootReveal();
    this.clearResolutionTimer();
    this.driver.advanceFromResolution();
  }

  private clearResolutionTimer(): void {
    if (this.resolutionAutoTimer !== null) {
      clearTimeout(this.resolutionAutoTimer);
      this.resolutionAutoTimer = null;
    }
    if (this.resolutionCountdownFn !== null) {
      this.app.ticker.remove(this.resolutionCountdownFn);
      this.resolutionCountdownFn = null;
    }
  }

  private onMatchOver(
    placements: number[],
    mmr?: Record<number, { before: number; after: number }>,
    stats?: Record<number, MatchStats>
  ): void {
    this.teardownPlayback();
    this.clearResolutionTimer();
    this.clearLootReveal();
    this.closeInspect();
    void this.opts.audio.setMusicState("results");
    const seat = this.driver.seatIndex;
    const mine = placements.indexOf(seat) + 1;
    this.opts.audio.play(mine >= 1 && mine <= 4 ? "roundWin" : "roundLoss");
    this.combatLayer.removeChildren();

    const state = this.driver.getState();
    const { designW, designH } = this.layout;
    const cx = designW / 2;
    const land = this.isLandscape;

    // Dim scrim behind the themed panel (consistent with the inspect/resolution
    // panels — full-screen scrim + a rounded bgInspect surface with an accent rim).
    const scrim = new PIXI.Graphics();
    scrim.rect(0, 0, designW, designH).fill({ color: C.bgScrim, alpha: 0.72 });
    scrim.eventMode = "none";
    this.combatLayer.addChild(scrim);

    // Layout the panel from a content budget so 8 placements + the MMR line +
    // the button never collide regardless of seat count. Landscape (short height)
    // compresses row height + header so it still fits within designH.
    const rowH = land ? 17 : 22;
    const headerH = land ? 56 : 78;   // title + "you placed" line
    const titleSize = land ? 15 : 18;
    const rowsH = placements.length * rowH;
    const myMmr = mmr?.[seat];
    const mmrH = myMmr ? (land ? 22 : 30) : 8;
    // Personal match summary (W–L record + total damage), decided by rules.
    const myStats = stats?.[seat];
    const statsH = myStats ? (land ? 30 : 40) : 0;
    const btnH = land ? 36 : 44;
    const btnGap = land ? 10 : 18;
    const contentH = headerH + rowsH + mmrH + statsH + btnGap + btnH + 20;
    // centeredModal clamps the panel into the safe design area.
    const modal = centeredModal(this.layout, designW - 56, contentH);
    const panelX = modal.x, panelY = modal.y, panelW = modal.w, panelH = modal.h;

    const panel = new PIXI.Graphics();
    panel.roundRect(panelX, panelY, panelW, panelH, 12).fill({ color: C.bgInspect, alpha: 0.98 });
    panel.roundRect(panelX, panelY, panelW, panelH, 12).stroke({ width: 1.5, color: C.accentGold, alpha: 0.9 });
    panel.eventMode = "static"; // modal — swallow taps
    this.combatLayer.addChild(panel);

    const title = this.text(this.combatLayer, "MATCH OVER", cx, panelY + 12, titleSize, C.textGold, [0.5, 0]);
    title.eventMode = "none";

    const playerPlacement = state.players[seat]?.placement ?? (mine || 1);
    this.text(
      this.combatLayer, `You placed #${playerPlacement}`,
      cx, panelY + (land ? 34 : 44), 13, C.textPrimary, [0.5, 0]
    );

    // Placement list — one row per seat, you highlighted, name where available.
    const rowsTop = panelY + headerH;
    for (let i = 0; i < placements.length; i++) {
      const pid = placements[i] ?? 0;
      const isMe = pid === seat;
      const name = this.seatName(state, pid);
      this.text(
        this.combatLayer, `#${i + 1}  ${name}${isMe ? "  (You)" : ""}`,
        cx, rowsTop + i * rowH, 11, isMe ? C.textReady : C.textMuted, [0.5, 0]
      );
    }

    // MMR line in its own band below the list (no overlap at 8 seats).
    if (myMmr) {
      const delta = myMmr.after - myMmr.before;
      this.text(
        this.combatLayer,
        `MMR ${myMmr.after} (${delta >= 0 ? "+" : ""}${delta})`,
        cx, rowsTop + rowsH + 6, 12, delta >= 0 ? C.textReady : C.textBadHP, [0.5, 0]
      );
    }

    // Personal match summary band: W–L record + total damage taken/dealt.
    // Numbers come straight from rules; the renderer only displays them.
    if (myStats) {
      const summaryTop = rowsTop + rowsH + mmrH;
      this.text(
        this.combatLayer,
        `Record ${myStats.roundWins}–${myStats.roundLosses}`,
        cx, summaryTop, 12, C.textPrimary, [0.5, 0]
      );
      this.text(
        this.combatLayer,
        `Dealt ${myStats.totalDamageDealt}  ·  Taken ${myStats.totalDamageTaken}`,
        cx, summaryTop + (land ? 14 : 18), 11, C.textMuted, [0.5, 0]
      );
    }

    // Main Menu button — themed, thumb-reachable, pinned to the panel base.
    const btnW = 160;
    const btnX = cx - btnW / 2;
    const btnY = panelY + panelH - btnH - 14;
    const menuBtn = new PIXI.Graphics();
    menuBtn.roundRect(btnX, btnY, btnW, btnH, 8).fill({ color: C.bgContinue, alpha: 0.95 });
    menuBtn.roundRect(btnX, btnY, btnW, btnH, 8).stroke({ width: 1.5, color: C.hpGreen, alpha: 0.8 });
    menuBtn.eventMode = "static";
    menuBtn.hitArea = new PIXI.Rectangle(btnX, btnY, btnW, btnH);
    menuBtn.cursor = "pointer";
    menuBtn.on("pointerdown", () => this.opts.onLeave());
    this.combatLayer.addChild(menuBtn);
    const menuTxt = this.text(this.combatLayer, "Main Menu", cx, btnY + btnH / 2, 14, C.textReady, [0.5, 0.5]);
    menuTxt.eventMode = "none";
  }

  /** Display name for a seat, falling back to "Player N" when none is known. */
  private seatName(state: MatchState, pid: number): string {
    const p = state.players[pid] as (PlayerState & { name?: string }) | undefined;
    return p?.name && p.name.length > 0 ? p.name : `Player ${pid + 1}`;
  }

  /** Tear down the scene: stop playback/timers, unsubscribe, drop the container. */
  destroy(): void {
    this.teardownPlayback();
    this.clearResolutionTimer();
    this.clearLootReveal();
    this.clearPress();
    this.clearToast();
    this.unsub();
    this.unsubArt();
    this.unsubItemArt();
    if (this.container.parent) this.container.parent.removeChild(this.container);
    this.container.destroy({ children: true });
  }

  // ─── TOAST ───────────────────────────────────────────────────────────────

  private showToast(msg: string): void {
    const TTL = 1800;
    // Dedupe rapid identical errors: refresh the existing toast's lifetime
    // instead of re-rendering / stacking the same message.
    if (this.toastMsg === msg && this.toastLayer.children.length > 0) {
      if (this.toastTimer !== null) clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => this.clearToast(), TTL);
      return;
    }

    this.opts.audio.play("error");
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastLayer.removeChildren();
    this.toastMsg = msg;

    // Flexible width: grow with the text up to a sensible cap, wrapping if longer.
    const fontSize = 10;
    const charW = fontSize * 0.62;
    const padX = 12;
    const designW = this.designW;
    const maxTextW = designW - 40 - 2 * padX; // cap so it never reaches the edges
    const lines = wrapToWidth(msg, Math.floor(maxTextW / charW));
    const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
    const boxW = Math.min(maxTextW, longest * charW) + 2 * padX;
    const lineH = fontSize + 4;
    const boxH = lines.length * lineH + 14;
    const boxX = designW / 2 - boxW / 2;
    // Portrait: just above the bench. Landscape: just below the status row so it
    // never overlaps the board panel (which nearly fills the short viewport).
    const boxY = this.isLandscape
      ? this.layout.regions.statusRow.h + 8
      : this.layout.regions.bench.y - 22 - boxH;

    const bg = new PIXI.Graphics();
    bg.roundRect(boxX, boxY, boxW, boxH, 5).fill({ color: C.bgToast, alpha: 0.92 });
    bg.roundRect(boxX, boxY, boxW, boxH, 5).stroke({ width: 1, color: C.textToast, alpha: 0.5 });
    bg.eventMode = "none";
    this.toastLayer.addChild(bg);

    lines.forEach((line, i) => {
      const t = this.text(this.toastLayer, line, designW / 2, boxY + 7 + i * lineH + lineH / 2, fontSize, C.textToast, [0.5, 0.5]);
      t.eventMode = "none";
    });

    // Reduced-motion: no fade-in, render at full alpha immediately.
    if (this.opts.settings.get().reducedMotion) {
      this.toastLayer.alpha = 1;
    } else {
      this.toastLayer.alpha = 0;
      const fadeIn = (ticker: PIXI.Ticker): void => {
        this.toastLayer.alpha = Math.min(1, this.toastLayer.alpha + ticker.deltaMS / 150);
        if (this.toastLayer.alpha >= 1) this.app.ticker.remove(fadeIn);
      };
      this.app.ticker.add(fadeIn);
    }

    this.toastTimer = setTimeout(() => this.clearToast(), TTL);
  }

  private clearToast(): void {
    if (this.toastTimer !== null) { clearTimeout(this.toastTimer); this.toastTimer = null; }
    this.toastLayer.removeChildren();
    this.toastLayer.alpha = 1;
    this.toastMsg = null;
  }
}

/** Greedy word-wrap to a max character width; returns the lines. */
function wrapToWidth(str: string, perLine: number): string[] {
  if (str.length <= perLine) return [str];
  const words = str.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > perLine && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}
