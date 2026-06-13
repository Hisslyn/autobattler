// Pixi layer for combat playback. Renders strictly from CombatPlayer frames
// (reducer output + fx stream) — never reads MatchState.
import * as PIXI from "pixi.js";
import { gameData } from "@autobattler/data";
import type { HexCoord } from "@autobattler/sim/src/hex.js";
import type { CombatFx, PlaybackFrame, UnitFrame } from "./player.js";
import { C, tierColor, starColor } from "../theme.js";

export type HexToPixel = (hex: HexCoord) => { x: number; y: number };

interface TransientFx {
  node: PIXI.Container;
  ageMs: number;
  ttlMs: number;
  /** px/ms upward drift (floaters). */
  rise: number;
  /** scale growth per ms (cast pulse). */
  grow: number;
}

const UNIT_R = 14;
const FLOATER_TTL_MS = 700;
const FLASH_TTL_MS = 160;
const PULSE_TTL_MS = 320;
const DEATH_TTL_MS = 450;

export class CombatView {
  readonly container = new PIXI.Container();
  private unitLayer = new PIXI.Container();
  private fxLayer = new PIXI.Container();
  private overtimeBanner: PIXI.Text | null = null;
  private transients: TransientFx[] = [];
  private readonly bannerX: number;
  private readonly bannerY: number;

  private readonly reducedMotion: boolean;

  constructor(
    private toPixel: HexToPixel,
    bannerPos: { x: number; y: number },
    opts: { reducedMotion?: boolean } = {}
  ) {
    this.container.addChild(this.unitLayer);
    this.container.addChild(this.fxLayer);
    this.bannerX = bannerPos.x;
    this.bannerY = bannerPos.y;
    this.reducedMotion = opts.reducedMotion ?? false;
  }

  renderFrame(frame: PlaybackFrame, dtMs: number): void {
    this.unitLayer.removeChildren();
    const pixels = new Map<number, { x: number; y: number }>();
    for (const u of frame.units) {
      const p = this.unitPixel(u);
      pixels.set(u.uid, p);
      if (u.alive) this.drawUnit(u, p.x, p.y);
    }

    // Reduced motion: skip non-essential combat tweens (flashes, pulses,
    // floaters, fades); units + hp/mana still render from the frame.
    if (!this.reducedMotion) for (const fx of frame.fx) this.spawnFx(fx, pixels);

    for (const t of this.transients) {
      t.ageMs += dtMs;
      t.node.y -= t.rise * dtMs;
      t.node.alpha = Math.max(0, 1 - t.ageMs / t.ttlMs);
      if (t.grow > 0) {
        const s = 1 + t.grow * t.ageMs;
        t.node.scale.set(s);
      }
    }
    const expired = this.transients.filter((t) => t.ageMs >= t.ttlMs);
    for (const t of expired) this.fxLayer.removeChild(t.node);
    this.transients = this.transients.filter((t) => t.ageMs < t.ttlMs);

    if (frame.overtime && !this.overtimeBanner) {
      const banner = new PIXI.Text("OVERTIME", {
        fontSize: 13,
        fill: C.textOvertime,
        fontFamily: "monospace",
      });
      banner.anchor.set(0.5, 0.5);
      banner.x = this.bannerX;
      banner.y = this.bannerY;
      this.container.addChild(banner);
      this.overtimeBanner = banner;
    }
  }

