// Pixi layer for combat playback. Renders strictly from CombatPlayer frames
// (reducer output + fx stream) — never reads MatchState. All combat juice
// (projectiles, sparks, ability auras, bar tweens, dissolves, screen shake,
// overtime tint) is driven by the fx stream and the frame's tick clock, so the
// render is a pure function of (log, seed). Reduced motion downgrades every
// effect: shake + particle bursts are skipped and bars snap near-instantly.
import * as PIXI from "pixi.js";
import { gameData } from "@autobattler/data";
import type { HexCoord } from "@autobattler/sim/src/hex.js";
import type { AbilityFxKind, CombatFx, PlaybackFrame, UnitFrame } from "./player.js";
import { C } from "../theme.js";
import { drawUnitToken } from "../unitToken.js";

export type HexToPixel = (hex: HexCoord) => { x: number; y: number };

interface TransientFx {
  node: PIXI.Container;
  /** A pooled Graphics to recycle on expiry, if any. */
  gfx: PIXI.Graphics | null;
  ageMs: number;
  ttlMs: number;
  /** px/ms upward drift (floaters). */
  rise: number;
  /** scale growth per ms (expanding rings). */
  grow: number;
  /** px/ms downward sink (dissolve). */
  sink: number;
}

interface Projectile {
  node: PIXI.Graphics;
  fromPx: { x: number; y: number };
  toPx: { x: number; y: number };
  targetUid: number;
  startTick: number;
  travelTicks: number;
  crit: boolean;
  landed: boolean;
}

interface BarState { hp: number; hpChip: number; mana: number; }

const UNIT_R = 14;
const FLOATER_TTL_MS = 700;
const SPARK_TTL_MS = 180;
const PULSE_TTL_MS = 320;
const AURA_TTL_MS = 520;
const DISSOLVE_TTL_MS = 480;
const RECOIL_MS = 150;
const POP_MS = 180;
const SHAKE_MS = 200;
const SHAKE_MAG_CRIT = 3;
const SHAKE_MAG_DEATH = 4;
const SHAKE_MAG_CAP = 5;
// Particle budget for a full board on mobile: drop new spawns past the cap.
const MAX_TRANSIENTS = 48;
const MAX_PROJECTILES = 24;
// Bar easing (fraction/ms): hp fast, chip trails, mana smooth.
const HP_RATE = 0.012;
const CHIP_RATE = 0.004;
const MANA_RATE = 0.009;

function ease(cur: number, tgt: number, rate: number, dtMs: number): number {
  return cur + (tgt - cur) * Math.min(1, rate * dtMs);
}

function abilityColor(kind: AbilityFxKind): number {
  switch (kind) {
    case "magic_damage": return C.fxAbilityMagic;
    case "burn": return C.fxAbilityBurn;
    case "shield": return C.fxAbilityShield;
    case "buff": return C.fxAbilityBuff;
    case "stealth": return C.fxAbilityStealth;
  }
}

export class CombatView {
  readonly container = new PIXI.Container();
  private unitLayer = new PIXI.Container();
  private fxLayer = new PIXI.Container();
  private overtimeBanner: PIXI.Text | null = null;
  private overtimeEdge: PIXI.Graphics | null = null;
  private transients: TransientFx[] = [];
  private projectiles: Projectile[] = [];
  private gfxPool: PIXI.Graphics[] = [];
  private bars = new Map<number, BarState>();
  private recoil = new Map<number, number>();
  private pop = new Map<number, number>();
  /** Dying units kept around to animate the dissolve after they leave the frame. */
  private dissolves = new Map<number, { ageMs: number; x: number; y: number; defId: string; tier: number; star: 1 | 2 | 3 }>();
  private shakeMs = 0;
  private shakeMag = 0;
  private readonly bannerX: number;
  private readonly bannerY: number;
  private readonly edgeW: number;
  private readonly edgeH: number;

  private readonly reducedMotion: boolean;

  constructor(
    private toPixel: HexToPixel,
    bannerPos: { x: number; y: number },
    opts: { reducedMotion?: boolean; edge?: { w: number; h: number } } = {}
  ) {
    this.container.addChild(this.unitLayer);
    this.container.addChild(this.fxLayer);
    this.bannerX = bannerPos.x;
    this.bannerY = bannerPos.y;
    this.edgeW = opts.edge?.w ?? bannerPos.x * 2;
    this.edgeH = opts.edge?.h ?? bannerPos.y * 2;
    this.reducedMotion = opts.reducedMotion ?? false;
  }

