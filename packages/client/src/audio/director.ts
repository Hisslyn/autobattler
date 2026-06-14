// Music director — pure mapping from game phase/scene to a music state, plus the
// per-state file-vs-generative resolution, crossfade gain math, and the autoplay
// unlock state machine. The AudioManager owns the nodes; this module owns the
// decisions, so they can be unit-tested without Web Audio.
import type { MusicMood } from "./music.js";

/** Distinct music states the director can drive. */
export type MusicState = "menu" | "planning" | "combat" | "results";

/** Where a state's audio comes from once resolved. */
export type MusicSource = "file" | "generative";

/** Map a match phase (driver phase string) to its music state. */
export function phaseToMusicState(phase: string): MusicState {
  switch (phase) {
    case "PLANNING": return "planning";
    case "COMBAT": return "combat";
    case "RESOLUTION": return "combat"; // hold tension through the result overlay
    default: return "planning";
  }
}

/** Generative mood backing each state (results underscores like the menu). */
export function stateToMood(state: MusicState): MusicMood {
  switch (state) {
    case "menu": return "menu";
    case "results": return "menu";
    case "planning": return "planning";
    case "combat": return "combat";
  }
}

/**
 * A real dropped-in file always wins; otherwise the generative version plays.
 * `hasFile` is whether `public/audio/music/<state>.(mp3|ogg)` resolved.
 */
export function resolveMusicSource(_state: MusicState, hasFile: boolean): MusicSource {
  return hasFile ? "file" : "generative";
}

/** Candidate file paths for a state's drop-in slot, in priority order. */
export function musicFilePaths(state: MusicState, base = "/audio"): string[] {
  return [`${base}/music/${state}.mp3`, `${base}/music/${state}.ogg`];
}

/** Candidate file paths for a per-event SFX override, in priority order. */
export function sfxFilePaths(name: string, base = "/audio"): string[] {
  return [`${base}/sfx/${name}.mp3`, `${base}/sfx/${name}.ogg`];
}

/**
 * Equal-power crossfade gains at progress 0..1 (0 = all out, 1 = all in). Keeps
 * combined loudness ~constant across a transition. Pure.
 */
export function crossfadeGains(progress: number): { out: number; in: number } {
  const p = Math.max(0, Math.min(1, progress));
  return { out: Math.cos((p * Math.PI) / 2), in: Math.cos(((1 - p) * Math.PI) / 2) };
}

// ── Autoplay unlock ─────────────────────────────────────────────────────────

export type AudioUnlockState = "locked" | "unlocked";

/**
 * Browsers start an AudioContext "suspended" until a user gesture. Unlock is
 * sticky: once running we stay unlocked. Pure transition from the context state.
 */
export function nextUnlockState(
  prev: AudioUnlockState,
  ctxState: AudioContextState | null,
): AudioUnlockState {
  if (prev === "unlocked") return "unlocked";
  return ctxState === "running" ? "unlocked" : "locked";
}

/** True exactly on the locked→unlocked edge — the moment to (re)start music. */
export function becameUnlocked(prev: AudioUnlockState, next: AudioUnlockState): boolean {
  return prev === "locked" && next === "unlocked";
}
