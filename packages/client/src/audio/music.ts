// Generative, loopable background music — composed from scratch (no recognizable
// melodies). Each mood is a scale + functional chord progression that MOVES,
// rendered as a high-passed pad stack, a root bass line, a gentle arpeggio and a
// short seeded melodic motif (re-varied each loop so it repeats with slight
// change, not identically), plus light percussion — scheduled with a Web Audio
// lookahead scheduler so loops evolve slowly and never click. The progression,
// motif, motif-variation, voice-leading and per-layer mixing gains are pure
// music-theory helpers (unit-tested); the engine class wraps them around nodes.

export type MusicMood = "menu" | "planning" | "combat";

export interface MoodConfig {
  /** Beats per minute of the arpeggio/percussion grid. */
  bpm: number;
  /** Scale as semitone offsets from the root, within one octave. */
  scale: number[];
  /** Root note (MIDI). */
  rootMidi: number;
  /** Chord progression: each chord is a list of scale-degree indices. */
  progression: number[][];
  arpGain: number;
  padGain: number;
  /** 0 → no percussion layer. */
  percGain: number;
  /** Arp notes per beat. */
  arpSubdiv: number;
  /** Overall mood loudness trim (kept low so music underscores). */
  level: number;
}

// A natural minor / dorian family keeps the three moods relatives of one another.
const A_MINOR = [0, 2, 3, 5, 7, 8, 10];
const A_DORIAN = [0, 2, 3, 5, 7, 9, 10];

/**
 * Functional progression per state, as the scale-degree of each chord ROOT (one
 * chord per bar). These move (no static one-chord loops) and resolve back so the
 * loop seam is musical; chord-tones are stacked diatonically from the root by
 * {@link triad}. Lengths divide evenly into the loop (4 bars each).
 *
 *  menu     i – VI – III – VII  (Am – F – C – G)  reflective, falling.
 *  planning i – iv – VI – V     (Am – Dm – F – E) warm, turning home.
 *  combat   i – VII – VI – v     (Am – G – F – Em) driving, modal descent.
 */
export const PROGRESSIONS: Record<MusicMood, number[]> = {
  menu: [0, 5, 2, 6],
  planning: [0, 3, 5, 4],
  combat: [0, 6, 5, 4],
};

/** Stack a diatonic triad (root, third, fifth) from a scale-degree root. */
export function triad(rootDegree: number): number[] {
  return [rootDegree, rootDegree + 2, rootDegree + 4];
}

/** Build the bar-by-bar triad progression for a state from its root degrees. */
export function progressionFor(mood: MusicMood): number[][] {
  return PROGRESSIONS[mood].map(triad);
}

export const MOODS: Record<MusicMood, MoodConfig> = {
  menu: {
    bpm: 66, scale: A_MINOR, rootMidi: 57 /* A3 */,
    progression: progressionFor("menu"),
    arpGain: 0.085, padGain: 0.15, percGain: 0, arpSubdiv: 1, level: 0.7,
  },
  planning: {
    bpm: 94, scale: A_DORIAN, rootMidi: 57,
    progression: progressionFor("planning"),
    arpGain: 0.1, padGain: 0.135, percGain: 0.05, arpSubdiv: 2, level: 0.75,
  },
  combat: {
    bpm: 134, scale: A_MINOR, rootMidi: 57,
    progression: progressionFor("combat"),
    arpGain: 0.11, padGain: 0.115, percGain: 0.1, arpSubdiv: 2, level: 0.8,
  },
};

/**
 * Per-layer mixing gain multipliers (× padGain etc. are baked into MoodConfig;
 * these gain-stage the relative balance so the lead sits ABOVE the pads and the
 * percussion never dominates). Each in (0, 1]; lead > padFloor; perc < lead.
 */
export interface MixTable {
  lead: number;
  pad: number;
  bass: number;
  arp: number;
  perc: number;
}

export const MIX: Record<MusicMood, MixTable> = {
  menu: { lead: 0.9, pad: 0.7, bass: 0.6, arp: 0.55, perc: 0 },
  planning: { lead: 0.85, pad: 0.65, bass: 0.6, arp: 0.55, perc: 0.4 },
  combat: { lead: 0.8, pad: 0.6, bass: 0.7, arp: 0.5, perc: 0.5 },
};

