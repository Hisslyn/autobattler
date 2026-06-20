# packages/sim/src/prng.ts

**Path & purpose** — `packages/sim/src/prng.ts`. The seeded pseudo-random number generator (mulberry32 algorithm) that is the ONLY permitted source of randomness anywhere in `packages/sim`, per CLAUDE.md's hard invariant.

**Responsibility** — Owns the single deterministic, seedable RNG implementation used wherever the sim (or any pure package wrapping it) needs "randomness" that must still be perfectly reproducible given the same seed.

**Exports**
- `mulberry32(seed: number): () => number` — given an integer `seed`, returns a NEW zero-argument generator FUNCTION; each call to that returned function produces the next pseudo-random 32-bit unsigned integer in the deterministic sequence derived from `seed`. The seed is coerced to an unsigned 32-bit integer via `>>> 0` before use (so e.g. a negative or non-integer seed is normalized into the valid range rather than producing undefined/inconsistent behavior).
- `type Prng = ReturnType<typeof mulberry32>` — the type alias for "a mulberry32 generator instance" (i.e. `() => number`), used elsewhere to type a parameter/field that holds one of these generator closures without needing to spell out the function signature directly.

**Key behavior**
- Internal state `s` (closed over by the returned function) starts at the seed and is advanced by adding the constant `0x6d2b79f5` on EVERY call.
- Each call then runs the classic mulberry32 mixing steps on a COPY of the advanced state (`z = s`): two rounds of XOR-shift combined with `Math.imul` (32-bit integer multiplication, avoiding any float precision loss) using mixing constants `| 1` and `| 61`, followed by a final XOR-shift and an unsigned right-shift-by-0 (`>>> 0`) to force the result back into the unsigned 32-bit integer range before returning.
- Returns a raw 32-bit unsigned integer (range `[0, 2^32 - 1]`) — NOT a float in `[0,1)` like `Math.random()` — callers wanting a probability/percentage check must do their OWN modulo/scaling, exactly as `engine.ts` does for crit rolls: `prng() % SCALE < critChance` (modulo against the fixed-point `SCALE=1000`, then compared against a fixed-point percentage threshold).

**Invariants & constraints**
- **Pure and fully deterministic**: identical seed → identical infinite sequence of outputs, every time, on every platform (no platform-dependent float rounding concerns since the entire algorithm uses only integer bitwise/multiply operations) — this is THE mechanism that makes `simulateCombat`'s crit rolls reproducible, and by extension the entire combat outcome reproducible, for a given seed.
- **No internal global state** — each call to `mulberry32(seed)` creates a fresh closure-scoped `s` variable; multiple simultaneous generator instances (e.g. one engine's PRNG vs. another's, or different match seeds running in the same process) never interfere with each other.
- This is the ONLY randomness primitive permitted in `packages/sim` per CLAUDE.md ("All randomness goes through the seeded mulberry32 PRNG in `prng.ts`") — any code anywhere in this package needing a random-feeling decision MUST instantiate/consume one of these generators rather than reaching for `Math.random()` (which would break determinism and is explicitly forbidden by the project's hard invariants for this package, likely enforced by `tests/purity.test.ts`, to be confirmed when that file is documented).
- The exact mixing constants (`0x6d2b79f5`, `15`, `1`, `7`, `61`, `14`) are the STANDARD published mulberry32 algorithm's constants — this is a well-known, widely-used small/fast seedable PRNG (not a novel/custom algorithm), chosen presumably for its simplicity, speed, and adequate statistical quality for game-randomness purposes (not cryptographic use).

**Depends on** — Nothing (no imports) — fully self-contained.

**Used by** — `engine.ts` (`simulateCombat` instantiates exactly one `mulberry32(seed)` per combat call, consumed solely for crit rolls); presumably `packages/rules` (for any PRNG-driven decisions outside combat itself — shop rolls, loot resolution, AI command choices, all of which CLAUDE.md states must be seeded-deterministic) and `packages/balance` (seeded sweep runs) — likely importing this SAME module (or its sibling export path `@autobattler/sim/src/prng.js`, per `package.json`'s explicit deep-export allowlist) rather than reimplementing their own PRNG, to keep the entire system on one canonical RNG implementation.

**Notes** — Returning a raw unsigned 32-bit integer (rather than a normalized `[0,1)` float) is a deliberate choice that keeps this module ENTIRELY free of any floating-point output, consistent with the project-wide "no floats" invariant — every consumer is responsible for converting the raw integer into whatever fixed-point-scaled decision they need (e.g. modulo against `SCALE`), rather than this module doing an internal float-producing normalization step that would violate the no-floats rule.
