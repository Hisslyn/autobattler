# Path & purpose

`packages/client/src/ui/styles.ts` -- the single injected stylesheet for the entire DOM meta-screen layer (menus, profile, leaderboard, how-to-play, settings, the in-match pause modal, and coachmarks). Every color in this CSS resolves to a `var(--kebab-case-key)` custom property generated from `theme.ts`, so the DOM never drifts visually from the Pixi canvas.

# Responsibility

Owns: all CSS rules for the non-Pixi UI -- layout (`.ui-screen`, `.ui-card`, `.ui-row`), the full button component set (`.ui-btn`/`.ui-btn-wide`/`.ui-btn-back`/`.ui-btn-nav`/`.ui-btn-primary`/`.ui-btn-danger`) with hover/active/focus/disabled states, form controls (range sliders, text inputs, toggle pills), list/leaderboard rows, the placement-distribution bar chart, the diamond/tier/trait legend motifs, the How-to-Play page typography, the in-match pause modal (`.match-modal`), the coachmark overlay (`#coach-overlay`/`.coach-ring`/`.coach-card`), reduced-motion overrides, and a landscape-orientation responsive pass (wider/scrollable layout, compressed spacing, an extra-compression tier for very short landscape viewports).

# Exports

- `function injectStyles(): void` -- the ONLY export. Idempotent: calls `applyThemeVars()` (from `theme.ts`, writes every theme color as a `:root` CSS custom property) unconditionally every call, then checks `document.getElementById(STYLE_ID)` ("ab-ui-styles") -- if already present, returns immediately (does NOT re-inject or update the `<style>` tag's content); otherwise creates a `<style id="ab-ui-styles">` element, sets its `textContent` to the full `css()` string, and appends it to `document.head`.

# Key behavior

The private `css()` function (not exported) returns one giant template-literal string containing the ENTIRE stylesheet, built by interpolating `themeCssVars()` (the full `:root { --key: #hex; ... }` block) at the top and `cssVar(key)` calls throughout every rule needing a color. No hex literal appears anywhere in this file's CSS text -- every color reference is a `cssVar(...)` call resolving to a `var(--...)` reference at template-construction time (so the FINAL injected CSS text does contain literal `var(--bg-page)`-style strings, but never a raw `#rrggbb`).

**Notable structural pieces**:
- `#ui-root`/`#match-overlay` are positioned `absolute; inset:0` siblings layered over the Pixi canvas; `#ui-root` has `z-index:10`, `#match-overlay` has `z-index:20` (always above the menu layer, matching the pause modal needing to show even when menus are hidden) and `pointer-events:none` by DEFAULT (only the modal/coachmark children inside it, via their OWN `pointer-events:auto`, actually intercept clicks -- letting the Pixi canvas underneath receive pointer events when no modal is open).
- `#ui-root`'s padding uses `env(safe-area-inset-*)` directly (not JS-computed) to clear notches/home-indicators on the MENU screens specifically (separate from the match scene's own safe-area handling via `main.ts`'s `#safe-probe`).
- Button press feedback (`:active` states: `filter: brightness(0.88); transform: scale(0.98)`) is explicitly commented as mirroring "the Pixi alpha-dip + scale-pop model" used by `scenes/match.ts`'s `pressFeedback` helper -- a deliberate cross-layer consistency choice so DOM buttons and Pixi buttons feel the same to press.
- `.ui-rank-badge`/`.ui-diamond`/`.ui-trait-chip` use an inline CSS custom property `--rank`/`--dia` (set via `element.style.setProperty(...)` in `ui/app.ts`, NOT in this stylesheet) as a per-instance color override, falling back to `cssVar("textMuted")`/`cssVar("chipBorder")` when unset -- this is the mechanism that lets one shared CSS class render a different color per rank/trait without generating one CSS class per rank/trait combination.
- Reduced motion has TWO layers: `.reduced-motion *` (an explicit DOM class toggled by `main.ts`'s settings subscription, killing ALL transitions/animations everywhere) and a `@media (prefers-reduced-motion: reduce)` block (honors the OS-level preference even if the in-app setting/class isn't applied, but only for button transitions specifically -- a narrower scope than the full class-based override).
- The landscape responsive pass is explicitly marked ADDITIVE ("portrait unaffected") -- a `@media (orientation: landscape)` block widens/scrolls screens and compresses vertical spacing, with a SECOND, more aggressive `@media (orientation: landscape) and (max-height: 420px)` block for very short landscape viewports (further compressing padding/font sizes and shrinking the placement-distribution chart's height).

# Invariants & constraints

- **No hex color literal may appear in this file** -- consistent with `theme.ts`'s file-wide invariant ("theme test forbids `0x` outside theme.ts"); every color in `css()` must be a `cssVar(...)`/`rankCssVar(...)`-style call. A reviewer adding a new rule with a raw `#hex` or `rgb(...)` (excluding alpha-only utility values like `rgba(0,0,0,0.55)` for scrims/shadows, which aren't theme colors) would be violating this pattern.
- `injectStyles` is idempotent specifically so it's safe to call from multiple entry points without producing duplicate `<style>` tags or doing wasted work -- `UiApp.mount()` calls it once, and that's the only current call site, but the idempotency guard protects against a future second call (e.g. if a test or hot-reload path calls `mount` twice).
- `injectStyles` ALWAYS re-applies `applyThemeVars()` even when the `<style>` tag injection is skipped (the `if (...) return` happens AFTER the `applyThemeVars()` call, not before) -- this means re-calling `injectStyles()` is a cheap way to refresh the `:root` custom properties (e.g. if theme values were ever dynamically swapped at runtime) without re-injecting the stylesheet text itself, though no current code path exercises that.
- The font family throughout is `ui-monospace, Menlo, Consolas, monospace` (set once on `#ui-root, #match-overlay` and inherited) -- this is a DELIBERATE monospace aesthetic choice for the meta-screen layer, distinct from the canvas's `CHIP_TEXT_FONT` (`system-ui, -apple-system, sans-serif`, used for in-game trait chips per `theme.ts`'s legibility-pass notes) -- the two layers intentionally use different type families for different reasons (DOM monospace for a terminal/HUD feel in menus; canvas sans-serif for small-chip legibility at low resolution).
- `.match-modal`/`#coach-overlay` both set `z-index: 22`/`23` respectively, ABOVE `#match-overlay`'s own `20` -- since both are appended INSIDE `#match-overlay` as children, this stacking is really about how they sit relative to siblings within that container (e.g. multiple modals open at once), not about escaping `#match-overlay`'s own z-index relative to `#ui-root`.