  renderFrame(frame: PlaybackFrame, dtMs: number): void {
    this.unitLayer.removeChildren();
    for (const u of frame.units) {
      if (u.alive) this.drawUnit(u, dtMs);
      else this.bars.delete(u.uid);
    }

    // Spawn one-shot fx (skipped wholesale under reduced motion: no particles,
    // no bursts, no shake — bars + units still render from the frame).
    if (!this.reducedMotion) for (const fx of frame.fx) this.spawnFx(fx);

    this.advanceProjectiles(frame.tick);
    this.advanceTransients(dtMs);
    this.advanceDissolves(dtMs);
    this.tickTimers(dtMs);
    this.applyShake(dtMs);
    this.renderOvertime(frame.overtime);
  }

  destroy(): void {
    this.transients = [];
    this.projectiles = [];
    this.gfxPool = [];
    this.container.destroy({ children: true });
  }

  private unitPixel(u: UnitFrame): { x: number; y: number } {
    const to = this.toPixel(u.hex);
    if (!u.fromHex || u.moveT >= 1) return to;
    const from = this.toPixel(u.fromHex);
    return {
      x: from.x + (to.x - from.x) * u.moveT,
      y: from.y + (to.y - from.y) * u.moveT,
    };
  }

  private drawUnit(u: UnitFrame, dtMs: number): void {
    const { x, y } = this.unitPixel(u);
    const tier = gameData.units.find((d) => d.id === u.defId)?.tier ?? 1;
    const hpTarget = u.maxHp > 0 ? u.hp / u.maxHp : 0;
    const manaTarget = u.maxMana > 0 ? u.mana / u.maxMana : 0;
    const st = this.bars.get(u.uid) ?? { hp: hpTarget, hpChip: hpTarget, mana: manaTarget };
    if (this.reducedMotion) {
      st.hp = hpTarget; st.hpChip = hpTarget; st.mana = manaTarget;
    } else {
      st.hp = ease(st.hp, hpTarget, HP_RATE, dtMs);
      st.hpChip = ease(st.hpChip, st.hp, CHIP_RATE, dtMs);
      if (st.hpChip < st.hp || hpTarget > st.hpChip) st.hpChip = Math.max(st.hp, hpTarget);
      st.mana = ease(st.mana, manaTarget, MANA_RATE, dtMs);
    }
    this.bars.set(u.uid, st);

    // Per-unit container so recoil (bob) and crit scale-pop transform the token.
    const uc = new PIXI.Container();
    uc.position.set(x, y);
    const popMs = this.pop.get(u.uid);
    if (popMs) uc.scale.set(1 + 0.25 * (popMs / POP_MS));
    const recMs = this.recoil.get(u.uid);
    if (recMs) uc.y -= 3 * (recMs / RECOIL_MS);
    drawUnitToken(uc, u.defId, tier, u.star, 0, 0, {
      radius: UNIT_R,
      bars: { hpFrac: st.hp, manaFrac: st.mana, hpChipFrac: st.hpChip },
    });
    this.unitLayer.addChild(uc);
    this.lastUnit.set(u.uid, { x, y, defId: u.defId, tier, star: u.star });
  }

  // ─── fx spawning ───────────────────────────────────────────────────────────

  private spawnFx(fx: CombatFx): void {
    switch (fx.kind) {
      case "projectile": {
        if (this.projectiles.length >= MAX_PROJECTILES) break;
        const fromPx = this.toPixel(fx.fromPos);
        const toPx = this.toPixel(fx.toPos);
        const node = this.acquireGfx();
        node.circle(0, 0, fx.crit ? 4 : 3).fill({ color: C.fxProjectile });
        node.circle(0, 0, fx.crit ? 7 : 5).stroke({ width: 1, color: C.fxProjTrail, alpha: 0.6 });
        node.position.set(fromPx.x, fromPx.y);
        this.fxLayer.addChild(node);
        this.projectiles.push({ node, fromPx, toPx, targetUid: fx.targetUid, startTick: fx.startTick, travelTicks: fx.travelTicks, crit: fx.crit, landed: false });
        break;
      }
      case "contact": {
        const from = this.toPixel(fx.fromPos);
        const to = this.toPixel(fx.toPos);
        const streak = this.acquireGfx();
        streak.moveTo(from.x, from.y)
          .lineTo(from.x + (to.x - from.x) * 0.7, from.y + (to.y - from.y) * 0.7)
          .stroke({ width: fx.crit ? 3 : 2, color: C.fxAttackFlash, alpha: 0.8 });
        this.addTransient(streak, SPARK_TTL_MS, 0, 0, 0, streak);
        break;
      }
      case "impact":
        this.spawnImpact(this.toPixel(fx.pos), fx.targetUid, fx.crit);
        break;
      case "floater":
        this.spawnFloater(this.toPixel(fx.pos), fx.amount, fx.crit, fx.magic);
        break;
      case "abilityCast": {
        const p = this.toPixel(fx.casterPos);
        const burst = this.acquireGfx();
        burst.circle(0, 0, UNIT_R).stroke({ width: 2, color: abilityColor(fx.effect), alpha: 0.9 });
        burst.position.set(p.x, p.y);
        this.addTransient(burst, PULSE_TTL_MS, 0, 0.004, 0, burst);
        break;
      }
      case "abilityHit":
        this.spawnAbilityAura(this.toPixel(fx.targetPos), fx.effect);
        break;
      case "dissolve":
        this.startDissolve(fx.uid);
        break;
      case "overtime":
        // edge/tint handled via frame.overtime
        break;
    }
  }

