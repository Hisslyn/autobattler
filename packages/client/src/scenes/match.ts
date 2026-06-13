import * as PIXI from "pixi.js";
import { gameData } from "@autobattler/data";
import type { MatchState, PlayerState } from "@autobattler/rules/src/state.js";
import type { UnitInstance, CombatEvent } from "@autobattler/sim/src/types.js";
import type { HexCoord } from "@autobattler/sim/src/hex.js";
import type { IDriver } from "../driver.js";
import { CombatPlayer, toDisplayHex } from "../combat/player.js";
import type { PlaybackSpeed } from "../combat/player.js";
import { CombatView } from "../combat/view.js";
import { C, tierColor, starColor } from "../theme.js";
import {
  HEX_R, HEX_W, HEX_H, BOARD_COLS, BOARD_ROWS, BOARD_SLOTS,
  hexToPixel, hexFromPointer,
} from "../hexUtils.js";

const DESIGN_W = 390;
const DESIGN_H = 844;

const BOARD_OFFSET_X = (DESIGN_W - BOARD_COLS * HEX_W) / 2 + HEX_R;
const BOARD_OFFSET_Y = 265;

const BENCH_SLOT_W = 38;
const BENCH_Y = BOARD_OFFSET_Y + BOARD_ROWS * HEX_H + 18;
const SHOP_Y = BENCH_Y + BENCH_SLOT_W + 16;

// Opponent board is mirrored on the top half
const OPP_BOARD_OFFSET_Y = BOARD_OFFSET_Y - BOARD_ROWS * HEX_H - 12;

const RESOLUTION_AUTO_ADVANCE_MS = 5000;

function drawHex(g: PIXI.Graphics, x: number, y: number, r: number, fill: number, alpha = 1): void {
  g.beginFill(fill, alpha);
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    pts.push(x + r * Math.cos(angle), y + r * Math.sin(angle));
  }
  g.drawPolygon(pts);
  g.endFill();
}

