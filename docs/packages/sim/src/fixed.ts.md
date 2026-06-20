# packages/sim/src/fixed.ts

**Path & purpose** — `packages/sim/src/fixed.ts`. The integer fixed-point arithmetic helpers used everywhere in the sim engine to avoid floating-point math, per CLAUDE.md's "all arithmetic uses integer fixed-point math (scale 1000 = 1.0)" hard invariant.

**Responsibility** — Owns the SINGLE definition of the fixed-point scale constant and the 4 primitive operations (multiply, divide, to-fixed, from-fixed) needed to do scaled-integer math without ever introducing a float.

**Exports**
- `SCALE = 1000` — the fixed-point scale constant: a value of `1000` represents `1.0` in real terms. E.g. an attack-speed stat of `750` means `0.75` attacks/sec-equivalent (per CLAUDE.md's note that `as` is the one stat actually stored in this fixed-point representation, formatted by the client's `statFormat.ts` as `÷1000` to 2 decimals).
- `fmul(a: number, b: number): number` — fixed-point multiply: computes `trunc((a * b) / SCALE)`. Used whenever multiplying a real-valued stat (`hp`, `ad`, etc., stored as a plain integer) by a FIXED-POINT multiplier (e.g. a star multiplier of `1800` meaning 1.8x, or a crit multiplier). The result is truncated toward zero (`Math.trunc`, not `Math.floor`/`Math.round`) — for positive inputs this is equivalent to flooring, discarding any fractional remainder.
- `fdiv(a: number, b: number): number` — fixed-point divide: computes `trunc((a * SCALE) / b)` — produces a FIXED-POINT RESULT from two plain integers (e.g. dividing two real stats and getting back a scaled ratio). Not observed in use within `engine.ts` itself (engine only uses `fmul`), but exported for other consumers.
- `toFixed(n: number): number` — converts a plain real number into its fixed-point representation: `trunc(n * SCALE)` (e.g. `toFixed(0.75) → 750`).
- `fromFixed(n: number): number` — the inverse: converts a fixed-point value back to its plain real (truncated-integer) form: `trunc(n / SCALE)` (e.g. `fromFixed(750) → 0`, NOTE this loses the fractional part entirely since the return type is a plain truncated integer, not a float — `fromFixed` is for when you want the INTEGER part of the real value, not a float reconstruction).

**Key behavior** — All 4 functions are simple, single-expression, side-effect-free arithmetic — no loops, no branching, no state.

**Invariants & constraints**
- Every result is produced via `Math.trunc`, NEVER `Math.round`/`Math.floor`/`Math.ceil` — this is a deliberate determinism/consistency choice (truncation toward zero is unambiguous and doesn't require reasoning about negative-number rounding direction the way floor/ceil would); since all sim quantities in practice are non-negative, `Math.trunc` behaves identically to `Math.floor` here, but the explicit choice of `trunc` over `floor` signals "no special negative-number handling is needed/expected."
- This file is foundational to the project's "no floats" invariant — EVERY multiplicative scaling operation anywhere in `packages/sim` (star multipliers, crit multiplier, attack-cooldown-from-attack-speed) MUST go through `fmul`, never raw `*` followed by a float result, to keep all sim state representable as plain JS integers (which, being IEEE-754 doubles under the hood, CAN represent fractional values — the discipline here is conventions-level, not language-enforced; nothing stops a future change from accidentally introducing a raw float, this file just provides the correct primitives to use instead).
- `SCALE` is the canonical value other packages mirror rather than import directly in some cases — CLAUDE.md notes the CLIENT's `statFormat.ts` "mirrors the scale constant locally rather than widening sim's narrow exports," meaning `SCALE`'s value (`1000`) is DUPLICATED as a literal in at least one other file rather than imported, a deliberate decoupling choice (not a bug) to avoid expanding `sim`'s public surface just for one constant.

**Depends on** — Nothing (no imports).

**Used by** — `engine.ts` (`fmul`, `SCALE` — star multipliers, crit multiplier, attack-cooldown-from-as conversion, and the crit-roll comparison `prng() % SCALE < critChance`); presumably other sim-adjacent code that needs fixed-point math (e.g. `rules`/`balance` if they do any fixed-point-aware calculations, though this would need confirming when those files are documented).

**Notes** — `fdiv`/`toFixed`/`fromFixed` are exported but NOT used anywhere within `engine.ts` itself (only `fmul` and `SCALE` are imported there) — they exist as general-purpose fixed-point utilities for OTHER consumers (other sim internals, or other packages) rather than being dead code; their presence here (rather than defined ad-hoc elsewhere) keeps the fixed-point convention centralized in one place per the project's stated invariant.
