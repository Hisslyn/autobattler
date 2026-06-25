import * as PIXI from "pixi.js";
import { gameData } from "@autobattler/data";
import type { MatchState, PlayerState } from "@autobattler/rules/src/state.js";
import { stageForRound, isPveRound as isPveRoundAbs } from "@autobattler/rules/src/rounds.js";
import type { MatchStats } from "@autobattler/protocol";
import type { UnitInstance, CombatEvent } from "@autobattler/sim/src/types.js";
import type { HexCoord } from "@autobattler/sim/src/hex.js";
import type { IDriver } from "../driver.js";
import { PLANNING_TIMER_MS } from "../driver.js";
import { CombatPlayer, toDisplayHex, PLAYBACK_TIME_SCALE } from "../combat/player.js";
import type { PlaybackSpeed } from "../combat/player.js";
import { CombatView } from "../combat/view.js";
import { C, tierColor, CHIP_TEXT_SIZE, CHIP_TEXT_FONT, BOARD_TILT, CANDLE_COLUMN_SCREEN_OFFSET, HAMBURGER_RAIL_GAP } from "../theme.js";
import { drawUnitToken } from "../unitToken.js";
import { drawGlyph, glyphForTraits } from "../glyphs.js";
import type { GlyphKind } from "../glyphs.js";
import { traitStripModel, xpProgress, buyXpGeom } from "../hudModel.js";
import type { TraitChip } from "../hudModel.js";
import { inspectModel } from "../inspectModel.js";
import { traitDetailModel } from "../traitDetailModel.js";
import { sellValue } from "../sellValue.js";
import { renderUnitInspect, renderTraitDetail, renderItemDetail, renderItemPicker } from "../inspectPanel.js";
import { inventoryModel, itemModel } from "../itemModel.js";
import type { InventoryEntry, ItemModel } from "../itemModel.js";
import { combinePreview } from "../combinePreview.js";
import { radiantDropRoute } from "../consumablePicker.js";
import { lootRevealModel } from "../lootReveal.js";
import type { RevealStep } from "../lootReveal.js";
import { onUnitArtReady } from "../sprites.js";
import {
  PLAYER_1_AVATAR_NUM,
  generateAvatarAssignment,
  requestAvatarArt,
  resolveAvatarTexture,
  avatarTextureLookup,
  onAvatarArtReady,
} from "../avatars.js";
import { drawItemIcon, onItemArtReady } from "../itemIconDraw.js";
import {
  Z_COMBAT_HEADER, Z_RESOLUTION_OVERLAY, Z_RESOLUTION_BUTTON, Z_RESOLUTION_CONTROL,
  L0_BOARD_ENV, L2_UNITS, L3_WATERMARK, L4_FRAME, L5_HUD, L6_INSPECT, L8_TOAST,
} from "../combatLayout.js";
import { benchGeom, benchSlotAtX } from "../benchLayout.js";
import { TORCHES_PER_SIDE, torchLit } from "../torchMeter.js";
import type { SettingsStore } from "../settings.js";
import type { AudioManager } from "../audio/manager.js";
import { phaseToMusicState } from "../audio/director.js";

import type { MatchLayout } from "../layout.js";
import { centeredModal, opponentRailTile, shopCardContentLayout, shopPanelSlotRect } from "../layout.js";

export interface MatchSceneOptions {
  settings: SettingsStore;
  audio: AudioManager;
  /** Called to leave the match and return to the menu (pause panel or match-over). */
  onLeave: () => void;
  /**
   * Open the pause panel. The ☰ button lives in the Pixi HUD layer (so it scales
   * with the viewport); the shell owns the pause panel modal itself.
   */
  onPause: () => void;
  /** Active orientation-aware layout (design dims + named region rects). */
  layout: MatchLayout;
}
import {
  HEX_R, HEX_W, HEX_H, HEX_TILE_R, BOARD_COLS, BOARD_ROWS, BOARD_SLOTS,
  hexToPixel, hexFromPointer,
} from "../hexUtils.js";
import { makeBoardProjection, type BoardProjection } from "../boardProjection.js";

// Item chip sizing (orientation-independent).
const ITEM_SLOT = 30;          // item chip size

// Consistent inset between the hex grid's bounding box and the board frame.
const BOARD_PAD = 12;

// ─── Arena tealight candles (gold meter, renderer-only) ──────────────────────
// Candle body width/height in SCREEN px at depth-scale 1 (the near/front
// candle); each candle is depth-scaled by the board projection so front candles
// read larger than the receding back ones. TORCH_FRONT/TORCH_BACK/TORCH_MID are
// board-space y fractions of the grid frame (0 = far/enemy edge, 1 = near/player
// edge). Each side's 5 candles flank only that side's half of the board: the
// player (left) column spans [TORCH_MID, TORCH_FRONT] (front half, back-most at
// the midline) and the opponent (right) column spans [TORCH_BACK, TORCH_MID]
// (back half, front-most at the midline); the rest interpolate evenly so the
// squat tealights spread along the half rather than clustering.
// Tealight proportions: WIDE and SHORT (a squat wax disc with a small flame).
const TORCH_W = 32;
const TORCH_H = 9.1;
const TORCH_FRONT = 0.9;
const TORCH_BACK = 0.1;
const TORCH_MID = 0.5;

// Extra travel past the panel height when sliding the drop-down shop CLOSED, so
// its bottom border clears the screen top (the panel's top sits at y=0) instead
// of leaving a 1–2px gold rim peeking as a stray line.
const SHOP_PANEL_HIDE_MARGIN = 4;

// Match the driver/server resolution window (data-driven) so the visible
// countdown can never drift from the real auto-advance.
const RESOLUTION_AUTO_ADVANCE_MS = gameData.economy.resolutionSeconds * 1000;

interface HexStyle {
  /** Border stroke (thin tile outline / drag highlight). */
  border?: { color: number; width: number; alpha?: number };
}

/**
 * Pointy-top hex tile centered at board-space (x, y). The orientation matches the
 * row-offset lattice (see HEX_TILE_R): vertical edges shared left/right, slanted
 * edges on the diagonals — so neighbouring tiles share edges and tessellate with
 * no gaps. When `project` is supplied each vertex is mapped through it, so the
 * ground tile renders as a true perspective-foreshortened polygon (the board's
 * trapezoid); shared edges stay shared after projection (the homography maps a
 * line segment to a line segment).
 */
function drawHex(
  g: PIXI.Graphics,
  x: number,
  y: number,
  r: number,
  fill: number,
  alpha = 1,
  style: HexStyle = {},
  project?: (p: { x: number; y: number }) => { x: number; y: number }
): void {
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i + Math.PI / 6;
    const vx = x + r * Math.cos(angle);
    const vy = y + r * Math.sin(angle);
    const p = project ? project({ x: vx, y: vy }) : { x: vx, y: vy };
    pts.push(p.x, p.y);
  }
  g.poly(pts).fill({ color: fill, alpha });
  if (style.border) g.poly(pts).stroke({ width: style.border.width, color: style.border.color, alpha: style.border.alpha ?? 1 });
}

/**
 * Push a single pointy-top hex outline (same geometry as `drawHex`) as a SUBPATH
 * into `g` without filling or stroking it. Many cells accumulated this way and
 * then stroked in ONE `g.stroke()` call rasterize as a single stroke region, so
 * shared (tessellated) edges composite once — uniform grid-line alpha across the
 * field. Vertices are computed in flat board space, then projected, so the cells
 * follow the perspective tilt while the stroke width stays crisp in screen space.
 */
function addHexPath(
  g: PIXI.Graphics,
  x: number,
  y: number,
  r: number,
  project?: (p: { x: number; y: number }) => { x: number; y: number }
): void {
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i + Math.PI / 6;
    const vx = x + r * Math.cos(angle);
    const vy = y + r * Math.sin(angle);
    const p = project ? project({ x: vx, y: vy }) : { x: vx, y: vy };
    pts.push(p.x, p.y);
  }
  g.poly(pts);
}

/**
 * Render a unit token (board/combat with bars, bench without) at (x, y).
 * `piece` gives it "checkers piece" volume (board + bench only); flat surfaces
 * (drag ghost, scout overlay) leave it off.
 */
function drawUnit(
  container: PIXI.Container,
  unit: UnitInstance,
  x: number,
  y: number,
  r = 16,
  dimmed = false,
  withBars = true,
  piece = false
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
  if (piece) opts.piece = {};
  drawUnitToken(container, unit.defId, unit.tier, unit.star, x, y, opts);
}

export class MatchScene {
  // ── Top-center stage bar vertical stack (bar → progress capsule → Skip) ──────
  // Shared by renderHud (the stage bar) and renderSkipButton (Skip) so the two
  // never drift apart. The bar is pinned ~1px above the status-row top (clamped
  // on-screen); the progress capsule sits beneath it and the Skip pill below that.
  private static readonly STAGE_BAR_H = 22;   // trapezoid bar height
  private static readonly STAGE_PROGRESS_GAP = 3; // gap between bar and progress capsule
  private static readonly STAGE_PROGRESS_H = 4;   // progress capsule height
  /** Top of the stage bar (kept fully on-screen). */
  private static stageBarTopY(statusY: number): number {
    return Math.max(1, statusY - 1);
  }
  /** Bottom of the whole stage-bar widget (bar + gap + progress capsule). */
  private static stageBarBottomY(statusY: number): number {
    return (
      MatchScene.stageBarTopY(statusY) +
      MatchScene.STAGE_BAR_H +
      MatchScene.STAGE_PROGRESS_GAP +
      MatchScene.STAGE_PROGRESS_H
    );
  }

  readonly container: PIXI.Container;
  private app: PIXI.Application;
  private driver: IDriver;
  // Layer containers — created + z-bound in buildSceneLayers() (constructor).
  /**
   * Single parent for the entire board ASSEMBLY (board ground + hex grid + both
   * benches + the candle gold-meters). Parenting them under one node lets the
   * whole assembly later be transformed (flipped/moved/scaled) as one unit. Today
   * it carries an IDENTITY transform, so it's a purely structural reparent — every
   * child still draws at its existing design-space position. If a transform is
   * ever applied here, pointer hit-tests route their global coords through
   * `boardGroup.toLocal(...)` (see `boardSlotAt`/`benchSlotAt`) so drag-to-hex /
   * bench-slot placement stays correct in the group's local space.
   */
  private boardGroup!: PIXI.Container;
  private boardLayer!: PIXI.Container;
  private benchLayer!: PIXI.Container;
  private shopLayer!: PIXI.Container;
  private hudLayer!: PIXI.Container;
  private toastLayer!: PIXI.Container;
  private combatLayer!: PIXI.Container;
  private traitLayer!: PIXI.Container;
  /** Landscape left-column rail tab (view-only UI state; never persisted). */
  private activeRailTab: "traits" | "items" = "traits";
  /** Landscape trait-rail page when the list overflows (view-only UI state). */
  private traitRailPage = 0;
  private scoutLayer!: PIXI.Container;
  /** Loot-orb reveal overlay (PvE resolution). */
  private lootLayer!: PIXI.Container;
  /** Inspect / trait-detail panels (topmost, modal). */
  private inspectLayer!: PIXI.Container;
  /**
   * Playtest-only Skip pill (Practice/local only) — an independent top-most
   * overlay pinned top-center below the timer. Rendered into its OWN layer so it
   * never participates in any layout cluster's anchoring/sizing.
   */
  private skipLayer!: PIXI.Container;
  /** L3_WATERMARK — board-anchored center watermark. Reserved empty layer (no content yet). */
  private watermarkLayer!: PIXI.Container;
  /** L4_FRAME — ornate edge frame, 9-slice. Reserved empty layer, non-interactive (no content yet). */
  private frameLayer!: PIXI.Container;
  /** Planning-phase juice (star-up flourish, buy/sell pops); not cleared by render(). */
  private planningFxLayer!: PIXI.Container;
  /** Drop-down shop panel (toggled by the money-sack button) + its toggle button. */
  private shopPanelLayer!: PIXI.Container;
  private shopToggleLayer!: PIXI.Container;
  /**
   * Full-screen interactive scrim behind the open shop panel: captures every
   * pointer event so nothing in the HUD/board behind the open panel is clickable
   * through it, and a tap on it (= a click OUTSIDE the panel) dismisses the shop.
   * Sits above the Skip pill + all HUD so the open panel reads as the top surface.
   */
  private shopBackdropLayer!: PIXI.Container;
  /** Drop-down shop UI state (view-only; never persisted). */
  private shopPanelOpen = false;
  /** Current vertical slide offset of the panel (0 = open, -panelH = hidden up). */
  private shopPanelOffsetY = -9999;
  private shopPanelAnimFn: ((t: PIXI.Ticker) => void) | null = null;

  private selectedBenchIdx: number | null = null;
  private selectedBoardIdx: number | null = null;
  private isDragging = false;
  private dragUnit: { uid: number; fromBench: boolean; fromIdx: number } | null = null;
  private dragSprite: PIXI.Container | null = null;
  /** Player being peeked (their board shown in-place); null = viewing my own board. */
  private peekTargetId: number | null = null;
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
  /** Planning timer Text node + ticker, so the countdown visibly drains each
   * second instead of freezing at the value rendered on phase entry. */
  private planningTimerText: PIXI.Text | null = null;
  private planningTimerFn: ((t: PIXI.Ticker) => void) | null = null;
  /** Retained stage-bar progress capsule + its geometry, redrawn each frame from
   * the live planning clock so it drains smoothly (not only on state changes). */
  private planningProgressBar: PIXI.Graphics | null = null;
  private planningProgressGeom: { x: number; y: number; w: number; h: number } | null = null;
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
  private playbackSpeed: PlaybackSpeed = 0.5;
  private speedBtnLabel: PIXI.Text | null = null;
  private opts: MatchSceneOptions;
  /** Active orientation-aware layout (design dims + named region rects). */
  private layout: MatchLayout;
  private unsub: () => void = () => {};
  private unsubArt: () => void = () => {};
  private unsubItemArt: () => void = () => {};
  private unsubAvatarArt: () => void = () => {};
  /** Cosmetic seat→avatar map, generated once at match init and stable for the
   *  whole match (seat 0 = the human's PLAYER_1_AVATAR_NUM, others random distinct).
   *  Not sim state; never re-rolled mid-match. */
  private avatarAssignment: Map<number, number> | null = null;

  constructor(app: PIXI.Application, driver: IDriver, opts: MatchSceneOptions) {
    this.container = new PIXI.Container();
    this.app = app;
    this.driver = driver;
    this.opts = opts;
    this.layout = opts.layout;
    this.playbackSpeed = opts.settings.get().defaultSpeed;

    this.buildSceneLayers();

    // Invisible full-screen drag target for pointer-up — only active while dragging
    const dragCatcher = new PIXI.Graphics();
    dragCatcher.eventMode = "none"; // disabled until drag starts
    dragCatcher.zIndex = 900; // magic-ok: backstop above every L* layer, below the 999 drag sprite
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
    // An avatar PNG finishing its lazy load: repaint so the opponent rail swaps
    // its glyph for the portrait (the rail is part of the HUD, drawn every render).
    this.unsubAvatarArt = onAvatarArtReady(() => this.render(this.driver.getState()));

    this.render(driver.getState());
    driver.startPlanning();
  }

  /**
   * Build the scene's layer containers and bind their stacking to the named
   * L*_* z-stack constants from combatLayout.ts — the documented 9-layer stack
   * becomes the real, enforced render order. The root is `sortableChildren`, and
   * every layer's `zIndex` IS its layer constant (1:1), so stacking derives from
   * the constants, NOT addChild insertion order.
   *
   * Several containers legitimately share one layer (L2_UNITS, L5_HUD,
   * L6_INSPECT); within a shared zIndex the stable tie-break is the addChild
   * order below, chosen so the intended sub-order holds:
   *   • planning VFX (`planningFxLayer`) over the board/bench unit tokens;
   *   • the combat overlay (`combatLayer`) — and the loot reveal (`lootLayer`)
   *     above it — over the persistent HUD chrome, so a full-screen RESOLUTION
   *     scrim covers the opponent rail (the combat overlay's own internal stack
   *     is consumed at L2/L5 — see combatLayout.ts);
   *   • the inspect panel (`inspectLayer`) over the scout overlay (`scoutLayer`).
   * Toast sits above the HUD but below the inspect/scout modals (L8_TOAST <
   * L6_INSPECT), per the spec's toast bullet.
   */
  private buildSceneLayers(): void {
    // Stacking is by zIndex, not insertion order.
    this.container.sortableChildren = true;

    // The board assembly group: board ground + hex grid + both benches + the
    // candle gold-meters all live under this one node so it can later be
    // transformed (flip/move/scale) as a single unit. Sortable so its children
    // keep their own L*_* z-stack (board ground under bench tokens).
    this.boardGroup = new PIXI.Container();
    this.boardGroup.sortableChildren = true;
    this.boardLayer = new PIXI.Container();
    this.benchLayer = new PIXI.Container();
    this.planningFxLayer = new PIXI.Container();
    // L3_WATERMARK / L4_FRAME — reserved empty layers, styling deferred.
    this.watermarkLayer = new PIXI.Container();
    this.frameLayer = new PIXI.Container();
    this.frameLayer.eventMode = "none"; // L4_FRAME is non-interactive per spec
    this.hudLayer = new PIXI.Container();
    this.shopLayer = new PIXI.Container();
    this.traitLayer = new PIXI.Container();
    this.shopPanelLayer = new PIXI.Container();
    this.shopToggleLayer = new PIXI.Container();
    this.shopBackdropLayer = new PIXI.Container();
    this.combatLayer = new PIXI.Container();
    this.combatLayer.sortableChildren = true; // keeps its own internal z-stack
    this.lootLayer = new PIXI.Container();
    this.toastLayer = new PIXI.Container();
    this.scoutLayer = new PIXI.Container();
    this.inspectLayer = new PIXI.Container();
    this.skipLayer = new PIXI.Container();

    // zIndex IS the layer constant (1:1) — the enforced z-stack.
    // The board group sits at the board-environment level so the whole assembly
    // (ground + grid + benches + candles) stacks below the planning FX / HUD /
    // overlays. Within the group, the board ground (L0) draws under the bench
    // tokens (L2) — the children keep their own constants.
    this.boardGroup.zIndex = L0_BOARD_ENV;
    this.boardLayer.zIndex = L0_BOARD_ENV;
    this.benchLayer.zIndex = L2_UNITS;
    this.planningFxLayer.zIndex = L2_UNITS;
    this.watermarkLayer.zIndex = L3_WATERMARK;
    this.frameLayer.zIndex = L4_FRAME;
    this.hudLayer.zIndex = L5_HUD;
    this.shopLayer.zIndex = L5_HUD;
    this.traitLayer.zIndex = L5_HUD;
    this.shopToggleLayer.zIndex = L5_HUD;
    // The open shop panel + its backdrop scrim must overlay EVERYTHING in the
    // canvas — including the Skip pill (850) and all HUD — and take click
    // priority. Pin both above the Skip pill but below the active drag sprite
    // (999) / drag catcher (900) so an in-progress drag still wins.
    this.shopBackdropLayer.zIndex = 870; // magic-ok: above Skip (850), below drag (900)
    this.shopPanelLayer.zIndex = 871;    // magic-ok: directly above its own backdrop
    this.combatLayer.zIndex = L5_HUD;
    this.lootLayer.zIndex = L5_HUD;
    this.toastLayer.zIndex = L8_TOAST;
    this.scoutLayer.zIndex = L6_INSPECT;
    this.inspectLayer.zIndex = L6_INSPECT;
    // Playtest Skip pill: a standalone top-most overlay, above all HUD/modal
    // layers but below the active drag sprite (999) / drag catcher (900) so it
    // never intercepts an in-progress unit/item drag.
    this.skipLayer.zIndex = 850; // magic-ok: independent debug overlay, above L* layers

    // Added back-to-front; addChild order is only the stable tie-break within a
    // shared layer (see the method doc).
    // Board ground + grid + both benches are children of the single board group
    // (their own zIndex orders board-under-bench inside it); the group is added
    // to the scene at the board-environment level.
    this.boardGroup.addChild(this.boardLayer);
    this.boardGroup.addChild(this.benchLayer);
    this.container.addChild(this.boardGroup);
    this.container.addChild(this.planningFxLayer);
    this.container.addChild(this.watermarkLayer);
    this.container.addChild(this.frameLayer);
    this.container.addChild(this.hudLayer);
    this.container.addChild(this.shopLayer);
    this.container.addChild(this.traitLayer);
    // The toggle button sits in the HUD band (L5).
    this.container.addChild(this.shopToggleLayer);
    this.container.addChild(this.combatLayer);
    this.container.addChild(this.lootLayer);
    this.container.addChild(this.toastLayer);
    this.container.addChild(this.scoutLayer);
    this.container.addChild(this.inspectLayer);
    this.container.addChild(this.skipLayer);
    // The open shop panel + its backdrop scrim are the top-most canvas overlays
    // (zIndex 870/871, above the Skip pill) — added last so insertion order stays
    // ascending by zIndex (back-to-front).
    this.container.addChild(this.shopBackdropLayer);
    this.container.addChild(this.shopPanelLayer);
  }

