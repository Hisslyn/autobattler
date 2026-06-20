# Path & purpose

`packages/client/src/main.ts` -- the client's bootstrap entry point: initializes Pixi, resolves the responsive layout, boots guest auth, mounts the DOM meta-screen UI (`UiApp`), and wires the Main Menu's "start match" action to construct a `LocalDriver` or `NetDriver` + `MatchScene`.

# Responsibility

Owns the top-level wiring that nothing else in the client owns: creating the single `PIXI.Application`, resizing it (and the `MatchScene`) on viewport/orientation changes, reading device safe-area insets, constructing `SettingsStore`/`AudioManager` once, running the boot-time auth flow, and the start-match / leave-match lifecycle that swaps between menu and in-match state. This file has no game logic of its own -- it only assembles other modules.

# Exports

No exports -- this is a script entry point (`main().catch(console.error)` runs immediately on module load; nothing here is imported by other client modules).

# Key behavior

**`readSafeInsets()`**: reads `env(safe-area-inset-*)` by querying the computed `padding*` of a hidden `#safe-probe` DOM element (defined in `index.html`), parsing each as a float (falls back to 0 for `NaN`/missing). Returns a `SafeInsets` object consumed by `resolveLayout`.

**Boot sequence in `main()`**:
1. Resolves the initial `MatchLayout` via `resolveLayout({viewportW: window.innerWidth, viewportH: window.innerHeight, safe: readSafeInsets()})` (from `layout.ts`) -- this is the SINGLE source for the Pixi canvas's design dimensions.
2. Creates and `await`s `PIXI.Application.init({width: designW, height: designH, backgroundColor: C.bgPage, antialias: true, resolution: devicePixelRatio||1, autoDensity: true})`, sets `app.stage.sortableChildren = true` (so z-index ordering works across the app), and appends `app.canvas` into the `#app` DOM element.
3. A FUTURE Capacitor native-shell hook is left as a comment (`ScreenOrientation.lock({type:"landscape-primary"})` gated on `Capacitor.isNativePlatform()`) but explicitly NOT implemented -- web stays orientation-responsive.
4. Defines `resize()`: re-resolves `activeLayout`, calls `app.renderer.resize(designW, designH)` (Pixi v8 dynamic resize), then CSS-sizes/positions the canvas element (`width`/`height`/`left`/`top` in absolute-positioned CSS pixels derived from `scale`/`canvasOffsetX`/`canvasOffsetY`), and if a `scene` exists, calls `scene.onLayoutChange(activeLayout)` so the in-match UI re-renders against the new regions.
5. Registers `resize` on `window`'s `resize` event, AND on `orientationchange` via `setTimeout(resize, 100)` -- the 100ms delay exists because iOS reports stale viewport dimensions at the exact moment the `orientationchange` event fires.
6. Constructs `SettingsStore` and `AudioManager(settings)` (audio is procedural SFX + drop-in music slot, see `audio/manager.ts`). Defines `applyReducedMotion(on)` which toggles the `reduced-motion` class on `document.documentElement` (read by CSS) -- applied once immediately from current settings, then re-applied on every settings change via `settings.subscribe`.
7. Calls `await bootAuth(HTTP_BASE)` -- guest auth that's tolerant of an offline server (returns null auth in that case); this happens BEFORE the menu is shown, gating the whole boot flow (`auth.ts`).
8. Calls `resize()` once explicitly (now that `scene`/`driver` mutable bindings are in scope, since `resize`'s closure reads them for `onLayoutChange`).
9. Constructs `UiApp` with `{httpBase, settings, audio, auth, canvas: app.canvas, onStartMatch: startMatch}` -- `UiApp` owns the DOM meta-screen layer (Main Menu, Profile, Leaderboard, etc.) and calls back into `startMatch(mode)` when the player picks Practice or Online.
10. Defines `leaveMatch()`: destroys the current `scene`, disposes the current `driver`, nulls both, and calls `ui.showMenu()` -- the single exit path back to the menu from an in-match state.
11. Defines `startMatch(mode: PlayMode)`: calls `audio.resume()` (unlocks the Web Audio context on this first user-gesture-triggered call), constructs either a `NetDriver(SERVER_URL, ui.auth?.token)` (mode `"online"`) or a `LocalDriver(undefined, ui.auth?.profile.name)` (otherwise, i.e. `"local"`/Practice -- note the literal check is `mode === "online"`, so any other `PlayMode` value falls into the local branch), then constructs `new MatchScene(app, driver, {settings, audio, onLeave: leaveMatch, layout: activeLayout, onPause: () => ui.openPausePanel()})`, appends `scene.container` to `app.stage`, calls `ui.enterMatch(leaveMatch)` (switches the DOM layer into the in-match pause-button mode), and if `mode === "local"` calls `ui.maybeShowCoachmarks(() => activeLayout.portraitDesignH ?? activeLayout.designH)` -- passing a GETTER (not a snapshot value) so coachmark ring placement always reads the LIVE current design height, not a stale one captured at match start.
12. Finally calls `ui.mount(wrapper)` to attach the DOM UI layer.

# Invariants & constraints

- `SERVER_URL`/`HTTP_BASE` are hardcoded to `localhost:3001` -- there is no environment-variable or build-time override visible in this file; a deployed build would need this changed (no abstraction layer for it currently).
- `resize()`'s closure captures `scene` by reference from an outer `let` binding declared AFTER the function is defined but BEFORE it's first called (`let scene: MatchScene | null = null;` appears after `resize` is declared in source order, but JS function declarations/closures over `let` resolve at call time, not declaration time, so this works correctly -- still, a reader skimming top-to-bottom might wrongly assume `resize` can't see `scene` yet).
- Audio `resume()` must be called from a user-gesture-triggered callback (browser autoplay policy) -- it's deliberately placed inside `startMatch`, which only fires from a UI button tap, never automatically.
- The 100ms `orientationchange` delay is an iOS-specific workaround; removing it would cause the immediate post-rotation layout resolve to use stale (pre-rotation) `window.innerWidth/innerHeight` values on iOS Safari specifically.
- Coachmarks are only offered on `mode === "local"` (Practice) starts, never online -- this is the only mode-conditional behavior difference in `startMatch` besides driver selection.
- `app.stage.sortableChildren = true` is set ONCE globally on the root stage; any Pixi layer relying on zIndex ordering (combat overlay, modals, etc., per `combatLayout.ts`) depends on this being set here.

# Depends on

- `pixi.js` -- `PIXI.Application` (v8 API: `app.init(...)`, `app.renderer.resize`, `app.canvas`).
- `./driver.ts` (`LocalDriver`, `IDriver` type) -- the Practice-mode match driver.
- `./netDriver.ts` (`NetDriver`) -- the Online-mode match driver.
- `./scenes/match.ts` (`MatchScene`) -- the single in-match Pixi scene, constructed fresh per match.
- `./auth.ts` (`bootAuth`) -- guest auth bootstrap (deviceId+token, offline-tolerant).
- `./settings.ts` (`SettingsStore`) -- persisted client prefs (volumes, reduced motion, etc.).
- `./audio/manager.ts` (`AudioManager`) -- the Web Audio engine instance shared across menu and match.
- `./ui/app.ts` (`UiApp`, `PlayMode` type) -- the DOM meta-screen layer / screen manager.
- `./theme.ts` (`C`) -- only `C.bgPage` is read here (Pixi app background color).
- `./layout.ts` (`resolveLayout`, `MatchLayout`, `SafeInsets` types) -- the layout resolver this file drives on every resize.
- DOM: `#app` (canvas mount point) and `#safe-probe` (safe-area-inset probe element), both defined in `index.html`.

# Used by

Nothing in the client imports `main.ts` -- it is the Vite entry script referenced directly by `index.html`'s `<script type="module" src="...main.ts">` tag (per CLAUDE.md / the `index.html` doc).

# Notes

- The Capacitor native-shell orientation-lock hook is explicitly marked as NOT implemented (a TODO-by-comment) -- any future native wrapper work should start here.
- `mode === "local"` is used both as the driver-selection branch's else-case AND as the explicit coachmark gate; if a third `PlayMode` value were ever introduced (currently only `"online"`/`"local"` are implied by the binary check), it would silently fall into the LocalDriver branch since the check is `mode === "online" ? NetDriver : LocalDriver` rather than an exhaustive switch -- worth flagging if `PlayMode` is ever widened.
- `leaveMatch` is the only path that calls `driver.dispose()` -- for `NetDriver` this is documented elsewhere (CLAUDE.md) to disconnect and forfeit via the server's AFK path, since there's no explicit SURRENDER message.
