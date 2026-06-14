// Pure SFX palette — the full designed sound set as data, plus the event→sound
// coverage map. No Web Audio here: the AudioManager renders these specs through
// its layered synth voice (ADSR + multi-osc + noise + filter + shared reverb).
// Keeping the palette pure lets the coverage test assert every game/combat/
// economy event resolves to a defined, single-key/timbre sound.
import type { AbilityFxKind } from "../combat/player.js";

export type SfxName =
  // UI
  | "tap" | "buy" | "sell" | "reroll" | "levelUp" | "error"
  // Combat
  | "attack" | "projectile" | "impact" | "crit" | "death"
  | "castMagic" | "castBurn" | "castShield" | "castBuff" | "castStealth"
  // Economy / feedback
  | "goldGain" | "starUp" | "roundStart" | "roundWin" | "roundLoss" | "elimination";

export type WaveKind = OscillatorType | "noise";

/** One synth voice: a source (osc or filtered noise) shaped by an ADSR. */
export interface SfxVoice {
  wave: WaveKind;
  /** Base frequency (Hz). For noise, the filter centre. */
  freq: number;
  /** Optional exponential pitch glide target. */
  sweepTo?: number;
  /** Static detune (cents) for thickness against a sibling voice. */
  detune?: number;
  filter?: { type: BiquadFilterType; freq: number; q?: number };
  // ADSR (seconds; sustain is a 0..1 fraction of `gain`).
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  /** Voice peak gain. */
  gain: number;
  /** Start offset within the sound (s) — used to arpeggiate a chord. */
  delay?: number;
  /** Sustain hold time before release (s). */
  hold: number;
}

export interface SfxSpec {
  voices: SfxVoice[];
  /** 0..1 reverb send for air/space. */
  send?: number;
  /** Per-trigger random pitch variation (± cents) so repeats don't fatigue. */
  jitterCents?: number;
}

// Tonal centre = A minor family, so the whole set shares one key/timbre.
const NOTE = {
  A1: 55, A2: 110, E3: 164.81, A3: 220, C4: 261.63, D4: 293.66, E4: 329.63,
  G4: 392.0, A4: 440, B4: 493.88, Cs5: 554.37, C5: 523.25, D5: 587.33,
  E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, E6: 1318.51,
} as const;

/** Voice builder with sensible plucked-envelope defaults. */
function v(p: Partial<SfxVoice> & { wave: WaveKind; freq: number }): SfxVoice {
  return { attack: 0.004, decay: 0.07, sustain: 0, release: 0.08, gain: 0.3, hold: 0, ...p };
}

