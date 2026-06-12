export const SCALE = 1000;

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