# Depends on

`../theme.js` (`applyThemeVars`, `cssVar`, `themeCssVars`) -- the entire color story of this file flows through these three functions; this is the canonical "DOM consumer of theme.ts" file.

# Used by

`packages/client/src/ui/app.ts` -- `UiApp.mount()` calls `injectStyles()` once, before the first render.

# Notes

- This file is the natural place to look when investigating ANY visual/layout question about a non-Pixi screen (menus, profile, leaderboard, settings, pause modal, coachmarks) -- the class names referenced throughout `ui/app.ts`/`ui/coachmarks.ts` are all defined exhaustively here, with no other stylesheet or inline `<style>` tag in the client.
- The two-tier landscape compression (`@media (orientation: landscape)` then a narrower `and (max-height: 420px)` refinement) mirrors the same "supported floor" mentality as `layout.ts`'s portrait-mode floor handling (360×640) -- both layers of the client independently guard against very small/short viewports, just via different mechanisms (CSS media queries here vs. a JS region-budget algorithm in `layout.ts`).
- `.ui-list-row.me` (highlighting the current player's leaderboard row) and `.ui-dist-col.top` (highlighting top-4 placement bars) are both purely additive class-based overrides layered onto a base rule -- consistent styling pattern throughout this file (base rule + state-modifier classes) rather than deeply nested selectors.