export const SFX_SPECS: Record<SfxName, SfxSpec> = {
  // ── UI ─────────────────────────────────────────────────────────────────────
  tap: {
    voices: [v({ wave: "sine", freq: NOTE.A5, attack: 0.002, decay: 0.05, release: 0.04, gain: 0.22 })],
    jitterCents: 30, send: 0.05,
  },
  buy: {
    voices: [
      v({ wave: "triangle", freq: NOTE.C5, sweepTo: NOTE.E5, decay: 0.09, release: 0.1, gain: 0.32 }),
      v({ wave: "sine", freq: NOTE.E5, delay: 0.05, decay: 0.08, release: 0.1, gain: 0.18 }),
      v({ wave: "sine", freq: NOTE.A3, release: 0.06, gain: 0.12 }),
    ],
    jitterCents: 25, send: 0.12,
  },
  sell: {
    voices: [
      v({ wave: "triangle", freq: NOTE.E5, sweepTo: NOTE.A4, decay: 0.1, release: 0.12, gain: 0.3 }),
      v({ wave: "sine", freq: NOTE.A3, sweepTo: NOTE.E3, release: 0.1, gain: 0.12 }),
    ],
    jitterCents: 25, send: 0.1,
  },
  reroll: {
    voices: [
      v({ wave: "noise", freq: 2600, filter: { type: "bandpass", freq: 2600, q: 0.8 }, attack: 0.002, decay: 0.05, sustain: 0.2, hold: 0.05, release: 0.06, gain: 0.18 }),
      v({ wave: "square", freq: NOTE.A4, sweepTo: NOTE.D5, decay: 0.05, release: 0.05, gain: 0.12 }),
    ],
    jitterCents: 40, send: 0.08,
  },
  levelUp: {
    voices: [
      v({ wave: "triangle", freq: NOTE.A4, decay: 0.08, release: 0.12, gain: 0.26 }),
      v({ wave: "triangle", freq: NOTE.C5, delay: 0.07, decay: 0.08, release: 0.12, gain: 0.26 }),
      v({ wave: "triangle", freq: NOTE.E5, delay: 0.14, decay: 0.1, release: 0.18, gain: 0.28 }),
    ],
    jitterCents: 15, send: 0.2,
  },
  error: {
    voices: [
      v({ wave: "sawtooth", freq: NOTE.E3, sweepTo: 130, filter: { type: "lowpass", freq: 900, q: 1 }, decay: 0.14, release: 0.1, gain: 0.3 }),
      v({ wave: "square", freq: 138, detune: 14, decay: 0.12, release: 0.08, gain: 0.14 }),
    ],
    jitterCents: 10, send: 0.04,
  },

  // ── Combat ───────────────────────────────────────────────────────────────────
  attack: {
    voices: [
      v({ wave: "noise", freq: 1400, filter: { type: "lowpass", freq: 1800, q: 0.7 }, attack: 0.001, decay: 0.05, release: 0.03, gain: 0.22 }),
      v({ wave: "square", freq: NOTE.A3, sweepTo: 150, decay: 0.04, release: 0.03, gain: 0.16 }),
    ],
    jitterCents: 60, send: 0.04,
  },
  projectile: {
    voices: [
      v({ wave: "triangle", freq: NOTE.E5, sweepTo: NOTE.A4, decay: 0.09, release: 0.06, gain: 0.2 }),
      v({ wave: "noise", freq: 3200, filter: { type: "bandpass", freq: 3200, q: 1.4 }, attack: 0.003, decay: 0.07, release: 0.05, gain: 0.1 }),
    ],
    jitterCents: 55, send: 0.1,
  },
  impact: {
    voices: [
      v({ wave: "noise", freq: 900, filter: { type: "lowpass", freq: 1200, q: 0.8 }, attack: 0.001, decay: 0.06, release: 0.04, gain: 0.28 }),
      v({ wave: "square", freq: 190, sweepTo: 110, decay: 0.05, release: 0.04, gain: 0.18 }),
    ],
    jitterCents: 50, send: 0.06,
  },
  crit: {
    voices: [
      v({ wave: "noise", freq: 1600, filter: { type: "highpass", freq: 800, q: 0.7 }, attack: 0.001, decay: 0.08, release: 0.06, gain: 0.3 }),
      v({ wave: "square", freq: NOTE.E4, sweepTo: NOTE.E5, decay: 0.07, release: 0.06, gain: 0.2 }),
      v({ wave: "sine", freq: NOTE.E6, delay: 0.02, decay: 0.1, release: 0.1, gain: 0.16 }),
    ],
    jitterCents: 30, send: 0.16,
  },
  death: {
    voices: [
      v({ wave: "sine", freq: NOTE.A3, sweepTo: NOTE.A1, decay: 0.2, release: 0.16, gain: 0.32 }),
      v({ wave: "noise", freq: 600, filter: { type: "lowpass", freq: 800, q: 0.6 }, attack: 0.002, decay: 0.18, release: 0.14, gain: 0.16 }),
    ],
    jitterCents: 30, send: 0.18,
  },
  castMagic: {
    voices: [
      v({ wave: "sine", freq: NOTE.E5, sweepTo: NOTE.B4, decay: 0.12, release: 0.14, gain: 0.24 }),
      v({ wave: "sine", freq: NOTE.E5, detune: 12, sweepTo: NOTE.B4, decay: 0.12, release: 0.14, gain: 0.16 }),
      v({ wave: "triangle", freq: NOTE.E6, delay: 0.03, decay: 0.12, release: 0.12, gain: 0.14 }),
    ],
    jitterCents: 25, send: 0.28,
  },
  castBurn: {
    voices: [
      v({ wave: "sawtooth", freq: NOTE.A3, sweepTo: NOTE.E4, filter: { type: "bandpass", freq: 1200, q: 1.2 }, decay: 0.14, sustain: 0.2, hold: 0.05, release: 0.12, gain: 0.22 }),
      v({ wave: "noise", freq: 2400, filter: { type: "highpass", freq: 1600, q: 0.7 }, attack: 0.004, decay: 0.12, sustain: 0.2, hold: 0.05, release: 0.1, gain: 0.12 }),
    ],
    jitterCents: 30, send: 0.18,
  },
  castShield: {
    voices: [
      v({ wave: "sine", freq: NOTE.A4, sweepTo: NOTE.E5, attack: 0.03, decay: 0.1, sustain: 0.4, hold: 0.08, release: 0.16, gain: 0.24 }),
      v({ wave: "triangle", freq: NOTE.E5, detune: -8, attack: 0.04, decay: 0.1, sustain: 0.3, hold: 0.06, release: 0.16, gain: 0.14 }),
    ],
    jitterCents: 20, send: 0.3,
  },
  castBuff: {
    voices: [
      v({ wave: "triangle", freq: NOTE.A4, decay: 0.07, release: 0.1, gain: 0.22 }),
      v({ wave: "triangle", freq: NOTE.Cs5, delay: 0.05, decay: 0.07, release: 0.1, gain: 0.22 }),
      v({ wave: "triangle", freq: NOTE.E5, delay: 0.1, decay: 0.09, release: 0.14, gain: 0.24 }),
    ],
    jitterCents: 20, send: 0.22,
  },
  castStealth: {
    voices: [
      v({ wave: "sine", freq: NOTE.A5, sweepTo: NOTE.A3, filter: { type: "lowpass", freq: 2000, q: 0.7 }, attack: 0.01, decay: 0.16, release: 0.18, gain: 0.22 }),
      v({ wave: "noise", freq: 4000, filter: { type: "bandpass", freq: 4000, q: 0.8 }, attack: 0.01, decay: 0.16, release: 0.12, gain: 0.07 }),
    ],
    jitterCents: 30, send: 0.26,
  },

  // ── Economy / feedback ────────────────────────────────────────────────────────
  goldGain: {
    voices: [
      v({ wave: "sine", freq: NOTE.E5, decay: 0.06, release: 0.1, gain: 0.2 }),
      v({ wave: "sine", freq: NOTE.A5, delay: 0.04, decay: 0.08, release: 0.12, gain: 0.18 }),
      v({ wave: "triangle", freq: NOTE.E6, delay: 0.06, decay: 0.08, release: 0.12, gain: 0.1 }),
    ],
    jitterCents: 25, send: 0.24,
  },
  starUp: {
    voices: [
      v({ wave: "triangle", freq: NOTE.A4, decay: 0.08, release: 0.12, gain: 0.26 }),
      v({ wave: "triangle", freq: NOTE.Cs5, delay: 0.06, decay: 0.08, release: 0.12, gain: 0.26 }),
      v({ wave: "triangle", freq: NOTE.E5, delay: 0.12, decay: 0.08, release: 0.14, gain: 0.27 }),
      v({ wave: "sine", freq: NOTE.A5, delay: 0.18, decay: 0.12, release: 0.2, gain: 0.24 }),
    ],
    jitterCents: 12, send: 0.3,
  },
  roundStart: {
    voices: [
      v({ wave: "sawtooth", freq: NOTE.A3, filter: { type: "lowpass", freq: 1100, q: 1 }, attack: 0.02, decay: 0.12, sustain: 0.3, hold: 0.06, release: 0.16, gain: 0.22 }),
      v({ wave: "sawtooth", freq: NOTE.E4, detune: 6, filter: { type: "lowpass", freq: 1300, q: 1 }, attack: 0.02, decay: 0.12, sustain: 0.3, hold: 0.06, release: 0.16, gain: 0.16 }),
    ],
    jitterCents: 12, send: 0.18,
  },
  roundWin: {
    voices: [
      v({ wave: "triangle", freq: NOTE.A4, decay: 0.1, release: 0.16, gain: 0.26 }),
      v({ wave: "triangle", freq: NOTE.Cs5, delay: 0.08, decay: 0.1, release: 0.16, gain: 0.26 }),
      v({ wave: "triangle", freq: NOTE.E5, delay: 0.16, decay: 0.12, release: 0.22, gain: 0.28 }),
    ],
    jitterCents: 12, send: 0.3,
  },
  roundLoss: {
    voices: [
      v({ wave: "triangle", freq: NOTE.E5, filter: { type: "lowpass", freq: 1400, q: 1 }, decay: 0.1, release: 0.16, gain: 0.24 }),
      v({ wave: "triangle", freq: NOTE.C5, delay: 0.09, filter: { type: "lowpass", freq: 1200, q: 1 }, decay: 0.1, release: 0.16, gain: 0.24 }),
      v({ wave: "sine", freq: NOTE.A3, delay: 0.18, decay: 0.16, release: 0.2, gain: 0.2 }),
    ],
    jitterCents: 12, send: 0.2,
  },
  elimination: {
    voices: [
      v({ wave: "sine", freq: NOTE.A3, sweepTo: NOTE.A1, decay: 0.3, release: 0.3, gain: 0.34 }),
      v({ wave: "sawtooth", freq: NOTE.A2, detune: 8, filter: { type: "lowpass", freq: 700, q: 1.2 }, decay: 0.26, sustain: 0.2, hold: 0.08, release: 0.3, gain: 0.16 }),
      v({ wave: "noise", freq: 500, filter: { type: "lowpass", freq: 600, q: 0.6 }, attack: 0.004, decay: 0.3, release: 0.24, gain: 0.12 }),
    ],
    jitterCents: 16, send: 0.3,
  },
};