function drawUnitCircle(
  container: PIXI.Container,
  unit: UnitInstance,
  x: number,
  y: number,
  r = 14,
  dimmed = false
): void {
  const g = new PIXI.Graphics();
  g.beginFill(C.bgUnit, dimmed ? 0.5 : 1);
  g.drawCircle(x, y, r);
  g.endFill();
  const ring = tierColor(unit.tier);
  g.lineStyle(2, ring, dimmed ? 0.4 : 0.9);
  g.drawCircle(x, y, r);
  g.lineStyle(0);

  const hpFrac = Math.max(0, unit.hp / unit.maxHp);
  g.beginFill(C.hpBg);
  g.drawRect(x - r, y + r + 2, r * 2, 3);
  g.endFill();
  g.beginFill(C.hpFill);
  g.drawRect(x - r, y + r + 2, Math.round(r * 2 * hpFrac), 3);
  g.endFill();

  const manaFrac = unit.maxMana > 0 ? Math.max(0, unit.mana / unit.maxMana) : 0;
  g.beginFill(C.manaBg);
  g.drawRect(x - r, y + r + 6, r * 2, 2);
  g.endFill();
  g.beginFill(C.manaFill);
  g.drawRect(x - r, y + r + 6, Math.round(r * 2 * manaFrac), 2);
  g.endFill();

  container.addChild(g);

  const sc = unit.star;
  const scColor = starColor(sc);
  const starG = new PIXI.Graphics();
  for (let i = 0; i < sc; i++) {
    starG.beginFill(scColor);
    starG.drawCircle(x - (sc - 1) * 3 + i * 6, y - r - 3, 2);
    starG.endFill();
  }
  container.addChild(starG);

  const def = gameData.units.find((u) => u.id === unit.defId);
  const label = new PIXI.Text((def?.name ?? "??").slice(0, 2).toUpperCase(), {
    fontSize: 7,
    fill: dimmed ? C.textDimmed : C.textLabel,
    fontFamily: "monospace",
  });
  label.anchor.set(0.5);
  label.x = x;
  label.y = y;
  container.addChild(label);
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

  private selectedBenchIdx: number | null = null;
  private selectedBoardIdx: number | null = null;
  private isDragging = false;
  private dragUnit: { uid: number; fromBench: boolean; fromIdx: number } | null = null;
  private dragSprite: PIXI.Container | null = null;
  private traitPanelOpen = true;
  private scoutTargetId: number | null = null;

  private dragCatcher!: PIXI.Graphics;
  private resolutionAutoTimer: ReturnType<typeof setTimeout> | null = null;

  private playback: {
    player: CombatPlayer;
    view: CombatView;
    tickerFn: (ticker: PIXI.Ticker) => void;
  } | null = null;
  private playbackSpeed: PlaybackSpeed = 1;
  private speedBtnLabel: PIXI.Text | null = null;

  constructor(app: PIXI.Application, driver: IDriver) {
    this.container = new PIXI.Container();
    this.app = app;
    this.driver = driver;

    this.hudLayer = new PIXI.Container();
    this.boardLayer = new PIXI.Container();
    this.benchLayer = new PIXI.Container();
    this.shopLayer = new PIXI.Container();
    this.traitLayer = new PIXI.Container();
    this.combatLayer = new PIXI.Container();
    this.combatLayer.sortableChildren = true;
    this.scoutLayer = new PIXI.Container();
    this.toastLayer = new PIXI.Container();

    this.container.addChild(this.hudLayer);
    this.container.addChild(this.boardLayer);
    this.container.addChild(this.benchLayer);
    this.container.addChild(this.shopLayer);
    this.container.addChild(this.traitLayer);
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

    driver.on((e) => {
      if (e.type === "state") this.render(e.state);
      if (e.type === "phase_change") {
        if (e.phase === "PLANNING") this.onPlanningStart();
        if (e.phase === "COMBAT") this.onCombatPhase();
        if (e.phase === "RESOLUTION") this.onResolutionPhase();
      }
      if (e.type === "match_over") this.onMatchOver(e.placements, e.mmr);
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
      this.renderShop(state, me);
      this.renderTraitPanel(me);
    }
  }

  // ─── HUD ─────────────────────────────────────────────────────────────────

  private renderHud(state: MatchState, me: PlayerState): void {
    this.hudLayer.removeChildren();
    const bg = new PIXI.Graphics();
    bg.beginFill(C.bgHud);
    bg.drawRect(0, 0, DESIGN_W, 56);
    bg.endFill();
    this.hudLayer.addChild(bg);

    const barW = Math.floor((DESIGN_W - 8) / 8);
    for (let i = 0; i < 8; i++) {
      const p = state.players[i];
      if (!p) continue;
      const x = 4 + i * barW;
      const g = new PIXI.Graphics();
      const barColor = p.alive ? (i === this.driver.seatIndex ? C.hpBarSelf : C.hpBarOther) : C.hpBarDead;
      g.beginFill(barColor, 0.35);
      g.drawRoundedRect(x, 4, barW - 2, 18, 2);
      g.endFill();
      const hpFrac = Math.max(0, p.hp / 100);
      g.beginFill(barColor, 0.85);
      g.drawRoundedRect(x, 4, Math.round((barW - 2) * hpFrac), 18, 2);
      g.endFill();

      // Make each bar tappable for scouting (not self, alive opponents only)
      if (i !== this.driver.seatIndex && p.alive && state.phase === "PLANNING") {
        g.eventMode = "static";
        g.cursor = "pointer";
        const capturedId = i;
        g.on("pointerdown", () => this.openScout(capturedId, state));
      }

      this.hudLayer.addChild(g);

      const hpText = new PIXI.Text(`${Math.max(0, p.hp)}`, {
        fontSize: 8,
        fill: C.textPrimary,
        fontFamily: "monospace",
      });
      hpText.anchor.set(0.5, 0.5);
      hpText.x = x + (barW - 2) / 2;
      hpText.y = 13;
      this.hudLayer.addChild(hpText);
    }

    const timeLeft = this.driver.getPlanningTimeLeft();
    const timerStr = state.phase === "PLANNING" && timeLeft > 0 ? ` ${Math.ceil(timeLeft / 1000)}s` : "";
    const roundText = new PIXI.Text(`R${state.round} ${state.phase}${timerStr}`, {
      fontSize: 9,
      fill: C.textMuted,
      fontFamily: "monospace",
    });
    roundText.x = 4;
    roundText.y = 28;
    this.hudLayer.addChild(roundText);

    const goldText = new PIXI.Text(`${me.gold}g  Lv${me.level}  XP${me.xp}`, {
      fontSize: 9,
      fill: C.textGold,
      fontFamily: "monospace",
    });
    goldText.x = 4;
    goldText.y = 41;
    this.hudLayer.addChild(goldText);
  }

  // ─── BOARD ───────────────────────────────────────────────────────────────

  private renderBoard(me: PlayerState): void {
    this.boardLayer.removeChildren();

    // Opponent area placeholder (top 4 rows)
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let q = 0; q < BOARD_COLS; q++) {
        const { x, y } = hexToPixel(q, r, BOARD_OFFSET_X, OPP_BOARD_OFFSET_Y);
        const g = new PIXI.Graphics();
        drawHex(g, x, y, HEX_R - 2, C.bgBoardOpp, 0.4);
        this.boardLayer.addChild(g);
      }
    }

    // Player board (bottom 4 rows)
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let q = 0; q < BOARD_COLS; q++) {
        const slotIdx = r * BOARD_COLS + q;
        const { x, y } = hexToPixel(q, r, BOARD_OFFSET_X, BOARD_OFFSET_Y);
        const isSelected = this.selectedBoardIdx === slotIdx && me.board[slotIdx] != null;
        const g = new PIXI.Graphics();
        drawHex(g, x, y, HEX_R - 2, isSelected ? C.bgBoardSel : C.bgBoard, 0.7);
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
      drawUnitCircle(uc, unit, x, y, 14, this.selectedBenchIdx !== null || (this.selectedBoardIdx !== null && this.selectedBoardIdx !== idx));
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
        drawUnitCircle(uc, unit, x, BENCH_Y, 12);
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
    const shopCardW = 60;
    const shopCardH = 68;
    const shopStartX = 8;

    for (let i = 0; i < 5; i++) {
      const x = shopStartX + i * (shopCardW + 4);
      const slot = me.shop[i];
      const g = new PIXI.Graphics();
      g.beginFill(slot ? C.bgShopCard : C.bgShopEmpty, 0.9);
      g.drawRoundedRect(x, SHOP_Y, shopCardW, shopCardH, 5);
      g.endFill();

      if (slot) {
        const def = gameData.units.find((u) => u.id === slot.defId);
        const tc = tierColor(slot.tier);
        g.lineStyle(1, tc, 0.6);
        g.drawRoundedRect(x, SHOP_Y, shopCardW, shopCardH, 5);
        g.lineStyle(0);
        g.eventMode = "static";
        g.hitArea = new PIXI.Rectangle(x, SHOP_Y, shopCardW, shopCardH);
        g.cursor = "pointer";
        const ci = i;
        g.on("pointerdown", () => this.onShopBuy(ci));

        const nameText = new PIXI.Text(def?.name ?? slot.defId, {
          fontSize: 8,
          fill: C.textShop,
          fontFamily: "monospace",
          wordWrap: true,
          wordWrapWidth: shopCardW - 4,
        });
        nameText.anchor.set(0.5, 0);
        nameText.x = x + shopCardW / 2;
        nameText.y = SHOP_Y + 4;
        this.shopLayer.addChild(nameText);

        const costText = new PIXI.Text(`${slot.tier}g`, {
          fontSize: 10,
          fill: C.textGold,
          fontFamily: "monospace",
        });
        costText.anchor.set(0.5, 1);
        costText.x = x + shopCardW / 2;
        costText.y = SHOP_Y + shopCardH - 4;
        this.shopLayer.addChild(costText);

        const cg = new PIXI.Graphics();
        cg.beginFill(tc, 0.18);
        cg.drawCircle(x + shopCardW / 2, SHOP_Y + shopCardH / 2, 12);
        cg.endFill();
        this.shopLayer.addChild(cg);
      }

      this.shopLayer.addChild(g);
    }

    const rrX = 8 + 5 * (shopCardW + 4) + 4;
    const rrG = new PIXI.Graphics();
    rrG.beginFill(C.bgReroll);
    rrG.drawRoundedRect(rrX, SHOP_Y, 56, 26, 3);
    rrG.endFill();
    rrG.eventMode = "static";
    rrG.hitArea = new PIXI.Rectangle(rrX, SHOP_Y, 56, 26);
    rrG.cursor = "pointer";
    rrG.on("pointerdown", () => this.onReroll());
    const rrText = new PIXI.Text(`Roll\n${gameData.economy.rerollCost}g`, {
      fontSize: 8, fill: C.textReroll, fontFamily: "monospace", align: "center",
    });
    rrText.eventMode = "none";
    rrText.anchor.set(0.5, 0.5);
    rrText.x = rrX + 28;
    rrText.y = SHOP_Y + 13;
    this.shopLayer.addChild(rrG);
    this.shopLayer.addChild(rrText);

    const xpG = new PIXI.Graphics();
    xpG.beginFill(C.bgXp);
    xpG.drawRoundedRect(rrX, SHOP_Y + 30, 56, 26, 3);
    xpG.endFill();
    xpG.eventMode = "static";
    xpG.hitArea = new PIXI.Rectangle(rrX, SHOP_Y + 30, 56, 26);
    xpG.cursor = "pointer";
    xpG.on("pointerdown", () => this.onBuyXp());
    const xpText = new PIXI.Text(`+XP\n${gameData.economy.xpBuyCost}g`, {
      fontSize: 8, fill: C.textXp, fontFamily: "monospace", align: "center",
    });
    xpText.eventMode = "none";
    xpText.anchor.set(0.5, 0.5);
    xpText.x = rrX + 28;
    xpText.y = SHOP_Y + 43;
    this.shopLayer.addChild(xpG);
    this.shopLayer.addChild(xpText);

    const isPlanning = state.phase === "PLANNING";
    const readyG = new PIXI.Graphics();
    readyG.beginFill(isPlanning ? C.bgReady : C.bgReadyOff);
    readyG.drawRoundedRect(rrX, SHOP_Y + 60, 56, 26, 3);
    readyG.endFill();
    readyG.eventMode = isPlanning ? "static" : "none";
    readyG.hitArea = new PIXI.Rectangle(rrX, SHOP_Y + 60, 56, 26);
    readyG.cursor = isPlanning ? "pointer" : "default";
    readyG.on("pointerdown", () => isPlanning && this.driver.ready());
    const readyText = new PIXI.Text(isPlanning ? "Ready" : state.phase, {
      fontSize: 8, fill: isPlanning ? C.textReady : C.textMuted, fontFamily: "monospace",
    });
    readyText.eventMode = "none";
    readyText.anchor.set(0.5, 0.5);
    readyText.x = rrX + 28;
    readyText.y = SHOP_Y + 73;
    this.shopLayer.addChild(readyG);
    this.shopLayer.addChild(readyText);
  }

  // ─── TRAIT TRACKER ───────────────────────────────────────────────────────

  private renderTraitPanel(me: PlayerState): void {
    this.traitLayer.removeChildren();

    const units = me.board.filter((u): u is UnitInstance => u != null);
    const traitCounts = new Map<string, number>();
    for (const u of units) {
      const def = gameData.units.find((d) => d.id === u.defId);
      for (const t of def?.traits ?? []) {
        traitCounts.set(t, (traitCounts.get(t) ?? 0) + 1);
      }
    }
    const knownTraits = gameData.traits.filter((t) => traitCounts.has(t.id));

    const toggleW = 14;
    const toggleH = Math.max(44, knownTraits.length * 22 + 10);
    const panelW = this.traitPanelOpen ? 80 : 0;

    const toggleBtn = new PIXI.Graphics();
    toggleBtn.beginFill(C.bgPanel, 0.85);
    toggleBtn.drawRoundedRect(0, 68, toggleW + panelW, toggleH, 3);
    toggleBtn.endFill();
    toggleBtn.eventMode = "static";
    toggleBtn.cursor = "pointer";
    toggleBtn.on("pointerdown", () => {
      this.traitPanelOpen = !this.traitPanelOpen;
      this.renderTraitPanel(me);
    });
    this.traitLayer.addChild(toggleBtn);

    const toggleLabel = new PIXI.Text(this.traitPanelOpen ? "<" : ">", {
      fontSize: 9, fill: C.textMuted, fontFamily: "monospace",
    });
    toggleLabel.anchor.set(0.5, 0.5);
    toggleLabel.x = toggleW / 2;
    toggleLabel.y = 68 + toggleH / 2;
    this.traitLayer.addChild(toggleLabel);

    if (!this.traitPanelOpen) return;

    let rowY = 74;
    for (const trait of knownTraits) {
      const count = traitCounts.get(trait.id) ?? 0;
      const nextBp = trait.breakpoints.find((bp) => bp.count > count);
      const activeBp = [...trait.breakpoints].reverse().find((bp) => bp.count <= count);
      const isActive = activeBp != null;

      const rowBg = new PIXI.Graphics();
      rowBg.beginFill(isActive ? C.traitActive : C.traitPending, 0.6);
      rowBg.drawRoundedRect(toggleW + 2, rowY, panelW - 6, 18, 2);
      rowBg.endFill();
      this.traitLayer.addChild(rowBg);

      const label = `${trait.name.slice(0, 6)} ${count}/${nextBp?.count ?? activeBp?.count ?? "?"}`;
      const txt = new PIXI.Text(label, {
        fontSize: 7,
        fill: isActive ? C.textReady : C.textMuted,
        fontFamily: "monospace",
      });
      txt.anchor.set(0, 0.5);
      txt.x = toggleW + 5;
      txt.y = rowY + 9;
      this.traitLayer.addChild(txt);
      rowY += 22;
    }
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
    drawUnitCircle(c, unit, 0, 0, 14);
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
        if (!result.ok) this.showToast(result.error);
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
      if (!result.ok) this.showToast(result.error);
    }
    this.render(this.driver.getState());
  }

  private onShopBuy(idx: number): void {
    const result = this.driver.playerCommand({ type: "BUY", shopSlotIndex: idx });
    if (!result.ok) this.showToast(result.error);
  }

  private onReroll(): void {
    const result = this.driver.playerCommand({ type: "REROLL" });
    if (!result.ok) this.showToast(result.error);
  }

  private onBuyXp(): void {
    const result = this.driver.playerCommand({ type: "BUY_XP" });
    if (!result.ok) this.showToast(result.error);
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
      drawUnitCircle(uc, unit, x, y, 13);
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
    this.render(this.driver.getState());
  }

  private onCombatPhase(): void {
    const state = this.driver.getState();
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
        drawHex(og, opp.x, opp.y, HEX_R - 2, C.bgBoardOpp, 0.5);
        this.combatLayer.addChild(og);

        const own = hexToPixel(q, r, BOARD_OFFSET_X, BOARD_OFFSET_Y);
        const g = new PIXI.Graphics();
        drawHex(g, own.x, own.y, HEX_R - 2, C.bgBoard, 0.5);
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
        drawUnitCircle(uc, unit, x, y);
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

    const player = new CombatPlayer(events, gameData.gameplay.ticksPerSec);
    player.setSpeed(this.playbackSpeed);
    const view = new CombatView(toPixel, {
      x: DESIGN_W / 2,
      y: BOARD_OFFSET_Y - BOARD_ROWS * HEX_H + 10,
    });
    this.combatLayer.addChild(view.container);

    const tickerFn = (ticker: PIXI.Ticker): void => {
      const frame = player.advance(ticker.deltaMS);
      view.renderFrame(frame, ticker.deltaMS);
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
  }

  // ─── TOAST ───────────────────────────────────────────────────────────────

  private showToast(msg: string): void {
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
