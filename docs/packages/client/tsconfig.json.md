# Path & purpose

`packages/client/tsconfig.json` — TypeScript compiler config scoped to `packages/client/src/`. This is the ONLY package in the monorepo with its own `tsconfig.json`; every other package's TypeScript is governed solely by the root `tsconfig.json` (`tsc --build` from the repo root, which globs `packages/*/src/**/*.ts` + `packages/*/tests/**/*.ts` directly, no per-package configs or project references).

# Responsibility

Defines the TypeScript compiler options Vite uses when transpiling/type-stripping the client's `.ts` source during `npm run dev`/`vite build` (Vite reads the nearest `tsconfig.json` to the file being compiled for things like `target`/`lib`/path resolution semantics, though Vite itself doesn't type-check — it only strips types via esbuild). It does NOT participate in `npm run typecheck` (`tsc --build` at the repo root), which type-checks the client alongside every other package via the root config's glob include.

# Exports

Not a TypeScript/JS module — a JSON compiler configuration file, consumed by tooling (Vite, IDE language servers), not imported by code.

# Key behavior

- `compilerOptions.target: "ES2022"` — matches the root tsconfig's target exactly.
- `module: "ESNext"`, `moduleResolution: "bundler"` — bundler-mode resolution (vs the root's `"Bundler"`, same setting different casing — TypeScript accepts both case variants for this option).
- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `noImplicitOverride: true` — identical strictness flags to the root config, so the client's type-checking strictness (when checked) is consistent with the rest of the monorepo.
- `lib: ["ES2022", "DOM"]` — includes DOM lib types (needed for `window`/`document`/`localStorage`/Web Audio/Canvas APIs used throughout the client) but notably OMITS `"DOM.Iterable"`, which the root config DOES include. This means code relying on DOM iterable protocols (e.g. `for...of` over a `NodeList` or `FormData`) would type-check differently under this config vs the root config — a potential latent inconsistency between what `tsc --build` (root) checks and what an IDE using THIS config would flag.
- `skipLibCheck: true` — skips type-checking of `.d.ts` files (faster builds, matches the root config).
- `include: ["src"]` — scopes to `packages/client/src/` only; notably does NOT include `packages/client/tests/` (test files are covered by the ROOT tsconfig's `packages/*/tests/**/*.ts` glob instead).
- Does NOT have `noEmit: true` (the root config has it) — irrelevant here since Vite handles emission, not `tsc`, for this config's actual consumer.
- Does NOT have `resolveJsonModule: true` (the root config has it) — could matter if client source ever directly `import`s a `.json` file via a relative path rather than going through `@autobattler/data`'s loader, though Vite's own JSON-import support operates independently of this flag.

# Invariants & constraints

- This file's settings must stay reasonably aligned with the root `tsconfig.json` (same `target`/`strict` flags) to avoid surprising divergence between "what an IDE shows as an error in client files" (via this config) and "what `npm run typecheck` actually catches" (via the root config, which is the one CI/pretest enforces). The two configs are NOT formally linked (no `extends`), so a strictness flag added to one without the other is a silent gap — currently they match on all the strict-mode flags, but `lib` differs (`DOM.Iterable` present in root, absent here) and `resolveJsonModule`/`noEmit` differ too.
- The actual enforced gate (`npm test`'s `pretest` → `npm run typecheck` → `tsc --build`) uses the ROOT config, not this one — so a type error that this config's settings would catch (or fail to catch) but the root config doesn't is NOT what blocks CI. This file mainly affects IDE/editor experience and Vite's transpilation behavior for the client package specifically.

# Depends on

- Nothing (a leaf config; no `extends` field).

# Used by

- Vite (via `packages/client/vite.config.ts` and the `npm run dev`/build scripts) — picks up this `tsconfig.json` as the nearest config when compiling client source.
- IDE/editor TypeScript language servers opened with `packages/client` as a project root would use this config for in-editor diagnostics.
- NOT used by `npm run typecheck` (`tsc --build` from repo root) — that command uses only the root `tsconfig.json`'s glob-based `include`.

# Notes

- The fact that this is the ONLY package-level tsconfig in the repo is itself notable — every other package (`sim`, `rules`, `protocol`, `server`, `data`, `balance`) has no tsconfig of its own and relies entirely on the root config's globs. This file exists specifically because Vite needs a `tsconfig.json` colocated with (or discoverable from) the client source root for its tooling integration, not because the client package needed materially different compiler options.
- The `DOM.Iterable` omission (present in root, absent here) and the `resolveJsonModule`/`noEmit` differences from the root config are NOT called out anywhere in the source as intentional — they read as the kind of drift that happens when two configs are maintained separately without an `extends` relationship. Worth flagging if client code ever needs DOM-iterable typing or direct relative JSON imports and an IDE using this config disagrees with `tsc --build`'s root-config verdict.