export const SFX_NAMES = Object.keys(SFX_SPECS) as SfxName[];

/** Per-ability-kind cast sound. */
export function castSfx(kind: AbilityFxKind): SfxName {
  switch (kind) {
    case "magic_damage": return "castMagic";
    case "burn": return "castBurn";
    case "shield": return "castShield";
    case "buff": return "castBuff";
    case "stealth": return "castStealth";
  }
}

/**
 * The complete event→sound coverage map: every discrete UI, combat, and economy
 * event that produces audio, keyed to its SfxName. The AudioManager derives
 * combat triggers from the fx stream; this table is the source of truth the
 * coverage test asserts is total (and only references defined specs).
 */
export const EVENT_SFX = {
  // UI
  tap: "tap", buy: "buy", sell: "sell", reroll: "reroll", levelUp: "levelUp", error: "error",
  // Combat (manager derives these from the combat fx stream)
  meleeContact: "attack", projectileFire: "projectile", impact: "impact", critImpact: "crit", death: "death",
  abilityMagic: "castMagic", abilityBurn: "castBurn", abilityShield: "castShield",
  abilityBuff: "castBuff", abilityStealth: "castStealth",
  // Economy / feedback
  goldGain: "goldGain", starUp: "starUp", roundStart: "roundStart",
  roundWin: "roundWin", roundLoss: "roundLoss", elimination: "elimination",
} satisfies Record<string, SfxName>;

export type AudioEvent = keyof typeof EVENT_SFX;
