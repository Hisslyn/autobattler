// Web Audio engine. SFX are synthesized procedurally (no asset files); music is
// a pluggable file slot that no-ops cleanly when the file is absent. Audio is a
// pure consumer of the combat fx/effect stream (see handleCombatFx) and of UI
// events — it never reads game logic or MatchState.
import type { SettingsStore, Settings } from "../settings.js";
import type { CombatFx, AbilityFxKind } from "../combat/player.js";

export type SfxName =
  | "tap" | "buy" | "sell" | "reroll" | "levelUp" | "error"
  | "attack" | "crit" | "cast" | "death"
  | "projectile" | "impact"
  | "castMagic" | "castBurn" | "castShield" | "castBuff" | "castStealth";

/** Per-ability-kind cast sound. */
function castSfx(kind: AbilityFxKind): SfxName {
  switch (kind) {
    case "magic_damage": return "castMagic";
    case "burn": return "castBurn";
    case "shield": return "castShield";
    case "buff": return "castBuff";
    case "stealth": return "castStealth";
  }
}

export type MusicSlot = "menuTheme" | "matchTheme";

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Effective gain for a channel through the master bus. Pure; mirrors the node
 * graph (source → channelGain → masterGain → out). Mute zeroes everything.
 */
export function computeGain(masterVolume: number, channelVolume: number, muted: boolean): number {
  if (muted) return 0;
  return clamp01(masterVolume) * clamp01(channelVolume);
}

interface SfxSpec {
  type: OscillatorType;
  freq: number;
  /** Optional end frequency for a linear sweep. */
  sweepTo?: number;
  durMs: number;
  peak: number;
  /** Use filtered white noise instead of an oscillator (impacts/death). */
  noise?: boolean;
}

