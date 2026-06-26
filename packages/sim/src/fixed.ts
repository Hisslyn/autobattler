export const SCALE = 1000;

/**
 * THE canonical simulation rate: ticks per second of GAME time.
 *
 * This single constant defines the sim's fixed timestep — one tick is always
 * 1/TICK_HZ seconds of game time on every device, independent of wall clock,
 * Date, or device FPS. Combat duration in seconds = tickCount / TICK_HZ, so the
 * measured duration is deterministic and identical across devices.
 *
 * To change the simulation rate, change THIS value and only this value: every
 * per-second / duration derivation in the engine (attack cooldown from attack
 * speed, the overtime threshold, the overtime hard cap, ability windups, CC
 * durations, movement) routes through it via `secondsToTicks`. Authored durations
 * live in SECONDS in packages/data and are converted to integer ticks here.
 *
 * Lives in fixed.ts because this is the one sim file permitted raw numeric
 * literals (the fixed-point/rate primitives), per the magic-number lint policy.
 */
export const TICK_HZ = 30;

/**
 * Convert a duration authored in SECONDS (fixed-point, scale 1000 — e.g. 1500
 * means 1.5s) into an integer count of whole simulation ticks at TICK_HZ.
 * Pure integer fixed-point: ticks = trunc(secondsFixed * TICK_HZ / SCALE). No
 * floats, deterministic. e.g. secondsToTicks(60000) === 1800 ticks at 30 Hz.
 */
export function secondsToTicks(secondsFixed: number): number {
  return fmul(secondsFixed, TICK_HZ);
}

export function fmul(a: number, b: number): number {
  return Math.trunc((a * b) / SCALE);
}

export function fdiv(a: number, b: number): number {
  return Math.trunc((a * SCALE) / b);
}

export function toFixed(n: number): number {
  return Math.trunc(n * SCALE);
}

export function fromFixed(n: number): number {
  return Math.trunc(n / SCALE);
}
