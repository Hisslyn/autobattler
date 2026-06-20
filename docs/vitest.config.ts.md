# vitest.config.ts

**Path & purpose** — `/vitest.config.ts` (repo root). The single, shared Vitest test-runner configuration for the entire monorepo — there is no per-package `vitest.config.ts` anywhere in `packages/*`; every workspace package's tests run under this one root config when `npm test` (`vitest run --reporter=verbose`) executes.

**Responsibility** — Tells Vitest WHICH files in the monorepo are test files to discover and run. This is the entire content/responsibility of the file — it carries no other test configuration (no coverage thresholds, no custom environment, no setup files, no aliasing/path-resolution overrides, no globals injection).

**Exports**
- `export default defineConfig({ test: { include: ["packages/*/tests/**/*.test.ts"] } })` — the Vitest config object, built via Vitest's own `defineConfig` helper (from `vitest/config`) purely for type-checking/autocomplete of the config shape; at runtime it's just a plain object.

**Key behavior**
- `test.include: ["packages/*/tests/**/*.test.ts"]` is the ONLY override from Vitest's defaults — a single glob matching any `*.test.ts` file nested (at any depth) under a `tests/` directory directly inside any `packages/<name>/` folder. This is what causes `npm test` to discover and run every `*.test.ts` file across `packages/sim/tests/`, `packages/rules/tests/` (if present), `packages/server/tests/`, `packages/client/tests/` (if present), `packages/protocol/tests/` (if present), `packages/balance/tests/` (if present), etc. — confirmed by this documentation effort having encountered and documented test files like `packages/sim/tests/determinism.test.ts`, `packages/server/tests/room.test.ts`, `packages/server/tests/persistence.test.ts`, etc., all matching this exact glob shape.
- Because this is the ONLY test-discovery rule and there's no narrower per-package override, every package's test suite runs together as ONE Vitest invocation from the repo root — there's no built-in mechanism here to run, say, only `packages/sim`'s tests in isolation via this config alone (that would require Vitest CLI filtering flags, e.g. `vitest run packages/sim`, layered on top of this config at invocation time, not something this file itself provides).
- No `environment` is set, so Vitest defaults to its `node` test environment for everything — meaning `packages/client`'s tests (which may exercise DOM-touching pure logic like `layout.ts`'s `resolveLayout` or `hudModel.ts`'s pure derivations) must either be written to avoid needing a real DOM, or any actual DOM API usage in client tests would need a separate `jsdom`/`happy-dom` environment override not present in this config (a potential gap/limitation worth knowing if a future agent is debugging a client test that unexpectedly fails due to a missing DOM global).

**Invariants & constraints**
- This file's `include` glob is the SOLE gate on what `npm test`'s `vitest run` actually executes — a test file placed anywhere OUTSIDE a `packages/<name>/tests/` directory (e.g. directly in a package's `src/` folder, or at the repo root) would silently NOT be picked up and run, even if correctly named `*.test.ts`.
- This is a deliberately minimal config — no coverage reporting setup is configured here (if `npm run balance`-style coverage reports exist, they're a separate concern from this file), no path aliases, no global test utilities/setup files. A future agent adding tests should simply follow the existing convention (`packages/<name>/tests/<file>.test.ts`) and they'll be automatically discovered without any config changes needed.
- Since there's no per-package vitest config, all packages' tests share IDENTICAL runner behavior/defaults (timeouts, retry counts, etc. all at Vitest's stock defaults) — consistent with the single shared `tsconfig.json`'s similar "one config for everything" pattern at the monorepo root.

**Depends on** — `vitest/config` (`defineConfig`, purely for config-shape typing/validation, no runtime behavior difference from a plain object).

**Used by** — `npm test`'s `test` script (`vitest run --reporter=verbose`), which loads this file by default (Vitest auto-discovers `vitest.config.ts` at the project root with no `-c`/`--config` flag override observed in `package.json`'s scripts).

**Notes** — This is the last file in the documentation manifest for this pass; together with `tsconfig.json` it completes the full picture of how `npm test` operates end-to-end: `pretest` (`tsc --build` against `tsconfig.json`) must pass first, then `vitest run` (against THIS file's single test-discovery glob) actually executes every package's test suite as one combined run.
