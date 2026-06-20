# tsconfig.json

**Path & purpose** — `/tsconfig.json` (repo root). The single, shared TypeScript compiler configuration for the entire monorepo — there is no per-package `tsconfig.json` override anywhere in `packages/*`; every workspace package typechecks under these exact same compiler options.

**Responsibility** — Defines the TypeScript language/strictness baseline and file inclusion set for `npm run typecheck` (`tsc --build`), which `npm test`'s `pretest` hook runs automatically before every `vitest run` — meaning this file's settings gate WHETHER tests are even allowed to run at all (a typecheck failure blocks `npm test` entirely, since `pretest` must exit 0 first).

**Key settings**
- `"target": "ES2022"` / `"lib": ["ES2022", "DOM", "DOM.Iterable"]` — compiles assuming ES2022 runtime features are available, and includes BOTH `ES2022` and `DOM`/`DOM.Iterable` lib definitions — the `DOM` libs are needed because this single shared config also typechecks `packages/client` (a browser/Pixi app using `window`, `document`, Web Audio, etc.), even though `packages/sim`/`rules`/`protocol`/`server` never touch DOM APIs themselves — there's no separate Node-only vs. browser-only split, everything shares one global lib set.
- `"module": "ESNext"` / `"moduleResolution": "Bundler"` — modern ESM module emit/resolution semantics, consistent with every package being `"type": "module"` and using `.js`-suffixed relative imports for `.ts` source files (the TypeScript "import the .ts file using its post-compile .js extension" ESM convention seen throughout the codebase, e.g. `../src/engine.js` resolving to `engine.ts`).
- `"strict": true` — the full TypeScript strict-mode bundle (strict null checks, no implicit any, strict function types, etc.) is on for the ENTIRE codebase, no exceptions.
- `"noUncheckedIndexedAccess": true` — array/object index access (`arr[i]`) types as `T | undefined` rather than just `T`, forcing explicit undefined-handling at every indexed read — a notably stricter-than-default setting that affects code patterns throughout `packages/sim`'s array-heavy logic (e.g. `tgtHp[i-1]!` patterns seen in test files use non-null assertions specifically because of this setting).
- `"exactOptionalPropertyTypes": true` — another stricter-than-default setting: an optional field typed `foo?: string` may be OMITTED or hold a `string`, but explicitly assigning `undefined` to it is a type error (distinguishes "absent" from "present but undefined") — relevant to types like `UnitInstance`'s optional `shield?`/`untargetableUntil?`/`onHitBurn?` fields documented in `packages/sim/src/types.ts`.
- `"noImplicitOverride": true` — any class method overriding a base-class method must be explicitly marked `override`.
- `"resolveJsonModule": true` — allows directly `import`-ing `.json` files as typed modules, which is exactly how `packages/data`'s loader pulls in `units.json`/`traits.json`/`items.json`/etc.
- `"skipLibCheck": true` — skips re-typechecking `.d.ts` files inside `node_modules` (a near-universal perf optimization, not a strictness relaxation on the project's OWN code).
- `"noEmit": true` — this config is type-CHECKING only; it never produces `.js` output. Actual runtime execution relies on each package's tooling running TypeScript source directly (ts-node-equivalent ESM loaders, Vite for the client, Node's native TS stripping/Vitest's transform for tests, etc.) rather than a `tsc`-emitted build artifact — consistent with `noEmit` and the lack of an `outDir`.

**Key behavior — `include`**
```json
"include": [
  "packages/*/src/**/*.ts",
  "packages/*/src/**/*.json",
  "packages/*/tests/**/*.ts"
]
```
A glob covering every package's `src/` (both `.ts` source AND `.json` content files, the latter needed for `resolveJsonModule` to type-check `packages/data`'s direct JSON imports) plus every package's `tests/` directory. Notably this EXCLUDES: the repo root's own non-package files (this `tsconfig.json` doesn't typecheck itself, obviously, nor any root-level `.ts` scripts if present), any `dist`/`build` output directories (none are typically present given `noEmit`), and anything inside `node_modules` (implicitly, as is standard).

**Invariants & constraints**
- This is the ONLY tsconfig in the repo — there is no `packages/sim/tsconfig.json`, no `packages/client/tsconfig.json`, etc. Every package is typechecked under IDENTICAL strictness settings; a future agent should not expect to find or need package-specific compiler option overrides.
- `tsc --build` (the actual command run by `npm run typecheck`) is TypeScript's incremental/project-reference build mode — normally paired with a `"references": [...]` array pointing at sub-project tsconfigs, but THIS config has no `references` field and no sub-project tsconfigs exist, so `--build` here effectively behaves as a single-project incremental build (it still produces/uses a `.tsbuildinfo` cache file for faster subsequent runs, just without true multi-project orchestration).
- Because `pretest` runs `typecheck` automatically before `vitest run`, this config's `include` glob is what determines whether a given source file is EVEN TYPECHECKED at all before tests run — a new file outside these globs (e.g. a script placed directly in `packages/sim/` rather than under `src/`or `tests/`) would silently NOT be typechecked by `npm test`.
- CLAUDE.md's documented `npm run typecheck` (`tsc --build`, "must exit 0; npm test runs it automatically via pretest") is exactly this file's consumer/enforcement mechanism.

**Depends on** — Nothing (a leaf config file); implicitly assumes the `typescript` devDependency is installed at the workspace root (per the monorepo's single root `package.json`/`package-lock.json` pattern).

**Used by** — `npm run typecheck` (`tsc --build`, reads this file by default since it's named `tsconfig.json` at the root with no `-p`/`--project` flag override observed); transitively by `npm test` via its `pretest` hook; likely also picked up automatically by editor/IDE TypeScript tooling (e.g. VS Code's built-in TS server) for any file under the `include` globs, since there's no closer/more-specific tsconfig to shadow it.

**Notes** — The combination of `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `strict` is a notably rigorous strictness profile (stricter than TypeScript's default `strict: true` alone) — a future agent writing new code anywhere in this monorepo should expect array/object indexing to require explicit undefined-handling and should NOT assign `undefined` directly to optional fields (use the "omit the property" pattern instead, e.g. via object spread or conditional property inclusion) to satisfy this config.