  /**
   * The single board-assembly group node (board ground + hex grid + both benches
   * + candle gold-meters). Exposed so later code can apply ONE transform to
   * flip/translate/scale the whole assembly as a unit. Carries an identity
   * transform today; any transform set here must be matched by the `toLocal`
   * pointer mapping already in place in `boardSlotAt`/`benchSlotAt`.
   */
  get boardAssembly(): PIXI.Container {
    return this.boardGroup;
  }

  // ─── LAYOUT GEOMETRY (derived from this.layout) ──────────────────────────────

  private get designW(): number { return this.layout.designW; }
  private get designH(): number { return this.layout.designH; }
  private get isLandscape(): boolean { return this.layout.orientation === "landscape"; }

  /**
   * Board-space source frame the hex grid is laid out in (native size). The full
   * 7×4 grid spans BOARD_COLS*HEX_W + HEX_R × (BOARD_ROWS*HEX_H*2+12) = 360×348;
   * a BOARD_PAD margin on every side gives the frame. The perspective homography
   * (see `proj`) stretches this frame onto the on-screen board footprint
   * (regions.board), so the grid is always laid out at native scale here — the
   * projection carries ALL the sizing + the wide/shallow perspective.
   */
  private get gridFrame(): { x: number; y: number; w: number; h: number } {
    const gridW = BOARD_COLS * HEX_W + HEX_R; // 360
    const gridH = BOARD_ROWS * HEX_H * 2 + 12; // 348
    return { x: 0, y: 0, w: gridW + 2 * BOARD_PAD, h: gridH + 2 * BOARD_PAD };
  }
  /** Board hex-grid scale — always native (1); the projection does the scaling. */
  private get boardScale(): number {
    return 1;
  }
  /** Hex radius for drag highlight (board-space; projected per-vertex). */
  private get hexR(): number {
    return HEX_R * this.boardScale;
  }
  /**
   * Circumradius for the drawn ground tiles — the tessellating pointy-top size
   * (HEX_TILE_R) so adjacent tiles share edges and the field reads as one
   * continuous surface (no inter-hex gap), scaled by boardScale like the grid.
   */
  private get hexTileR(): number {
    return HEX_TILE_R * this.boardScale;
  }
  /** Unit-token base radius on the board (board-space; depth-scaled at draw). */
  private get boardTokenR(): number {
    return Math.round(16 * this.boardScale);
  }

  /** Hex-board horizontal offset — centers the grid in its source frame. */
  private get boardOffsetX(): number {
    const f = this.gridFrame;
    // Cell-center span is (BOARD_COLS-1)·HEX_W + HEX_R (the odd-row shift adds the
    // trailing HEX_R); centering that span centers the symmetric visual box too.
    const centerSpan = (BOARD_COLS - 1) * HEX_W + HEX_R;
    return f.x + f.w / 2 - centerSpan / 2;
  }
  /** Player-zone top hex row center y — centers the full grid in its source frame. */
  private get boardOffsetY(): number {
    const f = this.gridFrame;
    // Center the full grid (both 4-row halves + the 12px inter-zone gap) in the
    // frame, then nudge so the player half lands in the lower portion.
    return f.y + f.h / 2 + (HEX_H + 12) / 2;
  }
  /** Opponent-zone top hex row center y (mirrored above the player zone). */
  private get oppBoardOffsetY(): number {
    const s = this.boardScale;
    return this.boardOffsetY - BOARD_ROWS * HEX_H * s - 12 * s;
  }

  // ─── PERSPECTIVE PROJECTION (renderer-only) ──────────────────────────────────
  // Single transform for every board-space ⇄ screen conversion. Built from the
  // board panel rect; rebuilt only when that rect changes (layout/orientation).
  private projCache: { key: string; proj: BoardProjection } | null = null;
  private get proj(): BoardProjection {
    // Source = the native grid frame; destination = the on-screen board footprint.
    // The homography stretches the (near-square) grid onto the wide/shallow board.
    const dst = this.layout.regions.board;
    const key = `${dst.x},${dst.y},${dst.w},${dst.h}`;
    if (!this.projCache || this.projCache.key !== key) {
      this.projCache = { key, proj: makeBoardProjection(this.gridFrame, BOARD_TILT, dst) };
    }
    return this.projCache.proj;
  }
  /** Board-space point → tilted screen point. */
  private fwd(p: { x: number; y: number }): { x: number; y: number } {
    return this.proj.forward(p);
  }
  /** Depth scale (≈1 near, smaller far) at a board-space point. */
  private depthScaleAt(p: { x: number; y: number }): number {
    return this.proj.scaleAt(p);
  }
  /**
   * Map a stage-global pointer point into the board group's LOCAL space. The
   * board ground + grid + benches are all drawn in this space; routing every
   * board-plane hit-test through it keeps drag-to-hex / bench-slot placement
   * correct even if `boardGroup` is later given a flip/move/scale transform.
   * Identity transform today → a no-op pass-through.
   */
  private toBoardLocal(px: number, py: number): { x: number; y: number } {
    return this.boardGroup.toLocal({ x: px, y: py } as PIXI.PointData);
  }

  /**
   * Screen pointer → player-half board slot, routed through the board group's
   * local space then the inverse projection. Returns -1 when the pointer is
   * off-board or off every player hex.
   */
  private boardSlotAt(px: number, py: number): number {
    const lp = this.toBoardLocal(px, py);
    const bp = this.proj.inverse(lp);
    if (!bp) return -1;
    return hexFromPointer(bp.x, bp.y, this.boardOffsetX, this.boardOffsetY, this.boardScale);
  }

  // ─── TILTED BENCH (landscape) ────────────────────────────────────────────────
  // The bench lives on the SAME ground plane as the board: a board-space strip
  // butted directly against the grid frame's front (bottom) edge, projected
  // through the board's homography so it reads as a continuous front platform.
  // Its top edge maps exactly onto the board's near edge; perspective magnifies
  // it slightly toward the viewer. All rendering AND hit-testing go through the
  // same forward/inverse projection, so a drag lands on the right slot.

  /**
   * Board-space rect for the bench band (landscape only). Top = the grid frame's
   * front edge; bottom = the bench region's on-screen bottom mapped back onto the
   * board plane via the raw (off-board) inverse, so the projected platform lands
   * exactly in the bench region's vertical slot.
   */
  private benchBandRect(): { x: number; y: number; w: number; h: number } {
    const f = this.gridFrame;
    const dst = this.layout.regions.board;
    const bench = this.layout.regions.bench;
    const topY = f.y + f.h;
    const centerScreenX = dst.x + dst.w / 2; // board's vertical center line on screen
    const bottom = this.proj.inverseRaw({ x: centerScreenX, y: bench.y + bench.h });
    return { x: f.x, y: topY, w: f.w, h: Math.max(1, bottom.y - topY) };
  }

  /** Board-space rect for bench slot `i` (landscape; 9 equal columns of the band). */
  private benchSlotBoardRect(i: number): { x: number; y: number; w: number; h: number } {
    const band = this.benchBandRect();
    const slotW = band.w / 9;
    return { x: band.x + i * slotW, y: band.y, w: slotW, h: band.h };
  }

  // ─── TOP BENCH (the second-player bench) ─────────────────────────────────────
  // A mirror of the bottom bench, butted against the board's BACK (far/top) edge
  // and filling RIGHT-TO-LEFT (slot 0 = the rightmost cell). Built from the SAME
  // geometry helpers as the bottom bench so it behaves identically when later
  // populated. Our POV has no second-player bench state, so it renders EMPTY.

  /**
   * Board-space rect for the TOP bench band (landscape): a strip butted against
   * the grid frame's BACK (top) edge, the same board-space height as the bottom
   * bench band so the two mirror exactly across the board.
   */
  private topBenchBandRect(): { x: number; y: number; w: number; h: number } {
    const f = this.gridFrame;
    const bottomBand = this.benchBandRect();
    // Same height as the bottom band; placed above the board's back edge.
    return { x: f.x, y: f.y - bottomBand.h, w: f.w, h: bottomBand.h };
  }

  /** Portrait top-bench row geometry (mirror of the bottom row, above the board). */
  private topBenchGeomPortrait(): { slotW: number; slotH: number; startCx: number; centerY: number } {
    const { slotW, slotH, startCx } = this.benchGeom();
    const board = this.layout.regions.board;
    // Sit the row just above the board panel's top edge (same slot height as the
    // bottom bench). Clamp so it never leaves the design space on short viewports.
    const gap = 4;
    const centerY = Math.max(slotH / 2, board.y - gap - slotH / 2);
    return { slotW, slotH, startCx, centerY };
  }

  /** Pixel center of TOP bench slot `i` (right-to-left fill; orientation-aware). */
  private topBenchSlotCenter(i: number): { x: number; y: number } {
    const col = 8 - i; // right-to-left: slot 0 is the rightmost column
    if (this.isLandscape) {
      const band = this.topBenchBandRect();
      const slotW = band.w / 9;
      const cx = band.x + (col + 0.5) * slotW;
      const cy = band.y + band.h / 2;
      return this.fwd({ x: cx, y: cy });
    }
    const { slotW, startCx, centerY } = this.topBenchGeomPortrait();
    return { x: startCx + col * slotW, y: centerY };
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
    this.renderSkipButton(); // re-pin the playtest Skip pill (or keep it hidden)
  }

