# Path & purpose

`packages/client/index.html` -- the Vite entry HTML for the client app. Defines the page shell, viewport meta tags, the Pixi canvas mount point, a hidden safe-area-inset probe element, and the module script entry point.

# Responsibility

Owns the static HTML skeleton the client boots into: locks the viewport (no pinch-zoom, edge-to-edge via `viewport-fit=cover`), provides `#app` as the mount div for the Pixi canvas (and, per `CLAUDE.md`, also implicitly the area `#ui-root`/`#match-overlay` DOM layers get appended near/into), and exposes `#safe-probe` as the mechanism `main.ts` uses to read iOS/Android safe-area insets via computed CSS padding.

# Exports

Not code -- static HTML. Structure:
- `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />` -- disables user zoom/scale and requests edge-to-edge layout under notches/home-indicators (`viewport-fit=cover`).
- Inline `<style>`: global box-sizing reset, `body` background `#0d0d14` (near-black) with `overflow: hidden` and `100vw`/`100vh` sizing (no page scroll), `#app` sized to fill the viewport with `position: relative` (the positioning context for the Pixi canvas and any absolutely-positioned DOM overlays).
- `<div id="app"></div>` -- the mount point `main.ts` attaches the Pixi `Application`'s canvas (and DOM UI layers) into.
- `<div id="safe-probe" ...>` -- a zero-size, `pointer-events:none`, fixed-position div whose `padding` is set to the four `env(safe-area-inset-*)` CSS environment variables; `main.ts` reads this element's COMPUTED padding (via `getComputedStyle`) as the only cross-browser-reliable way to obtain safe-area-inset values in JS (CSS env() values aren't otherwise queryable from script).
- `<script type="module" src="/src/main.ts"></script>` -- the client's actual bootstrap entry point, loaded as a native ES module.

# Key behavior

Vite serves/transforms this file as the SPA's single HTML entry (per `vite.config.ts`); `main.ts` runs on load, creates the Pixi `Application`, resizes/positions the canvas inside `#app` based on `resolveLayout` (from `layout.ts`) using viewport dimensions and the safe-probe's computed insets, and mounts the DOM `ui/` layer (`#ui-root` for menus, `#match-overlay` for in-match pause/coachmarks, per `CLAUDE.md`) likely also under or alongside `#app`.

# Invariants & constraints

- `user-scalable=no` + `maximum-scale=1.0` are deliberate -- the game relies on a fixed, scale-to-fit canvas (`layout.ts`'s `resolveLayout`) and must not be pinch-zoomable, which would desync the Pixi canvas's CSS size from its logical design resolution.
- `#safe-probe` MUST remain a real element with non-removed padding for `main.ts`'s safe-area reading to work -- removing it or changing its `padding` rule would break the orientation-aware layout's safe-inset handling described in `CLAUDE.md` (`layout.ts`'s `resolveLayout({safe})` parameter).
- `overflow: hidden` on `body` prevents any native scroll, which would otherwise fight with the fixed full-viewport canvas.

# Depends on

`/src/main.ts` (the actual application entry, loaded as the module script). Implicitly relies on the browser supporting CSS `env(safe-area-inset-*)` (iOS Safari, modern Android Chrome) -- on browsers without support, the probe's padding resolves to `0px`, and `main.ts` would just treat insets as zero (graceful degradation, no error).

# Used by

Served by Vite (`packages/client/vite.config.ts`) as the dev-server root page and as the build entry HTML (`vite build` rewrites the `<script>` src to the bundled output). Loaded directly by any browser navigating to the client's URL (dev: typically `http://localhost:5173`).

# Notes

- No other markup beyond the two divs -- all real UI (menus, HUD, panels) is created/injected at runtime by `main.ts`/`ui/dom.ts`/Pixi, not authored here. This file should stay minimal; any new persistent DOM mount points (rare) would be the only reason to edit it.
