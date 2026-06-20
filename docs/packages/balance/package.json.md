# Path & purpose

`/Users/azat/Desktop/autobattler/packages/balance/package.json` — npm package manifest for the `@autobattler/balance` workspace, the headless batch-sweep tool that exercises `packages/sim` to produce balance reports.

# Responsibility

Declares the package identity, ESM module type, entry point, and intra-monorepo dependencies for the balance package. Per `CLAUDE.md`, this is the ONLY package in the repo permitted to do I/O (its CLI writes report files to disk).

# Exports

Not code — package metadata.
- `name: "@autobattler/balance"`, `version: "1.0.0"`, `type: "module"` (native ESM, no CommonJS).
- `main`/`exports["."]` both point at `./src/index.ts` — consumers import directly from TypeScript source (no build step published), resolved via the workspace's `tsx`/`vitest`/`vite` toolchain.
- `dependencies`: `@autobattler/sim` (the pure combat engine this package sweeps) and `@autobattler/data` (the JSON content + loader supplying unit/trait/item defs), both pinned as `"*"` (always resolves to the workspace-local version via npm workspaces, never a registry version).

# Key behavior

No runtime behavior — static manifest. Resolving `@autobattler/balance` (e.g. from a test or another package) resolves to `packages/balance/src/index.ts` directly per the `exports` map.

# Invariants & constraints

- `type: "module"` means every file in this package must use ESM `import`/`export` syntax (no `require`).
- Only depends on `sim` and `data` — does NOT depend on `rules`, `protocol`, `server`, or `client`, reflecting that balance sweeps operate purely at the combat-engine level using hand-built composition data (see `packages/balance/src/compositions.ts`), not full match state.
- No `bin` field — the CLI (`packages/balance/src/cli.ts`) is invoked via the root `npm run balance` script (`tsx packages/balance/src/cli.ts`), not as an installed binary.
- No own `scripts`/`devDependencies`/test runner config here — testing config is inherited from the root (`vitest.config.ts`) and `tsconfig.json` project references.

# Depends on

`@autobattler/sim`, `@autobattler/data` (workspace packages, resolved by npm workspaces from `package.json`'s root `workspaces` field).

# Used by

Resolved by the root `npm install`/workspaces mechanism; imported by `packages/balance/tests/balance.test.ts` and any other package wanting balance utilities (none currently, per `CLAUDE.md`'s dependency graph: `data <- sim <- rules <- {server, client}`, with `balance` as a sibling consumer of `sim`+`data` only).

# Notes

- Version `1.0.0` is notably higher than the data package's `0.1.0` (per `CLAUDE.md`, "data/ — JSON content + typed loader, version 0.1.0") — version numbers across packages are independent and not coordinated to a single monorepo version.
