# Path & purpose

`/Users/azat/Desktop/autobattler/packages/balance/src/cli.ts` — the balance package's command-line entry point, invoked via `npm run balance` (root `package.json` script: `tsx packages/balance/src/cli.ts`). The header comment explicitly marks it: "The ONLY I/O-permitted entry in the whole codebase outside the server."

# Responsibility

Owns reading CLI flags, running two full balance sweeps (itemless and itemized) over `gameData`, and writing the resulting markdown + JSON reports to disk. This is the only file in `packages/balance` (and one of the only files in the whole repo, alongside `packages/server`) that performs file I/O.

# Exports

This is a script, not a module with exports — running it (via `tsx` or `node`) executes top-level code with side effects (file writes + console output). No functions/types exported for import.

# Key behavior

1. `arg(flag, fallback)` — tiny inline CLI flag parser: scans `process.argv` for `flag` and returns the following argv element, or `fallback` if absent/missing a value.
2. Reads three flags: `--seeds` (default `300`, coerced via `parseInt` with a fallback to 300 if NaN/≤0), `--items` (default `6`, the number of completed items handed to each comp in the "itemized" sweep, floored at 0), `--out` (default `process.cwd()`, resolved to an absolute path via `node:path` `resolve`).
3. Runs `runSweep(gameData, seeds, { itemsPerComp: 0 })` -> `itemless` report, and `runSweep(gameData, seeds, { itemsPerComp: items })` -> `itemized` report (both from `./sweep.js`, the compiled-extension import convention used throughout this ESM package even though the source is `.ts`).
4. Computes `mdPath`/`jsonPath` as `<outDir>/balance-report.md` and `<outDir>/balance-report.json`.
5. Writes the markdown via `renderMarkdown(itemless, itemized)` (from `./report.js`) with a trailing newline, and writes the JSON via `JSON.stringify({ itemless, itemized }, null, 2)` with a trailing newline, both via `node:fs`'s `writeFileSync`.
6. Logs three lines to console: combat count summary (`itemless.totalCombats+itemized.totalCombats combats over N seeds/matchup`), and the two absolute paths written.

# Invariants & constraints

- This file's only job is orchestration + I/O — all the actual sweep computation (`runSweep`) and all the actual report formatting (`renderMarkdown`) are pure functions imported from sibling modules; this file must NOT grow business logic, it should stay a thin CLI shim.
- `seeds`/`items` parsing both guard against `NaN`/negative values via `Math.max(1, ...)` / `Math.max(0, ...)` plus `|| fallback` — a malformed flag value falls back safely rather than producing `NaN` seeds.
- Output is always two files (`.md` and `.json`) in the same directory, always overwritten (no append, no versioning) on each run.
- Per `CLAUDE.md`, this script (and the `server` package) are the ONLY parts of the codebase allowed to perform I/O; `sim`/`rules`/`balance`'s other files must stay pure.

# Depends on

`node:fs` (`writeFileSync`), `node:path` (`join`, `resolve`) — both Node built-ins, only usable because this file is explicitly the I/O-permitted entry point. `@autobattler/data` (`gameData`, the loaded/typed JSON content). `./sweep.js` (`runSweep` — the actual round-robin comp sweep logic, see `packages/balance/src/sweep.ts`). `./report.js` (`renderMarkdown` — pure markdown renderer, see `packages/balance/src/report.ts`).

# Used by

Invoked exclusively via the root `npm run balance` script (`package.json`: `"balance": "tsx packages/balance/src/cli.ts"`). Not imported by any other source file (it's a script, not a library module) — `packages/balance/src/index.ts` is the importable surface for other code, this file is the executable surface for humans/CI.

# Notes

- Flag default mismatch vs `CLAUDE.md`: `CLAUDE.md`'s balance section documents flags `--seeds N` and `--out DIR` only; this file additionally supports `--items N` (default 6) to control the itemized sweep's items-per-comp count — `CLAUDE.md` should be treated as slightly incomplete here, the code is the source of truth.
- Always runs BOTH an itemless (`itemsPerComp: 0`) and an itemized (`itemsPerComp: <--items, default 6>`) sweep every invocation, and both reports get combined into one markdown file (via `renderMarkdown`'s optional second argument) and one JSON file (`{ itemless, itemized }`) — there is no flag to run only one mode.
