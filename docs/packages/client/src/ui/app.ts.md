# Path & purpose

`packages/client/src/ui/app.ts` -- the DOM/CSS meta-screen shell layered over the Pixi canvas: `UiApp`, a small hand-rolled screen-manager/router (Main Menu, Play, Profile, Leaderboard, How to Play, Settings) plus the in-match pause panel and the coachmark trigger. Holds no authoritative game state -- gameplay itself runs entirely in the Pixi `MatchScene` driven by an `IDriver`.

# Responsibility

Owns: every non-gameplay screen the player sees (menus, profile, leaderboard, settings, how-to-play), navigation between them (a simple back-stack), the themed widgets these screens are built from (rank badges, trait/tier diamonds, sliders, toggles), HTTP-backed async data loading for Profile/Leaderboard (via `auth.ts`'s fetch wrappers), the in-match pause modal (volume/speed quick-controls + Leave Match), and triggering the first-match coachmark tour. Does NOT own match rendering, combat, or any game logic -- `enterMatch`/`showMenu` just show/hide the DOM layer around the canvas.

# Exports

- `type PlayMode = "local" | "online"` -- the two match-start modes, passed through to `opts.onStartMatch`.
- `interface UiAppOptions { httpBase, settings, audio, auth, canvas, onStartMatch }` -- constructor dependencies: `httpBase` (server HTTP root for fetch calls), `settings` (`SettingsStore`), `audio` (`AudioManager`), `auth` (`AuthState | null` -- null means no reachable server / offline, gating Online/Profile/Leaderboard), `canvas` (the Pixi canvas element, needed by `Coachmarks` for ring placement), `onStartMatch(mode)` (callback into `main.ts` to actually construct the driver+scene and start a match).
- `class UiApp` -- the shell.
  - `auth: AuthState | null` -- public, mutable; updated in-place whenever a screen successfully fetches a fresher profile (Profile screen, name-save).
  - `constructor(opts: UiAppOptions)` -- builds `menuRoot` (`#ui-root`, holds the menu screens) and `matchOverlay` (`#match-overlay`, holds the in-match pause button/modal, hidden by default); wires ONE delegated click listener on `menuRoot` that resumes audio (`audio.resume()`, satisfying the browser's autoplay-gesture requirement) and plays the `"tap"` SFX whenever any `<BUTTON>` is clicked.
  - `mount(parent: HTMLElement): void` -- injects the shared stylesheet (`injectStyles()`), appends both root elements to `parent`, renders the initial screen (`"main"`), sets the music state to `"menu"`.
  - `enterMatch(onLeave: () => void): void` -- hides `menuRoot`, shows (and clears) `matchOverlay`, stores `onLeave` for the pause panel's "Leave Match" button, sets music state to `"planning"`. The comment clarifies the actual ☰ pause BUTTON lives in the Pixi HUD layer (so it scales with the viewport) -- this shell only owns the resulting MODAL.
  - `showMenu(): void` -- the inverse: clears `leaveHandler`, hides/clears `matchOverlay`, shows `menuRoot`, resets the nav stack to `["main"]`, re-renders, sets music to `"menu"`.
  - `openPausePanel(): void` -- called from the Pixi HUD's ☰ button; builds and shows a themed `.match-modal` overlay (master-volume slider, default-speed cycle button, Resume, Leave Match) appended into `matchOverlay`; dismissible by tapping the modal backdrop (the click listener checks `e.target === modal`, i.e. the backdrop itself, not its children) or "Resume"; "Leave Match" calls `close()` then `this.leaveHandler?.()`.
  - `maybeShowCoachmarks(getDesignH?: () => number): void` -- checks `shouldShowCoachmarks(localStorage)`; if true, immediately calls `markCoachmarksSeen` (marks as seen BEFORE the tour runs/completes -- see Notes) and starts a `new Coachmarks(matchOverlay, canvas, COACHMARK_STEPS, () => {}, getDesignH)`.

# Key behavior

**Navigation** is a tiny back-stack (`stack: ScreenId[]`, starts as `["main"]`): `navigate(id)` pushes and re-renders; `back()` pops (no-ops if already at the root) and re-renders; `render()` clears `content` and appends the fresh DOM for the current top-of-stack screen via the `screen(id)` switch. Every non-main screen is wrapped via `wrap(children, withBack=true)` which prepends a "‹ Back" button.

**Profile screen** (`profileScreen`): shows "Connect to a server..." immediately if `auth` is null; otherwise shows a "Loading…" placeholder card, then asynchronously `Promise.all([fetchProfile, fetchHistory(...,20)])`s, and on success refreshes `this.auth` with the new profile, renders the name + rank badge + big MMR number, a placement-distribution bar chart (`placementDistribution`), and a recent-matches list (`historyList`). On fetch failure, shows "Failed to load profile (server offline?)".

**`placementDistribution(history)`**: builds an 8-bucket histogram of `h.placement` values (1..8) from the match history, normalizes each bar's height to the bucket with the highest count (`max = Math.max(1, ...counts)` -- the `1` floor avoids a divide-by-zero/empty-history all-bars-100% artifact), and gives buckets `i<4` (placements 1-4) a `.top` CSS class for distinct styling.

**`historyList(history)`**: one row per match showing placement (`#N`, colored good/bad by top-4-or-not), formatted date, and a signed MMR delta (`mmrAfter - mmrBefore`, or blank if either is `null`).

**Leaderboard screen**: fetches the top-50 rows (`fetchLeaderboard(httpBase, 50)`), renders one row per player (position, name, rank badge, MMR), highlighting the row matching `this.auth?.accountId === p.accountId` with a `.me` class.

**How-to-Play screen** (`howToScreen`): a local `page` counter over `HELP_PAGES` (from `content.ts`); `renderPage()` rebuilds the body (title + paragraphs) and an optional `howToMotif(title)` -- a per-page visual aid: the "Combat & Traits" page shows 5 sample trait diamond-chips (holy/frost/dragon/knight/ranger) tinted via `traitColorCss`; the "Leveling & Shop Odds" page shows 5 tier diamond-chips (tier1..5) tinted via `cssVar`. Prev/Next buttons disable at the respective ends.

**Settings screen**: three cards -- `volumeCard` (master/sfx/music sliders via a shared `slider(label,key)` closure that updates `SettingsStore` live on `input`, plus Music-enabled and Mute toggles via `toggleRow`), `prefsCard` (a default-speed cycle button toggling between `1x`/`2x` -- NOTE this only toggles between 1 and 2, never reaching the `0.25`/`0.5` values `PlaybackSpeedPref` also allows; see Notes), and `nameCard` (the player-name editor).

**`nameCard()`**: disabled/informational if `auth` is null ("Sign in (online) to change your name"); otherwise a maxlength-16 text input + Save button. Save disables itself, calls `patchName(httpBase, token, trimmedValue)`, on success updates `this.auth` with the fresh profile and shows a green "Saved" toast, on failure shows a red toast (special-cased message for the `INVALID_NAME` error: `"Name must be 2–16 letters, digits, space, _ or -"`, generic "Failed to save" otherwise), and re-enables the button in `.finally()` regardless of outcome.

# Invariants & constraints

- **No authoritative game state lives here** -- `UiApp` only stores `auth` (a cache of the player's own profile, refreshed opportunistically) and `leaveHandler` (a callback reference); it never reads or writes `MatchState`/driver internals directly. All gameplay flows through `onStartMatch` → `main.ts` → the driver/scene.
- **Online/Profile/Leaderboard require `auth !== null`** -- `auth` is set once at boot from `bootAuth` (in `main.ts`) and is NOT re-checked/re-attempted by this file if the server becomes reachable later in the session; a player who started offline would need to reload the page to regain Online access (no retry-auth button exists in this file).
- The pause panel's volume slider and speed button are DUPLICATED (near-identical code) between `prefsCard`/`volumeCard` (Settings screen) and `openPausePanel` (in-match pause modal) -- there's no shared helper between them beyond `toggleRow`; a future change to slider/speed-button behavior must be applied in both places if both should change.
- `prefsCard`'s and `openPausePanel`'s default-speed button toggles ONLY between `1` and `2` (`s.get().defaultSpeed === 1 ? 2 : 1`) -- it can NEVER set or cycle through `0.25` or `0.5` (the other two values `PlaybackSpeedPref` allows per `settings.ts`, where `0.25` is actually the documented DEFAULT). A player whose stored `defaultSpeed` starts at `0.25` (the default) and clicks this button once would jump straight to `2x`, skipping `0.5x` and any path back to `0.25x` entirely via this UI. This looks like a stale control left over from before the `0.25`/`0.5` options were added to `PlaybackSpeedPref` -- worth flagging as a likely UI bug/incompleteness, not a deliberate design choice (the comment in `settings.ts` calls `0.25` "the new experienced default", implying this UI predates that addition).
- `maybeShowCoachmarks` marks the tour as SEEN (`markCoachmarksSeen`) BEFORE the tour actually starts/completes -- per CLAUDE.md's documented footgun, a force-quit mid-tour permanently loses the coachmarks for that device (no replay mechanism exposed in this file).
- The single delegated `click` listener on `menuRoot` plays the `"tap"` SFX for ANY element with `tagName === "BUTTON"`, regardless of which screen/action it triggers -- a future button added to any screen automatically gets tap feedback with zero additional wiring, but this also means there is no way to suppress the tap sound for a specific button without changing its tag.
- `howToMotif` matches on the page's literal TITLE STRING (`"Combat & Traits"`, `"Leveling & Shop Odds"`) rather than a stable page id/index -- if `content.ts`'s `HELP_PAGES` titles are ever edited, these motif hooks will silently stop matching and the page will render with no motif (no error, just a quietly missing visual).

# Depends on

- `@autobattler/data` (`mmrToRank`, `RankBand` type) -- maps a profile's MMR to its rank band for badges.
- `../theme.js` (`cssVar`, `rankCssVar`, `traitColorCss`) -- all DOM coloring goes through these (never raw hex), per the theme-as-CSS-vars invariant.
- `../settings.js` (`SettingsStore`, `Settings` types) -- the Settings screen and pause panel read/write live preferences.
- `../audio/manager.js` (`AudioManager` type) -- `resume()`/`play("tap")`/`setMusicState(...)` calls throughout.
- `../auth.js` (`AuthState`, `MatchHistoryEntry` types; `fetchLeaderboard`, `fetchProfile`, `fetchHistory`, `patchName` functions) -- all server-backed data fetching/mutation.
- `../onboarding.js` (`shouldShowCoachmarks`, `markCoachmarksSeen`, `COACHMARK_STEPS`) -- the first-match tour gate + step data.
- `./coachmarks.js` (`Coachmarks` class) -- the actual tour overlay implementation.
- `./content.js` (`HELP_PAGES`) -- the How-to-Play page content.
- `./styles.js` (`injectStyles`) -- the shared stylesheet (CSS-var-driven, themed components).
- `./dom.js` (`el`, `button`, `clear`) -- small DOM-construction helpers.

# Used by

`packages/client/src/main.ts` -- constructs the single `UiApp` instance with `onStartMatch: startMatch`, calls `ui.mount(wrapper)`; `startMatch`/`leaveMatch` call `ui.enterMatch(...)`/`ui.showMenu()`; passed as the `onPause` target for `MatchScene` (the Pixi ☰ button calls `ui.openPausePanel()`); calls `ui.maybeShowCoachmarks(...)` only for local (Practice) mode matches.

# Notes

- This file is a deliberately framework-free, hand-rolled DOM screen manager -- no virtual DOM, no diffing; every `navigate`/`back`/data-load triggers a full `clear(content) + rebuild` of the current screen's subtree. This is simple and adequate for the small number of screens here but means any screen with significant internal state (like `howToScreen`'s `page` counter) has to keep that state in a closure variable captured by `renderPage`, recreated fresh each time the screen is navigated to.
- `auth` being a plain mutable public field (not behind a getter/setter or change-notification mechanism) means any code holding a reference to `this.auth` before a refresh (e.g. captured in a closure) could observe a stale object after `this.auth = {...}` reassigns it elsewhere -- in practice this isn't currently a problem since screens re-read `this.auth` fresh on each navigation/render, but it's worth knowing if a bug ever surfaces around "profile shows stale name after editing."
- The default-speed-button-skips-0.25/0.5 issue (see Invariants) is the most concrete, actionable finding in this file from a correctness-review perspective -- a UI fix here (e.g. cycling through all 4 `PlaybackSpeedPref` values) would directly close the gap between what `settings.ts` allows and what the UI can actually reach.