/** Equal-tempered MIDI note → frequency (Hz). A4 (69) = 440. Pure. */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Resolve a scale-degree (which may exceed the scale length) to a MIDI note. */
export function degreeToMidi(rootMidi: number, scale: number[], degree: number): number {
  const n = scale.length;
  const oct = Math.floor(degree / n);
  const idx = ((degree % n) + n) % n;
  return rootMidi + oct * 12 + scale[idx]!;
}

/**
 * Small deterministic PRNG (mulberry32) so motif generation is seedable and
 * unit-testable: same seed → identical note sequence. Pure, no global state.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 1831565813) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A short original melodic motif as scale-degree offsets (above the chord),
 * generated deterministically from `seed`. The shape steps mostly by scale-step
 * with the occasional skip and rest (degree = null), so it reads as a memorable
 * phrase rather than a running arpeggio. `len` notes long. Pure + deterministic.
 */
export function generateMotif(seed: number, len: number): (number | null)[] {
  const rnd = mulberry32(seed);
  const notes: (number | null)[] = [];
  // Start on a chord tone (0/2/4), then walk mostly stepwise with skips/rests.
  let deg = [0, 2, 4][Math.floor(rnd() * 3)]!;
  for (let i = 0; i < len; i++) {
    const roll = rnd();
    if (i > 0 && roll < 0.18) {
      notes.push(null); // rest — leaves room so the motif breathes
      continue;
    }
    notes.push(deg);
    // Step (±1), occasional skip (±2), rare leap to a chord tone.
    const move = rnd();
    if (move < 0.55) deg += rnd() < 0.5 ? 1 : -1;
    else if (move < 0.85) deg += rnd() < 0.5 ? 2 : -2;
    else deg = [0, 2, 4][Math.floor(rnd() * 3)]!;
    // Keep the motif in a singable register: clamp to one octave window.
    if (deg > 6) deg -= 4;
    if (deg < -2) deg += 4;
  }
  return notes;
}

/**
 * Vary a motif for a given loop iteration so the lead repeats with slight,
 * deterministic change instead of looping identically: ornament a few notes (±1
 * step / octave-lift) and toggle a rest, leaving the contour recognizable. Pure;
 * `pass` 0 returns the motif unchanged so the theme states plainly first.
 */
export function varyMotif(motif: (number | null)[], pass: number): (number | null)[] {
  if (pass === 0) return motif.slice();
  const rnd = mulberry32((pass * 2654435761) >>> 0);
  return motif.map((n) => {
    const roll = rnd();
    if (n === null) return roll < 0.25 ? 0 : null; // sometimes fill a rest
    if (roll < 0.15) return null; // sometimes open a rest
    if (roll < 0.4) return n + (rnd() < 0.5 ? 1 : -1); // neighbor ornament
    if (roll < 0.5) return n + 7; // octave lift for a lift in energy
    return n;
  });
}

/**
 * Voice-lead one chord (degrees) toward the previous chord's actual MIDI notes:
 * for each target chord tone pick the octave nearest the closest previous note,
 * so motion is shared/stepwise rather than parallel block-chord leaps. Pure.
 * Returns MIDI notes (sorted) for the new chord.
 */
export function voiceLead(
  prevMidi: number[], chordDegrees: number[], rootMidi: number, scale: number[],
): number[] {
  const out = chordDegrees.map((deg) => {
    const base = degreeToMidi(rootMidi, scale, deg);
    if (prevMidi.length === 0) return base;
    // Try the chord tone in nearby octaves; keep the one closest to any prev note.
    let best = base;
    let bestDist = Infinity;
    for (let oct = -1; oct <= 1; oct++) {
      const cand = base + oct * 12;
      const dist = Math.min(...prevMidi.map((p) => Math.abs(p - cand)));
      if (dist < bestDist) { bestDist = dist; best = cand; }
    }
    return best;
  });
  return out.sort((x, y) => x - y);
}

/**
 * Lookahead scheduler arithmetic: starting at `nextTime` with `step` spacing,
 * return every grid time strictly within (now, now + lookahead] together with the
 * advanced cursor. Pure so the scheduler cadence is testable without a clock.
 */
export function dueSteps(
  nextTime: number, now: number, lookahead: number, step: number,
): { times: number[]; nextTime: number } {
  const times: number[] = [];
  let t = nextTime;
  const horizon = now + lookahead;
  // Guard against a far-behind cursor (tab was backgrounded): catch up cheaply.
  if (t < now) t = now;
  let guard = 0;
  while (t <= horizon && guard++ < 256) {
    times.push(t);
    t += step;
  }
  return { times, nextTime: t };
}

