import * as PIXI from "pixi.js";
import { gameData } from "@autobattler/data";
import type { MatchState, PlayerState } from "@autobattler/rules/src/state.js";
import type { UnitInstance, CombatEvent } from "@autobattler/sim/src/types.js";
import type { HexCoord } from "@autobattler/sim/src/hex.js";
import type { IDriver } from "../driver.js";
import { CombatPlayer, toDisplayHex } from "../combat/player.js";
import type { PlaybackSpeed } from "../combat/player.js";
import { CombatView } from "../combat/view.js";
import { C, tierColor } from "../theme.js";
import { drawUnitToken } from "../unitToken.js";
import { drawGlyph, glyphForTraits } from "../glyphs.js";
import type { GlyphKind } from "../glyphs.js";
import { traitStripModel, xpProgress } from "../hudModel.js";
import { onUnitArtReady } from "../sprites.js";
import type { SettingsStore } from "../settings.js";
import type { AudioManager } from "../audio/manager.js";
import { phaseToMusicState } from "../audio/director.js";

export interface MatchSceneOptions {
  settings: SettingsStore;
  audio: AudioManager;
  /** Called to leave the match and return to the menu (pause panel or match-over). */
  onLeave: () => void;
}
import {
  HEX_R, HEX_W, HEX_H, BOARD_COLS, BOARD_ROWS, BOARD_SLOTS,
  hexToPixel, hexFromPointer,
} from "../hexUtils.js";

const DESIGN_W = 390;
const DESIGN_H = 844;

const BOARD_OFFSET_X = (DESIGN_W - BOARD_COLS * HEX_W) / 2 + HEX_R;
const BOARD_OFFSET_Y = 265;

// ── Stage-2 chrome layout ───────────────────────────────────────────────────
const STATUS_Y = 4;          // status row (stage chip / timer)
const RAIL_Y = 28;           // opponent rail top
const TRAIT_STRIP_Y = 426;   // trait strip (just below the board panel)
const HUD_ROW_Y = 476;       // level / gold / streak / reroll / buy-xp row
const HUD_ROW_H = 38;

const BENCH_SLOT_W = 38;
const BENCH_Y = 532;
const SHOP_Y = 574;
const SHOP_CARD_W = 71;
const SHOP_CARD_H = 84;
const SHOP_GAP = 4;
const SHOP_START_X = 9;
const READY_Y = SHOP_Y + SHOP_CARD_H + 10;

// Opponent board is mirrored on the top half
const OPP_BOARD_OFFSET_Y = BOARD_OFFSET_Y - BOARD_ROWS * HEX_H - 12;

// Board-bg panel framing both zones (visual only — geometry unchanged).
const BOARD_PANEL_X = 8;
const BOARD_PANEL_W = DESIGN_W - 16;
const BOARD_PANEL_Y = 58;
const BOARD_PANEL_H = 360;