  private render(state: MatchState): void {
    const me = state.players[this.driver.seatIndex];
    if (!me) return;
    this.renderHud(state, me);
    if (state.phase === "PLANNING") {
      // Peeking another player swaps ONLY the board view to their (mirrored)
      // board + trait strip; bench/shop/HUD stay mine. View-only, no mutation.
      const peeked = this.peekTargetId !== null ? state.players[this.peekTargetId] : null;
      if (peeked) {
        // Read-only peek: the board, trait strip, bench, and econ all show the
        // PEEKED player (mutations are blocked elsewhere via peekTargetId guards).
        this.scoutLayer.removeChildren();
        this.renderPeekBoard(peeked);
        // Peeked trait strip (traits only — never the item-browse tab, which would
        // read the peeked player's PRIVATE inventory).
        if (this.isLandscape) {
          this.traitLayer.removeChildren();
          this.drawTraitRailContent(peeked);
        } else {
          this.renderTraitStrip(peeked);
        }
        this.renderPeekBench(peeked);
        this.renderTopBench(); // empty second-player bench (same layout as own POV)
        this.renderPeekEcon(peeked);
      } else {
        this.scoutLayer.removeChildren();
        this.renderBoard(me);
        if (this.isLandscape) this.renderRailTabs(me);
        else this.renderTraitStrip(me);
        this.renderBench(me);
        this.renderTopBench(); // empty second-player bench (top edge of the board)
        this.renderShop(me);
        this.renderShopToggle(me);
        this.renderShopPanel(me);
      }
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
    size: number, fill: number, anchor: [number, number] = [0, 0],
    weight: string = "400"
  ): PIXI.Text {
    const t = new PIXI.Text(str, { fontSize: size, fill, fontFamily: "monospace", fontWeight: weight as PIXI.TextStyleFontWeight });
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

  /**
   * Playtest-only Skip pill. Independent top-most overlay (its own layer), pinned
   * top-center directly below the stage/timer — it does NOT touch any layout
   * cluster's anchoring or sizing. Shown only during PLANNING and only when the
   * driver owns the planning clock (LocalDriver exposes skipPlanning; NetDriver
   * omits it, so online stays server-paced and the pill never appears). On click
   * it fires the driver's normal planning-timer expiry path — no sim bypass.
   */
  private renderSkipButton(): void {
    this.skipLayer.removeChildren();
    const skip = this.driver.skipPlanning;
    if (typeof skip !== "function") return; // online / server-paced → hidden
    if (this.driver.getState().phase !== "PLANNING") return;

    const status = this.layout.regions.statusRow;
    const board = this.layout.regions.board;
    const w = 52;
    const h = 20;
    const cx = board.x + board.w / 2; // board center, beneath the stage bar
    const x = cx - w / 2;
    // Top-to-bottom stack: stage bar → progress capsule → Skip. Pin Skip 4px
    // below the progress capsule so the widgets never overlap.
    const y = MatchScene.stageBarBottomY(status.y) + 4;
    const g = this.chip(this.skipLayer, x, y, w, h, {
      fill: C.panelBg,
      fillAlpha: 0.95,
      border: C.accentGold,
      borderW: 1,
      radius: 10,
    });
    g.eventMode = "static";
    g.cursor = "pointer";
    this.text(this.skipLayer, "Skip", cx, y + h / 2, 11, C.textGold, [0.5, 0.5]);
    this.pressFeedback(g, () => this.driver.skipPlanning?.(), { cx: x + w / 2, cy: y + h / 2 });
  }

  // ─── HUD: status row + opponent rail ─────────────────────────────────────────

  /**
   * Top-center stage bar: ONE unified trapezoidal teal-glass plaque pinned at the
   * very top of the status row, centered over the board's center X. Left→right:
   *   (A) a stage-marker glyph + bold "X-Y" stage-round label,
   *   (B) a round-schedule strip — one icon per round in the CURRENT stage
   *       (swords=PvP, gem=PvE, monster=final/boss PvE), the current round's icon
   *       gold + larger with an up-chevron beneath it, completed rounds dimmer,
   *       upcoming neutral,
   *   (C) a clock glyph + bold remaining-seconds (hpLow tint under 5s),
   * plus a separate thin teal progress capsule beneath it that depletes
   * left→right with the timer. Static (no animation) — reduced-motion-agnostic.
   * Pure render-from-state: every value derives from MatchState via the rules
   * helpers stageForRound / isPveRound + the driver's planning clock. Rebuilt each
   * render() pass (and the seconds number live-updated by startPlanningTimerTick).
   */
  private renderStageBar(centerX: number, statusY: number, state: MatchState): void {
    const barW = 184;
    const barH = MatchScene.STAGE_BAR_H;
    const slant = 7;
    const barX = Math.round(centerX - barW / 2);
    const topY = MatchScene.stageBarTopY(statusY);
    const bottomY = topY + barH;
    const cy = topY + barH / 2;

    // Stage / round-within-stage from the pure rules helper (the structural
    // source: stage 1 = 3 rounds, stages 2+ = 7) — a pure read of state.round.
    const { stage, roundInStage } = stageForRound(state.round);
    const roundsInStage = stage === 1 ? 3 : 7; // structural stage length (mirror rounds.ts)
    const stageStartRound = state.round - (roundInStage - 1); // first abs round of this stage

    // ── Trapezoid bg + border (`\___/`: top edge wider than the bottom) ──────
    const poly = [
      barX,                  bottomY,  // bottom-left
      barX + barW,           bottomY,  // bottom-right
      barX + barW + slant,   topY,     // top-right (wider)
      barX - slant,          topY,     // top-left  (wider)
    ];
    const bar = new PIXI.Graphics();
    bar.eventMode = "none";
    bar.poly(poly).fill({ color: C.stageBarBg, alpha: 0.93 });
    bar.poly(poly).stroke({ width: 1, color: C.stageBarBorder, alpha: 0.6 });
    // Emphasize the bottom edge (the reference's border reads heaviest there).
    bar.moveTo(barX, bottomY).lineTo(barX + barW, bottomY);
    bar.stroke({ width: 2, color: C.stageBarBorder, alpha: 1 });
    this.hudLayer.addChild(bar);

    // ── Zone A — stage marker (glyph + "X-Y") ────────────────────────────────
    const ax = barX + 8;
    this.glyph(this.hudLayer, "banner", ax + 6, cy, 13, C.textPrimary);
    this.text(this.hudLayer, `${stage}-${roundInStage}`, ax + 16, cy, 12, C.textPrimary, [0, 0.5], "700");

    // ── Zone B — round schedule strip ────────────────────────────────────────
    const pitch = 13;
    const stripW = (roundsInStage - 1) * pitch;
    const stripStartX = barX + 56; // after Zone A (40px) + 8px pad + 6px gap ≈ 54
    const stripBaseX = Math.round(stripStartX + (96 - stripW) / 2); // center within the ~96px Zone B
    const iconG = new PIXI.Graphics();
    iconG.eventMode = "none";
    for (let i = 0; i < roundsInStage; i++) {
      const roundNo = i + 1;
      const icx = stripBaseX + i * pitch;
      const absRound = stageStartRound + i;
      const pve = isPveRoundAbs(absRound);
      const last = roundNo === roundsInStage;
      const kind: GlyphKind = !pve ? "swords" : last ? "monster" : "gem";
      if (roundNo === roundInStage) {
        // Current round → gold, larger, nudged up 1px, with an up-chevron beneath.
        this.glyph(this.hudLayer, kind, icx, cy - 1, 13, C.accentGold);
        const chTop = cy - 1 + 13 / 2 + 2; // 2px below the (13px) icon's bottom edge
        iconG.moveTo(icx - 2.5, chTop + 2.5).lineTo(icx, chTop).lineTo(icx + 2.5, chTop + 2.5);
        iconG.stroke({ width: 1.2, color: C.accentGold, alpha: 1, cap: "round", join: "round" });
      } else {
        // Completed dimmer than upcoming (subtle 2-tier ramp; gold is the signal).
        const dimmer = new PIXI.Graphics();
        drawGlyph(dimmer, kind, icx, cy, 9, C.textMuted);
        dimmer.alpha = roundNo < roundInStage ? 0.55 : 0.85;
        dimmer.eventMode = "none";
        this.hudLayer.addChild(dimmer);
      }
    }
    this.hudLayer.addChild(iconG);

    // ── Zone C — clock glyph + remaining seconds ─────────────────────────────
    this.planningTimerText = null;
    const timeLeft = this.driver.getPlanningTimeLeft();
    const planning = state.phase === "PLANNING" && timeLeft > 0;
    const secs = Math.max(0, Math.ceil(timeLeft / 1000));
    const urgent = secs <= 5;
    const clockCx = barX + barW - 8 - 22; // right-aligned timer block (~22px wide)
    this.glyph(this.hudLayer, "clock", clockCx, cy, 11, C.textPrimary);
    if (planning) {
      this.planningTimerText = this.text(
        this.hudLayer, `${secs}`, clockCx + 9, cy, 12,
        urgent ? C.hpLow : C.textPrimary, [0, 0.5], "700"
      );
    } else {
      this.text(this.hudLayer, state.phase.slice(0, 4), clockCx + 9, cy, 8, C.textMuted, [0, 0.5]);
    }

    // ── Progress capsule beneath the bar (depletes left→right) ───────────────
    // Retained + its geometry stored so the planning ticker can redraw the fill
    // every frame from the LIVE clock (getPlanningTimeLeft), draining smoothly
    // rather than only on a state-changing re-render.
    const pgY = bottomY + MatchScene.STAGE_PROGRESS_GAP;
    const pgH = MatchScene.STAGE_PROGRESS_H;
    const pg = new PIXI.Graphics();
    pg.eventMode = "none";
    this.hudLayer.addChild(pg);
    this.planningProgressBar = planning ? pg : null;
    this.planningProgressGeom = { x: barX, y: pgY, w: barW, h: pgH };
    if (planning) {
      this.redrawPlanningProgress(timeLeft);
    } else {
      pg.roundRect(barX, pgY, barW, pgH, 2).fill({ color: C.stageBarTrack, alpha: 0.5 });
    }
  }

  /** Redraw the retained stage-bar progress capsule from a live remaining-time
   * value (ms). Called by renderStageBar and per-frame by the planning ticker so
   * the bar drains smoothly with the countdown number. Depletes LEFT→RIGHT: the
   * remaining portion is anchored at the RIGHT edge and recedes rightward (the
   * left empties first). Presentation only. */
  private redrawPlanningProgress(timeLeft: number): void {
    const pg = this.planningProgressBar;
    const geom = this.planningProgressGeom;
    if (!pg || !geom) return;
    const secs = Math.max(0, Math.ceil(timeLeft / 1000));
    const urgent = secs <= 5;
    const frac = Math.max(0, Math.min(1, timeLeft / PLANNING_TIMER_MS));
    const fillW = Math.max(0, geom.w * frac);
    pg.clear();
    pg.roundRect(geom.x, geom.y, geom.w, geom.h, 2).fill({ color: C.stageBarTrack, alpha: 0.9 });
    if (fillW > 0) {
      // Right-anchored fill: empties from the left edge, remaining portion hugs
      // the right edge and shrinks rightward as time runs out.
      pg.roundRect(geom.x + geom.w - fillW, geom.y, fillW, geom.h, 2)
        .fill({ color: urgent ? C.hpLow : C.stageProgress, alpha: 1 });
    }
  }

  /**
   * Top-RIGHT ☰ pause button, drawn into the HUD layer so it scales/positions
   * with the viewport. Sits immediately to the LEFT of the "Player 1" (seat 0)
   * rail entry, vertically aligned with that row (HAMBURGER_RAIL_GAP apart).
   * Fires `onPause` on tap (the shell owns the pause modal). The shop panel layer
   * is above the HUD, so an open shop overlays it via z.
   */
  private renderPauseButton(rail: { x: number; y: number; w: number; h: number }): void {
    const w = 30, h = 22;
    // Seat 0 = "Player 1": portrait rail is 8×1 (seat 0 leftmost), landscape is
    // 1×8 (seat 0 top row). Pin the button just left of that tile, centered on it.
    const tile = this.isLandscape
      ? opponentRailTile(0, 1, 8, rail)
      : opponentRailTile(0, 8, 1, rail);
    const x = Math.round(tile.tileX - HAMBURGER_RAIL_GAP - w);
    const y = Math.round(tile.tileY + tile.tileH / 2 - h / 2);
    const g = new PIXI.Graphics();
    g.roundRect(x, y, w, h, 6).fill({ color: C.panelBg, alpha: 0.95 });
    g.roundRect(x, y, w, h, 6).stroke({ width: 1, color: C.chipBorder });
    // ☰ glyph: three horizontal bars.
    const barW = 14;
    const bx = x + (w - barW) / 2;
    for (let i = 0; i < 3; i++) {
      g.rect(bx, y + 6 + i * 5, barW, 1.6).fill({ color: C.textPrimary });
    }
    g.eventMode = "static";
    g.hitArea = new PIXI.Rectangle(x, y, w, h);
    g.cursor = "pointer";
    this.pressFeedback(g, () => this.opts.onPause(), { cx: x + w / 2, cy: y + h / 2 });
    this.hudLayer.addChild(g);
  }

  /** Lazily build (once) and return the cosmetic seat→avatar map for this match.
   *  Generated on first opponent-rail render and never re-rolled, so every later
   *  render reads the same stable assignment. Cosmetic only (not sim state). */
  private getAvatarAssignment(): Map<number, number> {
    if (!this.avatarAssignment) {
      this.avatarAssignment = generateAvatarAssignment();
    }
    return this.avatarAssignment;
  }

  /**
   * Draw a seat's avatar clipped to the rail circle at (cx, cy, r). The bundled
   * PNG already carries its rarity ring, so NO second ring is stacked on top —
   * any current-opponent / self emphasis is drawn UNDER the portrait (a thin
   * accent disc that peeks as a hairline), and eliminated seats dim. Falls back
   * to the panelBg disc + glyph when the texture hasn't loaded yet.
   * Returns true if the portrait texture was drawn (caller skips the glyph then).
   */
  private drawSeatAvatar(
    cx: number,
    cy: number,
    r: number,
    seat: number,
    opts: { elim: boolean; accent: number | null }
  ): boolean {
    const alpha = opts.elim ? 0.4 : 1;
    const avatarNum = this.getAvatarAssignment().get(seat) ?? PLAYER_1_AVATAR_NUM;
    requestAvatarArt(avatarNum);
    const tex = resolveAvatarTexture(avatarNum, avatarTextureLookup);

    // Accent: thin disc UNDER the portrait, slightly larger so it reads as a
    // hairline rim (subtle), never a heavy ring stroke over the rarity artwork.
    if (opts.accent !== null) {
      const ring = new PIXI.Graphics();
      ring.circle(cx, cy, r + 1.5).fill({ color: opts.accent, alpha });
      this.hudLayer.addChild(ring);
    }

    if (tex) {
      const sprite = new PIXI.Sprite(tex);
      sprite.anchor.set(0.5);
      sprite.position.set(cx, cy);
      const d = r * 2;
      const src = Math.max(1, tex.width, tex.height);
      sprite.scale.set(d / src);
      sprite.alpha = alpha;
      const mask = new PIXI.Graphics();
      mask.circle(cx, cy, r).fill({ color: C.textPrimary });
      sprite.mask = mask;
      this.hudLayer.addChild(mask, sprite);
      return true;
    }

    // Fallback while loading (or if absent): the prior empty disc.
    const disc = new PIXI.Graphics();
    disc.circle(cx, cy, r).fill({ color: C.panelBg, alpha });
    this.hudLayer.addChild(disc);
    return false;
  }

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

    // ── A. Stage bar ─────────────────────────────────────────────────────────
    // One unified trapezoidal teal-glass bar centered over the BOARD center X,
    // pinned to the very top of the status row: stage marker + "X-Y" label on the
    // left, the round-schedule strip (one icon per round of the current stage,
    // current round gold + chevron) in the center, the clock + remaining seconds
    // on the right, and a thin teal progress capsule beneath it that depletes
    // with the timer. The DOM ☰ pause / exit "X" stays a standalone top-LEFT
    // control (untouched). See renderStageBar.
    const board = regions.board;
    const boardCenterX = board.x + board.w / 2;
    this.renderStageBar(boardCenterX, status.y, state);

    // Top-RIGHT ☰ pause button — rendered in the HUD layer so it scales and
    // repositions with the viewport like the rest of the chrome, placed just
    // left of the "Player 1" rail entry. The shop panel layer sits above the
    // HUD, so it overlays this button via z-ordering (no hide-while-shop
    // workaround needed).
    this.renderPauseButton(rail);

    // ── B. Opponent rail: 8 seat tiles ──────────────────────────────────────
    // Portrait: a single horizontal row of 8 tiles. Landscape: a single 1×8
    // vertical column of compact horizontal tiles in the right rail.
    const myPairing = this.driver.getMyPairing();
    const currentOpp = myPairing && !myPairing.isGhost ? myPairing.opponentId : -1;
    if (this.isLandscape) {
      this.renderOpponentColumn(state, rail, currentOpp);
      return;
    }
    const cols = 8;
    const rows = 1;
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

      // Avatar portrait (rarity ring baked into the PNG). The current opponent /
      // self emphasis is a subtle hairline accent UNDER the portrait, never a
      // second ring stroke over it.
      const accent =
        i === currentOpp ? C.textCombat : isSelf ? C.tier3 : null;
      const drewPortrait = this.drawSeatAvatar(cx, cy, av, i, { elim, accent });

      // Seat number: only a fallback label when the portrait isn't loaded (so the
      // artwork is never covered). Level label below the disc stays either way.
      if (!drewPortrait) {
        this.text(this.hudLayer, `${i + 1}`, cx, cy - 1, 10, elim ? C.textMuted : C.textPrimary, [0.5, 0.5]);
      }
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
        hit.on("pointerdown", () => this.enterPeek(capturedId));
        this.hudLayer.addChild(hit);
      }
      // Returning to my own board is done via the return-to-board medallion
      // (renderReturnToBoardButton), not by tapping my own avatar; tapping a
      // DIFFERENT player's avatar still switches the peek to that player.
    }
  }

  /**
   * Landscape opponent rail: a single 1×8 vertical column, stacked top-to-bottom
   * in seat order, right-aligned and hugging the rail's right edge. Each row is
   * an avatar disc on the RIGHT with a right-aligned two-line text block to its
   * left (nickname on top, current HP below). Presentation only.
   */
  private renderOpponentColumn(
    state: MatchState,
    rail: { x: number; y: number; w: number; h: number },
    currentOpp: number
  ): void {
    const av = 16; // enlarged (~1.8× the prior 9) so a glyph reads inside
    const rightPad = 6;
    for (let i = 0; i < 8; i++) {
      const p = state.players[i];
      if (!p) continue;
      const tile = opponentRailTile(i, 1, 8, rail);
      const { tileX, tileY, tileW, tileH } = tile;
      const cy = tileY + tileH / 2;
      const discCx = tileX + tileW - rightPad - av; // avatar anchored on the right
      const textRightX = discCx - av - 7; // text block right-aligned left of the disc
      const isSelf = i === this.driver.seatIndex;
      const elim = !p.alive;
      const scoutable = !isSelf && p.alive && state.phase === "PLANNING";

      // Avatar portrait (rarity ring baked into the PNG). Current-opponent / self
      // emphasis is a subtle hairline accent under the portrait, not a ring over it.
      const accent = i === currentOpp ? C.textCombat : isSelf ? C.tier3 : null;
      const drewPortrait = this.drawSeatAvatar(discCx, cy, av, i, { elim, accent });
      if (!drewPortrait) {
        // Fallback glyph inside the disc until the portrait loads.
        this.glyph(
          this.hudLayer, "helmet", discCx, cy + 1, av * 1.35,
          elim ? C.textMuted : isSelf ? C.tier3 : C.textPrimary
        );
      }

      // Two-line text block, right-aligned: nickname (placeholder) on top, HP below.
      this.text(this.hudLayer, `Player ${i + 1}`, textRightX, cy - 6, 9, elim ? C.textMuted : C.textPrimary, [1, 0.5]);
      this.text(this.hudLayer, `${p.hp}`, textRightX, cy + 6, 10, elim ? C.textMuted : C.hpGreen, [1, 0.5]);

      if (scoutable) {
        const hit = new PIXI.Graphics();
        hit.rect(tileX, tileY, tileW, tileH).fill({ color: C.bgOverlay, alpha: 0.001 });
        hit.eventMode = "static";
        hit.cursor = "pointer";
        const capturedId = i;
        hit.on("pointerdown", () => this.enterPeek(capturedId));
        this.hudLayer.addChild(hit);
      }
      // Returning to my own board is the return-to-board medallion's job (see
      // renderReturnToBoardButton); tapping a DIFFERENT player's avatar still
      // switches the peek to that player.
    }
  }

  // ─── BOARD ───────────────────────────────────────────────────────────────

  /** Board-bg panel behind the hex tiles (shared by planning + combat). The panel
   *  is the board's ground plane, so it is projected to the perspective trapezoid
   *  (its four corners become the projected board corners). */
  private drawBoardPanel(layer: PIXI.Container): void {
    const c = this.proj.corners;
    const panel = new PIXI.Graphics();
    // Projected trapezoid: fill, outer border, then a faint inset rim so the
    // board reads as a raised, tilted ground plane rather than a flat rectangle.
    const quad = [c.tl.x, c.tl.y, c.tr.x, c.tr.y, c.br.x, c.br.y, c.bl.x, c.bl.y];
    panel.poly(quad).fill({ color: C.boardBg, alpha: 0.92 });
    panel.poly(quad).stroke({ width: 1, color: C.boardBorder, alpha: 0.9 });
    // Inset rim: project a 1px-inset board-space frame through the same transform.
    const f = this.gridFrame;
    const i0 = this.fwd({ x: f.x + 1, y: f.y + 1 });
    const i1 = this.fwd({ x: f.x + f.w - 1, y: f.y + 1 });
    const i2 = this.fwd({ x: f.x + f.w - 1, y: f.y + f.h - 1 });
    const i3 = this.fwd({ x: f.x + 1, y: f.y + f.h - 1 });
    panel.poly([i0.x, i0.y, i1.x, i1.y, i2.x, i2.y, i3.x, i3.y]).stroke({ width: 1, color: C.surfaceFloat, alpha: 0.25 });
    panel.eventMode = "none";
    layer.addChild(panel);
  }

  /**
   * Arena torch pillars flanking the board as a gold meter (renderer-only). Five
   * cylindrical pillars stand along each board edge on the SAME ground plane as
   * the hexes — projected through the board homography so they recede with the
   * perspective (front larger, back smaller) and depth-sorted so nearer pillars
   * draw over farther ones. The gold→torch mapping is pure presentation
   * (`torchMeter`): lit = floor(gold/10) capped at 5.
   *
   * LEFT column = MY gold, always (planning + combat), lit front→back, flanking
   * the front half. RIGHT column = the OPPONENT's, always visible (mirroring the
   * player so the arena reads symmetric) flanking the back half — but its flames
   * only LIGHT during combat (per the opponent's gold; 0 for PvE mobs / bye),
   * lit back→front; the pillars stay unlit during planning.
   */
  private drawArenaTorches(layer: PIXI.Container, me: PlayerState, combat: boolean): void {
    const f = this.gridFrame;
    const leftX = f.x;            // board-space left frame edge
    const rightX = f.x + f.w;     // board-space right frame edge
    // board-space y for pillar index i (0 = back/far, last = front/near) within
    // a side's [back, front] half-board fraction span.
    const yAt = (i: number, back: number, front: number): number => {
      const t = back + (front - back) * (i / (TORCHES_PER_SIDE - 1));
      return f.y + t * f.h;
    };

    type Pillar = { sx: number; sy: number; scale: number; lit: boolean; y: number };
    const pillars: Pillar[] = [];

    // Board-space front-back nudge: each candle shifts 0.6 hex-heights along the
    // board's y axis BEFORE projection, so the offset foreshortens with the
    // perspective. Player (left) candles slide toward the FRONT/bottom border
    // (+y); opponent (right) candles slide toward the BACK/top border (−y).
    const candleDy = 0.6 * HEX_H;

    // Screen-space horizontal nudge applied AFTER projection so each column sits
    // a fixed half-candle gap outward from the board edge regardless of depth.
    const pushColumn = (
      boardX: number, flags: boolean[], back: number, front: number, dy: number, screenDx: number
    ): void => {
      for (let i = 0; i < TORCHES_PER_SIDE; i++) {
        const by = yAt(i, back, front) + dy;
        const base = this.fwd({ x: boardX, y: by });
        pillars.push({ sx: base.x + screenDx, sy: base.y, scale: this.depthScaleAt({ x: boardX, y: by }), lit: flags[i]!, y: by });
      }
    };

    // Player flanks the FRONT half (back-most pillar at the midline); shifted left.
    pushColumn(leftX, torchLit(me.gold, "left"), TORCH_MID, TORCH_FRONT, candleDy, -CANDLE_COLUMN_SCREEN_OFFSET);
    // Opponent flanks the BACK half, always drawn; lit only during combat; shifted right.
    const oppFlags = combat ? torchLit(this.opponentGold(), "right") : new Array<boolean>(TORCHES_PER_SIDE).fill(false);
    pushColumn(rightX, oppFlags, TORCH_BACK, TORCH_MID, -candleDy, CANDLE_COLUMN_SCREEN_OFFSET);

    // Depth-sort: far (smaller board y) first so nearer pillars overlap them.
    pillars.sort((a, b) => a.y - b.y);
    for (const p of pillars) {
      const g = new PIXI.Graphics();
      g.eventMode = "none";
      this.drawTorchPillar(g, p.sx, p.sy, p.scale, p.lit);
      layer.addChild(g);
    }
  }

  /**
   * Opponent gold for the RIGHT torch column during combat. Read straight off the
   * match snapshot (presentation only); 0 for PvE / bye / ghost or when the
   * opponent's gold is private (online — opponent gold isn't in the public
   * snapshot, so the column simply reads empty).
   */
  private opponentGold(): number {
    if (this.driver.isPveRound()) return 0;
    const pairing = this.driver.getMyPairing();
    if (!pairing || pairing.isGhost || pairing.opponentId < 0) return 0;
    return this.driver.getState().players[pairing.opponentId]?.gold ?? 0;
  }

  /** One tealight candle: a squat, wide wax disc with a small flame (lit) / cold wick (unlit). */
  private drawTorchPillar(g: PIXI.Graphics, cx: number, baseY: number, scale: number, lit: boolean): void {
    const w = TORCH_W * scale;
    const h = TORCH_H * scale;
    const half = w / 2;
    const topY = baseY - h;            // wax rim sits at the candle top
    const sw = Math.max(1, scale);     // depth-scaled outline weight

    // Contact shadow on the ground plane.
    g.ellipse(cx, baseY, half * 1.05, half * 0.34).fill({ color: C.torchStoneDark, alpha: 0.45 });
    // Squat wax body (short, wide) + shaded outline.
    g.roundRect(cx - half, topY, w, h, half * 0.32).fill({ color: C.torchStone });
    g.roundRect(cx - half, topY, w, h, half * 0.32).stroke({ width: sw, color: C.torchStoneDark, alpha: 0.85 });
    // Wax rim (top ellipse) — the recessed pool the flame sits in.
    g.ellipse(cx, topY, half * 0.92, half * 0.26).fill({ color: C.torchStoneDark });

    if (lit) {
      // Small flame on top — width tracks the candle WIDTH (now a thicker
      // teardrop with the doubled base), but its HEIGHT is held at the original
      // absolute value (decoupled from the wider half) so the flame got wider,
      // not taller.
      const fw = half * 0.42;
      const fh = half * 0.21 * 2.6;
      const flameBase = topY - half * 0.06;
      // Soft warm glow behind the flame.
      g.circle(cx, flameBase - fh * 0.4, fw * 1.9).fill({ color: C.torchGlow, alpha: 0.16 });
      // Outer flame teardrop.
      g.moveTo(cx, flameBase);
      g.quadraticCurveTo(cx - fw, flameBase - fh * 0.45, cx, flameBase - fh);
      g.quadraticCurveTo(cx + fw, flameBase - fh * 0.45, cx, flameBase);
      g.fill({ color: C.torchFlame });
      // Inner bright core.
      const ih = fh * 0.58;
      const iw = fw * 0.5;
      const iy = flameBase - fh * 0.1;
      g.moveTo(cx, iy);
      g.quadraticCurveTo(cx - iw, iy - ih * 0.45, cx, iy - ih);
      g.quadraticCurveTo(cx + iw, iy - ih * 0.45, cx, iy);
      g.fill({ color: C.torchFlameCore });
    } else {
      // Extinguished: a cold dim ember pooled in the wax.
      g.ellipse(cx, topY, half * 0.5, half * 0.18).fill({ color: C.torchUnlit, alpha: 0.7 });
    }
  }

  private renderBoard(me: PlayerState): void {
    this.boardLayer.removeChildren();
    this.drawBoardPanel(this.boardLayer);
    this.drawArenaTorches(this.boardLayer, me, false);
    const offX = this.boardOffsetX;
    const playerY = this.boardOffsetY;
    const oppY = this.oppBoardOffsetY;
    const s = this.boardScale;
    const hexR = this.hexTileR; // tessellating tile size — no inter-hex gap
    const tokR = this.boardTokenR;

    // Only a UNIT drag (not an item drag) makes player hexes valid drop targets.
    const unitDragging = this.isDragging && this.dragItem === null;

    // Enemy zone (top 4 rows) — darker tint, untargetable during planning. While
    // dragging a unit, dim it so it reads as "not a valid drop zone". A PvE round
    // tints the enemy half with the warm mobZone (mirrors onCombatPhase) so the
    // creep round reads as PvE — the hex tiles stay non-interactive either way.
    const isPveRound = this.driver.isPveRound();
    const enemyZone = isPveRound ? C.mobZone : C.enemyHex;
    const fwd = (p: { x: number; y: number }): { x: number; y: number } => this.fwd(p);

    // ── Enemy zone fills (top 4 rows) — seamless tessellation, NO per-tile
    // borders (the grid pass below draws the uniform cell lines so neighbour
    // fills can never paint over them). Dimmed while dragging a unit;
    // non-interactive. ───────────────────────────────────────────────────────
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let q = 0; q < BOARD_COLS; q++) {
        const bp = hexToPixel(q, r, offX, oppY, s);
        const g = new PIXI.Graphics();
        drawHex(g, bp.x, bp.y, hexR, enemyZone, unitDragging ? 0.4 : 1, {}, fwd);
        g.eventMode = "none";
        this.boardLayer.addChild(g);
      }
    }

    // Enemy-zone grid lines: clean, uniform cell borders computed in flat board
    // space and projected with the tilt, drawn over the fills but under the mob
    // tokens. One stroke pass → shared tessellated edges composite once (uniform
    // line alpha). Dimmed while dragging (not a valid drop zone).
    const enemyGrid = new PIXI.Graphics();
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let q = 0; q < BOARD_COLS; q++) {
        const bp = hexToPixel(q, r, offX, oppY, s);
        addHexPath(enemyGrid, bp.x, bp.y, hexR, fwd);
      }
    }
    enemyGrid.stroke({ width: 1, color: C.boardBorder, alpha: unitDragging ? 0.12 : 0.4 });
    enemyGrid.eventMode = "none";
    this.boardLayer.addChild(enemyGrid);

    // PvE creep preview: render the upcoming mob board (real BoardState from rules
    // via the driver) on the enemy half so the planned-for round is visible inline
    // instead of behind a scout overlay. Mob tokens are READ-ONLY — the only
    // interaction is long-press → inspect (the same armInspect path as board
    // units; inspectModel resolves a defId absent from data.units). No drag.
    if (isPveRound) {
      const mobBoard = this.driver.getUpcomingPveBoard();
      if (mobBoard) {
        for (const unit of mobBoard.units) {
          const displayRow = unit.pos.r - BOARD_ROWS; // enemy-half row → 0..BOARD_ROWS-1
          if (displayRow < 0 || displayRow >= BOARD_ROWS) continue;
          const bp = hexToPixel(unit.pos.q, displayRow, offX, oppY, s);
          const sp = this.fwd(bp);
          const sc = this.depthScaleAt(bp);
          const uc = new PIXI.Container();
          uc.eventMode = "static";
          uc.cursor = "default";
          const u = unit;
          uc.on("pointerdown", (e: PIXI.FederatedPointerEvent) => this.armInspect(u.defId, u, e));
          uc.on("pointerup", () => this.clearPress());
          uc.on("pointerupoutside", () => this.clearPress());
          // withBars=false: the neutral mobTint ring fires automatically because
          // the mob defId is absent from data.units (no extra theming here).
          // Depth-scaled piece; bars/pips stay upright + screen-aligned.
          drawUnit(uc, unit, sp.x, sp.y, Math.round(tokR * sc), false, false, true);
          this.boardLayer.addChild(uc);
        }
      }
    }

    // Player zone (bottom 4 rows) fills — selection / occupied-swap tints; each
    // tile's projected polygon is its own Pixi hit area, so a tap lands on the
    // hex actually under the finger at the tilted angle. Borders come from the
    // grid pass below (no per-tile border here).
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let q = 0; q < BOARD_COLS; q++) {
        const slotIdx = r * BOARD_COLS + q;
        const bp = hexToPixel(q, r, offX, playerY, s);
        const isSelected = this.selectedBoardIdx === slotIdx && me.board[slotIdx] != null;
        const occupied = me.board[slotIdx] != null;
        const fill = isSelected
          ? C.bgBoardSel
          : unitDragging && occupied ? C.bgBoardDragOver : C.myHex;
        const g = new PIXI.Graphics();
        drawHex(g, bp.x, bp.y, hexR, fill, 1, {}, fwd);
        const sp = this.fwd(bp);
        g.eventMode = "static";
        g.cursor = "pointer";
        g.on("pointerdown", () => this.onHexPointerDown(slotIdx, me, sp.x, sp.y));
        this.boardLayer.addChild(g);
      }
    }

    // Player-zone grid lines: uniform cell borders over the fills, under the unit
    // tokens (one stroke pass → uniform alpha). While dragging a unit these cells
    // highlight green to read as valid drop targets.
    const playerGrid = new PIXI.Graphics();
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let q = 0; q < BOARD_COLS; q++) {
        const bp = hexToPixel(q, r, offX, playerY, s);
        addHexPath(playerGrid, bp.x, bp.y, hexR, fwd);
      }
    }
    playerGrid.stroke(
      unitDragging
        ? { width: 2, color: C.hpGreen, alpha: 0.6 }
        : { width: 1, color: C.boardBorder, alpha: 0.4 }
    );
    playerGrid.eventMode = "none";
    this.boardLayer.addChild(playerGrid);

    // Draw units. Slot index order already runs back row → front row, so units
    // are added back-to-front and a nearer (larger, depth-scaled) unit renders in
    // front of a farther one. Each is positioned at forward(its board hex) but
    // drawn UPRIGHT and screen-aligned (no tile warp) — only depth-scaled.
    for (let idx = 0; idx < BOARD_SLOTS; idx++) {
      const unit = me.board[idx];
      if (!unit) continue;
      if (this.dragUnit?.uid === unit.uid) continue; // being dragged
      const q = idx % BOARD_COLS;
      const r = Math.floor(idx / BOARD_COLS);
      const bp = hexToPixel(q, r, offX, playerY, s);
      const sp = this.fwd(bp);
      const r2 = Math.round(tokR * this.depthScaleAt(bp));
      // Selected (tap-to-move) unit gets a halo ring OUTSIDE its tier ring so it
      // reads as "this unit is selected" — the hex fill alone is hidden behind it.
      if (this.selectedBoardIdx === idx && !this.isDragging) {
        const halo = new PIXI.Graphics();
        halo.circle(sp.x, sp.y, r2 + 4).stroke({ width: 2, color: C.tier3, alpha: 0.75 });
        halo.eventMode = "none";
        this.boardLayer.addChild(halo);
      }
      const uc = new PIXI.Container();
      uc.eventMode = "static";
      uc.cursor = "grab";
      uc.on("pointerdown", (e: PIXI.FederatedPointerEvent) => this.startDragBoard(idx, unit, e));
      uc.on("pointerup", () => this.clearPress());
      uc.on("pointerupoutside", () => this.clearPress());
      drawUnit(uc, unit, sp.x, sp.y, r2, this.selectedBenchIdx !== null || (this.selectedBoardIdx !== null && this.selectedBoardIdx !== idx), true, true);
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
    if (this.isLandscape) {
      // Tilted bench: project the board-space slot center through the board's
      // own homography (same plane as the board).
      const r = this.benchSlotBoardRect(i);
      return this.fwd({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
    }
    const { slotW, startCx } = this.benchGeom();
    return { x: startCx + i * slotW, y: this.benchCenterY };
  }

  /** Bench slot index under a pointer, or null (orientation-aware). */
  private benchSlotAt(px: number, py: number): number | null {
    // Both benches live inside the board group, so hit-test in its local space
    // (identity today → unchanged; correct if the group is ever transformed).
    const lp = this.toBoardLocal(px, py);
    if (this.isLandscape) {
      // Map the board-local point back onto the board plane (raw inverse — the
      // bench band lies BELOW the board rect) and resolve the column it falls in.
      const band = this.benchBandRect();
      const bp = this.proj.inverseRaw(lp);
      const marginY = band.h * 0.25; // forgiving band above/below the platform
      if (bp.x < band.x || bp.x > band.x + band.w) return null;
      if (bp.y < band.y - marginY || bp.y > band.y + band.h + marginY) return null;
      return Math.max(0, Math.min(8, Math.floor((bp.x - band.x) / (band.w / 9))));
    }
    const r = this.layout.regions.bench;
    if (lp.y < r.y - 7 || lp.y > r.y + r.h + 7) return null; // forgiving vertical band
    return benchSlotAtX(lp.x, this.benchGeom());
  }

  private renderBench(me: PlayerState): void {
    this.benchLayer.removeChildren();

    // Landscape: a subtle column-bg behind the left rail (trait tab bar + trait/
    // items rail) so the rail reads as a panel rather than floating chips.
    if (this.isLandscape && this.layout.clusters) {
      const lr = this.layout.clusters.leftRail;
      const colBg = new PIXI.Graphics();
      colBg.roundRect(lr.x - 4, lr.y - 4, lr.w + 8, lr.h + 8, 6)
        .fill({ color: C.bgHud, alpha: 0.4 });
      colBg.eventMode = "none";
      this.benchLayer.addChild(colBg);
    }

    // Landscape: the bench is a tilted front platform on the board's plane.
    if (this.isLandscape) {
      this.renderTiltedBench(me);
      return;
    }

    for (let i = 0; i < 9; i++) {
      const { x: cx, y: cy } = this.benchSlotCenter(i);
      const unit = me.bench[i];
      const isSelected = this.selectedBenchIdx === i && unit != null;
      const occupied = unit != null;

      // Cell rect: portrait uses the benchGeom slot height; landscape divides
      // the bench rect into a single 1×9 horizontal row.
      let cellW: number, cellH: number, cellX: number, cellY: number;
      if (this.isLandscape) {
        const r = this.layout.regions.bench;
        cellW = r.w / 9;
        cellH = r.h;
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
        // Size the checkers piece to fill the slot — matches the board token look
        // (extruded volume) rather than a small flat disc. The piece's thickness
        // and star pips sit above/below the disc, so fit to the slot's short side.
        const r = Math.max(12, Math.min(18, Math.round(0.42 * Math.min(cellW, cellH))));
        drawUnit(uc, unit, cx, cy, r, false, false, true);
        this.benchLayer.addChild(uc);
      }
    }
  }

  /**
   * Landscape bench: a tilted front platform on the board's ground plane. The
   * band is a projected stone slab butting the board's near edge; its 9 slots are
   * board-space rectangles projected to trapezoids (rectangular cells lying on
   * the tilted plane). Tokens stay upright/screen-aligned, sized to the projected
   * slot. All geometry uses the SAME forward/inverse projection as the board, so
   * dragging a unit to/from a slot lands on the correct one (see benchSlotAt).
   */
  private renderTiltedBench(me: PlayerState): void {
    const band = this.benchBandRect();
    const fwd = (p: { x: number; y: number }): { x: number; y: number } => this.fwd(p);

    // Platform base slab — a slightly lighter shade than the board, seamless with
    // its front edge (the band's top edge maps exactly onto the board near edge).
    const base = new PIXI.Graphics();
    const b0 = fwd({ x: band.x, y: band.y });
    const b1 = fwd({ x: band.x + band.w, y: band.y });
    const b2 = fwd({ x: band.x + band.w, y: band.y + band.h });
    const b3 = fwd({ x: band.x, y: band.y + band.h });
    const baseQuad = [b0.x, b0.y, b1.x, b1.y, b2.x, b2.y, b3.x, b3.y];
    base.poly(baseQuad).fill({ color: C.benchPlatform, alpha: 0.96 });
    base.poly(baseQuad).stroke({ width: 1, color: C.boardBorder, alpha: 0.6 });
    base.eventMode = "none";
    this.benchLayer.addChild(base);

    const slotW = band.w / 9;
    const insetX = slotW * 0.06;     // small board-space gaps so cells read distinct
    const insetY = band.h * 0.1;
    for (let i = 0; i < 9; i++) {
      const unit = me.bench[i];
      const isSelected = this.selectedBenchIdx === i && unit != null;
      const occupied = unit != null;

      const sx = band.x + i * slotW + insetX;
      const sw = slotW - 2 * insetX;
      const sy = band.y + insetY;
      const sh = band.h - 2 * insetY;
      const p0 = fwd({ x: sx, y: sy });
      const p1 = fwd({ x: sx + sw, y: sy });
      const p2 = fwd({ x: sx + sw, y: sy + sh });
      const p3 = fwd({ x: sx, y: sy + sh });
      const poly = [p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, p3.x, p3.y];

      const g = new PIXI.Graphics();
      g.poly(poly).fill({
        color: isSelected ? C.bgBenchSel : occupied ? C.benchOccupied : C.benchEmpty,
        alpha: occupied ? 1.0 : 0.55,
      });
      g.poly(poly).stroke({
        width: 1,
        color: isSelected ? C.tier3 : occupied ? C.chipBorder : C.benchEmptyRim,
        alpha: occupied ? 0.9 : 0.6,
      });
      g.eventMode = "static";
      g.cursor = "pointer";
      g.on("pointerdown", () => this.onBenchSlotClick(i, me));
      this.benchLayer.addChild(g);

      if (unit) {
        if (this.dragUnit?.uid === unit.uid) continue;
        // Fit the token to the PROJECTED slot size (perspective magnifies the
        // near platform), and keep it upright/screen-aligned like board tokens.
        const center = fwd({ x: sx + sw / 2, y: sy + sh / 2 });
        const screenW = Math.hypot(p2.x - p3.x, p2.y - p3.y); // bottom edge length
        const screenH = Math.hypot(p3.x - p0.x, p3.y - p0.y); // left edge length
        const r = Math.max(9, Math.min(22, Math.round(0.42 * Math.min(screenW, screenH))));
        const minX = Math.min(p0.x, p1.x, p2.x, p3.x);
        const maxX = Math.max(p0.x, p1.x, p2.x, p3.x);
        const minY = Math.min(p0.y, p1.y, p2.y, p3.y);
        const maxY = Math.max(p0.y, p1.y, p2.y, p3.y);
        const uc = new PIXI.Container();
        uc.eventMode = "static";
        uc.cursor = "grab";
        uc.hitArea = new PIXI.Rectangle(minX, minY, maxX - minX, maxY - minY);
        uc.on("pointerdown", (e: PIXI.FederatedPointerEvent) => this.startDragBench(i, unit, e));
        uc.on("pointerup", () => this.clearPress());
        uc.on("pointerupoutside", () => this.clearPress());
        drawUnit(uc, unit, center.x, center.y, r, false, false, true);
        this.benchLayer.addChild(uc);
      }
    }
  }

  /**
   * The TOP (second-player) bench: a mirror of the bottom bench butted against
   * the board's back/top edge, filling RIGHT-TO-LEFT (slot 0 = rightmost). Built
   * from the SAME geometry helpers and slot/cell drawing as the bottom bench so
   * it behaves identically when later populated. Our POV has no second-player
   * bench state, so it renders EMPTY and non-interactive. Part of the board group.
   */
  private renderTopBench(): void {
    if (this.isLandscape) {
      // Tilted platform on the board plane, butted against the board's back edge.
      const band = this.topBenchBandRect();
      const fwd = (p: { x: number; y: number }): { x: number; y: number } => this.fwd(p);

      // Platform base slab (mirrors renderTiltedBench's base).
      const base = new PIXI.Graphics();
      const b0 = fwd({ x: band.x, y: band.y });
      const b1 = fwd({ x: band.x + band.w, y: band.y });
      const b2 = fwd({ x: band.x + band.w, y: band.y + band.h });
      const b3 = fwd({ x: band.x, y: band.y + band.h });
      const baseQuad = [b0.x, b0.y, b1.x, b1.y, b2.x, b2.y, b3.x, b3.y];
      base.poly(baseQuad).fill({ color: C.benchPlatform, alpha: 0.96 });
      base.poly(baseQuad).stroke({ width: 1, color: C.boardBorder, alpha: 0.6 });
      base.eventMode = "none";
      this.benchLayer.addChild(base);

      const slotW = band.w / 9;
      const insetX = slotW * 0.06;
      const insetY = band.h * 0.1;
      // Draw cells in screen order (left→right columns); the right-to-left fill is
      // a slot-INDEX convention, irrelevant to drawing empty cells.
      for (let col = 0; col < 9; col++) {
        const sx = band.x + col * slotW + insetX;
        const sw = slotW - 2 * insetX;
        const sy = band.y + insetY;
        const sh = band.h - 2 * insetY;
        const p0 = fwd({ x: sx, y: sy });
        const p1 = fwd({ x: sx + sw, y: sy });
        const p2 = fwd({ x: sx + sw, y: sy + sh });
        const p3 = fwd({ x: sx, y: sy + sh });
        const poly = [p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, p3.x, p3.y];
        const g = new PIXI.Graphics();
        g.poly(poly).fill({ color: C.benchEmpty, alpha: 0.55 });
        g.poly(poly).stroke({ width: 1, color: C.benchEmptyRim, alpha: 0.6 });
        g.eventMode = "none"; // no second-player state to interact with
        this.benchLayer.addChild(g);
      }
      return;
    }

    // Portrait: a flat row above the board, mirroring the bottom bench's cells.
    const { slotW, slotH } = this.topBenchGeomPortrait();
    for (let col = 0; col < 9; col++) {
      const { x: cx, y: cy } = this.topBenchSlotCenter(8 - col); // col→slot index inverse
      const cellW = slotW, cellH = slotH;
      const cellX = cx - cellW / 2, cellY = cy - cellH / 2;
      const g = new PIXI.Graphics();
      g.roundRect(cellX + 1, cellY, cellW - 2, cellH, 4)
        .fill({ color: C.benchEmpty, alpha: 0.5 });
      g.roundRect(cellX + 1, cellY, cellW - 2, cellH, 4)
        .stroke({ width: 1, color: C.benchEmptyRim, alpha: 0.5 });
      g.eventMode = "none"; // no second-player state to interact with
      this.benchLayer.addChild(g);
    }
  }

  /**
   * Armed = a unit is selected (tap) or being unit-dragged (item drags excluded).
   * Only then do the two contextual sell buttons replace the Buy XP cluster
   * (LEFT) and the money-sack shop toggle (RIGHT).
   */
  private sellArmed(me: PlayerState): boolean {
    if (this.dragItem) return false;
    return this.selectedUnit(me) != null || this.isDragging;
  }

  /** The unit a sell action would target: the selected one, else the dragged one. */
  private sellTargetUnit(me: PlayerState): UnitInstance | null {
    const sel = this.selectedUnit(me);
    if (sel) return sel;
    if (this.dragUnit) {
      return me.bench
        .filter((u): u is UnitInstance => u != null)
        .concat(me.board.filter((u): u is UnitInstance => u != null))
        .find((u) => u.uid === this.dragUnit!.uid) ?? null;
    }
    return null;
  }

  /**
   * The Buy XP button's circular footprint (its medallion bounding box). This is
   * the canonical bottom-LEFT corner button rect — the LEFT sell button covers it
   * exactly, and the shop toggle mirrors it into the bottom-RIGHT corner. Computed
   * from buyXpGeom so it tracks the button's real rendered diameter (no bench
   * overlap: the box is the circle, not the wide econ region).
   */
  private buyXpFootprint(): { x: number; y: number; w: number; h: number } {
    const reg = this.isLandscape ? this.buyXpRegionLandscape() : this.layout.regions.hud;
    const g = buyXpGeom(reg);
    const half = g.r + g.rimW;
    return { x: g.cx - half, y: g.cy - half, w: 2 * half, h: 2 * half };
  }

  /** LEFT sell button footprint — the Buy XP button's circular spot (bottom-left). */
  private leftSellRect(): { x: number; y: number; w: number; h: number } {
    return this.buyXpFootprint();
  }

  /** RIGHT sell button footprint — the money-sack shop toggle's spot (bottom-right). */
  private rightSellRect(): { x: number; y: number; w: number; h: number } {
    return this.shopToggleRect();
  }

  /**
   * Contextual sell button (LEFT/RIGHT). Rendered ONLY while a unit is selected
   * or being dragged, in place of the Buy XP cluster / money-sack shop toggle;
   * shows the held/selected unit's gold refund (the rules SELL formula). Tapping
   * it (when a unit is selected) or dropping a dragged unit on it sells the unit.
   */
  private renderSellButton(
    layer: PIXI.Container,
    rect: { x: number; y: number; w: number; h: number },
    me: PlayerState
  ): void {
    const { x, y, w, h } = rect;
    const cx = x + w / 2, cy = y + h / 2;
    const target = this.sellTargetUnit(me);
    const refund = target ? sellValue(target, gameData) : null;

    const g = this.chip(layer, x, y, w, h, {
      fill: C.bgSellArmed, border: C.textSell, borderW: 2, radius: 8,
    });
    g.eventMode = "static";
    g.cursor = "pointer";
    g.hitArea = new PIXI.Rectangle(x, y, w, h);
    g.on("pointerdown", () => this.onSellZoneClick(me, { x: cx, y: cy }));

    const labelSize = Math.max(9, Math.min(15, Math.round(h * 0.22)));
    if (refund != null) {
      const numSize = labelSize + 1;
      this.text(layer, "SELL", cx, cy - labelSize * 0.8, labelSize, C.textSell, [0.5, 0.5]);
      const coinSize = Math.max(7, numSize - 2);
      const numStr = `${refund}`;
      const numW = numStr.length * numSize * 0.6;
      const gx = cx - numW / 2 - coinSize * 0.5;
      this.glyph(layer, "coin", gx, cy + numSize * 0.5, coinSize, C.accentGold);
      this.text(layer, numStr, gx + coinSize * 0.7, cy + numSize * 0.5, numSize, C.textGold, [0, 0.5]);
    } else {
      this.text(layer, "SELL", cx, cy, labelSize, C.textSell, [0.5, 0.5]);
    }
  }

  /** Center of whichever sell button a drop at (px,py) landed on (for the pop). */
  private sellZoneCenterAt(px: number, py: number): { x: number; y: number } {
    const center = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
    const right = this.rightSellRect();
    if (this.inRect(px, py, right)) return center(right);
    return center(this.leftSellRect());
  }

  private inRect(px: number, py: number, r: { x: number; y: number; w: number; h: number }, pad = 8): boolean {
    return px >= r.x - pad && px <= r.x + r.w + pad && py >= r.y - pad && py <= r.y + r.h + pad;
  }

  /** Currently selected bench/board unit, if any. */
  private selectedUnit(me: PlayerState): UnitInstance | null {
    if (this.selectedBenchIdx !== null) return me.bench[this.selectedBenchIdx] ?? null;
    if (this.selectedBoardIdx !== null) return me.board[this.selectedBoardIdx] ?? null;
    return null;
  }

  // ─── ITEM INVENTORY BAR (phase 10b) ──────────────────────────────────────

  /** Draw one item chip centered at (cx, cy); wires tap (info) + drag start. */
  private drawItemChip(
    layer: PIXI.Container,
    entry: InventoryEntry,
    cx: number,
    cy: number,
    size: number,
    onTap?: () => void,
    onDragStart?: (e: PIXI.FederatedPointerEvent) => void
  ): void {
    const half = size / 2;
    const g = new PIXI.Graphics();
    // Consumables read distinct from equippable items: their own fill (set by
    // itemModel) + the consumable rim color, never the gilded finished-item rim.
    const rim = entry.consumable ? C.itemConsumableRim : C.itemBorder;
    g.roundRect(cx - half, cy - half, size, size, 6).fill({ color: entry.color, alpha: 0.95 });
    g.roundRect(cx - half, cy - half, size, size, 6).stroke({ width: 1.5, color: rim, alpha: 0.95 });
    // Completed/radiant items carry the gilded inner rim (same motif as the full
    // icon frame) so the chip reads as a finished item, not a loose component;
    // consumables are not equippable, so they never get the gild.
    if (!entry.component && !entry.consumable) {
      g.roundRect(cx - half + 2, cy - half + 2, size - 4, size - 4, 4).stroke({ width: 1, color: C.itemFrame, alpha: 0.55 });
    }
    // Radiant (tier-4) items get a small corner badge so they read as top tier.
    if (entry.tier === "radiant") {
      g.circle(cx + half - 4, cy - half + 4, 2.5).fill({ color: C.radiantBadge, alpha: 0.95 });
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
    } else if (onTap) {
      // Tap-only chip (e.g. the landscape item-browse tab): no drag, just info.
      g.eventMode = "static";
      g.cursor = "pointer";
      g.hitArea = new PIXI.Rectangle(cx - half, cy - half, size, size);
      g.on("pointertap", onTap);
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
  private armItemTap(onTap: (() => void) | undefined, e: PIXI.FederatedPointerEvent): void {
    this.clearPress();
    this.pressStart = { x: e.globalX, y: e.globalY };
    this.pressTimer = setTimeout(() => {
      this.pressTimer = null;
      this.abortItemDrag();
      onTap?.();
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
    this.drawItemChip(c, entry, 0, 0, ITEM_SLOT, undefined);
    c.eventMode = "none";
    c.x = e.globalX; c.y = e.globalY;
    this.container.addChild(c);
    this.container.sortChildren();
    this.dragSprite = c;
    const me = this.driver.getState().players[this.driver.seatIndex]!;
    // Landscape tab-2 browse is the draggable item source; re-render the rail so
    // its source chip hides while dragging.
    if (this.isLandscape && this.activeRailTab === "items") this.renderRailTabs(me);
  }

  /** Cancel an in-progress item drag without issuing a command. */
  private abortItemDrag(): void {
    if (!this.dragItem) return;
    if (this.dragSprite) { this.container.removeChild(this.dragSprite); this.dragSprite = null; }
    this.dragItem = null;
    this.isDragging = false;
    this.dragCatcher.eventMode = "none";
    this.closeCombineHint();
    this.render(this.driver.getState());
  }

  /**
   * Pixel center (x, y) of inventory row `i` in the landscape tab-2 browse list,
   * or null when the browse isn't the active source. Mirrors renderItemBrowse's
   * row layout.
   */
  private itemBrowseRowCenter(i: number): { x: number; y: number } | null {
    if (!this.isLandscape || this.activeRailTab !== "items") return null;
    const rail = this.layout.regions.traitRail;
    const rowH = ITEM_SLOT + 4;
    const half = ITEM_SLOT / 2;
    return { x: rail.x + half, y: rail.y + half + i * rowH };
  }

  /** Inventory row under a pixel in the tab-2 browse list, or null. */
  private itemSlotAtBrowse(px: number, py: number, count: number): number | null {
    if (!this.isLandscape || this.activeRailTab !== "items") return null;
    for (let i = 0; i < count; i++) {
      const c = this.itemBrowseRowCenter(i);
      if (!c) continue;
      if (
        px >= c.x - ITEM_SLOT / 2 - 4 && px <= c.x + ITEM_SLOT / 2 + 4 &&
        py >= c.y - ITEM_SLOT / 2 - 2 && py <= c.y + ITEM_SLOT / 2 + 2
      ) return i;
    }
    return null;
  }

  /** Resolve an item drag-drop: EQUIP on a unit, COMBINE on another item, else no-op. */
  private onItemDragEnd(px: number, py: number, me: PlayerState): void {
    const drag = this.dragItem!;
    this.closeCombineHint();
    if (this.peekTargetId !== null) return; // peek is view-only: no equip/combine

    // 0) Consumables target a UNIT only (board/bench) — never combine onto another
    // item. If dropped anywhere but a unit, the consumable stays put (no-op).
    if (itemModel(drag.id, gameData)?.consumable) {
      const cBoard = this.boardSlotAt(px, py);
      if (cBoard >= 0 && me.board[cBoard]) { this.useConsumableOnUnit(drag.id, me.board[cBoard]!); return; }
      const cBench = this.benchSlotAt(px, py);
      if (cBench !== null && me.bench[cBench]) { this.useConsumableOnUnit(drag.id, me.bench[cBench]!); return; }
      return;
    }

    // 1) Dropped on a board hex with a unit → EQUIP.
    const boardSlot = this.boardSlotAt(px, py);
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
    // 3) Dropped on another inventory item (tab-2 browse) → COMBINE (if a recipe exists).
    const inv = inventoryModel(me.items, gameData);
    const overIdx = this.itemSlotAtBrowse(px, py, inv.length);
    if (overIdx !== null && overIdx !== drag.index) {
      const other = me.items[overIdx]!;
      const center = this.itemBrowseRowCenter(overIdx);
      const preview = combinePreview(drag.id, drag.index, other, overIdx, gameData);
      if (preview.ok) {
        const result = this.driver.playerCommand({ type: "COMBINE_ITEMS", itemIdA: drag.id, itemIdB: other });
        if (result.ok) {
          this.opts.audio.play("buy");
          if (center) this.spawnPlanningPop(center.x, center.y, C.itemCombineOk);
        } else {
          this.showToast(result.error);
        }
      } else {
        // No recipe: clear "no combine" feedback, send no command.
        this.showToast("NO_RECIPE");
        if (center) this.spawnPlanningPop(center.x, center.y, C.itemCombineNo);
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

  /**
   * Apply a consumable dropped on `unit` (board/bench). Renderer-is-dumb: the
   * command is ALWAYS sent — the no-op-success vs real-effect distinction is read
   * from a state diff AROUND the command (mirrors tryEquip's slot-count snapshot),
   * never from pre-inspecting the unit's items. radiant_enhancer needs an explicit
   * target, so when the unit has tier-2 items it opens the picker first; with zero
   * tier-2 items it still sends and lets the server reject (NO_TIER_2_ITEMS_EQUIPPED).
   */
  private useConsumableOnUnit(consumableId: string, unit: UnitInstance): void {
    const cons = itemModel(consumableId, gameData);
    if (cons?.consumableEffect === "radiant_upgrade") {
      const route = radiantDropRoute(unit, gameData);
      if (route.kind === "picker") {
        this.openConsumablePicker(consumableId, unit.uid, route.items);
        return;
      }
    }
    // item_remover / reforger (and radiant with no tier-2 items): no targetItemId.
    this.sendConsumable(consumableId, unit.uid);
  }

  /** Send a USE_CONSUMABLE and pick feedback from the resulting state diff. */
  private sendConsumable(consumableId: string, targetUnitId: number, targetItemId?: string): void {
    const before = this.consumableStateSig(targetUnitId);
    const result = this.driver.playerCommand(
      targetItemId !== undefined
        ? { type: "USE_CONSUMABLE", consumableId, targetUnitId, targetItemId }
        : { type: "USE_CONSUMABLE", consumableId, targetUnitId }
    );
    if (!result.ok) { this.showToast(result.error); return; }
    const after = this.consumableStateSig(targetUnitId);
    if (after === before) {
      // No-op success: the rules consumed nothing and changed nothing (e.g. a
      // remover/reforger on a unit with no items). Neutral cue, not a reward.
      this.showToast("Nothing to change");
      return;
    }
    this.opts.audio.play("buy");
    const pos = this.unitPixel(targetUnitId);
    if (pos) this.spawnPlanningPop(pos.x, pos.y, C.itemCombineOk);
  }

  /** Snapshot of a unit's items + my inventory, to detect whether a consumable
   *  actually changed state (vs a no-op success). */
  private consumableStateSig(uid: number): string {
    const me = this.driver.getState().players[this.driver.seatIndex];
    if (!me) return "";
    const u = me.board.find((x) => x?.uid === uid) ?? me.bench.find((x) => x?.uid === uid);
    return `${u?.items.join(",") ?? ""}|${me.items.join(",")}`;
  }

  /** Open the radiant_enhancer item picker; pick → send with that target, cancel
   *  → nothing (the dragged chip is already back in the inventory bar). */
  private openConsumablePicker(consumableId: string, targetUnitId: number, items: ItemModel[]): void {
    this.opts.audio.play("tap");
    renderItemPicker(
      this.inspectLayer,
      items,
      (itemId) => { this.closeInspect(); this.sendConsumable(consumableId, targetUnitId, itemId); },
      () => this.closeInspect(),
      this.layout,
      this.opts.settings.get().reducedMotion
    );
  }

  /** Current equipped-item count for a unit on my board/bench (0 if not found). */
  private unitItemCount(uid: number): number {
    const me = this.driver.getState().players[this.driver.seatIndex];
    if (!me) return 0;
    const u = me.board.find((x) => x?.uid === uid) ?? me.bench.find((x) => x?.uid === uid);
    return u?.items.length ?? 0;
  }

  /** Pixel center of a unit on my board/bench, or null. */
  private unitPixel(uid: number): { x: number; y: number } | null {
    const me = this.driver.getState().players[this.driver.seatIndex];
    if (!me) return null;
    const bIdx = me.board.findIndex((x) => x?.uid === uid);
    if (bIdx >= 0) {
      // Board-anchored VFX → forward through the perspective transform.
      return this.fwd(hexToPixel(bIdx % BOARD_COLS, Math.floor(bIdx / BOARD_COLS), this.boardOffsetX, this.boardOffsetY, this.boardScale));
    }
    const benchIdx = me.bench.findIndex((x) => x?.uid === uid);
    if (benchIdx >= 0) {
      return this.benchSlotCenter(benchIdx);
    }
    return null;
  }

  /** Live combine-preview hint shown while dragging one item over another. */
  private combineHint: PIXI.Container | null = null;
  private updateCombineHint(px: number, py: number, me: PlayerState): void {
    if (!this.dragItem) return;
    // Consumables only drop onto units (never combine onto another item), so a
    // combine-preview hint never applies while one is being dragged.
    if (itemModel(this.dragItem.id, gameData)?.consumable) { this.closeCombineHint(); return; }
    const inv = inventoryModel(me.items, gameData);
    const overIdx = this.itemSlotAtBrowse(px, py, inv.length);
    this.closeCombineHint();
    if (overIdx === null || overIdx === this.dragItem.index) return;
    const other = me.items[overIdx]!;
    const center = this.itemBrowseRowCenter(overIdx);
    if (!center) return;
    const preview = combinePreview(this.dragItem.id, this.dragItem.index, other, overIdx, gameData);
    const cx = center.x;
    const midY = center.y;
    // The tab-2 browse rows sit in the far-left column; show the result chip just
    // to the right of the target row so it doesn't overlap the row icon.
    const hintY = midY - 10;
    const hint = new PIXI.Container();
    if (preview.ok) {
      // "→ Result name" chip just to the right of the target row.
      const w = 18 + preview.result.name.length * 5.0 + 14;
      const hx = Math.max(6, Math.min(this.designW - w - 6, cx + ITEM_SLOT / 2 + 4));
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

  private renderShop(me: PlayerState): void {
    this.shopLayer.removeChildren();
    this.renderControls(me);
    // The shop is drop-down-only in BOTH orientations now — it opens solely via
    // the shop button (renderShopToggle) and lives in renderShopPanel. No always-
    // visible docked strip; nothing to draw into shopLayer here beyond controls.
  }

  /**
   * Draw the 6 shop cards into `layer`, one per rect in `cardRects` (rects[i] is
   * the slot for shop card i). The drop-down shop panel computes these from its
   * 7-equal-slot grid (slot 0 = refresh, slots 1–6 = cards) and passes them here,
   * so this stays pure geometry-consumption: it renders the SAME live shop
   * (me.shop) and routes taps through `onShopBuy`.
   */
  private drawShopCards(
    layer: PIXI.Container,
    cardRects: { x: number; y: number; w: number; h: number }[],
    me: PlayerState
  ): void {
    for (let i = 0; i < cardRects.length; i++) {
      const rect = cardRects[i];
      if (!rect) continue;
      const x = rect.x;
      const shopY = rect.y;
      const cardW = rect.w;
      const cardH = rect.h;
      const slot = me.shop[i];

      if (!slot) {
        // Empty slots read as non-interactive: dimmer fill + subdued border.
        this.chip(layer, x, shopY, cardW, cardH, {
          fill: C.bgShopEmpty, fillAlpha: 0.4, border: C.borderSubtle,
        });
        continue;
      }

      const def = gameData.units.find((u) => u.id === slot.defId);
      const tc = tierColor(slot.tier);
      const cardCx = x + cardW / 2;

      const card = this.chip(layer, x, shopY, cardW, cardH, {
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
      layer.addChild(top);

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

      // Content offsets scale with the (variable) card height so nothing rides
      // off-screen when shop.h compresses toward its 64px floor.
      const cl = shopCardContentLayout(cardH);

      // portrait disc (token glyph/art, no bars); non-interactive so taps reach the card
      const tokenC = new PIXI.Container();
      tokenC.eventMode = "none";
      drawUnitToken(tokenC, slot.defId, slot.tier, 0, cardCx, shopY + cl.discY, { radius: cl.discR });
      layer.addChild(tokenC);

      this.text(layer, def?.name ?? slot.defId, cardCx, shopY + cl.nameY, 8, C.textPrimary, [0.5, 0]);

      const traitNames = [def?.origin, ...(def?.classes ?? [])]
        .map((tid) => gameData.traits.find((t) => t.id === tid)?.name)
        .filter((n): n is string => !!n);
      // Truncate (not wrap) at 7px so the line stays legible inside the 71px card.
      const traitStr = traitNames.length > 1
        ? `${traitNames[0]!.slice(0, 6)}·${traitNames[1]!.slice(0, 6)}`
        : (traitNames[0] ?? "");
      this.text(layer, traitStr, cardCx, shopY + cl.traitY, 7, C.textMuted, [0.5, 0]);

      this.glyph(layer, "coin", x + 12, shopY + cl.tierY, 9, C.accentGold);
      this.text(layer, `${slot.tier}`, x + 20, shopY + cl.tierY, 11, C.textGold, [0, 0.5]);
    }
  }

  // ─── Drop-down shop panel + money-sack toggle ────────────────────────────────

  /**
   * Money-sack toggle button rect. Landscape: the bottom-RIGHTMOST corner (the
   * `shop` region — gold lives inside it), with sell to its left. Portrait:
   * directly above the sell drop-zone so the two coexist (sell keeps its spot).
   */
  private shopToggleRect(): { x: number; y: number; w: number; h: number } {
    if (this.isLandscape) {
      // Mirror the Buy XP button's circular footprint into the OPPOSITE bottom
      // corner so the two read as a symmetric pair: identical size, identical
      // distance from the bottom edge, and the right-edge margin equals the Buy XP
      // button's left-edge margin. The footprint is the button's own bounding box
      // (not the oversized econ region), so the circle stays fully inside the safe
      // area instead of clipping off the bottom-right edge.
      const fp = this.buyXpFootprint();
      const leftMargin = fp.x;
      return { x: this.designW - leftMargin - fp.w, y: fp.y, w: fp.w, h: fp.h };
    }
    const sr = this.layout.regions.sellControl;
    // Portrait (unchanged): match the Buy XP button's EXACT diameter (shared
    // medallion base): the slot is its full circle (2·(r + rimW)), centered over
    // the sell control, so the toggle never renders smaller than Buy XP.
    const bx = buyXpGeom(this.layout.regions.hud);
    const size = 2 * (bx.r + bx.rimW);
    return { x: sr.x + (sr.w - size) / 2, y: sr.y - size - 6, w: size, h: size };
  }

  /**
   * Drop-down shop panel rect — anchored to the top edge, spanning (near) the
   * full design width so its inner 7-equal-slot grid (refresh + 6 cards) gets
   * comfortable per-slot width. One row of shop cards, no title strip (refresh
   * now lives in slot 0 of the grid).
   */
  private shopPanelRect(): { x: number; y: number; w: number; h: number } {
    const margin = this.isLandscape ? Math.round(this.designW * 0.06) : 6;
    const w = this.designW - 2 * margin;
    const cardH = Math.max(72, Math.min(96, Math.round(this.designH * 0.22)));
    const pad = 10;
    return { x: margin, y: 0, w, h: cardH + 2 * pad };
  }

  /** Money-sack button that toggles the drop-down shop panel. */
  private renderShopToggle(me: PlayerState): void {
    this.shopToggleLayer.removeChildren();
    // While a unit is selected/dragged the RIGHT sell button takes over this spot.
    if (this.sellArmed(me)) {
      this.renderSellButton(this.shopToggleLayer, this.rightSellRect(), me);
      return;
    }
    const r = this.shopToggleRect();
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    // EXACTLY the Buy XP button's diameter (shared medallion base): use its
    // geometry's radius directly — no corner-fit clamp (the slot rect is already
    // sized to the full circle), so the two buttons render identically sized.
    const bx = buyXpGeom(this.isLandscape ? this.buyXpRegionLandscape() : this.layout.regions.hud);
    const R = bx.r;
    const rimW = bx.rimW;

    // Shared medallion base: blue disc + ornate gold/bronze rim (same scheme as
    // Buy XP), then the open-state highlight ring on top. The body is the one
    // interactive node (hit area stays the full slot rect so the toggle target
    // keeps its size); content sits static on top, mirroring the prior
    // chip-pops-behind-glyph press feel.
    const g = this.drawMedallionBase(cx, cy, R, rimW, { fill: C.xpBtnDisc });
    if (this.shopPanelOpen) {
      // Brighter inner ring while the panel is open (open-state read).
      g.circle(cx, cy, R - rimW).stroke({ width: Math.max(1.2, rimW * 0.6), color: C.lootOrbCore, alpha: 0.9 });
    }
    this.shopToggleLayer.addChild(g);
    g.eventMode = "static";
    g.cursor = "pointer";
    g.hitArea = new PIXI.Rectangle(r.x, r.y, r.w, r.h);
    this.pressFeedback(g, () => this.toggleShopPanel(me), { cx, cy });

    // Cream coin-pouch in the upper-center of the medallion (both orientations).
    this.drawMoneySack(this.shopToggleLayer, cx, cy - R * 0.12, R * 0.92, R * 0.8);

    if (this.isLandscape) {
      // The live gold amount (bound to me.gold) — bold numeral stamped below /
      // overlapping the sack; gold has no other standalone display in landscape.
      const t = new PIXI.Text({
        text: `${me.gold}`,
        style: {
          fontFamily: "monospace", fontWeight: "bold",
          fontSize: Math.max(14, Math.round(R * 0.62)),
          fill: C.xpBtnRimDeep,
          stroke: { color: C.lootOrbCore, width: Math.max(2, R * 0.08) },
          align: "center",
        },
      });
      t.anchor.set(0.5, 0.5);
      t.x = cx; t.y = cy + R * 0.42;
      t.eventMode = "none";
      this.shopToggleLayer.addChild(t);

      // Existing win/loss streak badge — repositioned to cling to the medallion's
      // upper-left rim (unchanged content/bindings, just clipped to the circle).
      const streak = me.winStreak > 0 ? me.winStreak : me.loseStreak > 0 ? -me.loseStreak : 0;
      if (streak !== 0) {
        const bw = 32, bh = 16;
        const rim = R * 0.707; // 45° up-left point on the rim
        const bx = cx - rim - bw * 0.55, by = cy - rim - bh * 0.5;
        this.chip(this.shopToggleLayer, bx, by, bw, bh, {
          fill: C.panelBg, border: C.streakOrange, borderW: 1.5, radius: 7,
        });
        this.glyph(this.shopToggleLayer, "flame", bx + 9, by + bh / 2, 10, C.streakOrange);
        this.text(
          this.shopToggleLayer, `${streak > 0 ? "+" : ""}${streak}`, bx + 17, by + bh / 2, 10,
          C.streakOrange, [0, 0.5]
        );
      }
    }
  }

  /** Stylized cream coin-pouch with a cinched, tied top — drawn into `layer`. */
  private drawMoneySack(layer: PIXI.Container, cx: number, cy: number, w: number, h: number): void {
    const cream = C.lootOrbCore;
    const edgeW = Math.max(1, w * 0.05);
    const s = new PIXI.Graphics();
    // Round belly.
    s.roundRect(cx - w * 0.5, cy - h * 0.02, w, h * 0.72, w * 0.42)
      .fill({ color: cream })
      .stroke({ width: edgeW, color: C.xpBtnRimDeep, alpha: 0.85, join: "round" });
    // Cinched neck flaring up from the tie into two fabric ruffles.
    s.moveTo(cx - w * 0.3, cy)
      .lineTo(cx - w * 0.42, cy - h * 0.4)
      .lineTo(cx - w * 0.12, cy - h * 0.22)
      .lineTo(cx + w * 0.12, cy - h * 0.22)
      .lineTo(cx + w * 0.42, cy - h * 0.4)
      .lineTo(cx + w * 0.3, cy)
      .closePath()
      .fill({ color: cream })
      .stroke({ width: edgeW, color: C.xpBtnRimDeep, alpha: 0.85, join: "round" });
    // Tie band cinching the neck (drawn last → hides the belly/neck seam).
    s.roundRect(cx - w * 0.28, cy - h * 0.12, w * 0.56, h * 0.18, h * 0.07)
      .fill({ color: C.xpBtnRimDeep });
    s.eventMode = "none";
    layer.addChild(s);
  }

  /** Render the drop-down panel's bg + the shared shop cards, then position it. */
  private renderShopPanel(me: PlayerState): void {
    this.shopPanelLayer.removeChildren();
    const pr = this.shopPanelRect();
    const pad = 10;

    // Keep the click-outside backdrop scrim in sync with the open state (it lives
    // on its own non-sliding layer, drawn by renderShopBackdrop).
    this.renderShopBackdrop(me);

    // ── Panel surface ─────────────────────────────────────────────────────────
    // The surface is an interactive click-absorbing backdrop: a tap on any empty
    // area WITHIN the panel (corners, gaps, padding) must do NOTHING, never
    // dismiss. Only a tap strictly OUTSIDE the panel (on the scrim) closes the
    // shop. Making the whole panel rect a `static` hit target stops the event
    // from reaching the dismiss scrim below it.
    const surface = this.chip(this.shopPanelLayer, pr.x, pr.y, pr.w, pr.h, {
      fill: C.bgInspect, border: C.accentGold, borderW: 2, radius: 8,
    });
    surface.eventMode = "static";
    surface.hitArea = new PIXI.Rectangle(pr.x, pr.y, pr.w, pr.h);
    // Swallow taps on the surface so they don't fall through to the scrim.
    surface.on("pointertap", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());

    // ── 7-equal-slot grid: slot 0 = refresh, slots 1–6 = the 6 shop cards ──────
    const innerArea = { x: pr.x + pad, y: pr.y + pad, w: pr.w - 2 * pad, h: pr.h - 2 * pad };

    // Slot 0 — refresh (reroll) button. Same shared shop state; cost unchanged.
    const s0 = shopPanelSlotRect(innerArea, 0);
    const rr = this.chip(this.shopPanelLayer, s0.x, s0.y, s0.w, s0.h, { fill: C.bgReroll, radius: 6 });
    rr.eventMode = "static";
    rr.hitArea = new PIXI.Rectangle(s0.x, s0.y, s0.w, s0.h);
    rr.cursor = "pointer";
    const rrCx = s0.x + s0.w / 2, rrCy = s0.y + s0.h / 2;
    this.pressFeedback(rr, () => this.onReroll(), { cx: rrCx, cy: rrCy });
    this.glyph(this.shopPanelLayer, "refresh", rrCx, rrCy - 8, 16, C.textPrimary);
    this.glyph(this.shopPanelLayer, "coin", rrCx - 8, rrCy + 12, 9, C.accentGold);
    this.text(this.shopPanelLayer, `${gameData.economy.rerollCost}`, rrCx, rrCy + 12, 11, C.textGold, [0, 0.5]);

    // Slots 1–6 — the 6 shop cards, one per slot (each exactly 1/7 of the panel).
    const cardRects = [0, 1, 2, 3, 4, 5].map((i) => shopPanelSlotRect(innerArea, i + 1));
    this.drawShopCards(this.shopPanelLayer, cardRects, me);

    // Resting position when no slide is animating (keeps the panel in place across
    // re-renders, e.g. after a buy): open → flush with the top, closed → hidden up.
    // Closed clears the full height PLUS the border so the bottom gold rim doesn't
    // peek as a stray line across the screen top (the panel's top is at y=0).
    if (this.shopPanelAnimFn === null) {
      this.shopPanelOffsetY = this.shopPanelOpen ? 0 : -(pr.h + SHOP_PANEL_HIDE_MARGIN);
    }
    this.shopPanelLayer.y = this.shopPanelOffsetY;
    this.shopPanelLayer.eventMode = this.shopPanelOpen ? "auto" : "none";
  }

  /** Flip the panel open/closed and (re)start the slide animation. */
  private toggleShopPanel(me: PlayerState): void {
    this.shopPanelOpen = !this.shopPanelOpen;
    this.opts.audio.play("tap");
    this.renderShopToggle(me);   // repaint the button's open/closed fill
    this.renderShopBackdrop(me); // create (open) / tear down (closed) the scrim
    this.animateShopPanel();
  }

  /**
   * Draw / tear down the click-outside backdrop scrim to match `shopPanelOpen`.
   * Lives on its own non-sliding layer (zIndex 870) so it captures every pointer
   * event behind the open panel (nothing in the HUD/board is clickable through
   * it) and a tap anywhere on it (= a click OUTSIDE the panel) dismisses the shop.
   */
  private renderShopBackdrop(me: PlayerState): void {
    this.shopBackdropLayer.removeChildren();
    if (this.shopPanelOpen) {
      const scrim = new PIXI.Graphics();
      scrim.rect(0, 0, this.designW, this.designH).fill({ color: C.bgScrim, alpha: 0.45 });
      scrim.eventMode = "static";
      scrim.cursor = "pointer";
      scrim.hitArea = new PIXI.Rectangle(0, 0, this.designW, this.designH);
      scrim.on("pointertap", () => { if (this.shopPanelOpen) this.toggleShopPanel(me); });
      this.shopBackdropLayer.addChild(scrim);
    }
    this.shopBackdropLayer.eventMode = this.shopPanelOpen ? "auto" : "none";
  }

  /** Slide the panel down (open) / up (closed); reduced-motion snaps. */
  private animateShopPanel(): void {
    const pr = this.shopPanelRect();
    const target = this.shopPanelOpen ? 0 : -(pr.h + SHOP_PANEL_HIDE_MARGIN);
    if (this.shopPanelAnimFn !== null) {
      this.app.ticker.remove(this.shopPanelAnimFn);
      this.shopPanelAnimFn = null;
    }
    const settle = (): void => {
      this.shopPanelOffsetY = target;
      this.shopPanelLayer.y = target;
      this.shopPanelLayer.eventMode = this.shopPanelOpen ? "auto" : "none";
    };
    if (this.opts.settings.get().reducedMotion) { settle(); return; }
    this.shopPanelLayer.eventMode = "auto"; // interactive while sliding
    const speed = pr.h / 180; // ~180ms full travel
    const fn = (ticker: PIXI.Ticker): void => {
      const dir = target > this.shopPanelOffsetY ? 1 : -1;
      this.shopPanelOffsetY += dir * speed * ticker.deltaMS;
      if ((dir > 0 && this.shopPanelOffsetY >= target) || (dir < 0 && this.shopPanelOffsetY <= target)) {
        this.app.ticker.remove(fn);
        this.shopPanelAnimFn = null;
        settle();
        return;
      }
      this.shopPanelLayer.y = this.shopPanelOffsetY;
    };
    this.shopPanelAnimFn = fn;
    this.app.ticker.add(fn);
  }

  /** Tear down the panel slide ticker + reset to closed (phase change / destroy). */
  private resetShopPanel(): void {
    if (this.shopPanelAnimFn !== null) {
      this.app.ticker.remove(this.shopPanelAnimFn);
      this.shopPanelAnimFn = null;
    }
    this.shopPanelOpen = false;
    this.shopPanelOffsetY = -9999;
    this.shopPanelLayer.removeChildren();
    this.shopToggleLayer.removeChildren();
    this.shopBackdropLayer.removeChildren();
    this.shopBackdropLayer.eventMode = "none";
  }

  // ─── D. HUD row: level / gold / streak / reroll / buy-xp ──────────────────────

  /**
   * Shared circular medallion-button base. Both the Buy XP button and the
   * money-sack shop toggle layer their own center content / badges / arcs on top
   * of this one body: a configurable inner fill disc (both use the Buy XP blue),
   * an ornate gilded outer rim + bronze inner-shadow ring, a soft domed top
   * highlight, and 8 bronze filigree notches. Future circular buttons reuse it.
   *
   * Returns the body Graphics (one node so press feedback scales the whole disc);
   * the caller adds it to its own layer and wires interaction (so disabled / hit
   * area / tap binding stay per-button). Drawn with the Pixi v8 path API.
   */
  private drawMedallionBase(
    cx: number, cy: number, r: number, rimW: number,
    opts: { fill?: number; disabled?: boolean } = {}
  ): PIXI.Graphics {
    const disabled = opts.disabled ?? false;
    const rimCol = disabled ? C.xpBtnRimDeep : C.xpBtnRim;
    const discCol = disabled ? C.xpBtnDisabled : (opts.fill ?? C.xpBtnDisc);
    const body = new PIXI.Graphics();
    // Outer gilded rim.
    body.circle(cx, cy, r).stroke({ width: rimW, color: rimCol });
    // Bronze inner shadow line inside the rim.
    body.circle(cx, cy, r - rimW * 0.55).stroke({ width: Math.max(1, rimW * 0.4), color: C.xpBtnRimDeep, alpha: disabled ? 0.5 : 0.9 });
    // Inner disc + a soft top highlight for a domed read.
    const discR = r - rimW * 0.5;
    body.circle(cx, cy, discR).fill({ color: discCol });
    if (!disabled) {
      body.circle(cx, cy - discR * 0.32, discR * 0.7).fill({ color: C.xpBtnDiscHi, alpha: 0.22 });
    }
    // Ornate rim notches (8 small ticks) for the bronze filigree read.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const nx = cx + Math.cos(a) * r;
      const ny = cy + Math.sin(a) * r;
      body.circle(nx, ny, Math.max(0.8, rimW * 0.22)).fill({ color: C.xpBtnRimDeep, alpha: disabled ? 0.4 : 0.85 });
    }
    return body;
  }

  /**
   * Circular "Buy XP" button (econ cluster), replacing the former rounded-rect
   * Buy XP button + separate linear XP bar + standalone "L#" text. Anatomy:
   * shared medallion base (ornate gold/bronze rim around a blue disc) + stacked
   * level-up glyph + "Buy XP" + coin·cost in the center; the current/needed xp
   * text floats just above; a 90° teal progress arc hugs the outer-right edge
   * (the xp bar, clockwise); a small dark badge overlaps the bottom-right showing
   * the level. Pure geometry comes from `buyXpGeom`; this only paints + wires the
   * BUY_XP command (greyed + inert when gold < cost or at max level). Returns the
   * control's right edge.
   */
  private renderBuyXpButton(me: PlayerState, region?: { x: number; y: number; w: number; h: number }): number {
    const reg = region ?? this.layout.regions.hud;
    const g = buyXpGeom(reg);
    const xp = xpProgress(me.xp, me.level, gameData.economy.levelXpThresholds);
    const cost = gameData.economy.xpBuyCost;
    const disabled = me.gold < cost || xp.maxed;

    const rimCol = disabled ? C.xpBtnRimDeep : C.xpBtnRim;
    const inkCol = disabled ? C.textMuted : C.textPrimary;

    // ── Button body: shared medallion base (blue disc + ornate gold rim) ────
    const body = this.drawMedallionBase(g.cx, g.cy, g.r, g.rimW, { disabled });
    body.eventMode = disabled ? "none" : "static";
    if (!disabled) {
      const hit = new PIXI.Circle(g.cx, g.cy, g.r + g.rimW);
      body.hitArea = hit;
      body.cursor = "pointer";
      this.pressFeedback(body, () => this.onBuyXp(), { cx: g.cx, cy: g.cy });
    }
    this.shopLayer.addChild(body);

    // ── Progress arc on the outer-right edge (the xp bar) ───────────────────
    // Own Graphics so the disc subpath's pen never streaks into the arc start.
    const arc = new PIXI.Graphics();
    arc.arc(g.cx, g.cy, g.arcR, g.arcStart, g.arcEnd)
      .stroke({ width: g.arcW, color: C.xpArcTrack, cap: "round" });
    if (xp.frac > 0) {
      // Fill rises from the BOTTOM of the arc upward as xp grows: anchor the
      // filled segment at arcEnd (bottom) and extend its start toward arcStart.
      const fillStart = g.arcEnd - (g.arcEnd - g.arcStart) * xp.frac;
      arc.arc(g.cx, g.cy, g.arcR, fillStart, g.arcEnd)
        .stroke({ width: g.arcW, color: disabled ? C.xpBtnRimDeep : C.xpArcFill, cap: "round" });
    }
    arc.eventMode = "none";
    this.shopLayer.addChild(arc);

    // ── Stacked center content: glyph / "Buy XP" / coin + cost ──────────────
    this.glyph(this.shopLayer, "levelUp", g.cx, g.glyphY, Math.max(7, g.fontSize + 1), disabled ? C.textMuted : C.accentGold);
    this.text(this.shopLayer, "Buy XP", g.cx, g.labelY, g.fontSize, inkCol, [0.5, 0.5]);
    const coinSize = Math.max(6, g.fontSize - 1);
    const costStr = `${cost}`;
    const costW = costStr.length * g.fontSize * 0.6;
    const coinX = g.cx - costW / 2 - coinSize * 0.35;
    this.glyph(this.shopLayer, "coin", coinX, g.costY, coinSize, disabled ? C.textMuted : C.accentGold);
    this.text(this.shopLayer, costStr, coinX + coinSize * 0.7, g.costY, g.fontSize, disabled ? C.textMuted : C.textGold, [0, 0.5]);

    // ── Floating current/needed xp text, just ABOVE the button ──────────────
    const fracLabel = xp.maxed ? "MAX" : `${xp.inLevel}/${xp.needed}`;
    this.text(this.shopLayer, fracLabel, g.cx, g.fracY, Math.max(8, g.fontSize), C.textMuted, [0.5, 0.5]);

    // ── Level badge overlapping the bottom-right ────────────────────────────
    const badge = new PIXI.Graphics();
    badge.circle(g.badgeCx, g.badgeCy, g.badgeR).fill({ color: C.xpBadgeBg });
    badge.circle(g.badgeCx, g.badgeCy, g.badgeR).stroke({ width: Math.max(1.2, g.badgeR * 0.16), color: rimCol });
    badge.eventMode = "none";
    this.shopLayer.addChild(badge);
    this.text(this.shopLayer, `${me.level}`, g.badgeCx, g.badgeCy, Math.max(8, g.badgeR * 0.95), inkCol, [0.5, 0.5]);

    return g.cx + g.r + g.arcW + 2;
  }

  private renderControls(me: PlayerState): void {
    if (this.isLandscape) { this.renderControlsLandscape(me); return; }
    this.renderControlsPortrait(me);
  }

  /**
   * Landscape econ cluster (now the left unit of the bottom row): gold +
   * win-streak (left) and the buy-XP button with its XP progress bar (right).
   * Reroll moved to the drop-down shop panel's title strip. Grouped as one block.
   */
  private renderControlsLandscape(me: PlayerState): void {
    // While a unit is selected/dragged the LEFT sell button takes over this spot.
    if (this.sellArmed(me)) {
      this.renderSellButton(this.shopLayer, this.leftSellRect(), me);
      return;
    }
    // The buy-XP widget is now the sole occupant of the bottom-left corner
    // (gold + streak moved into the money-sack shop button), scaled ~2× by
    // giving it a full-bottom-bar-height square anchored at the left, clear of
    // the centred bench above it. Reroll lives in the drop-down shop panel.
    void this.renderBuyXpButton(me, this.buyXpRegionLandscape());
  }

  /**
   * Landscape buy-XP region: a square in the bottom-LEFT corner spanning the
   * full bottom-bar height (bench-row top → econ-row bottom), to the left of
   * the centred bench. Doubling the button's footprint vs. its prior row-2-only
   * slot, while staying clear of the bench/board.
   */
  private buyXpRegionLandscape(): { x: number; y: number; w: number; h: number } {
    const hud = this.layout.regions.hud;
    const bench = this.layout.regions.bench;
    const top = bench.y;
    const bottom = hud.y + hud.h;
    const w = Math.max(1, bench.x - hud.x - 8); // clear of the centred bench
    return { x: hud.x, y: top, w, h: bottom - top };
  }

  /** Portrait HUD: the prior single horizontal band (unchanged). */
  private renderControlsPortrait(me: PlayerState): void {
    const hud = this.layout.regions.hud;
    const y = hud.y;
    const h = hud.h;
    const x0 = hud.x;
    const off = { goldG: 83, goldT: 95, streakG: 147, streakT: 159, rrX: 233, rrW: 62 };

    // Circular Buy XP button (absorbs the level badge + xp progress), anchored
    // bottom-left of the hud band (the strip between the trait rail and bench).
    // While a unit is selected/dragged the LEFT sell button takes over its spot.
    if (this.sellArmed(me)) this.renderSellButton(this.shopLayer, this.leftSellRect(), me);
    else void this.renderBuyXpButton(me);

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
  }

  // ─── C. TRAIT STRIP (horizontal, wraps) ──────────────────────────────────────

  private renderTraitStrip(me: PlayerState): void {
    this.traitLayer.removeChildren();
    const chips = traitStripModel(me.board, gameData.units, gameData.traits);
    const rail = this.layout.regions.traitRail;
    const chipH = 18;

    if (this.isLandscape) {
      this.drawTraitRailContent(me);
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

  /**
   * Landscape-only left-column tab switcher: tab 1 = traits, tab 2 = item browse.
   * Owns the single traitLayer clear; draws the tab buttons in `traitTabBar`, then
   * dispatches the rail CONTENT (below) to a non-clearing drawer. The swap is an
   * instant content re-render (no animation). View-only UI state.
   */
  private renderRailTabs(me: PlayerState): void {
    this.traitLayer.removeChildren();
    const bar = this.layout.regions.traitTabBar;
    const btnW = (bar.w - 2) / 2;

    const drawTab = (
      label: string,
      tab: "traits" | "items",
      bx: number
    ): void => {
      const active = this.activeRailTab === tab;
      const g = new PIXI.Graphics();
      g.roundRect(bx, bar.y, btnW, bar.h, 3).fill({ color: C.panelBg, alpha: active ? 0.95 : 0.5 });
      g.roundRect(bx, bar.y, btnW, bar.h, 3).stroke({ width: 1, color: active ? C.tier3 : C.chipBorder, alpha: active ? 0.9 : 0.5 });
      g.alpha = active ? 1 : 0.6;
      g.eventMode = "static";
      g.cursor = "pointer";
      g.hitArea = new PIXI.Rectangle(bx, bar.y, btnW, bar.h);
      g.on("pointertap", () => {
        if (this.activeRailTab === tab) return;
        this.activeRailTab = tab;
        this.traitRailPage = 0;
        this.renderRailTabs(me);
      });
      this.traitLayer.addChild(g);
      this.text(this.traitLayer, label, bx + btnW / 2, bar.y + bar.h / 2, 9, active ? C.textPrimary : C.textMuted, [0.5, 0.5]);
    };

    drawTab("1", "traits", bar.x);
    drawTab("2", "items", bar.x + btnW + 2);

    if (this.activeRailTab === "traits") this.drawTraitRailContent(me);
    else this.renderItemBrowse(me);
  }

  /**
   * Landscape trait rail (tab 1): a vertical list of trait ROWS styled after the
   * reference — a sizable pointy-top hexagon emblem (colored by the trait's
   * current activation tier) on the left, the trait name + `count/denominator`
   * to its right. Active traits read bright/lit; sub-first-breakpoint traits are
   * greyed. Sort comes from `traitStripModel` (active-first → tier reached →
   * count). When the list overflows the rail it pages: each page that has more
   * rows after it reserves its last slot for a clickable "+N" pager (advance),
   * and every page past the first reserves a slot for a "‹ Back" control
   * (return to page 0). The current page lives in `traitRailPage` (view-only).
   * Assumes traitLayer is already cleared.
   */
  private drawTraitRailContent(me: PlayerState): void {
    const chips = traitStripModel(me.board, gameData.units, gameData.traits);
    const rail = this.layout.regions.traitRail;

    const rowH = 40;
    const gapY = 6;
    const stride = rowH + gapY;
    // How many slots (rows + pager affordances) fit in the rail.
    const fit = Math.max(1, Math.floor((rail.h + gapY) / stride));

    // No overflow: render every chip, no pager affordances.
    if (chips.length <= fit) {
      this.traitRailPage = 0;
      let rowY = rail.y;
      for (const chip of chips) {
        this.drawTraitRow(this.traitLayer, chip, rail.x, rowY, rail.w, rowH);
        rowY += stride;
      }
      return;
    }

    // Paginate. Page 0 reserves its last slot for a "+N" pager. Subsequent
    // pages reserve their first slot for a "‹ Back" control and (when more rows
    // remain after the page) their last slot for the "+N" pager.
    const firstPageRows = fit - 1; // page 0: rows + trailing pager
    const innerPageRows = Math.max(1, fit - 2); // pages>0 worst case: back + rows + pager
    const lastPageRows = fit - 1; // last page>0: back + rows (no trailing pager)

    // Build the page boundaries deterministically so clamp + render agree.
    const starts: number[] = [];
    let consumed = 0;
    starts.push(0);
    consumed = firstPageRows;
    while (consumed < chips.length) {
      starts.push(consumed);
      const remaining = chips.length - consumed;
      consumed += remaining <= lastPageRows ? remaining : innerPageRows;
    }
    const lastPage = starts.length - 1;
    // Clamp a stale page (e.g. the board shrank) back into range.
    this.traitRailPage = Math.max(0, Math.min(this.traitRailPage, lastPage));
    const page = this.traitRailPage;

    const start = starts[page]!;
    const isFirst = page === 0;
    const isLast = page === lastPage;
    // Rows this page can show before its reserved affordance slots.
    const rowCap = (isFirst ? fit : fit - 1) - (isLast ? 0 : 1);
    const end = Math.min(chips.length, start + Math.max(0, rowCap));

    let rowY = rail.y;
    if (!isFirst) {
      this.drawTraitPagerRow(this.traitLayer, "back", 0, rail.x, rowY, rail.w, rowH);
      rowY += stride;
    }
    for (let i = start; i < end; i++) {
      this.drawTraitRow(this.traitLayer, chips[i]!, rail.x, rowY, rail.w, rowH);
      rowY += stride;
    }
    if (!isLast) {
      this.drawTraitPagerRow(this.traitLayer, "next", chips.length - end, rail.x, rowY, rail.w, rowH);
    }
  }

  /**
   * One landscape trait-rail row: pointy-top hexagon emblem (tier-colored) +
   * glyph on the left, trait name over `count/denominator` on the right. The
   * whole row is the tap target → opens the trait-detail panel.
   */
  private drawTraitRow(
    layer: PIXI.Container, c: TraitChip, x: number, y: number, w: number, h: number
  ): void {
    const active = c.activeBreakpoint !== null;
    // Tier color: active → step the existing tier ramp by the trait's reached
    // tier mapped onto the trait's tier span so the TOP tier reads gold and
    // lower active tiers step down; inactive → desaturated grey.
    const tierIdx = active
      ? Math.max(1, Math.min(5, 5 - (c.tierCount - c.activeTier)))
      : 1;
    const emblem = active ? tierColor(tierIdx) : C.borderSubtle;
    const ink = active ? C.textPrimary : C.textDimmed;
    const sub = active ? C.textMuted : C.textDimmed;

    // Denominator: maxed → activeBreakpoint, active-not-maxed → nextBreakpoint,
    // inactive → its first (next) breakpoint, falling back to the raw count.
    const denom = c.nextBreakpoint ?? c.activeBreakpoint ?? c.count;
    const countStr = `${c.count}/${denom}`;

    // Tap target spanning the row.
    const hit = new PIXI.Graphics();
    hit.rect(x, y, w, h).fill({ color: C.surfaceFloat, alpha: 0.001 });
    hit.eventMode = "static";
    hit.cursor = "pointer";
    hit.hitArea = new PIXI.Rectangle(x, y, w, h);
    const tid = c.traitId;
    const tcount = c.count;
    hit.on("pointertap", () => this.openTraitDetail(tid, tcount));
    layer.addChild(hit);

    // Pointy-top hexagon emblem on the left.
    const hexR = Math.min(h / 2, 18);
    const hcx = x + hexR + 2;
    const hcy = y + h / 2;
    const pts = this.pointyHexPoints(hcx, hcy, hexR);
    const hex = new PIXI.Graphics();
    hex.poly(pts).fill({ color: emblem, alpha: active ? 1 : 0.55 });
    hex.poly(pts).stroke({ width: 2, color: active ? emblem : C.chipBorder, alpha: active ? 1 : 0.7 });
    hex.alpha = active ? 1 : 0.6;
    layer.addChild(hex);
    // Glyph centered inside the hexagon (dark ink over the lit emblem; muted
    // over the grey inactive emblem).
    this.glyph(layer, this.traitGlyph(c.traitId), hcx, hcy, hexR * 0.95, active ? C.panelBg : C.textDimmed);

    // Name + count column to the right of the emblem.
    const tx = hcx + hexR + 6;
    const cyMid = y + h / 2;
    this.text(layer, c.name, tx, cyMid - 7, 10, ink, [0, 0.5], active ? "700" : "400");
    this.text(layer, countStr, tx, cyMid + 8, 9, sub, [0, 0.5]);
  }

  /**
   * Clickable pager badge row for the landscape trait rail. `"next"` shows a
   * "+N" hexagon that advances `traitRailPage`; `"back"` shows a "‹" return
   * control (with a "Back" label) that jumps to page 0. Both re-render the rail
   * immediately via the same path the tab bar uses, keeping the tab bar intact.
   */
  private drawTraitPagerRow(
    layer: PIXI.Container, dir: "next" | "back", n: number, x: number, y: number, w: number, h: number
  ): void {
    const hexR = Math.min(h / 2, 18);
    const hcx = x + hexR + 2;
    const hcy = y + h / 2;
    const pts = this.pointyHexPoints(hcx, hcy, hexR);
    const hex = new PIXI.Graphics();
    hex.poly(pts).fill({ color: C.surfaceFloat });
    hex.poly(pts).stroke({ width: 2, color: C.chipBorder, alpha: 0.8 });
    layer.addChild(hex);
    this.text(layer, dir === "next" ? `+${n}` : "‹", hcx, hcy, dir === "next" ? 11 : 16, C.textMuted, [0.5, 0.5], "700");
    if (dir === "back") {
      // Label so the return control reads unambiguously.
      this.text(layer, "Back", hcx + hexR + 6, hcy, 10, C.textMuted, [0, 0.5], "700");
    }

    // Full-row tap target → page change + immediate re-render.
    const hit = new PIXI.Graphics();
    hit.rect(x, y, w, h).fill({ color: C.surfaceFloat, alpha: 0.001 });
    hit.eventMode = "static";
    hit.cursor = "pointer";
    hit.hitArea = new PIXI.Rectangle(x, y, w, h);
    hit.on("pointertap", () => {
      this.traitRailPage = dir === "next" ? this.traitRailPage + 1 : 0;
      const me = this.driver.getState().players[this.driver.seatIndex];
      if (me) this.renderRailTabs(me);
    });
    layer.addChild(hit);
  }

  /** Six vertices of a pointy-top (vertex-up) hexagon, for `poly()`. */
  private pointyHexPoints(cx: number, cy: number, r: number): number[] {
    const pts: number[] = [];
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 3; // start at the top vertex
      pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    return pts;
  }

  /**
   * Item browse (landscape tab 2): vertical list of the player's inventory in
   * `traitRail`. Chips are draggable for EQUIP/COMBINE exactly like the main
   * item bar (same `startDragItem`/`onItemDragEnd` path) and tap → item-info
   * modal. Assumes traitLayer is already cleared.
   */
  private renderItemBrowse(me: PlayerState): void {
    const inv = inventoryModel(me.items, gameData);
    const rail = this.layout.regions.traitRail;
    if (inv.length === 0) {
      this.text(this.traitLayer, "No items", rail.x, rail.y + 9, 9, C.textDimmed, [0, 0.5]);
      return;
    }
    const rowH = ITEM_SLOT + 4;
    const half = ITEM_SLOT / 2;
    let rowY = rail.y;
    for (const entry of inv) {
      if (this.dragItem?.index === entry.index) continue; // hide the source while dragging
      if (rowY + ITEM_SLOT > rail.y + rail.h) break; // clip to the rail
      const cx = rail.x + half;
      const cy = rowY + half;
      const id = entry.id;
      this.drawItemChip(this.traitLayer, entry, cx, cy, ITEM_SLOT, () => this.openItemDetail(id), (e) => this.startDragItem(entry, e));
      // Name label beside the icon (mirrors the trait chips' label; the row
      // extends rightward over the board's left margin like the trait stack).
      const m = itemModel(id, gameData);
      if (m) this.text(this.traitLayer, m.name, cx + half + 4, cy, 8, C.textPrimary, [0, 0.5]);
      rowY += rowH;
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
    const me = this.driver.getState().players[this.driver.seatIndex]!;
    this.renderBoard(me);
    this.renderBench(me);
    this.renderTopBench();
    this.renderShop(me);       // LEFT sell button replaces the Buy XP cluster
    this.renderShopToggle(me); // RIGHT sell button replaces the money-sack toggle
  }

  private startDragBench(idx: number, unit: UnitInstance, e: PIXI.FederatedPointerEvent): void {
    if (this.inspectOpen) return;
    if (this.peekTargetId !== null) return; // peek is view-only: no board edits
    this.selectedBenchIdx = null;
    this.selectedBoardIdx = null;
    this.isDragging = true;
    this.dragCatcher.eventMode = "static";
    this.dragUnit = { uid: unit.uid, fromBench: true, fromIdx: idx };
    this.armInspect(unit.defId, unit, e); // long-press still opens inspect
    this.createDragSprite(unit, e.globalX, e.globalY);
    const me = this.driver.getState().players[this.driver.seatIndex]!;
    this.renderBoard(me);
    this.renderBench(me);
    this.renderTopBench();
    this.renderShop(me);       // LEFT sell button replaces the Buy XP cluster
    this.renderShopToggle(me); // RIGHT sell button replaces the money-sack toggle
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
        this.closeCombineHint();
        this.render(this.driver.getState());
        this.openItemDetail(id);
        return;
      }
      if (me) this.onItemDragEnd(px, py, me);
      this.dragItem = null;
      this.render(this.driver.getState());
      return;
    }

    if (!this.dragUnit) return;
    if (!me) { this.dragUnit = null; return; }

    // Check if dropped on board area (screen → board via the inverse projection)
    const boardSlot = this.boardSlotAt(px, py);
    if (boardSlot >= 0) {
      const result = this.driver.playerCommand({
        type: "MOVE",
        unitUid: this.dragUnit.uid,
        toBench: false,
        toIndex: boardSlot,
      });
      if (!result.ok) this.showToast(result.error);
    } else if (this.inSellZone(px, py)) {
      // Sell zone takes priority over the bench: the whole visible sell-button
      // area is a valid drop-to-sell target, and in any residual overlap with the
      // bench's forgiving band the sell action wins (drop-to-sell never loses to a
      // bench MOVE).
      const dragged = me.bench.filter((u): u is UnitInstance => u != null)
        .concat(me.board.filter((u): u is UnitInstance => u != null))
        .find((u) => u.uid === this.dragUnit!.uid) ?? null;
      const refund = dragged ? sellValue(dragged, gameData) : 0;
      const result = this.driver.playerCommand({ type: "SELL", unitUid: this.dragUnit.uid });
      if (result.ok) { this.opts.audio.play("sell"); this.spawnSellPop(refund); }
      else this.showToast(result.error);
    } else {
      // Otherwise check the bench (orientation-aware hit testing). Sell was already
      // ruled out above, so the bench can keep its forgiving band without ever
      // swallowing a drop meant for the (corner) sell button.
      const benchIdx = this.benchSlotAt(px, py);
      if (benchIdx !== null) {
        const result = this.driver.playerCommand({
          type: "MOVE",
          unitUid: this.dragUnit.uid,
          toBench: true,
          toIndex: benchIdx,
        });
        if (!result.ok) this.showToast(result.error);
      }
      // else: dropped nowhere valid — unit stays put (no-op)
    }

    this.dragUnit = null;
    this.render(this.driver.getState());
  }

  /** True if (px, py) falls within either contextual sell button (forgiving). */
  private inSellZone(px: number, py: number): boolean {
    return this.inRect(px, py, this.leftSellRect()) || this.inRect(px, py, this.rightSellRect());
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
    if (this.peekTargetId !== null) return; // peek is view-only

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

  private onSellZoneClick(me: PlayerState, popAt?: { x: number; y: number }): void {
    if (this.isDragging) return;
    const sel = this.selectedUnit(me);
    this.selectedBenchIdx = null;
    this.selectedBoardIdx = null;
    if (sel) {
      const refund = sellValue(sel, gameData);
      const result = this.driver.playerCommand({ type: "SELL", unitUid: sel.uid });
      if (result.ok) {
        this.opts.audio.play("sell");
        this.spawnSellPop(refund);
      } else {
        this.showToast(result.error);
      }
    }
    this.render(this.driver.getState());
  }

  /**
   * Sell feedback: a "+N" gold floater that ALWAYS rises from the gold/shop
   * medallion in the bottom-right HUD (never over the sold unit or the sell
   * zone). Spawned on lootLayer — the top overlay layer ABOVE the HUD — so the
   * floater renders over the medallion instead of being occluded behind it
   * (planningFxLayer sits below the HUD chrome).
   */
  private spawnSellPop(refund: number): void {
    if (this.opts.settings.get().reducedMotion) return;
    // Anchor over the gold/shop medallion (the money-sack toggle slot).
    const m = this.shopToggleRect();
    const x = m.x + m.w / 2;
    const y = m.y + m.h / 2;
    const node = new PIXI.Container();
    node.position.set(x, y - 18);
    this.glyph(node, "coin", -8, 0, 9, C.accentGold);
    this.text(node, `+${refund}`, 3, 0, 11, C.textGold, [0, 0.5]);
    node.eventMode = "none";
    this.lootLayer.addChild(node);
    let age = 0;
    const ttl = 620;
    const fn = (ticker: PIXI.Ticker): void => {
      age += ticker.deltaMS;
      node.y -= ticker.deltaMS * 0.04; // float upward off the medallion
      node.alpha = Math.max(0, 1 - age / ttl);
      if (age >= ttl) {
        this.app.ticker.remove(fn);
        this.lootLayer.removeChild(node);
        node.destroy({ children: true });
      }
    };
    this.app.ticker.add(fn);
  }

  private onShopBuy(idx: number): void {
    if (this.peekTargetId !== null) return; // peek is view-only
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

  /**
   * Pixel center of shop card `idx` (mirrors renderShopPanel's 7-slot grid).
   * Cards live in the drop-down panel in both orientations now; it's only open
   * when a buy fires, so the panel's slide offset is 0 and these design coords
   * match the rendered card positions.
   */
  private shopCardCenter(idx: number): { x: number; y: number } {
    const pr = this.shopPanelRect();
    const pad = 10;
    const innerArea = { x: pr.x + pad, y: pr.y + pad, w: pr.w - 2 * pad, h: pr.h - 2 * pad };
    const rect = shopPanelSlotRect(innerArea, idx + 1); // slot 0 = refresh
    return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 + this.shopPanelOffsetY };
  }

  /** uid → star across board + bench, for detecting a merge after a command. */
  private starSnapshot(): Map<number, number> {
    const m = new Map<number, number>();
    const me = this.driver.getState().players[this.driver.seatIndex];
    if (!me) return m;
    for (const u of me.board) if (u) m.set(u.uid, u.star);
    for (const u of me.bench) if (u) m.set(u.uid, u.star);
    return m;
  }

  /** First board/bench unit at ≥2 star that is new or higher than `before`, with its pixel. */
  private findStarUp(before: Map<number, number>): { x: number; y: number } | null {
    const me = this.driver.getState().players[this.driver.seatIndex];
    if (!me) return null;
    for (let idx = 0; idx < me.board.length; idx++) {
      const u = me.board[idx];
      if (u && u.star >= 2 && (before.get(u.uid) ?? 0) < u.star) {
        return this.fwd(hexToPixel(idx % BOARD_COLS, Math.floor(idx / BOARD_COLS), this.boardOffsetX, this.boardOffsetY, this.boardScale));
      }
    }
    for (let i = 0; i < me.bench.length; i++) {
      const u = me.bench[i];
      if (u && u.star >= 2 && (before.get(u.uid) ?? 0) < u.star) {
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

  // ─── PEEK (in-board scouting: swap the board view, no popup) ───────────────

  /**
   * Peek another player: instead of a popup, swap the in-board view to show THEIR
   * state (units + bench + candles + econ) on a board with the SAME orientation,
   * layout, and side as your own POV — NO flip, NO mirror (their units sit on the
   * same near/bottom side as yours). The return-to-board medallion (replacing the
   * shop medallion) is the way back; tapping a different player's avatar switches
   * the peek. View-only — never touches my board, bench, econ, or the sim;
   * exiting restores my own board exactly.
   */
  private enterPeek(playerId: number): void {
    const state = this.driver.getState();
    if (state.phase !== "PLANNING") return;
    if (playerId === this.driver.seatIndex) return;
    if (!state.players[playerId]) return;
    // Drop any in-progress selection/drag/inspect so the peeked view is clean.
    this.selectedBenchIdx = null;
    this.selectedBoardIdx = null;
    this.closeInspect();
    // Close my own shop drop-down so its panel/backdrop never lingers over the
    // read-only peeked econ region (tear down any in-flight slide ticker too).
    this.shopPanelOpen = false;
    if (this.shopPanelAnimFn !== null) {
      this.app.ticker.remove(this.shopPanelAnimFn);
      this.shopPanelAnimFn = null;
    }
    this.shopPanelOffsetY = -(this.shopPanelRect().h + SHOP_PANEL_HIDE_MARGIN);
    this.peekTargetId = playerId;
    this.render(state);
  }

  /** Leave peek and restore my own board view. */
  private exitPeek(): void {
    if (this.peekTargetId === null) return;
    this.peekTargetId = null;
    this.scoutLayer.removeChildren();
    this.closeInspect();
    this.render(this.driver.getState());
  }

  /**
   * Tears down peek state + chrome WITHOUT re-rendering (used on phase change /
   * combat / match-over, where the caller renders the next phase itself).
   */
  private clearPeek(): void {
    this.peekTargetId = null;
    this.scoutLayer.removeChildren();
  }

  /**
   * Renders the peeked player's board with the SAME orientation, layout, and side
   * as your own POV — NO flip and NO mirror of any kind. The board reads exactly
   * like your own (neutral/empty enemy zone on the far half, your near/bottom half
   * holding the units), but the units shown are the PEEKED player's, placed on
   * their actual slot positions on the near side just as your own would be.
   *
   * Strictly view-only: long-press a token to inspect; no drag/drop, no selection,
   * no command. Never touches any board/bench/econ/sim — exiting peek restores
   * your own board exactly. Returning is via the bottom-right return-to-board
   * medallion (see renderReturnToBoardButton).
   */
  private renderPeekBoard(target: PlayerState): void {
    this.boardLayer.removeChildren();
    this.drawBoardPanel(this.boardLayer);
    // Their candles (gold meter) carried by their board-space anchors — left
    // column lit from the PEEKED player's gold (graceful empty when gold is
    // server-private online, exactly like the opponent column in combat).
    this.drawArenaTorches(this.boardLayer, target, false);
    const offX = this.boardOffsetX;
    const playerY = this.boardOffsetY; // near (your/bottom) half — the units sit here
    const oppY = this.oppBoardOffsetY; // far (top) half — empty neutral enemy zone
    const s = this.boardScale;
    const hexR = this.hexTileR;
    const tokR = this.boardTokenR;
    const fwd = (p: { x: number; y: number }): { x: number; y: number } => this.fwd(p);

    // Enemy zone (top 4 rows) — same neutral tint/treatment as your own board's
    // enemy half; empty, non-interactive.
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let q = 0; q < BOARD_COLS; q++) {
        const fp = hexToPixel(q, r, offX, oppY, s);
        const farG = new PIXI.Graphics();
        drawHex(farG, fp.x, fp.y, hexR, C.enemyHex, 1, {}, fwd);
        farG.eventMode = "none";
        this.boardLayer.addChild(farG);
      }
    }
    // Player zone (bottom 4 rows) — same near-half tint as your own board.
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let q = 0; q < BOARD_COLS; q++) {
        const np = hexToPixel(q, r, offX, playerY, s);
        const nearG = new PIXI.Graphics();
        drawHex(nearG, np.x, np.y, hexR, C.myHex, 1, {}, fwd);
        nearG.eventMode = "none";
        this.boardLayer.addChild(nearG);
      }
    }
    const grid = new PIXI.Graphics();
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let q = 0; q < BOARD_COLS; q++) {
        const fp = hexToPixel(q, r, offX, oppY, s);
        addHexPath(grid, fp.x, fp.y, hexR, fwd);
        const np = hexToPixel(q, r, offX, playerY, s);
        addHexPath(grid, np.x, np.y, hexR, fwd);
      }
    }
    grid.stroke({ width: 1, color: C.boardBorder, alpha: 0.4 });
    grid.eventMode = "none";
    this.boardLayer.addChild(grid);

    // Peeked units: placed on the near/bottom half at their ACTUAL slot position
    // (same (q, r) mapping as your own board) — NO flip, NO mirror. Drawn
    // back-to-front so nearer (larger, depth-scaled) tokens overlap farther ones.
    for (let idx = 0; idx < BOARD_SLOTS; idx++) {
      const unit = target.board[idx];
      if (!unit) continue;
      const q = idx % BOARD_COLS;
      const r = Math.floor(idx / BOARD_COLS);
      const bp = hexToPixel(q, r, offX, playerY, s);
      const sp = this.fwd(bp);
      const sc = this.depthScaleAt(bp);
      const uc = new PIXI.Container();
      uc.eventMode = "static";
      uc.cursor = "pointer";
      const u = unit;
      uc.on("pointerdown", (e: PIXI.FederatedPointerEvent) => this.armInspect(u.defId, u, e));
      uc.on("pointerup", () => this.clearPress());
      uc.on("pointerupoutside", () => this.clearPress());
      drawUnit(uc, unit, sp.x, sp.y, Math.round(tokR * sc), false, true, true);
      this.boardLayer.addChild(uc);
    }
  }

  /**
   * Read-only peeked bench: the peeked player's bench units drawn into the
   * existing bench region, with NO drag/sell/tap wiring. View-only.
   */
  private renderPeekBench(target: PlayerState): void {
    this.benchLayer.removeChildren();

    // Landscape: the column-bg panel behind the left rail (matches renderBench).
    if (this.isLandscape && this.layout.clusters) {
      const lr = this.layout.clusters.leftRail;
      const colBg = new PIXI.Graphics();
      colBg.roundRect(lr.x - 4, lr.y - 4, lr.w + 8, lr.h + 8, 6).fill({ color: C.bgHud, alpha: 0.4 });
      colBg.eventMode = "none";
      this.benchLayer.addChild(colBg);
    }

    for (let i = 0; i < 9; i++) {
      const { x: cx, y: cy } = this.benchSlotCenter(i);
      const unit = target.bench[i];
      const occupied = unit != null;
      let cellW: number, cellH: number, cellX: number, cellY: number;
      if (this.isLandscape) {
        const r = this.layout.regions.bench;
        cellW = r.w / 9; cellH = r.h; cellX = cx - cellW / 2; cellY = cy - cellH / 2;
      } else {
        const { slotH, slotW } = this.benchGeom();
        cellW = slotW; cellH = slotH; cellX = cx - slotW / 2; cellY = cy - slotH / 2;
      }
      const g = new PIXI.Graphics();
      g.roundRect(cellX + 1, cellY, cellW - 2, cellH, 4)
        .fill({ color: occupied ? C.benchOccupied : C.benchEmpty, alpha: occupied ? 1.0 : 0.5 });
      g.roundRect(cellX + 1, cellY, cellW - 2, cellH, 4)
        .stroke({ width: 1, color: occupied ? C.chipBorder : C.benchEmptyRim, alpha: occupied ? 0.9 : 0.5 });
      g.eventMode = "none"; // view-only: no slot interaction while peeking
      this.benchLayer.addChild(g);
      if (unit) {
        const uc = new PIXI.Container();
        uc.eventMode = "none";
        const r = Math.max(12, Math.min(18, Math.round(0.42 * Math.min(cellW, cellH))));
        drawUnit(uc, unit, cx, cy, r, false, false, true);
        this.benchLayer.addChild(uc);
      }
    }
  }

  /**
   * Read-only peeked economy: the peeked player's gold + level/XP shown in the
   * econ/HUD region (where my own controls normally sit). No interactive buttons.
   * Clears the shop/toggle/panel layers so my own shop chrome never lingers.
   */
  private renderPeekEcon(target: PlayerState): void {
    this.shopLayer.removeChildren();
    this.shopToggleLayer.removeChildren();
    this.shopPanelLayer.removeChildren();
    this.shopBackdropLayer.removeChildren();

    const hud = this.layout.regions.hud;
    const cy = hud.y + hud.h / 2;
    const x0 = hud.x + 10;

    // Level badge.
    this.glyph(this.shopLayer, "banner", x0 + 6, cy, 12, C.tier3);
    this.text(this.shopLayer, `L${target.level}`, x0 + 16, cy, 13, C.textPrimary, [0, 0.5], "700");

    // XP progress (level/XP) — a thin bar after the level badge.
    const xp = xpProgress(target.xp, target.level, gameData.economy.levelXpThresholds);
    const barX = x0 + 44, barW = 60, barH = 6, barY = cy - barH / 2;
    const xpg = new PIXI.Graphics();
    xpg.roundRect(barX, barY, barW, barH, 2).fill({ color: C.xpArcTrack, alpha: 0.9 });
    if (xp.frac > 0) {
      xpg.roundRect(barX, barY, Math.max(0, barW * xp.frac), barH, 2).fill({ color: C.xpPurple, alpha: 1 });
    }
    xpg.eventMode = "none";
    this.shopLayer.addChild(xpg);

    // Gold (coin glyph + amount).
    const goldX = barX + barW + 16;
    this.glyph(this.shopLayer, "coin", goldX, cy, 13, C.accentGold);
    this.text(this.shopLayer, `${target.gold}`, goldX + 12, cy, 18, C.textGold, [0, 0.5]);

    // Streak (read-only), matching the own-board econ display.
    const streak = target.winStreak > 0 ? target.winStreak : target.loseStreak > 0 ? -target.loseStreak : 0;
    if (streak !== 0) {
      const sX = goldX + 64;
      this.glyph(this.shopLayer, "flame", sX, cy, 12, C.streakOrange);
      this.text(this.shopLayer, `${streak > 0 ? "+" : ""}${streak}`, sX + 12, cy, 12, C.streakOrange, [0, 0.5]);
    }

    // Return-to-board button — occupies the EXACT shop medallion spot (it
    // replaces the shop toggle during peek). This is now the ONLY way back.
    this.renderReturnToBoardButton();
  }

  /**
   * Return-to-board medallion, shown ONLY while peeking. Occupies the exact
   * position/size/style of the shop/gold medallion (`shopToggleRect` +
   * `drawMedallionBase`) — it stands in for that medallion during peek. Its
   * central glyph is the light-blue keystone/trapezoid emblem; tapping it
   * returns to my own board. Drawn into the (cleared) shopToggleLayer.
   */
  private renderReturnToBoardButton(): void {
    const r = this.shopToggleRect();
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const bx = buyXpGeom(this.isLandscape ? this.buyXpRegionLandscape() : this.layout.regions.hud);
    const R = bx.r;
    const rimW = bx.rimW;

    const g = this.drawMedallionBase(cx, cy, R, rimW, { fill: C.xpBtnDisc });
    this.shopToggleLayer.addChild(g);
    g.eventMode = "static";
    g.cursor = "pointer";
    g.hitArea = new PIXI.Rectangle(r.x, r.y, r.w, r.h);
    this.pressFeedback(g, () => this.exitPeek(), { cx, cy });

    // Central keystone emblem, centered on the medallion (occupies the middle
    // ~46% of the disc, leaving comfortable dark padding to the rim).
    this.drawReturnToBoardGlyph(this.shopToggleLayer, cx, cy, R * 0.92);
  }

  /**
   * Light-blue keystone/trapezoid "return to board" emblem (see
   * references/return-to-board.md): a symmetric trapezoid — narrower top, wider
   * bottom — with softly rounded corners, a domed upper-left bevel (highlight →
   * mid → shade in one blue hue family), a hairline darker outer rim, and a thin
   * concentric inner outline of the SAME silhouette. Pixi v8 path API; colors
   * from theme.ts (returnHi/Mid/Shade/Rim/Line). `size` = the glyph footprint.
   */
  private drawReturnToBoardGlyph(layer: PIXI.Container, cx: number, cy: number, size: number): void {
    const g = new PIXI.Graphics();
    g.eventMode = "none";

    const halfH = size * 0.5;
    const halfBot = size * 0.5;          // bottom edge = full width
    const halfTop = halfBot * 0.62;      // top edge ≈ 62% of bottom (keystone taper)
    const cr = size * 0.1;               // corner radius (~10% of width)
    const yTop = cy - halfH;
    const yBot = cy + halfH;

    // Build a rounded trapezoid path from its four corners. The edges run
    // top-right → bottom-right → bottom-left → top-left; corners are eased with
    // quadratic arcs toward the next edge so all four read consistently rounded.
    const roundedTrapezoid = (gr: PIXI.Graphics, ht: number, hb: number, yt: number, yb: number, rad: number): void => {
      const tr = { x: cx + ht, y: yt }, br = { x: cx + hb, y: yb };
      const bl = { x: cx - hb, y: yb }, tl = { x: cx - ht, y: yt };
      // Unit direction along each edge, used to back off `rad` from each corner.
      const lerp = (a: { x: number; y: number }, b: { x: number; y: number }, d: number): { x: number; y: number } => {
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        return { x: a.x + (dx / len) * d, y: a.y + (dy / len) * d };
      };
      gr.moveTo(lerp(tr, br, rad).x, lerp(tr, br, rad).y);
      gr.lineTo(lerp(br, tr, rad).x, lerp(br, tr, rad).y);
      gr.quadraticCurveTo(br.x, br.y, lerp(br, bl, rad).x, lerp(br, bl, rad).y);
      gr.lineTo(lerp(bl, br, rad).x, lerp(bl, br, rad).y);
      gr.quadraticCurveTo(bl.x, bl.y, lerp(bl, tl, rad).x, lerp(bl, tl, rad).y);
      gr.lineTo(lerp(tl, bl, rad).x, lerp(tl, bl, rad).y);
      gr.quadraticCurveTo(tl.x, tl.y, lerp(tl, tr, rad).x, lerp(tl, tr, rad).y);
      gr.lineTo(lerp(tr, tl, rad).x, lerp(tr, tl, rad).y);
      gr.quadraticCurveTo(tr.x, tr.y, lerp(tr, br, rad).x, lerp(tr, br, rad).y);
      gr.closePath();
    };

    // Outer body: mid fill + thin darker rim against the dark disc.
    roundedTrapezoid(g, halfTop, halfBot, yTop, yBot, cr);
    g.fill({ color: C.returnMid });
    roundedTrapezoid(g, halfTop, halfBot, yTop, yBot, cr);
    g.stroke({ width: Math.max(1, size * 0.05), color: C.returnRim, alpha: 0.9, join: "round" });

    // Upper-left bevel: a soft lighter highlight wedge biased to the upper-left,
    // and a deeper shade wedge biased to the lower-right — approximates the domed
    // enamel surface lit from the upper-left without a hard cel split.
    g.poly([cx - halfTop, yTop, cx + halfTop * 0.2, yTop, cx - halfBot, yBot])
      .fill({ color: C.returnHi, alpha: 0.5 });
    g.poly([cx + halfTop, yTop, cx + halfBot, yBot, cx - halfBot * 0.2, yBot])
      .fill({ color: C.returnShade, alpha: 0.45 });

    // Inner concentric outline (stroke only — same silhouette, inset ~13% of the
    // outer height), reads as an engraved contour line.
    const inset = size * 0.13;
    const innerHalfH = halfH - inset;
    roundedTrapezoid(
      g,
      Math.max(0, halfTop - inset), Math.max(0, halfBot - inset),
      cy - innerHalfH, cy + innerHalfH, Math.max(0.5, cr * 0.7)
    );
    g.stroke({ width: Math.max(1, size * 0.045), color: C.returnLine, alpha: 0.95, join: "round" });

    layer.addChild(g);
  }

  // (The PvE creep board is previewed directly on the enemy half of the main
  // board during planning — see renderBoard — so there's no separate PvE scout
  // overlay. The PvP scout overlay above stays for scouting other players.)

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

  /**
   * Drives the planning countdown text once per second so it visibly drains
   * (the renderer only repaints on state changes, so without this the timer
   * froze at its phase-entry value and combat appeared to start with no
   * warning). Updates only the retained Text node — no full re-render. Torn
   * down on every phase change / destroy via clearPlanningTimerTick.
   */
  private startPlanningTimerTick(): void {
    // Remove only a prior ticker fn — do NOT null the progress-bar refs here.
    // renderStageBar (called immediately before this in onPlanningStart) just
    // assigned the live bar + geom; calling the full clearPlanningTimerTick()
    // would wipe them, leaving the bar frozen until the next state re-render (the
    // first-round "number drains but bar doesn't move" bug — there's no player
    // interaction yet on round 1 to trigger that re-render).
    if (this.planningTimerFn) {
      this.app.ticker.remove(this.planningTimerFn);
      this.planningTimerFn = null;
    }
    let acc = 0;
    const fn = (ticker: PIXI.Ticker): void => {
      if (this.driver.getState().phase !== "PLANNING") return;
      const left = this.driver.getPlanningTimeLeft();
      // Progress bar drains every frame from the same live clock the number reads.
      this.redrawPlanningProgress(left);
      acc += ticker.deltaMS;
      if (acc < 250) return; // ~4Hz number update: cheap, still smooth at the second boundary
      acc = 0;
      const node = this.planningTimerText;
      if (!node) return;
      const secs = Math.max(0, Math.ceil(left / 1000));
      node.text = `${secs}`;
      node.style.fill = secs <= 5 ? C.hpLow : C.textPrimary;
    };
    this.app.ticker.add(fn);
    this.planningTimerFn = fn;
  }

  private clearPlanningTimerTick(): void {
    if (this.planningTimerFn) {
      this.app.ticker.remove(this.planningTimerFn);
      this.planningTimerFn = null;
    }
    this.planningProgressBar = null;
    this.planningProgressGeom = null;
  }

  private onPlanningStart(): void {
    this.teardownPlayback();
    this.clearResolutionTimer();
    this.clearLootReveal();
    this.clearPress();
    this.combatLayer.removeChildren();
    this.clearPeek();
    this.closeInspect();
    this.traitRailPage = 0;
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
    this.renderSkipButton();
    this.startPlanningTimerTick();
  }

  private onCombatPhase(): void {
    this.clearPlanningTimerTick();
    this.renderSkipButton(); // hides the playtest Skip pill (phase no longer PLANNING)
    const state = this.driver.getState();
    void this.opts.audio.setMusicState(phaseToMusicState("COMBAT"));
    // Bridge planning → combat with a brief cross-fade so the cut isn't a hard
    // single-frame flash. Reduced-motion skips straight to the combat render.
    if (this.opts.settings.get().reducedMotion) {
      this.renderCombat(state);
      return;
    }
    const planning = [this.boardLayer, this.benchLayer, this.shopLayer, this.traitLayer, this.shopPanelLayer, this.shopToggleLayer];
    let t = 0;
    const fade = (ticker: PIXI.Ticker): void => {
      t += ticker.deltaMS;
      const k = Math.min(1, t / 120);
      for (const l of planning) l.alpha = 1 - k;
      if (k >= 1) {
        this.app.ticker.remove(fade);
        for (const l of planning) l.alpha = 1;
        // The phase may have already advanced past COMBAT (a fast PvE round can
        // hit RESOLUTION before this 120ms fade completes). Rendering the combat
        // board then would stamp the combat header on top of the resolution
        // overlay — so only render combat if we're still in COMBAT.
        if (this.driver.getState().phase === "COMBAT") this.renderCombat(this.driver.getState());
      }
    };
    this.app.ticker.add(fade);
  }

  private renderCombat(state: MatchState): void {
    this.teardownPlayback();
    this.clearPress();
    this.clearPeek();
    this.closeInspect();
    this.combatLayer.removeChildren();
    // Hide planning UI
    this.boardLayer.removeChildren();
    this.benchLayer.removeChildren();
    this.shopLayer.removeChildren();
    this.traitLayer.removeChildren();
    this.resetShopPanel();
    this.closeCombineHint();
    this.clearLootReveal();
    this.dragItem = null;

    const me = state.players[this.driver.seatIndex];
    if (!me) return;

    // Board-bg panel first so banners/tiles/tokens layer on top of it.
    this.drawBoardPanel(this.combatLayer);
    // Arena torches: LEFT = my gold, RIGHT = opponent gold (combat-only).
    this.drawArenaTorches(this.combatLayer, me, true);

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
    const hexR = this.hexTileR; // tessellating tile size — no inter-hex gap
    const tokR = this.boardTokenR;
    const enemyZone = isPve ? C.mobZone : C.enemyHex;
    const fwd = (p: { x: number; y: number }): { x: number; y: number } => this.fwd(p);
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let q = 0; q < BOARD_COLS; q++) {
        const opp = hexToPixel(q, r, offX, oppY, s);
        const og = new PIXI.Graphics();
        drawHex(og, opp.x, opp.y, hexR, enemyZone, 1, {
          border: { color: C.boardBorder, width: 1, alpha: 0.3 },
        }, fwd);
        this.combatLayer.addChild(og);

        const own = hexToPixel(q, r, offX, playerY, s);
        const g = new PIXI.Graphics();
        drawHex(g, own.x, own.y, hexR, C.myHex, 1, {
          border: { color: C.boardBorder, width: 1, alpha: 0.3 },
        }, fwd);
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
        const bp = hexToPixel(q, r, offX, playerY, s);
        const sp = this.fwd(bp);
        const uc = new PIXI.Container();
        drawUnit(uc, unit, sp.x, sp.y, Math.round(tokR * this.depthScaleAt(bp)), false, true, true);
        this.combatLayer.addChild(uc);
      }
      this.driver.combatPlaybackDone();
    }

    // Single combat header, placed in the clear band just below the board panel
    // (outside both hex zones) and given a high zIndex so the sortable
    // combatLayer always draws it above the tiles/tokens — never behind them.
    // Clamp into view for short landscape (board panel nearly fills designH).
    // PvE rounds render NO header text once combat starts (the PvE label lives
    // only in the planning-phase board preview); PvP keeps its "vs X" header.
    if (!isPve) {
      const b = this.layout.regions.board;
      const headerY = Math.min(b.y + b.h + 12, this.designH - 10);
      const header = new PIXI.Text(`COMBAT  ·  vs ${opponentName}`, {
        fontSize: 13, fill: C.textCombat, fontFamily: "monospace",
      });
      header.anchor.set(0.5, 0.5);
      header.x = this.designW / 2;
      header.y = headerY;
      header.zIndex = Z_COMBAT_HEADER;
      header.eventMode = "none";
      this.combatLayer.addChild(header);
    }
  }

  // ─── COMBAT PLAYBACK ─────────────────────────────────────────────────────

  private startPlayback(events: CombatEvent[], side: 0 | 1): void {
    // Display rows 0-3 = opponent half, 4-7 = my half (toDisplayHex keeps my
    // units on the bottom regardless of pairing side).
    const offX = this.boardOffsetX;
    const playerY = this.boardOffsetY;
    const oppY = this.oppBoardOffsetY;
    const s = this.boardScale;
    // Board-space position of a display hex (flat). Every combat conversion —
    // unit positions, projectiles, ability/VFX anchors — is routed from here
    // through the perspective forward(), and the depth scale comes from the same
    // board-space point so combat entities scale with the tilted ground.
    const toBoard = (hex: HexCoord): { x: number; y: number } => {
      const d = toDisplayHex(hex, side);
      return d.r < BOARD_ROWS
        ? hexToPixel(d.q, d.r, offX, oppY, s)
        : hexToPixel(d.q, d.r - BOARD_ROWS, offX, playerY, s);
    };
    const toPixel = (hex: HexCoord): { x: number; y: number } => this.fwd(toBoard(hex));
    const entityScale = (hex: HexCoord): number => this.depthScaleAt(toBoard(hex));

    const reducedMotion = this.opts.settings.get().reducedMotion;
    const player = new CombatPlayer(events, gameData.gameplay.ticksPerSec, gameData, { reducedMotion });
    player.setSpeed(this.playbackSpeed);
    // Overtime banner sits near the top (far edge) of the board, in SCREEN space
    // (boardOffset* are board-source coords now — route them through fwd()).
    const banner = this.fwd(hexToPixel(Math.floor(BOARD_COLS / 2), 0, offX, oppY, s));
    const view = new CombatView(toPixel, {
      x: this.designW / 2,
      y: banner.y - 8,
    }, { reducedMotion, scale: s, edge: { w: this.designW, h: this.designH }, entityScale });
    this.combatLayer.addChild(view.container);

    const tickerFn = (ticker: PIXI.Ticker): void => {
      // Presentation-only slowdown: feed both the clock and the view the same
      // scaled delta so playback (and its tweens) run 5x slower for monitoring.
      const dt = ticker.deltaMS * PLAYBACK_TIME_SCALE;
      const frame = player.advance(dt);
      view.renderFrame(frame, dt);
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
    // Toggle set is 0.5x / 1x — 0.5x is the default (half the old pace), 1x the
    // faster option. (1x keeps its prior meaning; this only adds the slow step.)
    this.playbackSpeed = this.playbackSpeed === 0.5 ? 1 : 0.5;
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
    this.clearPeek();
    this.renderSkipButton(); // hides the playtest Skip pill (phase no longer PLANNING)
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
    // Above the combat header so the resolution screen always covers it (a fast
    // PvE round can land RESOLUTION mid planning→combat fade). See combatLayout.ts.
    bg.zIndex = Z_RESOLUTION_OVERLAY;
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
    box.zIndex = Z_RESOLUTION_OVERLAY;
    this.combatLayer.addChild(box);
    const title = new PIXI.Text(`Round ${state.round} — ${resultStr}`, {
      fontSize: 13, fill: C.textPrimary, fontFamily: "monospace",
    });
    title.eventMode = "none";
    title.anchor.set(0.5, 0);
    title.x = cx;
    title.y = modal.y + 12;
    title.zIndex = Z_RESOLUTION_CONTROL;
    this.combatLayer.addChild(title);

    const resultLabel = new PIXI.Text(resultStr, {
      fontSize: 20, fill: resultColor, fontFamily: "monospace",
    });
    resultLabel.eventMode = "none";
    resultLabel.anchor.set(0.5, 0);
    resultLabel.x = cx;
    resultLabel.y = modal.y + 34;
    resultLabel.zIndex = Z_RESOLUTION_CONTROL;
    this.combatLayer.addChild(resultLabel);

    const hpText = new PIXI.Text(`HP: ${Math.max(0, me.hp)}`, {
      fontSize: 12, fill: me.alive ? C.textGoodHP : C.textBadHP, fontFamily: "monospace",
    });
    hpText.eventMode = "none";
    hpText.anchor.set(0.5, 0);
    hpText.x = cx;
    hpText.y = modal.y + 68;
    hpText.zIndex = Z_RESOLUTION_CONTROL;
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
      detailText.zIndex = Z_RESOLUTION_CONTROL;
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
        const bench = this.layout.regions.bench;
        const target = step.destination === "gold"
          ? { x: hud.x + (this.isLandscape ? 18 : 95), y: hud.y + hud.h / 2 } // gold counter
          : { x: bench.x + bench.w / 2, y: bench.y + bench.h / 2 };            // bench (item inventory)
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
    this.clearPeek();
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
    this.resetShopPanel();
    this.clearPlanningTimerTick();
    this.clearResolutionTimer();
    this.clearLootReveal();
    this.clearPress();
    this.clearToast();
    this.unsub();
    this.unsubArt();
    this.unsubItemArt();
    this.unsubAvatarArt();
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
