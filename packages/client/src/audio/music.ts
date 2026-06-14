// Generative, loopable background music — composed from scratch (no recognizable
// melodies). Each mood is a scale + chord progression rendered as layered pads + a
// gentle arpeggio + light percussion, scheduled with a Web Audio lookahead
// scheduler so loops evolve slowly and never click. Pure music-theory + scheduler
// helpers are unit-tested; the engine class wraps them around real audio nodes.

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

export const MOODS: Record<MusicMood, MoodConfig> = {
  menu: {
    bpm: 68, scale: A_MINOR, rootMidi: 57 /* A3 */,
    progression: [[0, 2, 4], [5, 0, 2], [3, 5, 0], [4, 6, 1]],
    arpGain: 0.1, padGain: 0.16, percGain: 0, arpSubdiv: 1, level: 0.7,
  },
  planning: {
    bpm: 96, scale: A_DORIAN, rootMidi: 57,
    progression: [[0, 2, 4], [3, 5, 0], [4, 6, 1], [0, 2, 4]],
    arpGain: 0.12, padGain: 0.15, percGain: 0.06, arpSubdiv: 2, level: 0.75,
  },
  combat: {
    bpm: 132, scale: A_MINOR, rootMidi: 45 /* A2 */,
    progression: [[0, 2, 4], [5, 0, 2], [4, 6, 1], [3, 5, 0]],
    arpGain: 0.14, padGain: 0.13, percGain: 0.12, arpSubdiv: 2, level: 0.8,
  },
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

  constructor(private ctx: AudioContext, private out: GainNode) {}

  get running(): boolean {
    return this.timer !== null;
  }

  setMood(mood: MusicMood): void {
    this.mood = mood;
  }

  start(): void {
    if (this.timer) return;
    this.nextBeat = this.ctx.currentTime + 0.06;
    this.beat = 0;
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

  /** Lay down pad (per bar) + arpeggio (per beat) + light percussion at time `t`. */
  private scheduleBeat(beat: number, t: number, cfg: MoodConfig): void {
    const beatsPerBar = 4;
    const bar = Math.floor(beat / beatsPerBar);
    const inBar = beat % beatsPerBar;
    const chord = cfg.progression[bar % cfg.progression.length]!;

    // Pad: sustain the chord across the bar (scheduled once, on the downbeat).
    if (inBar === 0) {
      const barDur = step60(cfg.bpm) * beatsPerBar;
      for (const deg of chord) {
        const midi = degreeToMidi(cfg.rootMidi, cfg.scale, deg);
        this.pad(midiToFreq(midi), t, barDur, cfg.padGain * cfg.level);
      }
    }

    // Arpeggio: walk the chord tones, slowly drifting an octave for evolution.
    for (let s = 0; s < cfg.arpSubdiv; s++) {
      const at = t + (s * step60(cfg.bpm)) / cfg.arpSubdiv;
      const seq = beat * cfg.arpSubdiv + s;
      const deg = chord[seq % chord.length]! + (Math.floor(seq / (chord.length * 2)) % 2) * cfg.scale.length;
      const midi = degreeToMidi(cfg.rootMidi, cfg.scale, deg) + 12;
      this.pluck(midiToFreq(midi), at, cfg.arpGain * cfg.level);
    }

    // Percussion: a soft filtered-noise tick on the beat (denser moods only).
    if (cfg.percGain > 0) {
      const accent = inBar === 0 ? 1.4 : 1;
      this.tick(t, cfg.percGain * cfg.level * accent, inBar % 2 === 0);
    }
  }

  private pad(freq: number, t: number, dur: number, gain: number): void {
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filt = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();
    osc.type = "triangle";
    osc2.type = "sine";
    osc.frequency.value = freq;
    osc2.frequency.value = freq;
    osc2.detune.value = 7;
    filt.type = "lowpass";
    filt.frequency.value = 1400;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + dur * 0.35);
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