const RESOLUTION_AUTO_ADVANCE_MS = 5000;

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
  if (style.border) g.lineStyle(style.border.width, style.border.color, style.border.alpha ?? 1);
  g.beginFill(fill, alpha);
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    pts.push(x + r * Math.cos(angle), y + r * Math.sin(angle));
  }
  g.drawPolygon(pts);
  g.endFill();
  if (style.border) g.lineStyle(0);
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
  drawUnitToken(
    container,
    unit.defId,
    unit.tier,
    unit.star,
    x,
    y,
    bars ? { radius: r, dimmed, bars } : { radius: r, dimmed }
  );
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
  /** Planning-phase juice (star-up flourish, buy/sell pops); not cleared by render(). */
  private planningFxLayer: PIXI.Container;

  private selectedBenchIdx: number | null = null;
  private selectedBoardIdx: number | null = null;
  private isDragging = false;
  private dragUnit: { uid: number; fromBench: boolean; fromIdx: number } | null = null;
  private dragSprite: PIXI.Container | null = null;
  private scoutTargetId: number | null = null;

  private dragCatcher!: PIXI.Graphics;
  private resolutionAutoTimer: ReturnType<typeof setTimeout> | null = null;
  /** Gold at the last planning start, to voice income gain (no game logic). */
  private prevGold = 0;

  private playback: {
    player: CombatPlayer;
    view: CombatView;
    tickerFn: (ticker: PIXI.Ticker) => void;
  } | null = null;
  private playbackSpeed: PlaybackSpeed = 1;
  private speedBtnLabel: PIXI.Text | null = null;
  private opts: MatchSceneOptions;
  private unsub: () => void = () => {};
  private unsubArt: () => void = () => {};

  constructor(app: PIXI.Application, driver: IDriver, opts: MatchSceneOptions) {
    this.container = new PIXI.Container();
    this.app = app;
    this.driver = driver;
    this.opts = opts;
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

    this.container.addChild(this.hudLayer);
    this.container.addChild(this.boardLayer);
    this.container.addChild(this.benchLayer);
    this.container.addChild(this.shopLayer);
    this.container.addChild(this.traitLayer);
    this.container.addChild(this.planningFxLayer);
    this.container.addChild(this.combatLayer);
    this.container.addChild(this.scoutLayer);
    this.container.addChild(this.toastLayer);

    // Invisible full-screen drag target for pointer-up — only active while dragging
    const dragCatcher = new PIXI.Graphics();
    dragCatcher.beginFill(C.bgOverlay, 0);
    dragCatcher.drawRect(0, 0, DESIGN_W, DESIGN_H);
    dragCatcher.endFill();
    dragCatcher.eventMode = "none"; // disabled until drag starts
    dragCatcher.hitArea = new PIXI.Rectangle(0, 0, DESIGN_W, DESIGN_H);
    dragCatcher.on("pointermove", (e: PIXI.FederatedPointerEvent) => this.onDragMove(e));
    dragCatcher.on("pointerup", (e: PIXI.FederatedPointerEvent) => this.onDragEnd(e));
    dragCatcher.on("pointerupoutside", (e: PIXI.FederatedPointerEvent) => this.onDragEnd(e));
    this.container.addChild(dragCatcher);
    this.dragCatcher = dragCatcher;

    this.unsub = driver.on((e) => {
      if (e.type === "state") this.render(e.state);
      if (e.type === "phase_change") {
        if (e.phase === "PLANNING") this.onPlanningStart();
        if (e.phase === "COMBAT") this.onCombatPhase();
        if (e.phase === "RESOLUTION") this.onResolutionPhase();
      }
      if (e.type === "match_over") this.onMatchOver(e.placements, e.mmr);
    });

    // A drop-in PNG finishing its lazy load: repaint the static planning board
    // so the glyph swaps to the sprite (combat repaints every tick already).
    this.unsubArt = onUnitArtReady(() => {
      const s = this.driver.getState();
      if (s.phase === "PLANNING") this.render(s);
    });

    this.render(driver.getState());
    driver.startPlanning();
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
    g.beginFill(opts.fill ?? C.panelBg, opts.fillAlpha ?? 1);
    g.lineStyle(opts.borderW ?? 1, opts.border ?? C.chipBorder, 1);
    g.drawRoundedRect(x, y, w, h, opts.radius ?? 5);
    g.endFill();
    g.lineStyle(0);
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

  private glyph(layer: PIXI.Container, kind: GlyphKind, x: number, y: number, size: number, color: number): void {
    const g = new PIXI.Graphics();
    drawGlyph(g, kind, x, y, size, color);
    g.eventMode = "none";
    layer.addChild(g);
  }

  // ─── HUD: status row + opponent rail ─────────────────────────────────────────

  private renderHud(state: MatchState, me: PlayerState): void {
    this.hudLayer.removeChildren();
    const bg = new PIXI.Graphics();
    bg.beginFill(C.bgHud);
    bg.drawRect(0, 0, DESIGN_W, 58);
    bg.endFill();
    this.hudLayer.addChild(bg);

    // ── A. Status row ──────────────────────────────────────────────────────
    // Stage chip (left): swords glyph + "Stage X-Y" derived from the round.
    const stage = Math.floor((state.round - 1) / 5) + 1;
    const sub = ((state.round - 1) % 5) + 1;
    const stageW = 96;
    this.chip(this.hudLayer, 6, STATUS_Y, stageW, 20, { fillAlpha: 0.9 });
    this.glyph(this.hudLayer, "swords", 17, STATUS_Y + 10, 13, C.starGold);
    this.text(this.hudLayer, `Stage ${stage}-${sub}`, 28, STATUS_Y + 10, 10, C.textPrimary, [0, 0.5]);

    // Planning timer (center): m:ss, muted; tint toward hp-low under 5s.
    const timeLeft = this.driver.getPlanningTimeLeft();
    if (state.phase === "PLANNING" && timeLeft > 0) {
      const secs = Math.ceil(timeLeft / 1000);
      const m = Math.floor(secs / 60);
      const ss = (secs % 60).toString().padStart(2, "0");
      this.text(
        this.hudLayer, `${m}:${ss}`, DESIGN_W / 2, STATUS_Y + 10, 13,
        secs <= 5 ? C.hpLow : C.textMuted, [0.5, 0.5]
      );
    } else {
      this.text(this.hudLayer, state.phase, DESIGN_W / 2, STATUS_Y + 10, 11, C.textMuted, [0.5, 0.5]);
    }
    // Right slot reserved for the DOM ☰ pause button (existing hook).

    // ── B. Opponent rail: 8 compact seat tiles ──────────────────────────────
    const myPairing = this.driver.getMyPairing();
    const currentOpp = myPairing && !myPairing.isGhost ? myPairing.opponentId : -1;
    const tileW = (DESIGN_W - 8) / 8;
    const av = 8; // avatar radius
    for (let i = 0; i < 8; i++) {
      const p = state.players[i];
      if (!p) continue;
      const cx = 4 + i * tileW + tileW / 2;
      const cy = RAIL_Y + av + 1;
      const isSelf = i === this.driver.seatIndex;
      const elim = !p.alive;

      const avg = new PIXI.Graphics();
      avg.circle(cx, cy, av).fill({ color: C.panelBg, alpha: elim ? 0.4 : 1 });
      avg.circle(cx, cy, av).stroke({
        width: i === currentOpp ? 2 : 1,
        color: i === currentOpp ? C.starGold : isSelf ? C.tier3 : C.chipBorder,
        alpha: elim ? 0.4 : 1,
      });
      this.hudLayer.addChild(avg);

      this.text(this.hudLayer, `${i + 1}`, cx, cy, 9, elim ? C.textMuted : C.textPrimary, [0.5, 0.5]);

      // HP bar below the avatar
      const hpFrac = Math.max(0, Math.min(1, p.hp / 100));
      const barW = tileW - 10;
      const barX = cx - barW / 2;
      const barY = cy + av + 2;
      const hb = new PIXI.Graphics();
      hb.rect(barX, barY, barW, 3).fill({ color: C.hpBg, alpha: elim ? 0.4 : 1 });
      hb.rect(barX, barY, Math.round(barW * hpFrac), 3)
        .fill({ color: hpFrac < 0.25 ? C.hpLow : C.hpGreen, alpha: elim ? 0.4 : 1 });
      this.hudLayer.addChild(hb);

      // Tap-to-scout: alive opponents during planning
      if (!isSelf && p.alive && state.phase === "PLANNING") {
        const hit = new PIXI.Graphics();
        hit.beginFill(C.bgOverlay, 0.001);
        hit.drawRect(4 + i * tileW, RAIL_Y - 2, tileW, 30);
        hit.endFill();
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
    const panel = new PIXI.Graphics();
    panel.beginFill(C.boardBg, 0.92);
    panel.lineStyle(1, C.boardBorder, 0.9);
    panel.drawRoundedRect(BOARD_PANEL_X, BOARD_PANEL_Y, BOARD_PANEL_W, BOARD_PANEL_H, 10);
    panel.endFill();
    panel.lineStyle(0);
    layer.addChild(panel);
  }

  private renderBoard(me: PlayerState): void {
    this.boardLayer.removeChildren();
    this.drawBoardPanel(this.boardLayer);

    // Enemy zone (top 4 rows) — darker tint, untargetable during planning
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let q = 0; q < BOARD_COLS; q++) {
        const { x, y } = hexToPixel(q, r, BOARD_OFFSET_X, OPP_BOARD_OFFSET_Y);
        const g = new PIXI.Graphics();
        drawHex(g, x, y, HEX_R - 2, C.enemyHex, 1, {
          border: { color: C.boardBorder, width: 1, alpha: 0.8 },
        });
        this.boardLayer.addChild(g);
      }
    }

    // Player zone (bottom 4 rows) — lighter tint; valid drop hexes glow while dragging
    const dragging = this.isDragging;
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let q = 0; q < BOARD_COLS; q++) {
        const slotIdx = r * BOARD_COLS + q;
        const { x, y } = hexToPixel(q, r, BOARD_OFFSET_X, BOARD_OFFSET_Y);
        const isSelected = this.selectedBoardIdx === slotIdx && me.board[slotIdx] != null;
        const g = new PIXI.Graphics();
        drawHex(g, x, y, HEX_R - 2, isSelected ? C.bgBoardSel : C.myHex, 1, {
          border: dragging
            ? { color: C.textMuted, width: 2, alpha: 0.75 }
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
      const { x, y } = hexToPixel(q, r, BOARD_OFFSET_X, BOARD_OFFSET_Y);
      const uc = new PIXI.Container();
      uc.eventMode = "static";
      uc.cursor = "grab";
      uc.on("pointerdown", (e: PIXI.FederatedPointerEvent) => this.startDragBoard(idx, unit, e));
      drawUnit(uc, unit, x, y, 16, this.selectedBenchIdx !== null || (this.selectedBoardIdx !== null && this.selectedBoardIdx !== idx));
      this.boardLayer.addChild(uc);
    }
  }

  private renderBench(me: PlayerState): void {
    this.benchLayer.removeChildren();
    const startX = (DESIGN_W - 9 * BENCH_SLOT_W) / 2 + BENCH_SLOT_W / 2;

    for (let i = 0; i < 9; i++) {
      const x = startX + i * BENCH_SLOT_W;
      const isSelected = this.selectedBenchIdx === i && me.bench[i] != null;
      const g = new PIXI.Graphics();
      g.beginFill(isSelected ? C.bgBenchSel : C.bgBench, 0.7);
      g.drawRoundedRect(x - 16, BENCH_Y - 16, 32, 32, 3);
      g.endFill();
      g.eventMode = "static";
      g.cursor = "pointer";
      g.on("pointerdown", () => this.onBenchSlotClick(i, me));
      this.benchLayer.addChild(g);

      const unit = me.bench[i];
      if (unit) {
        if (this.dragUnit?.uid === unit.uid) continue;
        const uc = new PIXI.Container();
        uc.eventMode = "static";
        uc.cursor = "grab";
        uc.on("pointerdown", (e: PIXI.FederatedPointerEvent) => this.startDragBench(i, unit, e));
        drawUnit(uc, unit, x, BENCH_Y, 12, false, false);
        this.benchLayer.addChild(uc);
      }
    }

    // Sell zone
    const sellG = new PIXI.Graphics();
    sellG.beginFill(C.bgSellZone, 0.7);
    sellG.drawRoundedRect(DESIGN_W - 44, BENCH_Y - 16, 40, 32, 3);
    sellG.endFill();
    sellG.eventMode = "static";
    sellG.cursor = "pointer";
    sellG.on("pointerdown", () => this.onSellZoneClick(me));
    this.benchLayer.addChild(sellG);
    const sellLabel = new PIXI.Text("SELL", { fontSize: 8, fill: C.textSell, fontFamily: "monospace" });
    sellLabel.anchor.set(0.5);
    sellLabel.x = DESIGN_W - 24;
    sellLabel.y = BENCH_Y;
    this.benchLayer.addChild(sellLabel);
  }

  private renderShop(state: MatchState, me: PlayerState): void {
    this.shopLayer.removeChildren();
    this.renderControls(me);

    // ── E. Shop cards (5) ────────────────────────────────────────────────────
    for (let i = 0; i < 5; i++) {
      const x = SHOP_START_X + i * (SHOP_CARD_W + SHOP_GAP);
      const slot = me.shop[i];

      if (!slot) {
        this.chip(this.shopLayer, x, SHOP_Y, SHOP_CARD_W, SHOP_CARD_H, {
          fill: C.bgShopEmpty, fillAlpha: 0.6, border: C.chipBorder,
        });
        continue;
      }

      const def = gameData.units.find((u) => u.id === slot.defId);
      const tc = tierColor(slot.tier);
      const cardCx = x + SHOP_CARD_W / 2;

      const card = this.chip(this.shopLayer, x, SHOP_Y, SHOP_CARD_W, SHOP_CARD_H, {
        fill: C.bgShopCard,
      });
      // tier-colored 3px top border
      const top = new PIXI.Graphics();
      top.beginFill(tc);
      top.drawRoundedRect(x, SHOP_Y, SHOP_CARD_W, 3, 2);
      top.endFill();
      top.eventMode = "none";
      this.shopLayer.addChild(top);

      card.eventMode = "static";
      card.hitArea = new PIXI.Rectangle(x, SHOP_Y, SHOP_CARD_W, SHOP_CARD_H);
      card.cursor = "pointer";
      const ci = i;
      card.on("pointerdown", () => this.onShopBuy(ci));

      // portrait disc (token glyph/art, no bars); non-interactive so taps reach the card
      const tokenC = new PIXI.Container();
      tokenC.eventMode = "none";
      drawUnitToken(tokenC, slot.defId, slot.tier, 0, cardCx, SHOP_Y + 26, { radius: 17 });
      this.shopLayer.addChild(tokenC);

      this.text(this.shopLayer, def?.name ?? slot.defId, cardCx, SHOP_Y + 48, 8, C.textPrimary, [0.5, 0]);

      const traitNames = [def?.origin, ...(def?.classes ?? [])]
        .map((tid) => gameData.traits.find((t) => t.id === tid)?.name)
        .filter((n): n is string => !!n);
      this.text(this.shopLayer, traitNames.join(" · "), cardCx, SHOP_Y + 60, 6, C.textMuted, [0.5, 0]);

      this.glyph(this.shopLayer, "coin", x + 12, SHOP_Y + SHOP_CARD_H - 9, 9, C.starGold);
      this.text(this.shopLayer, `${slot.tier}`, x + 20, SHOP_Y + SHOP_CARD_H - 9, 11, C.textGold, [0, 0.5]);
    }

    // ── Ready button (full-width, below the shop) ────────────────────────────
    const isPlanning = state.phase === "PLANNING";
    const ready = this.chip(this.shopLayer, SHOP_START_X, READY_Y, DESIGN_W - 2 * SHOP_START_X, 34, {
      fill: isPlanning ? C.bgReady : C.bgReadyOff, border: isPlanning ? C.hpGreen : C.chipBorder, radius: 7,
    });
    ready.eventMode = isPlanning ? "static" : "none";
    ready.hitArea = new PIXI.Rectangle(SHOP_START_X, READY_Y, DESIGN_W - 2 * SHOP_START_X, 34);
    ready.cursor = isPlanning ? "pointer" : "default";
    ready.on("pointerdown", () => isPlanning && this.driver.ready());
    this.text(
      this.shopLayer, isPlanning ? "Ready" : state.phase, DESIGN_W / 2, READY_Y + 17, 13,
      isPlanning ? C.textReady : C.textMuted, [0.5, 0.5]
    );
  }

  // ─── D. HUD row: level / gold / streak / reroll / buy-xp ──────────────────────

  private renderControls(me: PlayerState): void {
    const y = HUD_ROW_Y;

    // Level chip + xp-purple progress bar
    this.chip(this.shopLayer, SHOP_START_X, y, 66, HUD_ROW_H);
    this.text(this.shopLayer, `Lv ${me.level}`, SHOP_START_X + 8, y + 12, 11, C.textPrimary, [0, 0.5]);
    const xp = xpProgress(me.xp, me.level, gameData.economy.levelXpThresholds);
    const xpBarX = SHOP_START_X + 8;
    const xpBarW = 50;
    const xpBarY = y + HUD_ROW_H - 10;
    const xpb = new PIXI.Graphics();
    xpb.rect(xpBarX, xpBarY, xpBarW, 4).fill({ color: C.bgShopEmpty });
    xpb.rect(xpBarX, xpBarY, Math.round(xpBarW * xp.frac), 4).fill({ color: C.xpPurple });
    xpb.eventMode = "none";
    this.shopLayer.addChild(xpb);

    // Gold (large, gold + coin glyph)
    this.glyph(this.shopLayer, "coin", 92, y + HUD_ROW_H / 2, 13, C.starGold);
    this.text(this.shopLayer, `${me.gold}`, 104, y + HUD_ROW_H / 2, 18, C.textGold, [0, 0.5]);

    // Streak (flame + signed value, streak-orange)
    const streak = me.winStreak > 0 ? me.winStreak : me.loseStreak > 0 ? -me.loseStreak : 0;
    if (streak !== 0) {
      this.glyph(this.shopLayer, "flame", 156, y + HUD_ROW_H / 2, 12, C.streakOrange);
      this.text(
        this.shopLayer, `${streak > 0 ? "+" : ""}${streak}`, 168, y + HUD_ROW_H / 2, 12,
        C.streakOrange, [0, 0.5]
      );
    }

    // Reroll button (refresh glyph + cost)
    const btnY = y + 2;
    const btnH = HUD_ROW_H - 4;
    const rrX = 242, rrW = 62;
    const rr = this.chip(this.shopLayer, rrX, btnY, rrW, btnH, { fill: C.bgReroll });
    rr.eventMode = "static";
    rr.hitArea = new PIXI.Rectangle(rrX, btnY, rrW, btnH);
    rr.cursor = "pointer";
    rr.on("pointerdown", () => this.onReroll());
    this.glyph(this.shopLayer, "refresh", rrX + 13, btnY + btnH / 2, 13, C.textPrimary);
    this.glyph(this.shopLayer, "coin", rrX + 30, btnY + btnH / 2, 8, C.starGold);
    this.text(this.shopLayer, `${gameData.economy.rerollCost}`, rrX + 38, btnY + btnH / 2, 11, C.textGold, [0, 0.5]);

    // Buy XP button (label + cost)
    const xpX = 312, xpW = 70;
    const xpBtn = this.chip(this.shopLayer, xpX, btnY, xpW, btnH, { fill: C.bgXp });
    xpBtn.eventMode = "static";
    xpBtn.hitArea = new PIXI.Rectangle(xpX, btnY, xpW, btnH);
    xpBtn.cursor = "pointer";
    xpBtn.on("pointerdown", () => this.onBuyXp());
    this.text(this.shopLayer, "XP", xpX + 8, btnY + btnH / 2, 11, C.textPrimary, [0, 0.5]);
    this.glyph(this.shopLayer, "coin", xpX + 36, btnY + btnH / 2, 8, C.starGold);
    this.text(this.shopLayer, `${gameData.economy.xpBuyCost}`, xpX + 44, btnY + btnH / 2, 11, C.textGold, [0, 0.5]);
  }

  // ─── C. TRAIT STRIP (horizontal, wraps) ──────────────────────────────────────

  private renderTraitStrip(me: PlayerState): void {
    this.traitLayer.removeChildren();
    const chips = traitStripModel(me.board, gameData.units, gameData.traits);

    const padX = 8;
    const chipH = 18;
    const gapX = 5;
    const gapY = 4;
    const maxRowW = DESIGN_W - 2 * padX;
    let x = padX;
    let rowY = TRAIT_STRIP_Y;

    for (const c of chips) {
      const active = c.activeBreakpoint !== null;
      const countStr = active
        ? `${c.count}`
        : `${c.count}/${c.nextBreakpoint ?? c.count}`;
      const label = `${c.name} ${countStr}`;
      const chipW = 26 + label.length * 5.4;

      if (x + chipW > padX + maxRowW) { x = padX; rowY += chipH + gapY; }

      const bg = new PIXI.Graphics();
      bg.beginFill(C.panelBg, active ? 0.95 : 0.5);
      bg.lineStyle(1, active ? c.color : C.chipBorder, active ? 0.9 : 0.5);
      bg.drawRoundedRect(x, rowY, chipW, chipH, 4);
      bg.endFill();
      bg.lineStyle(0);
      bg.alpha = active ? 1 : 0.5;
      this.traitLayer.addChild(bg);

      // 14px rotated diamond holding the glyph
      const cy = rowY + chipH / 2;
      const dcx = x + 12;
      const diamond = new PIXI.Graphics();
      const dr = 7;
      diamond.poly([dcx, cy - dr, dcx + dr, cy, dcx, cy + dr, dcx - dr, cy]);
      diamond.fill({ color: active ? c.color : C.chipBorder, alpha: active ? 0.35 : 0.25 });
      diamond.poly([dcx, cy - dr, dcx + dr, cy, dcx, cy + dr, dcx - dr, cy]);
      diamond.stroke({ width: 1, color: active ? c.color : C.textMuted });
      this.traitLayer.addChild(diamond);
      this.glyph(this.traitLayer, this.traitGlyph(c.traitId), dcx, cy, 8, active ? c.color : C.textMuted);

      this.text(this.traitLayer, label, x + 22, cy, 8, active ? C.textPrimary : C.textMuted, [0, 0.5]);

      x += chipW + gapX;
    }
  }

  private traitGlyph(traitId: string): GlyphKind {
    return glyphForTraits([traitId]);
  }

  // ─── DRAG & DROP ─────────────────────────────────────────────────────────

  private startDragBoard(idx: number, unit: UnitInstance, e: PIXI.FederatedPointerEvent): void {
    this.selectedBenchIdx = null;
    this.selectedBoardIdx = null;
    this.isDragging = true;
    this.dragCatcher.eventMode = "static";
    this.dragUnit = { uid: unit.uid, fromBench: false, fromIdx: idx };
    this.createDragSprite(unit, e.globalX, e.globalY);
    this.renderBoard(this.driver.getState().players[this.driver.seatIndex]!);
    this.renderBench(this.driver.getState().players[this.driver.seatIndex]!);
  }

  private startDragBench(idx: number, unit: UnitInstance, e: PIXI.FederatedPointerEvent): void {
    this.selectedBenchIdx = null;
    this.selectedBoardIdx = null;
    this.isDragging = true;
    this.dragCatcher.eventMode = "static";
    this.dragUnit = { uid: unit.uid, fromBench: true, fromIdx: idx };
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
    this.dragSprite.x = e.globalX;
    this.dragSprite.y = e.globalY;
  }

  private onDragEnd(e: PIXI.FederatedPointerEvent): void {
    if (!this.isDragging || !this.dragUnit) return;

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
    if (!me) { this.dragUnit = null; return; }

    // Check if dropped on board area
    const boardSlot = hexFromPointer(px, py, BOARD_OFFSET_X, BOARD_OFFSET_Y);
    if (boardSlot >= 0) {
      const result = this.driver.playerCommand({
        type: "MOVE",
        unitUid: this.dragUnit.uid,
        toBench: false,
        toIndex: boardSlot,
      });
      if (!result.ok) this.showToast(result.error);
    } else {
      // Check if dropped on bench area
      const startX = (DESIGN_W - 9 * BENCH_SLOT_W) / 2;
      if (py >= BENCH_Y - 20 && py <= BENCH_Y + 20 && px >= startX && px < startX + 9 * BENCH_SLOT_W) {
        const benchIdx = Math.floor((px - startX) / BENCH_SLOT_W);
        const clampedIdx = Math.max(0, Math.min(8, benchIdx));
        const result = this.driver.playerCommand({
          type: "MOVE",
          unitUid: this.dragUnit.uid,
          toBench: true,
          toIndex: clampedIdx,
        });
        if (!result.ok) this.showToast(result.error);
      } else if (py >= BENCH_Y - 20 && py <= BENCH_Y + 20 && px >= DESIGN_W - 48) {
        // Dropped on sell zone
        const result = this.driver.playerCommand({ type: "SELL", unitUid: this.dragUnit.uid });
        if (result.ok) { this.opts.audio.play("sell"); this.spawnPlanningPop(DESIGN_W - 24, BENCH_Y, C.textSell); }
        else this.showToast(result.error);
      }
      // else: dropped nowhere valid — unit stays put (no-op)
    }

    this.dragUnit = null;
    this.render(this.driver.getState());
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
    let uid: number | null = null;
    if (this.selectedBenchIdx !== null) {
      uid = me.bench[this.selectedBenchIdx]?.uid ?? null;
      this.selectedBenchIdx = null;
    } else if (this.selectedBoardIdx !== null) {
      uid = me.board[this.selectedBoardIdx]?.uid ?? null;
      this.selectedBoardIdx = null;
    }
    if (uid != null) {
      const result = this.driver.playerCommand({ type: "SELL", unitUid: uid });
      if (result.ok) { this.opts.audio.play("sell"); this.spawnPlanningPop(DESIGN_W - 24, BENCH_Y, C.textSell); }
      else this.showToast(result.error);
    }
    this.render(this.driver.getState());
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
      const cx = SHOP_START_X + idx * (SHOP_CARD_W + SHOP_GAP) + SHOP_CARD_W / 2;
      this.spawnPlanningPop(cx, SHOP_Y + SHOP_CARD_H / 2, C.starGold);
    }
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
        const { x, y } = hexToPixel(idx % BOARD_COLS, Math.floor(idx / BOARD_COLS), BOARD_OFFSET_X, BOARD_OFFSET_Y);
        return { x, y };
      }
    }
    const startX = (DESIGN_W - 9 * BENCH_SLOT_W) / 2 + BENCH_SLOT_W / 2;
    for (let i = 0; i < me.bench.length; i++) {
      const u = me.bench[i]!;
      if (u.star >= 2 && (before.get(u.uid) ?? 0) < u.star) {
        return { x: startX + i * BENCH_SLOT_W, y: BENCH_Y };
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

    const overlay = new PIXI.Graphics();
    overlay.beginFill(C.bgScout, 0.92);
    overlay.drawRoundedRect(20, 60, DESIGN_W - 40, DESIGN_H - 140, 8);
    overlay.endFill();
    overlay.eventMode = "static";
    this.scoutLayer.addChild(overlay);

    const title = new PIXI.Text(`Player ${playerId + 1}  HP:${Math.max(0, target.hp)}`, {
      fontSize: 12, fill: C.textBanner, fontFamily: "monospace",
    });
    title.anchor.set(0.5, 0);
    title.x = DESIGN_W / 2;
    title.y = 68;
    this.scoutLayer.addChild(title);

    // Board units
    const boardOffX = BOARD_OFFSET_X;
    const boardOffY = 110;
    for (let idx = 0; idx < BOARD_SLOTS; idx++) {
      const unit = target.board[idx];
      if (!unit) continue;
      const q = idx % BOARD_COLS;
      const r = Math.floor(idx / BOARD_COLS);
      const { x, y } = hexToPixel(q, r, boardOffX, boardOffY);
      const uc = new PIXI.Container();
      drawUnit(uc, unit, x, y, 14);
      this.scoutLayer.addChild(uc);
    }

    // Trait counts
    const units = target.board.filter((u): u is UnitInstance => u != null);
    const traitCounts = new Map<string, number>();
    for (const u of units) {
      const def = gameData.units.find((d) => d.id === u.defId);
      for (const t of def?.traits ?? []) traitCounts.set(t, (traitCounts.get(t) ?? 0) + 1);
    }
    let rowY = 110 + BOARD_ROWS * HEX_H + 10;
    for (const [traitId, count] of traitCounts) {
      const trait = gameData.traits.find((t) => t.id === traitId);
      if (!trait) continue;
      const nextBp = trait.breakpoints.find((bp) => bp.count > count);
      const activeBp = [...trait.breakpoints].reverse().find((bp) => bp.count <= count);
      const label = `${trait.name}: ${count}/${nextBp?.count ?? activeBp?.count ?? "?"}`;
      const txt = new PIXI.Text(label, {
        fontSize: 9,
        fill: activeBp ? C.textReady : C.textMuted,
        fontFamily: "monospace",
      });
      txt.anchor.set(0, 0);
      txt.x = 32;
      txt.y = rowY;
      this.scoutLayer.addChild(txt);
      rowY += 14;
    }

    // Close button
    const closeBtn = new PIXI.Graphics();
    closeBtn.beginFill(C.bgCloseBtn, 0.9);
    closeBtn.drawRoundedRect(DESIGN_W - 50, 64, 30, 24, 4);
    closeBtn.endFill();
    closeBtn.eventMode = "static";
    closeBtn.cursor = "pointer";
    closeBtn.on("pointerdown", () => this.closeScout());
    this.scoutLayer.addChild(closeBtn);
    const closeX = new PIXI.Text("X", { fontSize: 11, fill: C.textMuted, fontFamily: "monospace" });
    closeX.anchor.set(0.5, 0.5);
    closeX.x = DESIGN_W - 35;
    closeX.y = 76;
    this.scoutLayer.addChild(closeX);
  }

  private closeScout(): void {
    this.scoutTargetId = null;
    this.scoutLayer.removeChildren();
  }

  // ─── PHASE TRANSITIONS ───────────────────────────────────────────────────

  private onPlanningStart(): void {
    this.teardownPlayback();
    this.clearResolutionTimer();
    this.combatLayer.removeChildren();
    this.closeScout();
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
    this.renderCombat(state);
  }

  private renderCombat(state: MatchState): void {
    this.teardownPlayback();
    this.combatLayer.removeChildren();
    // Hide planning UI
    this.boardLayer.removeChildren();
    this.benchLayer.removeChildren();
    this.shopLayer.removeChildren();
    this.traitLayer.removeChildren();

    const me = state.players[this.driver.seatIndex];
    if (!me) return;

    // Board-bg panel first so banners/tiles/tokens layer on top of it.
    this.drawBoardPanel(this.combatLayer);

    const pairing = this.driver.getMyPairing();
    const isGhost = pairing?.isGhost ?? false;
    const opponentId = pairing ? pairing.opponentId : null;

    // "vs" banner
    let opponentName = "Ghost";
    if (opponentId !== null && !isGhost && opponentId >= 0) {
      opponentName = `Player ${opponentId + 1}`;
    } else if (isGhost) {
      opponentName = "Ghost (eliminated)";
    } else if (opponentId === null) {
      opponentName = "Bye (PvE)";
    }

    const banner = new PIXI.Text(`vs ${opponentName}`, {
      fontSize: 12, fill: C.textBanner, fontFamily: "monospace",
    });
    banner.anchor.set(0.5, 0.5);
    banner.x = DESIGN_W / 2;
    banner.y = BOARD_OFFSET_Y - BOARD_ROWS * HEX_H / 2 - 6;
    this.combatLayer.addChild(banner);

    // Full combat field: opponent half (top) + own half (bottom)
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let q = 0; q < BOARD_COLS; q++) {
        const opp = hexToPixel(q, r, BOARD_OFFSET_X, OPP_BOARD_OFFSET_Y);
        const og = new PIXI.Graphics();
        drawHex(og, opp.x, opp.y, HEX_R - 2, C.enemyHex, 1, {
          border: { color: C.boardBorder, width: 1, alpha: 0.8 },
        });
        this.combatLayer.addChild(og);

        const own = hexToPixel(q, r, BOARD_OFFSET_X, BOARD_OFFSET_Y);
        const g = new PIXI.Graphics();
        drawHex(g, own.x, own.y, HEX_R - 2, C.myHex, 1, {
          border: { color: C.boardBorder, width: 1, alpha: 0.8 },
        });
        this.combatLayer.addChild(g);
      }
    }

    const result = this.driver.getMyCombatResult();
    if (result && result.events.length > 0) {
      this.startPlayback(result.events, pairing?.side ?? 0);
      this.renderPlaybackControls();
    } else {
      // No event log (PvE/bye round): static own board, release the driver
      for (let idx = 0; idx < BOARD_SLOTS; idx++) {
        const unit = me.board[idx];
        if (!unit) continue;
        const q = idx % BOARD_COLS;
        const r = Math.floor(idx / BOARD_COLS);
        const { x, y } = hexToPixel(q, r, BOARD_OFFSET_X, BOARD_OFFSET_Y);
        const uc = new PIXI.Container();
        drawUnit(uc, unit, x, y);
        this.combatLayer.addChild(uc);
      }
      this.driver.combatPlaybackDone();
    }

    const combatLabel = new PIXI.Text("COMBAT", {
      fontSize: 14, fill: C.textCombat, fontFamily: "monospace",
    });
    combatLabel.anchor.set(0.5, 0.5);
    combatLabel.x = DESIGN_W / 2;
    combatLabel.y = BOARD_OFFSET_Y - BOARD_ROWS * HEX_H - 6;
    this.combatLayer.addChild(combatLabel);
  }

  // ─── COMBAT PLAYBACK ─────────────────────────────────────────────────────

  private startPlayback(events: CombatEvent[], side: 0 | 1): void {
    // Display rows 0-3 = opponent half, 4-7 = my half (toDisplayHex keeps my
    // units on the bottom regardless of pairing side).
    const toPixel = (hex: HexCoord): { x: number; y: number } => {
      const d = toDisplayHex(hex, side);
      return d.r < BOARD_ROWS
        ? hexToPixel(d.q, d.r, BOARD_OFFSET_X, OPP_BOARD_OFFSET_Y)
        : hexToPixel(d.q, d.r - BOARD_ROWS, BOARD_OFFSET_X, BOARD_OFFSET_Y);
    };

    const reducedMotion = this.opts.settings.get().reducedMotion;
    const player = new CombatPlayer(events, gameData.gameplay.ticksPerSec, gameData, { reducedMotion });
    player.setSpeed(this.playbackSpeed);
    const view = new CombatView(toPixel, {
      x: DESIGN_W / 2,
      y: BOARD_OFFSET_Y - BOARD_ROWS * HEX_H + 10,
    }, { reducedMotion, edge: { w: DESIGN_W, h: DESIGN_H } });
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
    const btnY = 62;
    const btnW = 44;
    const btnH = 22;
    const mkBtn = (x: number, label: string, onTap: () => void): PIXI.Text => {
      const g = new PIXI.Graphics();
      g.beginFill(C.bgMenuBtn, 0.9);
      g.drawRoundedRect(x, btnY, btnW, btnH, 3);
      g.endFill();
      g.eventMode = "static";
      g.hitArea = new PIXI.Rectangle(x, btnY, btnW, btnH);
      g.cursor = "pointer";
      g.on("pointerdown", onTap);
      this.combatLayer.addChild(g);
      const t = new PIXI.Text(label, {
        fontSize: 9, fill: C.textPrimary, fontFamily: "monospace",
      });
      t.anchor.set(0.5, 0.5);
      t.x = x + btnW / 2;
      t.y = btnY + btnH / 2;
      t.eventMode = "none";
      this.combatLayer.addChild(t);
      return t;
    };
    this.speedBtnLabel = mkBtn(DESIGN_W - 2 * btnW - 12, `${this.playbackSpeed}x`, () => this.toggleSpeed());
    mkBtn(DESIGN_W - btnW - 6, "Skip", () => this.skipPlayback());
  }

  private onResolutionPhase(): void {
    // Online the server may advance before playback ends: auto-skip to end.
    this.teardownPlayback();
    const state = this.driver.getState();
    this.renderResolution(state);
  }

  private renderResolution(state: MatchState): void {
    this.combatLayer.removeChildren();

    const me = state.players[this.driver.seatIndex];
    if (!me) return;

    // Win/loss comes from the driver's normalized perspective, never winner === 0
    const outcome = this.driver.getMyOutcome();
    const won = outcome === "win";
    const drew = outcome === "draw";

    const bg = new PIXI.Graphics();
    bg.beginFill(C.bgOverlay, 0.72);
    bg.drawRect(0, 0, DESIGN_W, DESIGN_H);
    bg.endFill();
    // Must NOT swallow pointer events — we need the Continue button to work
    bg.eventMode = "none";
    this.combatLayer.addChild(bg);

    const box = new PIXI.Graphics();
    box.beginFill(C.bgPanel, 0.95);
    box.drawRoundedRect(40, 200, DESIGN_W - 80, 220, 8);
    box.endFill();
    box.eventMode = "none";
    this.combatLayer.addChild(box);

    // Outcome cue: a player elimination overrides the round win/loss sting.
    if (!me.alive) this.opts.audio.play("elimination");
    else if (won) this.opts.audio.play("roundWin");
    else if (!drew) this.opts.audio.play("roundLoss");

    const resultStr = drew ? "Draw" : won ? "Victory" : "Defeat";
    const resultColor = drew ? C.textGold : won ? C.textGoodHP : C.textBadHP;
    const title = new PIXI.Text(`Round ${state.round} — ${resultStr}`, {
      fontSize: 13, fill: C.textPrimary, fontFamily: "monospace",
    });
    title.eventMode = "none";
    title.anchor.set(0.5, 0);
    title.x = DESIGN_W / 2;
    title.y = 212;
    this.combatLayer.addChild(title);

    const resultLabel = new PIXI.Text(resultStr, {
      fontSize: 20, fill: resultColor, fontFamily: "monospace",
    });
    resultLabel.eventMode = "none";
    resultLabel.anchor.set(0.5, 0);
    resultLabel.x = DESIGN_W / 2;
    resultLabel.y = 234;
    this.combatLayer.addChild(resultLabel);

    const hpText = new PIXI.Text(`HP: ${Math.max(0, me.hp)}`, {
      fontSize: 12, fill: me.alive ? C.textGoodHP : C.textBadHP, fontFamily: "monospace",
    });
    hpText.eventMode = "none";
    hpText.anchor.set(0.5, 0);
    hpText.x = DESIGN_W / 2;
    hpText.y = 268;
    this.combatLayer.addChild(hpText);

    // Continue button — must be interactive and above all overlays
    const continueBtn = new PIXI.Graphics();
    continueBtn.beginFill(C.bgContinue, 0.95);
    continueBtn.drawRoundedRect(DESIGN_W / 2 - 55, 330, 110, 36, 6);
    continueBtn.endFill();
    continueBtn.eventMode = "static";
    continueBtn.hitArea = new PIXI.Rectangle(DESIGN_W / 2 - 55, 330, 110, 36);
    continueBtn.cursor = "pointer";
    continueBtn.zIndex = 10;
    continueBtn.on("pointerdown", () => this.advanceFromResolution());
    this.combatLayer.addChild(continueBtn);

    const continueText = new PIXI.Text("Continue", {
      fontSize: 12, fill: C.textReady, fontFamily: "monospace",
    });
    continueText.anchor.set(0.5, 0.5);
    continueText.x = DESIGN_W / 2;
    continueText.y = 348;
    continueText.eventMode = "none";
    this.combatLayer.addChild(continueText);

    // Auto-advance fallback
    this.clearResolutionTimer();
    this.resolutionAutoTimer = setTimeout(
      () => this.advanceFromResolution(),
      RESOLUTION_AUTO_ADVANCE_MS
    );
  }

  private advanceFromResolution(): void {
    this.clearResolutionTimer();
    this.driver.advanceFromResolution();
  }

  private clearResolutionTimer(): void {
    if (this.resolutionAutoTimer !== null) {
      clearTimeout(this.resolutionAutoTimer);
      this.resolutionAutoTimer = null;
    }
  }

  private onMatchOver(placements: number[], mmr?: Record<number, { before: number; after: number }>): void {
    this.teardownPlayback();
    this.clearResolutionTimer();
    void this.opts.audio.setMusicState("results");
    const mine = placements[this.driver.seatIndex];
    this.opts.audio.play(mine !== undefined && mine <= 4 ? "roundWin" : "roundLoss");
    this.combatLayer.removeChildren();
    const bg = new PIXI.Graphics();
    bg.beginFill(C.bgOverlay, 0.88);
    bg.drawRect(20, 150, DESIGN_W - 40, 420);
    bg.endFill();
    bg.eventMode = "none";
    this.combatLayer.addChild(bg);

    const title = new PIXI.Text("MATCH OVER", {
      fontSize: 18, fill: C.textGold, fontFamily: "monospace",
    });
    title.anchor.set(0.5, 0);
    title.x = DESIGN_W / 2;
    title.y = 162;
    this.combatLayer.addChild(title);

    const state = this.driver.getState();
    const seat = this.driver.seatIndex;
    const playerPlacement = state.players[seat]?.placement ?? ((placements.indexOf(seat) + 1) || 1);
    const placeText = new PIXI.Text(`You placed #${playerPlacement}`, {
      fontSize: 13, fill: C.textPrimary, fontFamily: "monospace",
    });
    placeText.anchor.set(0.5, 0);
    placeText.x = DESIGN_W / 2;
    placeText.y = 192;
    this.combatLayer.addChild(placeText);

    const myMmr = mmr?.[seat];
    if (myMmr) {
      const delta = myMmr.after - myMmr.before;
      const mmrText = new PIXI.Text(
        `MMR ${myMmr.after} (${delta >= 0 ? "+" : ""}${delta})`,
        { fontSize: 12, fill: delta >= 0 ? C.textReady : C.textBadHP, fontFamily: "monospace" }
      );
      mmrText.anchor.set(0.5, 0);
      mmrText.x = DESIGN_W / 2;
      mmrText.y = 380 + 22;
      this.combatLayer.addChild(mmrText);
    }

    for (let i = 0; i < placements.length; i++) {
      const pid = placements[i];
      const pText = new PIXI.Text(
        `#${i + 1}: Player ${(pid ?? 0) + 1}${pid === 0 ? " (You)" : ""}`,
        { fontSize: 10, fill: pid === 0 ? C.textReady : C.textMuted, fontFamily: "monospace" }
      );
      pText.anchor.set(0.5, 0);
      pText.x = DESIGN_W / 2;
      pText.y = 220 + i * 18;
      this.combatLayer.addChild(pText);
    }

    const menuBtn = new PIXI.Graphics();
    menuBtn.beginFill(C.bgContinue, 0.95);
    menuBtn.drawRoundedRect(DESIGN_W / 2 - 70, 520, 140, 38, 6);
    menuBtn.endFill();
    menuBtn.eventMode = "static";
    menuBtn.hitArea = new PIXI.Rectangle(DESIGN_W / 2 - 70, 520, 140, 38);
    menuBtn.cursor = "pointer";
    menuBtn.on("pointerdown", () => this.opts.onLeave());
    this.combatLayer.addChild(menuBtn);
    const menuTxt = new PIXI.Text("Main Menu", { fontSize: 13, fill: C.textReady, fontFamily: "monospace" });
    menuTxt.anchor.set(0.5, 0.5);
    menuTxt.x = DESIGN_W / 2;
    menuTxt.y = 539;
    menuTxt.eventMode = "none";
    this.combatLayer.addChild(menuTxt);
  }

  /** Tear down the scene: stop playback/timers, unsubscribe, drop the container. */
  destroy(): void {
    this.teardownPlayback();
    this.clearResolutionTimer();
    this.unsub();
    this.unsubArt();
    if (this.container.parent) this.container.parent.removeChild(this.container);
    this.container.destroy({ children: true });
  }

  // ─── TOAST ───────────────────────────────────────────────────────────────

  private showToast(msg: string): void {
    this.opts.audio.play("error");
    this.toastLayer.removeChildren();
    const bg = new PIXI.Graphics();
    bg.beginFill(C.bgToast, 0.92);
    bg.drawRoundedRect(DESIGN_W / 2 - 90, BENCH_Y - 44, 180, 26, 5);
    bg.endFill();
    bg.eventMode = "none";
    this.toastLayer.addChild(bg);

    const t = new PIXI.Text(msg, { fontSize: 10, fill: C.textToast, fontFamily: "monospace" });
    t.anchor.set(0.5, 0.5);
    t.x = DESIGN_W / 2;
    t.y = BENCH_Y - 31;
    this.toastLayer.addChild(t);

    setTimeout(() => this.toastLayer.removeChildren(), 1800);
  }
}
