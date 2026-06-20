# Path & purpose

`packages/client/tests/theme.test.ts` — repo-wide static-scan architectural test enforcing that NO hex color literal (`0x...`) appears anywhere in `packages/client/src/**/*.ts` except inside `theme.ts` itself.

# Responsibility

Owns the hard invariant (documented in CLAUDE.md) that `theme.ts` is the single source of color truth for the entire client. This test is the mechanical enforcement: any future code that hardcodes a hex color instead of importing from `theme.ts`'s `C` palette / CSS-var helpers fails the test suite immediately, by file/line.

# Exports

None — Vitest test file. Defines local (unexported) helpers `getAllTsFiles(dir)` (recursive `.ts` file walker using `fs.readdirSync`) used only within this file.

# Key behavior

- `SRC = join(import.meta.dirname, "../src")` — resolves `packages/client/src` regardless of cwd.
- `getAllTsFiles(dir)` recursively walks the directory tree, collecting every file whose name ends in `.ts` (note: NOT `.tsx` — this client has no JSX; also does not filter by `.test.ts`, but the scan root is `src/`, not `tests/`, so test files are never included).
- The single test "no 0x color literal appears in client src outside theme.ts":
  - Iterates every `.ts` file under `src/`, SKIPPING any file whose path ends in `theme.ts` (the one allowed location for hex literals).
  - Reads each file, splits into lines, and regex-tests each line against `/0x[0-9a-fA-F]+/` (matches any hex-literal-shaped token — not anchored to color-specific context, so it would also flag e.g. a hex literal used for a non-color magic number, bitmask, or zIndex if one existed).
  - Collects every match as a `"<relative-path>:<line-number>: <trimmed-line-text>"` string into a `violations` array.
  - Asserts `violations` is the empty array — if ANY non-theme file contains an `0x...` token, the test fails and prints exactly which file/line/text violated the rule (a direct, actionable failure message naming the offending site).

# Invariants & constraints

- This is a blunt textual regex scan, not an AST-aware check — it will flag `0x` inside a STRING or COMMENT too (a false positive), and will MISS a color expressed without the `0x` prefix (e.g. decimal RGB ints, CSS hex strings like `"#fff"`, or `parseInt("ff0000", 16)`) — those forms simply aren't covered by this particular guard. The CLAUDE.md invariant is phrased as "theme test forbids `0x` outside theme.ts" — this file is exactly that test, no more and no less.
- `theme.ts` itself is completely exempt — every hex literal the codebase needs must live there (the `C` palette, CSS var generation, trait/rank/rarity color maps, etc. — all documented in `packages/client/src/theme.ts`'s own doc).
- Scans `.ts` files only, recursively, under `src/` — `.json`/`.html`/`.css`-in-JS-template-string content is not separately AST-parsed, but any literal `0x...` substring inside a `.ts` file (including inside a template literal building a CSS string) is still caught by the line-regex.

# Depends on

- Node `fs` (`readFileSync`, `readdirSync`) and `path` (`join`, `relative`) — direct filesystem access, no project imports.
- `vitest` (`describe`, `it`, `expect`).
- Implicitly depends on the CURRENT STATE of every `.ts` file under `packages/client/src/` — this test has no fixed "subject" file; it is a moving architectural guard over the whole source tree.

# Used by

Not imported elsewhere — standalone Vitest test file, but functions as a project-wide CI gate referenced by the CLAUDE.md hard-invariant description ("theme.ts as the single source").

# Notes

- Mirrors the analogous static-scan style used by `glyphs.test.ts` (`TRAIT_GLYPH` completeness) and `_pve_render.test.ts` (structural source-text scans) — this codebase uses several "grep the source and assert" tests as architectural guards rather than only behavioral unit tests.
- Because the scan is line-based and string-based (not tokenized), a hex literal split across multiple lines or constructed via string concatenation (e.g. `"0x" + "ff0000"`) would NOT be caught — this is a deliberate-but-unstated limitation of a lightweight regex guard.
