# packages/sim/tests/prng.test.ts

**Path & purpose** — `packages/sim/tests/prng.test.ts`. Minimal, focused unit tests for `prng.ts`'s `mulberry32` generator: a known-answer snapshot test, a same-seed-repeatability test, and a different-seeds-diverge test.

**Responsibility** — Confirms `mulberry32` is itself deterministic (same seed → same sequence) and seed-sensitive (different seeds → different first value), and pins its exact numeric output for a fixed seed via a Vitest snapshot — the most direct possible regression guard against ever accidentally changing the PRNG's mixing algorithm (which would silently invalidate every other determinism test/snapshot in the package, since they all depend transitively on this exact sequence).

**Key behavior — test by test**
1. **"known-answer: seed 42 first 5 values"**: calls `mulberry32(42)` and collects the first 5 raw outputs into an array, asserting it `toMatchSnapshot()`. The committed snapshot (`__snapshots__/prng.test.ts.snap`) pins the exact expected sequence:
   ```
   [2581720956, 1925393290, 3661312704, 2876485805, 750819978]
   ```
   These are raw unsigned 32-bit integers (consistent with `prng.ts`'s documented return type — NOT normalized floats in `[0,1)`). If `mulberry32`'s mixing constants or algorithm were ever changed, this exact array would change and the snapshot would fail, requiring an explicit, deliberate `--update` — making this the single most sensitive tripwire in the entire test suite for any accidental PRNG algorithm change (since `determinism.test.ts`'s own snapshot test, and indeed every test anywhere in the codebase that runs `simulateCombat` with a fixed seed and expects a specific outcome, transitively depends on `mulberry32` producing exactly this sequence for these seeds).
2. **"same seed produces identical sequence"**: creates two SEPARATE `mulberry32(1337)` closures (`a` and `b`) and pulls 100 values from each in lockstep, asserting `a() === b()` at every step — proves the generator is a pure function of its seed with no hidden shared/global mutable state (each call to `mulberry32(seed)` returns an independent closure with its own private `s` variable, confirmed by running two instances simultaneously and getting identical interleaved sequences).
3. **"different seeds diverge"**: creates `mulberry32(1)` and `mulberry32(2)`, pulls ONE value from each, and asserts they're NOT equal — a basic seed-sensitivity sanity check (not testing statistical quality/distribution, just confirming the seed actually participates in the output rather than being ignored).

**Invariants & constraints**
- The known-answer snapshot test is THE concrete, version-controlled proof of `mulberry32`'s exact output for seed 42 — any future agent suspicious that the PRNG implementation might have silently changed (e.g. after a refactor of `prng.ts`) can compare against this committed `.snap` file as ground truth without needing to trust the implementation's comments alone.
- This file does NOT test statistical randomness quality (uniformity, period length, correlation) — only determinism (same-seed repeatability) and basic seed-sensitivity (different seeds differ). Quality/distribution properties of mulberry32 are taken on faith from the published algorithm, not independently verified here.
- The two closures in test #2 are deliberately created and driven INTERLEAVED (alternating `a()`/`b()` calls within the same loop iteration, not sequentially) — this is a slightly stronger check than running them sequentially, since it would also catch a bug where the generator accidentally shared module-level mutable state across instances (each call to `a()`/`b()` in this interleaved pattern would corrupt the other's state if such a bug existed).

**Depends on** — `vitest`; `../src/prng.js` (`mulberry32`, the sole unit under test).

**Used by** — Run as part of `npm test`; not imported elsewhere. Its companion snapshot file `packages/sim/tests/__snapshots__/prng.test.ts.snap` is read/compared-against automatically by Vitest whenever this test runs (auto-discovered by file-naming convention, not an explicit import).

**Notes** — None; this is a small, clean, complete spec for `mulberry32`'s public contract (determinism + seed-sensitivity), with the snapshot file providing the otherwise-missing "what exact numbers does it produce" ground truth that the source code comments alone don't pin down.