  destroy(): void {
    this.transients = [];
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

  private drawUnit(u: UnitFrame, x: number, y: number): void {
    const def = gameData.units.find((d) => d.id === u.defId);
    const g = new PIXI.Graphics();
    g.beginFill(C.bgUnit);
    g.drawCircle(x, y, UNIT_R);
    g.endFill();
    g.lineStyle(2, tierColor(def?.tier ?? 1), 0.9);
    g.drawCircle(x, y, UNIT_R);
    g.lineStyle(0);

    const hpFrac = u.maxHp > 0 ? Math.max(0, u.hp / u.maxHp) : 0;
    g.beginFill(C.hpBg);
    g.drawRect(x - UNIT_R, y + UNIT_R + 2, UNIT_R * 2, 3);
    g.endFill();
    g.beginFill(C.hpFill);
    g.drawRect(x - UNIT_R, y + UNIT_R + 2, Math.round(UNIT_R * 2 * hpFrac), 3);
    g.endFill();

    const manaFrac = u.maxMana > 0 ? Math.max(0, u.mana / u.maxMana) : 0;
    g.beginFill(C.manaBg);
    g.drawRect(x - UNIT_R, y + UNIT_R + 6, UNIT_R * 2, 2);
    g.endFill();
    g.beginFill(C.manaFill);
    g.drawRect(x - UNIT_R, y + UNIT_R + 6, Math.round(UNIT_R * 2 * manaFrac), 2);
    g.endFill();
    this.unitLayer.addChild(g);

    const starG = new PIXI.Graphics();
    for (let i = 0; i < u.star; i++) {
      starG.beginFill(starColor(u.star));
      starG.drawCircle(x - (u.star - 1) * 3 + i * 6, y - UNIT_R - 3, 2);
      starG.endFill();
    }
    this.unitLayer.addChild(starG);

    const label = new PIXI.Text((def?.name ?? "??").slice(0, 2).toUpperCase(), {
      fontSize: 7,
      fill: C.textLabel,
      fontFamily: "monospace",
    });
    label.anchor.set(0.5);
    label.x = x;
    label.y = y;
    this.unitLayer.addChild(label);
  }

  private spawnFx(fx: CombatFx, pixels: Map<number, { x: number; y: number }>): void {
    switch (fx.kind) {
      case "attack": {
        const p = pixels.get(fx.uid);
        if (!p) return;
        const ring = new PIXI.Graphics();
        ring.lineStyle(2, fx.crit ? C.floatCrit : C.fxAttackFlash, 0.9);
        ring.drawCircle(0, 0, UNIT_R + (fx.crit ? 4 : 2));
        ring.lineStyle(0);
        ring.x = p.x;
        ring.y = p.y;
        this.addTransient(ring, FLASH_TTL_MS, 0, 0);
        break;
      }
      case "cast": {
        const p = pixels.get(fx.uid);
        if (!p) return;
        const pulse = new PIXI.Graphics();
        pulse.lineStyle(2, C.fxCastPulse, 0.9);
        pulse.drawCircle(0, 0, UNIT_R);
        pulse.lineStyle(0);
        pulse.x = p.x;
        pulse.y = p.y;
        this.addTransient(pulse, PULSE_TTL_MS, 0, 0.004);
        break;
      }
      case "hit": {
        const p = pixels.get(fx.uid);
        if (!p) return;
        const color = fx.crit ? C.floatCrit : fx.magic ? C.floatMagic : C.floatPhys;
        const txt = new PIXI.Text(`-${fx.amount}${fx.crit ? "!" : ""}`, {
          fontSize: fx.crit ? 12 : 9,
          fill: color,
          fontFamily: "monospace",
        });
        txt.anchor.set(0.5, 1);
        txt.x = p.x;
        txt.y = p.y - UNIT_R - 4;
        this.addTransient(txt, FLOATER_TTL_MS, 0.03, 0);
        break;
      }
      case "death": {
        const p = pixels.get(fx.uid);
        if (!p) return;
        const fade = new PIXI.Graphics();
        fade.beginFill(C.fxDeathFade, 0.8);
        fade.drawCircle(0, 0, UNIT_R);
        fade.endFill();
        fade.x = p.x;
        fade.y = p.y;
        this.addTransient(fade, DEATH_TTL_MS, 0, 0);
        break;
      }
      case "overtime":
        // banner handled via frame.overtime
        break;
    }
  }

  private addTransient(node: PIXI.Container, ttlMs: number, rise: number, grow: number): void {
    this.fxLayer.addChild(node);
    this.transients.push({ node, ageMs: 0, ttlMs, rise, grow });
  }
}