  private spawnImpact(p: { x: number; y: number }, targetUid: number, crit: boolean): void {
    const spark = this.acquireGfx();
    const r = crit ? UNIT_R + 6 : UNIT_R + 2;
    spark.circle(0, 0, r).stroke({ width: crit ? 3 : 2, color: crit ? C.floatCrit : C.fxImpact, alpha: 0.95 });
    spark.position.set(p.x, p.y);
    this.addTransient(spark, SPARK_TTL_MS, 0, crit ? 0.006 : 0.003, 0, spark);
    this.recoil.set(targetUid, RECOIL_MS);
    if (crit) {
      this.pop.set(targetUid, POP_MS);
      this.addShake(SHAKE_MAG_CRIT);
    }
  }

  private spawnFloater(p: { x: number; y: number }, amount: number, crit: boolean, magic: boolean): void {
    const color = crit ? C.floatCrit : magic ? C.floatMagic : C.floatPhys;
    const txt = new PIXI.Text({
      text: `-${amount}${crit ? "!" : ""}`,
      style: { fontSize: crit ? 13 : 9, fill: color, fontFamily: "monospace" },
    });
    txt.alpha = crit ? 1 : 0.85;
    txt.anchor.set(0.5, 1);
    txt.x = p.x;
    txt.y = p.y - UNIT_R - 4;
    this.addTransient(txt, FLOATER_TTL_MS, 0.03, 0, 0, null);
  }

  private spawnAbilityAura(p: { x: number; y: number }, effect: AbilityFxKind): void {
    const color = abilityColor(effect);
    const aura = this.acquireGfx();
    if (effect === "shield") {
      aura.circle(0, 0, UNIT_R + 3).stroke({ width: 2, color, alpha: 0.9 });
      aura.circle(0, 0, UNIT_R + 1).fill({ color, alpha: 0.12 });
    } else if (effect === "buff") {
      aura.circle(0, 0, UNIT_R + 2).fill({ color, alpha: 0.18 });
    } else if (effect === "stealth") {
      aura.circle(0, 0, UNIT_R).fill({ color, alpha: 0.22 });
    } else {
      // magic_damage / burn: a sharp burst ring
      aura.circle(0, 0, UNIT_R).stroke({ width: 3, color, alpha: 0.95 });
    }
    aura.position.set(p.x, p.y);
    const grow = effect === "magic_damage" || effect === "burn" ? 0.006 : 0;
    this.addTransient(aura, AURA_TTL_MS, 0, grow, 0, aura);
  }

  // ─── update loops ────────────────────────────────────────────────────────

  private advanceProjectiles(tick: number): void {
    for (const p of this.projectiles) {
      const t = p.travelTicks > 0 ? (tick - p.startTick) / p.travelTicks : 1;
      if (t >= 1 && !p.landed) {
        p.landed = true;
        this.spawnImpact(p.toPx, p.targetUid, p.crit);
        continue;
      }
      const c = Math.max(0, Math.min(1, t));
      p.node.position.set(p.fromPx.x + (p.toPx.x - p.fromPx.x) * c, p.fromPx.y + (p.toPx.y - p.fromPx.y) * c);
    }
    const landed = this.projectiles.filter((p) => p.landed);
    for (const p of landed) { this.fxLayer.removeChild(p.node); this.recycleGfx(p.node); }
    this.projectiles = this.projectiles.filter((p) => !p.landed);
  }

  private advanceTransients(dtMs: number): void {
    for (const t of this.transients) {
      t.ageMs += dtMs;
      t.node.y -= t.rise * dtMs;
      t.node.y += t.sink * dtMs;
      t.node.alpha = Math.max(0, 1 - t.ageMs / t.ttlMs);
      if (t.grow > 0) t.node.scale.set(1 + t.grow * t.ageMs);
    }
    const expired = this.transients.filter((t) => t.ageMs >= t.ttlMs);
    for (const t of expired) {
      this.fxLayer.removeChild(t.node);
      if (t.gfx) this.recycleGfx(t.gfx);
      else t.node.destroy();
    }
    this.transients = this.transients.filter((t) => t.ageMs < t.ttlMs);
  }

