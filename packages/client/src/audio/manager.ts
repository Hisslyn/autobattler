// Web Audio engine. SFX are synthesized procedurally from the pure layered-voice
// palette (sfx.ts); music is generative (music.ts) with a real dropped-in file
// always winning per state, sequenced by the pure director (director.ts). Audio
// stays a pure consumer of the combat fx/effect stream (handleCombatFx) and of UI
// events — it never reads game logic or MatchState.
import type { SettingsStore, Settings } from "../settings.js";
import type { CombatFx, AbilityFxKind } from "../combat/player.js";
import { SFX_SPECS, castSfx } from "./sfx.js";
import type { SfxName, SfxVoice } from "./sfx.js";
import { GenerativeMusic } from "./music.js";
import {
  resolveMusicSource, stateToMood, musicFilePaths, sfxFilePaths,
  nextUnlockState, type MusicState, type AudioUnlockState,
} from "./director.js";

export type { SfxName } from "./sfx.js";
export type { MusicState } from "./director.js";

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

const CROSSFADE_S = 0.6;

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private sfxReverb: ConvolverNode | null = null;
  private musicGain: GainNode | null = null;
  private genGain: GainNode | null = null;
  private fileGain: GainNode | null = null;
  private gen: GenerativeMusic | null = null;
  private whiteNoise: AudioBuffer | null = null;

  private currentState: MusicState | null = null;
  private musicToken = 0;
  private fileSource: AudioBufferSourceNode | null = null;
  private fileBuffers = new Map<MusicState, AudioBuffer | null>();
  private sfxBuffers = new Map<SfxName, AudioBuffer | null>();
  private unlock: AudioUnlockState = "locked";

  constructor(
    private settings: SettingsStore,
    private assetsBase = "/audio"
  ) {
    settings.subscribe((s) => {
      this.applyVolumes(s);
      void this.applyMusic();
    });
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
    const gen = ctx.createGain();
    const file = ctx.createGain();
    const reverb = ctx.createConvolver();
    reverb.buffer = this.makeImpulse(ctx);
    gen.gain.value = 0;
    file.gain.value = 0;
    sfx.connect(master);
    reverb.connect(sfx);
    gen.connect(music);
    file.connect(music);
    music.connect(master);
    master.connect(ctx.destination);
    this.ctx = ctx;
    this.masterGain = master;
    this.sfxGain = sfx;
    this.sfxReverb = reverb;
    this.musicGain = music;
    this.genGain = gen;
    this.fileGain = file;
    this.gen = new GenerativeMusic(ctx, gen);
    this.applyVolumes(this.settings.get());
    return ctx;
  }

  /** Resume the context + (re)start music on first user interaction. */
  resume(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const proceed = (): void => {
      this.unlock = nextUnlockState(this.unlock, ctx.state);
      void this.applyMusic();
    };
    if (ctx.state === "suspended") void ctx.resume().then(proceed, proceed);
    else proceed();
  }

  private applyVolumes(s: Settings): void {
    if (!this.masterGain || !this.sfxGain || !this.musicGain) return;
    // master node carries the mute; channel nodes carry their own volume, so the
    // product matches computeGain(master, channel, muted). The music toggle gates
    // the music channel without touching SFX.
    this.masterGain.gain.value = s.muted ? 0 : clamp01(s.masterVolume);
    this.sfxGain.gain.value = clamp01(s.sfxVolume);
    this.musicGain.gain.value = s.musicEnabled ? clamp01(s.musicVolume) : 0;
  }

  /** Music is audible only when nothing in the chain zeroes it (CPU gate). */
  private musicAudible(s: Settings = this.settings.get()): boolean {
    return !s.muted && s.musicEnabled && s.musicVolume > 0 && s.masterVolume > 0;
  }

  // ─── SFX ───────────────────────────────────────────────────────────────────

  /**
   * Play a designed SFX; `delaySec` sequences economy cues (e.g. coins after a
   * round start). A real sample dropped at `audio/sfx/<name>.(mp3|ogg)` overrides
   * the synthesized voice; otherwise (or until it loads) the procedural one plays.
   */
  play(name: SfxName, delaySec = 0): void {
    const ctx = this.ensure();
    if (!ctx || !this.sfxGain) return;
    const start = ctx.currentTime + Math.max(0, delaySec);
    const vel = 0.9 + Math.random() * 0.2; // ±10% velocity so repeats don't fatigue

    const override = this.sfxBuffers.get(name);
    if (override) { this.playSample(override, start, vel); return; }
    if (override === undefined) void this.loadSfxOverride(name); // lazy; synth meanwhile

    const spec = SFX_SPECS[name];
    const jitter = spec.jitterCents ?? 0;
    const ratio = jitter ? Math.pow(2, ((Math.random() * 2 - 1) * jitter) / 1200) : 1;
    for (const voice of spec.voices) this.renderVoice(voice, start, ratio, vel, spec.send ?? 0);
  }

  private playSample(buffer: AudioBuffer, start: number, vel: number): void {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.value = vel;
    gain.connect(this.sfxGain!);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(gain);
    src.start(start);
  }

  private async loadSfxOverride(name: SfxName): Promise<void> {
    let buf: AudioBuffer | null = null;
    for (const path of sfxFilePaths(name, this.assetsBase)) {
      buf = await this.tryLoad(path);
      if (buf) break;
    }
    this.sfxBuffers.set(name, buf);
  }

  private renderVoice(voice: SfxVoice, start: number, ratio: number, vel: number, send: number): void {
    const ctx = this.ctx!;
    const t0 = start + (voice.delay ?? 0);
    const attackEnd = t0 + voice.attack;
    const decayEnd = attackEnd + voice.decay;
    const holdEnd = decayEnd + voice.hold;
    const end = holdEnd + voice.release;
    const peak = Math.max(0.0001, voice.gain * vel);
    const sustainLvl = Math.max(0.0001, peak * voice.sustain);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(peak, attackEnd);
    env.gain.exponentialRampToValueAtTime(voice.sustain > 0 ? sustainLvl : 0.0001, decayEnd);
    if (voice.sustain > 0) env.gain.setValueAtTime(sustainLvl, holdEnd);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    env.connect(this.sfxGain!);
    if (send > 0 && this.sfxReverb) {
      const sendGain = ctx.createGain();
      sendGain.gain.value = send;
      env.connect(sendGain);
      sendGain.connect(this.sfxReverb);
    }

    let head: AudioScheduledSourceNode;
    if (voice.wave === "noise") {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer(ctx);
      head = src;
    } else {
      const osc = ctx.createOscillator();
      osc.type = voice.wave;
      osc.frequency.setValueAtTime(voice.freq * ratio, t0);
      if (voice.sweepTo !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, voice.sweepTo * ratio), end);
      }
      if (voice.detune) osc.detune.value = voice.detune;
      head = osc;
    }

    let tail: AudioNode = head;
    if (voice.filter) {
      const filt = ctx.createBiquadFilter();
      filt.type = voice.filter.type;
      filt.frequency.value = voice.filter.freq;
      if (voice.filter.q !== undefined) filt.Q.value = voice.filter.q;
      tail.connect(filt);
      tail = filt;
    }
    tail.connect(env);
    head.start(t0);
    head.stop(end + 0.02);
  }

  /**
   * Consume one playback frame's combat fx stream: one sound per effect type per
   * frame (deduped so a busy tick doesn't stack identical sounds). Melee contact
   * voices the swing; ranged fire voices the bolt; impacts/crits/casts/deaths
   * track the visuals (and survive reduced motion, where contact is dropped and
   * impact is emitted directly).
   */
  handleCombatFx(fx: CombatFx[]): void {
    let melee = false, land = false, crit = false, fire = false, death = false;
    const casts = new Set<AbilityFxKind>();
    for (const f of fx) {
      switch (f.kind) {
        case "contact": f.crit ? (crit = true) : (melee = true); break;
        case "impact": f.crit ? (crit = true) : (land = true); break;
        case "projectile": fire = true; if (f.crit) crit = true; break;
        case "abilityHit": casts.add(f.effect); break;
        case "dissolve": death = true; break;
        default: break;
      }
    }
    if (crit) this.play("crit");
    if (melee) this.play("attack");
    if (land && !melee) this.play("impact"); // melee already voices the swing
    if (fire) this.play("projectile");
    for (const k of casts) this.play(castSfx(k));
    if (death) this.play("death");
  }

  // ─── Music director ──────────────────────────────────────────────────────────

  /**
   * Drive the music state (menu/planning/combat/results). A real file in that
   * state's slot wins; otherwise the generative version plays. Crossfades on
   * transitions; no-ops cleanly while locked/inaudible (resumes on unlock).
   */
  async setMusicState(state: MusicState): Promise<void> {
    this.currentState = state;
    await this.applyMusic();
  }

  private async applyMusic(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || !this.gen || !this.genGain || !this.fileGain) return;
    const token = ++this.musicToken;
    const state = this.currentState;

    if (state === null || !this.musicAudible() || ctx.state !== "running") {
      // Inaudible or locked: pause generative + stop file to save CPU, keep state.
      this.gen.stop();
      this.stopFile();
      this.ramp(this.genGain, 0);
      this.ramp(this.fileGain, 0);
      return;
    }

    const buffer = await this.fileBufferFor(state);
    if (token !== this.musicToken) return; // superseded while loading

    if (resolveMusicSource(state, buffer !== null) === "file" && buffer) {
      this.startFile(buffer);
      this.gen.stop();
      this.ramp(this.fileGain, 1);
      this.ramp(this.genGain, 0);
    } else {
      this.stopFile();
      this.gen.setMood(stateToMood(state));
      this.gen.start();
      this.ramp(this.genGain, 1);
      this.ramp(this.fileGain, 0);
    }
  }

  private ramp(node: GainNode, target: number): void {
    const now = this.ctx!.currentTime;
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(node.gain.value, now);
    node.gain.linearRampToValueAtTime(target, now + CROSSFADE_S);
  }

  private startFile(buffer: AudioBuffer): void {
    this.stopFile();
    const src = this.ctx!.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(this.fileGain!);
    src.start();
    this.fileSource = src;
  }

  private stopFile(): void {
    if (this.fileSource) {
      try { this.fileSource.stop(); } catch { /* already stopped */ }
      this.fileSource.disconnect();
      this.fileSource = null;
    }
  }

  /** Per-state file slot: try `<state>.mp3` then `.ogg`; cache the result (incl. null). */
  private async fileBufferFor(state: MusicState): Promise<AudioBuffer | null> {
    const cached = this.fileBuffers.get(state);
    if (cached !== undefined) return cached;
    let buf: AudioBuffer | null = null;
    for (const path of musicFilePaths(state, this.assetsBase)) {
      buf = await this.tryLoad(path);
      if (buf) break;
    }
    this.fileBuffers.set(state, buf);
    return buf;
  }

  private async tryLoad(path: string): Promise<AudioBuffer | null> {
    const ctx = this.ctx;
    if (!ctx) return null;
    try {
      const res = await fetch(path);
      if (!res.ok) return null;
      return await ctx.decodeAudioData(await res.arrayBuffer());
    } catch {
      return null; // no file / network locked → generative fallback
    }
  }

  // ─── Buffers ──────────────────────────────────────────────────────────────────

  /** Shared 1s white-noise buffer reused by every noise voice. */
  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.whiteNoise) return this.whiteNoise;
    const len = Math.ceil(ctx.sampleRate);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.whiteNoise = buf;
    return buf;
  }

  /** Short decaying-noise impulse for the SFX reverb send. */
  private makeImpulse(ctx: AudioContext): AudioBuffer {
    const len = Math.ceil(ctx.sampleRate * 0.35);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    }
    return buf;
  }
}