const SFX: Record<SfxName, SfxSpec> = {
  tap:     { type: "sine",     freq: 440,  durMs: 60,  peak: 0.4 },
  buy:     { type: "triangle", freq: 520,  sweepTo: 780, durMs: 120, peak: 0.5 },
  sell:    { type: "triangle", freq: 480,  sweepTo: 240, durMs: 130, peak: 0.5 },
  reroll:  { type: "square",   freq: 320,  sweepTo: 360, durMs: 90,  peak: 0.35 },
  levelUp: { type: "triangle", freq: 660,  sweepTo: 990, durMs: 220, peak: 0.55 },
  error:   { type: "sawtooth", freq: 200,  sweepTo: 140, durMs: 180, peak: 0.5 },
  attack:  { type: "square",   freq: 300,  durMs: 50,  peak: 0.3 },
  crit:    { type: "square",   freq: 420,  sweepTo: 600, durMs: 90, peak: 0.45 },
  cast:    { type: "sine",     freq: 560,  sweepTo: 880, durMs: 160, peak: 0.4 },
  death:   { type: "sine",     freq: 180,  sweepTo: 60,  durMs: 260, peak: 0.5, noise: true },
  projectile: { type: "triangle", freq: 680, sweepTo: 460, durMs: 110, peak: 0.28 },
  impact:  { type: "square",   freq: 240,  sweepTo: 180, durMs: 60,  peak: 0.32, noise: true },
  castMagic:  { type: "sine",     freq: 560, sweepTo: 900, durMs: 170, peak: 0.4 },
  castBurn:   { type: "sawtooth", freq: 300, sweepTo: 460, durMs: 200, peak: 0.38 },
  castShield: { type: "sine",     freq: 380, sweepTo: 540, durMs: 200, peak: 0.36 },
  castBuff:   { type: "triangle", freq: 500, sweepTo: 760, durMs: 190, peak: 0.36 },
  castStealth:{ type: "sine",     freq: 720, sweepTo: 360, durMs: 220, peak: 0.3 },
};

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private musicBuffers = new Map<MusicSlot, AudioBuffer | null>();
  private currentMusic: MusicSlot | null = null;

  constructor(
    private settings: SettingsStore,
    private assetsBase = "/audio"
  ) {
    settings.subscribe((s) => this.applyVolumes(s));
  }

  /**
   * Lazily build the audio graph. Must be called from a user gesture (browser
   * autoplay policy); safe to call repeatedly.
   */
  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    const master = ctx.createGain();
    const sfx = ctx.createGain();
    const music = ctx.createGain();
    sfx.connect(master);
    music.connect(master);
    master.connect(ctx.destination);
    this.ctx = ctx;
    this.masterGain = master;
    this.sfxGain = sfx;
    this.musicGain = music;
    this.applyVolumes(this.settings.get());
    return ctx;
  }

  /** Resume the context (call on first user interaction). */
  resume(): void {
    const ctx = this.ensure();
    if (ctx && ctx.state === "suspended") void ctx.resume();
  }

  private applyVolumes(s: Settings): void {
    if (!this.masterGain || !this.sfxGain || !this.musicGain) return;
    // master node carries the mute; channel nodes carry their own volume, so the
    // product matches computeGain(master, channel, muted).
    this.masterGain.gain.value = s.muted ? 0 : clamp01(s.masterVolume);
    this.sfxGain.gain.value = clamp01(s.sfxVolume);
    this.musicGain.gain.value = clamp01(s.musicVolume);
  }

  // ─── SFX ───────────────────────────────────────────────────────────────────

  play(name: SfxName): void {
    const ctx = this.ensure();
    if (!ctx || !this.sfxGain) return;
    const spec = SFX[name];
    const now = ctx.currentTime;
    const dur = spec.durMs / 1000;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(spec.peak, now + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    env.connect(this.sfxGain);

    if (spec.noise) {
      const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(env);
      src.start(now);
      src.stop(now + dur);
    } else {
      const osc = ctx.createOscillator();
      osc.type = spec.type;
      osc.frequency.setValueAtTime(spec.freq, now);
      if (spec.sweepTo !== undefined) osc.frequency.linearRampToValueAtTime(spec.sweepTo, now + dur);
      osc.connect(env);
      osc.start(now);
      osc.stop(now + dur);
    }
  }

  /**
   * Consume one playback frame's combat fx stream: one sound per effect type per
   * frame (deduped so a busy tick doesn't stack identical sounds). Tracks the new
   * stage-3 fx kinds — projectile fire, per-kind ability casts, impacts, death —
   * so audio stays in sync with the visuals (and survives reduced motion, where
   * the heavy motion fx are dropped but impact/abilityHit/dissolve remain).
   */
  handleCombatFx(fx: CombatFx[]): void {
    let attack = false, crit = false, fire = false, death = false;
    const casts = new Set<AbilityFxKind>();
    for (const f of fx) {
      switch (f.kind) {
        case "contact": f.crit ? (crit = true) : (attack = true); break;
        case "impact": f.crit ? (crit = true) : (attack = true); break;
        case "projectile": fire = true; if (f.crit) crit = true; break;
        case "abilityHit": casts.add(f.effect); break;
        case "dissolve": death = true; break;
        default: break;
      }
    }
    if (crit) this.play("crit");
    if (attack) this.play("impact");
    if (fire) this.play("projectile");
    for (const k of casts) this.play(castSfx(k));
    if (death) this.play("death");
  }

  // ─── Music (pluggable file slot) ────────────────────────────────────────────

  /**
   * Switch the looping music track. Loads `${assetsBase}/${slot}.mp3` on first
   * use; if the file is absent or decoding fails, this no-ops cleanly (silent).
   * Drop real tracks at packages/client/public/audio/<slot>.mp3.
   */
  async setMusic(slot: MusicSlot | null): Promise<void> {
    if (slot === this.currentMusic) return;
    this.currentMusic = slot;
    this.stopMusic();
    if (slot === null) return;
    const ctx = this.ensure();
    if (!ctx || !this.musicGain) return;

    let buffer = this.musicBuffers.get(slot);
    if (buffer === undefined) {
      buffer = await this.loadMusic(ctx, slot);
      this.musicBuffers.set(slot, buffer);
    }
    if (!buffer || this.currentMusic !== slot) return; // missing file or switched away

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(this.musicGain);
    src.start();
    this.musicSource = src;
  }

  private async loadMusic(ctx: AudioContext, slot: MusicSlot): Promise<AudioBuffer | null> {
    try {
      const res = await fetch(`${this.assetsBase}/${slot}.mp3`);
      if (!res.ok) return null;
      return await ctx.decodeAudioData(await res.arrayBuffer());
    } catch {
      return null; // no file / network locked → silent no-op
    }
  }

  private stopMusic(): void {
    if (this.musicSource) {
      try { this.musicSource.stop(); } catch { /* already stopped */ }
      this.musicSource.disconnect();
      this.musicSource = null;
    }
  }
}