  private startDissolve(uid: number): void {
    // Snapshot the dying unit from its last bar/identity so it keeps rendering
    // after it leaves the alive set. Identity from the last frame's draw.
    const last = this.lastUnit.get(uid);
    if (!last) return;
    this.dissolves.set(uid, { ageMs: 0, x: last.x, y: last.y, defId: last.defId, tier: last.tier, star: last.star });
    this.bars.delete(uid);
    this.recoil.delete(uid);
    this.pop.delete(uid);
    this.addShake(SHAKE_MAG_DEATH);
  }

  private advanceDissolves(dtMs: number): void {
    for (const [uid, d] of this.dissolves) {
      d.ageMs += dtMs;
      const k = d.ageMs / DISSOLVE_TTL_MS;
      if (k >= 1) { this.dissolves.delete(uid); continue; }
      const uc = new PIXI.Container();
      uc.position.set(d.x, d.y + 8 * k);
      uc.scale.set(1 - 0.25 * k);
      uc.alpha = 1 - k;
      drawUnitToken(uc, d.defId, d.tier, d.star, 0, 0, { radius: UNIT_R });
      this.unitLayer.addChild(uc);
    }
  }

  private tickTimers(dtMs: number): void {
    for (const [uid, ms] of this.recoil) {
      const next = ms - dtMs;
      if (next <= 0) this.recoil.delete(uid); else this.recoil.set(uid, next);
    }
    for (const [uid, ms] of this.pop) {
      const next = ms - dtMs;
      if (next <= 0) this.pop.delete(uid); else this.pop.set(uid, next);
    }
  }

  private applyShake(dtMs: number): void {
    if (this.shakeMs <= 0) { this.container.position.set(0, 0); return; }
    this.shakeMs = Math.max(0, this.shakeMs - dtMs);
    const k = this.shakeMs / SHAKE_MS;
    const amp = this.shakeMag * k;
    // Deterministic oscillation (no RNG): phase from remaining time.
    this.container.position.set(Math.sin(this.shakeMs * 0.9) * amp, Math.cos(this.shakeMs * 1.3) * amp * 0.6);
  }

  private renderOvertime(overtime: boolean): void {
    if (!overtime) return;
    if (!this.overtimeBanner) {
      const banner = new PIXI.Text({
        text: "OVERTIME",
        style: { fontSize: 13, fill: C.textOvertime, fontFamily: "monospace" },
      });
      banner.anchor.set(0.5, 0.5);
      banner.x = this.bannerX;
      banner.y = this.bannerY;
      this.container.addChild(banner);
      this.overtimeBanner = banner;
    }
    if (!this.overtimeEdge && !this.reducedMotion) {
      const edge = new PIXI.Graphics();
      edge.rect(0, 0, this.edgeW, this.edgeH).stroke({ width: 4, color: C.fxOvertimeEdge, alpha: 0.5 });
      edge.rect(0, 0, this.edgeW, this.edgeH).fill({ color: C.fxOvertimeEdge, alpha: 0.05 });
      this.fxLayer.addChildAt(edge, 0);
      this.overtimeEdge = edge;
    }
  }

  // ─── object pooling ──────────────────────────────────────────────────────

  private acquireGfx(): PIXI.Graphics {
    const g = this.gfxPool.pop() ?? new PIXI.Graphics();
    g.clear();
    g.alpha = 1;
    g.scale.set(1);
    g.position.set(0, 0);
    return g;
  }

  private recycleGfx(g: PIXI.Graphics): void {
    if (this.gfxPool.length < MAX_TRANSIENTS) { g.clear(); this.gfxPool.push(g); }
    else g.destroy();
  }

  private addTransient(node: PIXI.Container, ttlMs: number, rise: number, grow: number, sink: number, gfx: PIXI.Graphics | null): void {
    if (this.transients.length >= MAX_TRANSIENTS) {
      // Budget hit: evict the oldest so newer, more relevant fx still show.
      const oldest = this.transients.shift();
      if (oldest) { this.fxLayer.removeChild(oldest.node); if (oldest.gfx) this.recycleGfx(oldest.gfx); else oldest.node.destroy(); }
    }
    this.fxLayer.addChild(node);
    this.transients.push({ node, gfx, ageMs: 0, ttlMs, rise, grow, sink });
  }

  private addShake(mag: number): void {
    this.shakeMag = Math.min(SHAKE_MAG_CAP, Math.max(this.shakeMag * (this.shakeMs / SHAKE_MS), mag));
    this.shakeMs = SHAKE_MS;
  }

  // Identity cache for dissolve snapshots (defId/tier/star/pixel of last draw).
  private lastUnit = new Map<number, { x: number; y: number; defId: string; tier: number; star: 1 | 2 | 3 }>();
}