const LOOKAHEAD = 0.12; // seconds scheduled ahead
const TICK_MS = 25; // scheduler wake interval
const BEATS_PER_BAR = 4;
const MOTIF_LEN = 8; // motif notes per loop (spans the whole 4-bar progression)
// Stable per-mood motif seeds so each state has its own memorable phrase.
const MOTIF_SEED: Record<MusicMood, number> = {
  menu: 77, planning: 156, combat: 183,
};

/**
 * Generative engine: owns a small, bounded set of nodes and a setInterval
 * scheduler. `setMood` re-parameterizes without restarting; `stop` tears down the
 * scheduler and lets scheduled voices ring out (so muting saves CPU).
 */
export class GenerativeMusic {
  private mood: MusicMood = "menu";
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextBeat = 0;
  private beat = 0;
  private noiseBuf: AudioBuffer | null = null;
  private prevChord: number[] = [];
  private motif = generateMotif(MOTIF_SEED.menu, MOTIF_LEN);
  private loopMotif = this.motif;
  private loopPass = -1;

  constructor(private ctx: AudioContext, private out: GainNode) {}

  get running(): boolean {
    return this.timer !== null;
  }

  setMood(mood: MusicMood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    this.motif = generateMotif(MOTIF_SEED[mood], MOTIF_LEN);
    this.loopMotif = this.motif;
    this.loopPass = -1;
    this.prevChord = []; // let voice-leading re-anchor on the new key/voicing
  }

  start(): void {
    if (this.timer) return;
    this.nextBeat = this.ctx.currentTime + 0.06;
    this.beat = 0;
    this.prevChord = [];
    this.motif = generateMotif(MOTIF_SEED[this.mood], MOTIF_LEN);
    this.loopMotif = this.motif;
    this.loopPass = -1;
    this.timer = setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private noise(): AudioBuffer {
    if (this.noiseBuf) return this.noiseBuf;
    const len = Math.ceil(this.ctx.sampleRate * 0.2);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    return buf;
  }

  private schedule(): void {
    const cfg = MOODS[this.mood];
    const step = 60 / cfg.bpm;
    const { times, nextTime } = dueSteps(this.nextBeat, this.ctx.currentTime, LOOKAHEAD, step);
    for (const t of times) {
      this.scheduleBeat(this.beat, t, cfg);
      this.beat++;
    }
    this.nextBeat = nextTime;
  }

  /** Lay down pad + bass (per bar) + arpeggio + seeded motif + percussion at `t`. */
  private scheduleBeat(beat: number, t: number, cfg: MoodConfig): void {
    const bar = Math.floor(beat / BEATS_PER_BAR);
    const inBar = beat % BEATS_PER_BAR;
    const progLen = cfg.progression.length;
    const chordDeg = cfg.progression[bar % progLen]!;
    const rootDeg = PROGRESSIONS[this.mood][bar % progLen]!;
    const mix = MIX[this.mood];
    const beatDur = step60(cfg.bpm);
    const barDur = beatDur * BEATS_PER_BAR;
    const loopBars = PROGRESSIONS[this.mood].length;
    const pass = Math.floor(bar / loopBars);

    // Pad + bass on each downbeat. Pad is voice-led from the previous chord so
    // motion is stepwise (no parallel block-chord leaps); pads are high-passed.
    if (inBar === 0) {
      // Re-derive the motif variation once per whole loop so the lead repeats
      // with slight, deterministic change instead of looping identically.
      if (pass !== this.loopPass) {
        this.loopPass = pass;
        this.loopMotif = varyMotif(this.motif, pass);
      }
      const voiced = voiceLead(this.prevChord, chordDeg, cfg.rootMidi, cfg.scale);
      this.prevChord = voiced;
      for (const midi of voiced) {
        this.pad(midiToFreq(midi), t, barDur, cfg.padGain * mix.pad * cfg.level);
      }
    }
    // Bass follows the chord root, an octave (or two for combat) below. Combat
    // drives a moving root pulse (downbeat + offbeat); calmer moods hold the bar.
    const bassOct = this.mood === "combat" ? -24 : -12;
    const bassMidi = degreeToMidi(cfg.rootMidi, cfg.scale, rootDeg) + bassOct;
    const bassGain = cfg.padGain * mix.bass * cfg.level;
    if (inBar === 0) {
      this.bass(midiToFreq(bassMidi), t, this.mood === "combat" ? beatDur * 0.9 : barDur, bassGain);
    } else if (this.mood === "combat" && inBar % 2 === 0) {
      this.bass(midiToFreq(bassMidi), t, beatDur * 0.9, bassGain * 0.85);
    }

    // Arpeggio: walk the chord tones, slowly drifting an octave for evolution.
    for (let s = 0; s < cfg.arpSubdiv; s++) {
      const at = t + (s * step60(cfg.bpm)) / cfg.arpSubdiv;
      const seq = beat * cfg.arpSubdiv + s;
      const drift = (Math.floor(seq / (chordDeg.length * 2)) % 2) * cfg.scale.length;
      const deg = chordDeg[seq % chordDeg.length]! + drift;
      const midi = degreeToMidi(cfg.rootMidi, cfg.scale, deg) + 12;
      this.pluck(midiToFreq(midi), at, cfg.arpGain * mix.arp * cfg.level);
    }

    // Motif: the lead phrase, two motif notes per bar (so MOTIF_LEN=8 spans the
    // 4-bar loop exactly). Plays above the arps; rests (null) leave space.
    const motifStep = BEATS_PER_BAR / 2; // a motif note every 2 beats
    if (inBar % motifStep === 0) {
      const barInLoop = bar % loopBars;
      const idx = (barInLoop * 2 + inBar / motifStep) % this.loopMotif.length;
      const md = this.loopMotif[idx];
      if (md !== null && md !== undefined) {
        // Sit the lead above the pad on the chord root for context, +1 octave.
        const midi = degreeToMidi(cfg.rootMidi, cfg.scale, rootDeg + md) + 12;
        this.lead(midiToFreq(midi), t, beatDur * 1.6, cfg.padGain * mix.lead * cfg.level);
      }
    }

    // Percussion: a soft filtered-noise tick on the beat (denser moods only).
    if (cfg.percGain > 0) {
      const accent = inBar === 0 ? 1.4 : 1;
      this.tick(t, cfg.percGain * mix.perc * cfg.level * accent, inBar % 2 === 0);
    }
  }

  private pad(freq: number, t: number, dur: number, gain: number): void {
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filt = this.ctx.createBiquadFilter();
    const hp = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();
    osc.type = "triangle";
    osc2.type = "sine";
    osc.frequency.value = freq;
    osc2.frequency.value = freq;
    osc2.detune.value = 7;
    filt.type = "lowpass";
    filt.frequency.value = 1400;
    // High-pass the pad so it leaves the low range for the bass and the mid for
    // the lead — keeps the stack out of the mud.
    hp.type = "highpass";
    hp.frequency.value = 180;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + dur * 0.35);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(filt);
    osc2.connect(filt);
    filt.connect(hp);
    hp.connect(env);
    env.connect(this.out);
    osc.start(t); osc2.start(t);
    osc.stop(t + dur + 0.05); osc2.stop(t + dur + 0.05);
  }

  private bass(freq: number, t: number, dur: number, gain: number): void {
    const osc = this.ctx.createOscillator();
    const filt = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    filt.type = "lowpass";
    filt.frequency.value = 320; // round, sub-y root note under the pads
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.04);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.95);
    osc.connect(filt);
    filt.connect(env);
    env.connect(this.out);
    osc.start(t);
    osc.stop(t + dur);
  }

  private lead(freq: number, t: number, dur: number, gain: number): void {
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filt = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();
    // Brighter, vocal-ish lead so the motif sits clearly above the pad bed.
    osc.type = "triangle";
    osc2.type = "sine";
    osc.frequency.value = freq;
    osc2.frequency.value = freq * 2; // a touch of octave shimmer for presence
    filt.type = "lowpass";
    filt.frequency.value = 2600;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.03);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(filt);
    osc2.connect(filt);
    filt.connect(env);
    env.connect(this.out);
    osc.start(t); osc2.start(t);
    osc.stop(t + dur + 0.05); osc2.stop(t + dur + 0.05);
  }

  private pluck(freq: number, t: number, gain: number): void {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    osc.connect(env);
    env.connect(this.out);
    osc.start(t);
    osc.stop(t + 0.36);
  }

  private tick(t: number, gain: number, low: boolean): void {
    const src = this.ctx.createBufferSource();
    const filt = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();
    src.buffer = this.noise();
    filt.type = low ? "lowpass" : "highpass";
    filt.frequency.value = low ? 220 : 5000;
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + (low ? 0.12 : 0.04));
    src.connect(filt);
    filt.connect(env);
    env.connect(this.out);
    src.start(t);
    src.stop(t + 0.14);
  }
}

function step60(bpm: number): number {
  return 60 / bpm;
}
