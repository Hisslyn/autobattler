# autobattler

8-player PvP auto-battler. Server-authoritative with a shared deterministic simulation core used by both server and clients.

## Hard invariants

- `packages/sim` is pure: no I/O, no `Math.random`, no `Date`, no floats
- All arithmetic uses integer fixed-point math (scale 1000 = 1.0)
- All randomness goes through the seeded mulberry32 PRNG in `prng.ts`
- All tuning numbers (unit stats, trait effects, item stats, economy) live in `packages/data`; content lives entirely in data (no content logic in code)
- `packages/balance` is the ONLY package permitted I/O (its CLI writes the report files); `sim`/`rules` stay pure
- Every change must keep determinism tests green (`npm test`)
- Pool conservation: total unit copies across pool + all player benches/boards is constant
- Command legality is enforced server-side in `packages/rules`; invalid commands return typed errors, never throw
- Server result is canon; client sim is presentation only (reconcile with COMBAT_RESULT, log mismatches)
- Combat playback = pure reducer over the event log; the Pixi layer renders reducer output only (never MatchState, never re-runs game logic)
- Bots never persist (no accounts/profiles, accountId null in match_players); all persistence writes go through the `Repository` interface

## Workspace layout

```
packages/
  data/     — JSON content + typed loader, version 0.1.0
  sim/      — pure deterministic combat engine
  rules/    — pure match state machine (no I/O)
  protocol/ — shared WS message types, envelope, encode/decode, validators (zero runtime deps)
  server/   — Node + ws authoritative server (matchmaker, rooms, sessions)
  client/   — Vite + TypeScript + PixiJS v8 web client
  balance/  — headless batch sweeps over the pure sim; CLI writes the report (only I/O-permitted package)
```

## Commands

```bash
npm install          # install all workspace deps (Node >= 20)
npm test             # typecheck (via pretest) + all tests via vitest
npm run typecheck    # tsc --build (must exit 0; npm test runs it automatically via pretest)
npm run dev          # start Vite dev server for the client
npm run server       # start the authoritative WS server (default port 3001)
npm run balance      # run the comp sweep, write balance-report.md + balance-report.json (flags: --seeds N, --out DIR)
docker compose up -d # local postgres:16 (then export DATABASE_URL, see below)
```

Env vars (server): `PORT` (default 3001), `DATABASE_URL` (postgres; unset → in-memory repo), `AUTH_SECRET` (HMAC secret for auth tokens; dev default if unset). With docker compose: `DATABASE_URL=postgres://autobattler:autobattler@localhost:5432/autobattler`. The postgres repo contract tests run only when `DATABASE_URL` is set (skipped + logged otherwise).

## packages/sim internals

- `prng.ts` — mulberry32 seeded PRNG; all sim randomness must use this
- `fixed.ts` — integer fixed-point helpers; scale 1000
- `hex.ts` — axial hex grid 7×8, neighbors, distance, A*
- `types.ts` — UnitDef, TraitDef, ItemDef, UnitInstance (has tier+star), BoardState, CombatEvent, CombatResult
- `engine.ts` — `simulateCombat(boardA, boardB, seed, data) → CombatResult`
  - Applies star multipliers (1.8x at 2-star, 3.24x at 3-star) at combat start
  - Applies trait breakpoint bonuses per team at combat start
  - Applies item stat bundles per unit at combat start
  - Fixed timestep 20 ticks/s, max 1200 ticks then overtime (ramping true damage)
  - Per-tick order: status effects (burn DoT + buff/shield expiry) → mana/cast → movement → attacks → death cleanup
  - Targeting: nearest enemy, tiebreak lowest uid; start-of-combat-stealth units are untargetable until their stealth tick elapses
  - Abilities at full mana (`UnitInstance.ability.effect`): `magic_damage` (single-target), `burn` (magic dmg + DoT), `shield` (self absorb), `buff` (self stat buff, reverted on expiry); `stealth` resolves at combat start, not on cast. Item passives reuse the same primitives: on-hit `burn`, start-of-combat `shield`. Damage routes through any shield before HP.
  - Emits ordered CombatEvent log that fully describes combat without re-running game logic: init (per-unit snapshot post star/item/trait), move (from/to), attack (dmg, crit), cast, mana/hp (absolute values, emitted only on change, hp clamped at 0), death, overtime_start, end (winnerSide, survivingUids)
  - survivingUnits in CombatResult carries tier+star for damage calculation

## packages/data content (v1)

- 50 units across tiers 1-5 (13/13/12/8/4). Each has one `origin` + 1-2 `classes` (flattened into `traits`), role-derived stats, and an `ability {name, manaCost=mana, effect}` from the engine-supported set
- 22 traits: 12 origins + 10 classes, each tagged `kind`; breakpoints at 2/4/6 (or 2/4, or 2) derived so every top breakpoint is reachable by unit count; `knight` keeps its armor curve (+200/+500/+800)
- 45 items: 9 stat-only components (incl. iron_sword/chain_vest/mana_crystal) + 36 completed items, one per distinct unordered component pair (`recipe: [a,b]`); a completed item is a stat bundle + at most one passive (`burn` on-hit or `shield` start-of-combat). Rules equip any item id directly; recipe combination is data-only (see design-notes.md)
- economy.json: pool counts by tier, shop odds by level (tiers 4-5 nonzero from mid levels), xp thresholds, streak table, income constants, damage constants, MMR constants (mmrStart 1000, mmrK 40, mmrEloDivisor 400)
- `ranks.json`: ordered rank bands (Bronze/Silver/Gold/Platinum/Diamond/Master) by ascending `minMmr`; loader exports `RANK_BANDS` + pure `mmrToRank(mmr)` (highest band whose minMmr ≤ mmr, boundaries inclusive on min)
- `design-notes.md`: intent + `// future:` notes for deferred behaviors the engine can't yet execute (kept out of JSON)
- loader exports `DATA_VERSION` (recorded on every persisted match)

## packages/balance internals

- Headless, seeded, pure except the CLI entry (the only I/O-permitted code in the repo)
- `runner.ts` — `runMatchup(boardA, boardB, seeds, data)`: N seeded combats → win rate, avg length, overtime rate, avg survivors
- `compositions.ts` — representative comp archetypes as data (defId+star), `buildBoard` places them deterministically, `activeTraits` lists hit breakpoints
- `sweep.ts` — `runSweep(data, seeds, comps?)`: round-robin every comp vs every other (both orientations) → per-comp win matrix + overall win rate, appearance-weighted per-unit win rate, per-trait win rate, avg game length, overtime rate
- `report.ts` — pure markdown renderer; `cli.ts` (`npm run balance`) runs the sweep and writes `balance-report.md` + `balance-report.json`

## packages/rules internals

- `state.ts` — MatchState, PlayerState, ShopSlot, Phase
- `pool.ts` — pool counts by tier (29/22/18/12/10), draw/return without replacement
- `shop.ts` — roll 5 slots using shopOdds table; reroll returns current shop to pool
- `economy.ts` — calcIncome (base 5 + interest + streak), levelForXp
- `commands.ts` — applyCommand: BUY, SELL, REROLL, BUY_XP, MOVE, EQUIP; validates legality, returns CommandResult (never throws); auto-merge 3 copies → 2-star, cascade 3x 2-star → 3-star
- `rounds.ts` — buildPairings (avoids repeat opponents, ghost on odd count), runCombatPhase, distributeIncome
- `match.ts` — createMatch(seed, data), advancePhase, runMatchToEnd
- `ai.ts` — applyAiCommands(state, playerId, prng, data): seeded bot policy for planning phase

## packages/protocol internals

- Zero runtime deps; pure TypeScript types + helpers
- `messages.ts` — C2SMessage union (QUEUE_JOIN (carries `authToken`), QUEUE_LEAVE, CMD, READY, PING, RECONNECT) and S2CMessage union (QUEUE_STATUS, MATCH_FOUND, STATE_SNAPSHOT, STATE_DELTA, PHASE_CHANGE, COMBAT_START, COMBAT_RESULT, MATCH_END (placements + per-seat `mmr` before/after), ERROR, PONG)
- `envelope.ts` — `{ v, t, p }` envelope; `encode(S2CMessage) → string`; `decodeC2S(raw) → C2SMessage | null` with full runtime validation; `decodeS2C` for client side

## packages/server internals

- Single-process Node server on `PORT` (default 3001): HTTP API + ws on the same port
- `session.ts` — connection registry, seat tokens, per-connection rate limit (20 CMD/s), AFK tracking, accountId set on authed QUEUE_JOIN
- `matchmaker.ts` — FIFO queue; 8 players OR 10s timeout with ≥1 human; backfills remaining seats with AI bots
- `room.ts` — owns MatchState; authoritative 30s planning timer; applies validated commands via applyCommand; broadcasts STATE_DELTA on each accepted command; at combat start runs sim server-side and broadcasts COMBAT_START + COMBAT_RESULT; READY from all human seats skips the 30s wait; at match end persists via recorder before broadcasting MATCH_END (so payload MMR always matches repo state); captures `seatAccounts` at creation
- `index.ts` — HTTP + WS server, heartbeat via ws.ping every 5s, reconnect via token restores seat; QUEUE_JOIN without a valid `authToken` → typed ERROR `UNAUTHENTICATED`
- `auth.ts` — HMAC-signed opaque tokens (`signToken`/`verifyToken`), secret from `AUTH_SECRET` (dev default)
- `http.ts` — minimal HTTP API on the WS port: `POST /auth/guest {deviceId, name?}` → `{accountId, token, profile}` (idempotent per deviceId); `GET /leaderboard?n=50`; `GET /profile` and `GET /history?limit=20` (Bearer token); `PATCH /profile {name}` (Bearer token; `validateName` enforces length 2-16 + charset `[A-Za-z0-9 _-]`, rejects with typed `INVALID_NAME`, persists via `repo.updateProfile`, returns updated profile; bots unaffected); CORS-enabled (GET/POST/PATCH)
- `db/` — `repo.ts` (`Repository` interface: createGuest, findByToken, get/updateProfile, recordMatch, leaderboard, matchHistory), `memory.ts` (default/dev/tests), `postgres.ts` + `schema.sql` (used when `DATABASE_URL` set; migrations = idempotent schema.sql; recordMatch inserts match + match_players and applies profile MMR updates in one transaction); contract test suite runs against both (pg only with DATABASE_URL)
- `mmr.ts` — Elo for 8-player FFA: expected = Elo expectation vs lobby's average MMR excluding self; actual = (8 − placement)/7; delta = round(K·(actual − expected)); K/start/divisor from economy.json; bots count at mmrStart for the lobby average but are never persisted
- `recorder.ts` — `recordMatchResult(repo, matchId, seats)`: fetches profiles, computes deltas, writes match + MMR through the repo, returns per-seat `{before, after}` for the MATCH_END payload

## packages/client internals

- Vite + TypeScript + PixiJS v8; design resolution 390×844, scale-to-fit
- Boot flow: `bootAuth` (guest auth, tolerant of an offline server → null) → Main Menu (not straight to mode select). Practice works offline; Online/Profile/Leaderboard need a reachable server
- `ui/` — DOM/CSS meta-screen layer over the Pixi canvas (`#ui-root` for menus, `#match-overlay` for the in-match pause button/coachmarks; canvas stays Pixi). **Visual-overhaul stage 4 themes every meta screen to the in-game art direction** (one shared CSS component set: panel surfaces `panelBg`/`chipBorder`, gold accents, themed buttons/cards/inputs/sliders/toggles — no default HTML chrome). `app.ts` = `UiApp` screen manager (MainMenu wordmark + primary Play, Play→Practice/Online themed cards, Profile, Leaderboard, HowToPlay, Settings) with back-nav, the themed in-match pause panel (master volume, default speed, Leave Match), and the coachmark trigger. Rank shown as a tier-colored `ui-rank-badge` (color from `rankCssVar(band.id)`, reusing `RANK_BANDS`); Leaderboard highlights the current player (`.me` by accountId); Profile shows placement-distribution bars + colored MMR deltas; How-to-Play pages reuse the diamond + tier/trait-color motif (`ui-diamond`/`ui-tier-legend`/`ui-trait-legend`). `styles.ts` injects one stylesheet whose colors are CSS custom properties generated from theme.ts (no hex literals); `content.ts` = How-to-Play pages; `coachmarks.ts` = first-match highlight overlay; `dom.ts` = element helpers. Stage 4 is pure visual/CSS — no navigation/logic change
- **Theme-as-CSS-vars single source (DOM + canvas)**: `theme.ts` is the only palette. The same numeric colors the Pixi layer uses are exported to the DOM as `:root` custom properties (`applyThemeVars`/`themeCssVars`); DOM/CSS reference them via `cssVar(key)`, never hex literals (theme test forbids `0x` outside theme.ts). Visual-overhaul stage-1 constants also live here: tier colors `tier1..tier5` (read by `tierColor`), token bars `hpGreen`/`hpLow`/`manaBlue`, hex board `enemyHex`/`myHex`/`boardBg`/`boardBorder`, and token `tokenBg`/`starGold`. Visual-overhaul stage-2 in-match chrome constants also live here: `panelBg`/`chipBorder` (chips), `xpPurple` (xp bar), `streakOrange` (streak), reusing `starGold` for gold/cost; plus the stable family-based `TRAIT_COLOR` map read by `traitColor(traitId)` for trait-strip chip hues. Visual-overhaul stage-4 (DOM meta) constants too: `bgPanelRaise`/`accentGold` + per-rank `rankBronze..rankMaster`, with `RANK_COLOR`/`rankColor(id)`/`rankCssVar(id)` mapping ranks.json band ids to badge colors and `traitColorCss(id)` exposing the canvas trait color to DOM motifs. Non-trait HUD glyphs `coin`/`refresh` added to `glyphs.ts` (`drawGlyph`), kept out of `TRAIT_GLYPH`. Stage-5 in-match-UX constants too: `bgInspect`/`bgInspectRow`/`bgScrim` (inspect & trait-detail panels), `bgSellChip`/`bgSellArmed` (sell affordance), `benchEmpty`/`benchEmptyRim`/`benchOccupied` (bench slot states)
- **HUD model (`hudModel.ts`)**: pure derivations for the stage-2 chrome (no Pixi, no game logic). `traitStripModel(board, units, traits)` → one chip per trait by unique-defId count vs breakpoints (`{traitId,name,count,activeBreakpoint,nextBreakpoint,color}`, sorted active-first then count desc); `xpProgress(xp, level, levelXpThresholds)` → fill fraction within the current level (maxed at top level). Both unit-tested
- **Inspect/detail models (stage-5 in-match UX, pure + unit-tested, mirror the hudModel pattern)**: `inspectModel.ts` (`inspectModel(defId, instance|null, data)` → identity + origin/classes + cost/tier + full stat block + readable `abilityDescription`; reads units.json, uses the live UnitInstance's hp/mana/star when owned, base stats for a shop preview); `traitDetailModel.ts` (`traitDetailModel(traitId, count, data)` → per-breakpoint `{count, effect, active, reached}` from traits.json + `breakpointEffect` stat-line formatter); `sellValue.ts` (`sellValue(unit, data)` — pure mirror of the rules SELL refund: tier × copies-per-star × multiplier); `benchLayout.ts` (`benchGeom(designW, benchY)` + `benchSlotAtX` — pure bench/sell hit-target math); `combatLayout.ts` (combat-layer z-index constants; regression guard so the header outranks the tiles)
- **Inspect panels (`inspectPanel.ts`, Pixi — same world as the scout overlay)**: `renderUnitInspect`/`renderTraitDetail` render the pure models into a modal `inspectLayer` (scrim-dismiss + ✕): unit panel = token + name + tier·cost, trait diamond+glyph chips, ability block (name/cost/wrapped description), 2-col stat grid; trait panel = diamond + name/kind/count + per-breakpoint rows marking reached/active (shape+arrow, not color-only). Opened by long-press on any unit (shop/bench/board) or tap on a trait-strip chip; no game logic, dismissable, torn down on every phase change
- **UnitToken (`unitToken.ts`)**: one reusable Pixi component drawn on the board, the bench, and in combat — disc (`tokenBg`) + 2.5px tier-color ring, class glyph (or drop-in art) centered, gold star pips above, optional HP/mana bars below (bench tokens pass no bars). Built with the Pixi v8 path API (`circle/poly/rect` + `fill`/`stroke`). The hex board renders flat-top tiles on a `boardBg` panel (enemy zone `enemyHex`, player zone `myHex`); while dragging a unit the player's own hexes outline-highlight as valid drop targets
- **Class glyphs (`glyphs.ts`)**: Tabler's webfont can't render in canvas/WebGL, so every origin + class trait maps to a procedural vector glyph in `TRAIT_GLYPH` (completeness is test-enforced); `drawGlyph` paints it. A unit shows its primary class glyph (`glyphForTraits`)
- **Unit art drop-in slot (`sprites.ts` + `public/units/`)**: mirrors the audio music slot — drop `public/units/<unitId>.png` and the token renders it clipped inside the ring instead of the glyph; absent → glyph fallback, no-op clean. Pure `resolveUnitTexture(unitId, lookup)` (path→texture|null) is the tested unit; `requestUnitArt` lazily loads + caches, `onUnitArtReady` lets the static planning board repaint when art lands. See `public/units/README.md` for naming/size
- `settings.ts` — `SettingsStore` persists client prefs in localStorage (master/sfx/music volume, mute, `musicEnabled` on/off, default combat speed 1x/2x, reduced motion). Gameplay-affecting prefs read by the match scene (default speed, reduced motion → CombatView skips non-essential tweens) and audio (volumes/mute/music toggle). Player name is NOT a setting — changed via `PATCH /profile` (`patchName`)
- **Audio (`audio/`)** — Web Audio engine; master/sfx/music gain buses bound to Settings volumes, mute zeroes master, the music toggle gates the music bus (pure `computeGain(master, channel, muted)` mirrors the node graph). Pure data/logic modules are unit-tested; `manager.ts` wraps them around real nodes:
  - `sfx.ts` (pure palette): the full designed SFX set as data — layered synth voices (ADSR + multi-osc + filtered noise + per-spec reverb send + per-trigger pitch/velocity jitter), one A-minor key/timbre family. Covers UI (tap/buy/sell/reroll/levelUp/error), combat (attack=melee contact/projectile/impact/crit/death + per-ability-kind casts castMagic/castBurn/castShield/castBuff/castStealth), and economy/feedback (goldGain/starUp/roundStart/roundWin/roundLoss/elimination). `EVENT_SFX` is the total event→sound coverage map (test-enforced complete); `castSfx(kind)` and `SFX_NAMES`/`SFX_SPECS` are the lookups
  - `music.ts` (generative): original loopable music composed from scratch (no copyrighted melodies) — a moving multi-chord progression rendered as a high-passed pad stack + a root bass line + a gentle arpeggio + a short seeded lead motif + light percussion per `MOODS` (menu calm / planning warm-mid / combat tense-rhythmic) in an A-minor/dorian family, scheduled by a Web Audio lookahead scheduler (`dueSteps`) that evolves slowly. The musical logic is extracted as pure, unit-tested helpers: `PROGRESSIONS`/`progressionFor(mood)`/`triad` (a distinct 4-bar diatonic progression per state that moves and resolves at the loop seam — menu i–VI–III–VII, planning i–iv–VI–V, combat i–VII–VI–v); `generateMotif(seed,len)` (deterministic mulberry32 motif as scale-degree offsets with stepwise motion + occasional skips/rests, one stable `MOTIF_SEED` per mood) re-varied each loop by `varyMotif(motif,pass)` (deterministic per-pass ornament/octave-lift/rest toggle; `pass` 0 states the theme plainly, so the lead repeats with slight change, not identically); `voiceLead(prevMidi,chordDegrees,rootMidi,scale)` (picks each chord tone's nearest octave to the previous voicing so motion is shared/stepwise, not parallel leaps); and the `MIX` gain table (per-layer multipliers in (0,1], lead above pads, percussion never dominant — pads high-passed and layers band-separated to avoid mud, all trimmed low to underscore). Also `midiToFreq`/`degreeToMidi`/`dueSteps`/`MOODS`. `GenerativeMusic.setMood` re-parameterizes (incl. re-seeding the motif and re-anchoring voice-leading) without restarting; `stop` saves CPU
  - `director.ts` (pure): maps phase/scene → `MusicState` (`phaseToMusicState`: PLANNING→planning, COMBAT/RESOLUTION→combat; match-over→results), `stateToMood`, `resolveMusicSource(state, hasFile)` (a dropped-in file always wins, else generative), file-slot paths (`musicFilePaths`/`sfxFilePaths`), equal-power `crossfadeGains`, and the sticky autoplay-unlock state machine (`nextUnlockState`/`becameUnlocked`)
  - `manager.ts`: `setMusicState(state)` resolves file-vs-generative and crossfades on transitions; `play(name, delaySec?)` synthesizes a spec (or plays a per-event override sample if dropped in). Combat audio stays a **consumer of the combat fx/effect stream** (`handleCombatFx(frame.fx)` from `combat/player.ts`), never game logic: melee `contact`→attack, `impact`/crit→impact/crit, `projectile`→fire, `abilityHit.effect`→per-kind cast, `dissolve`→death — so it still tracks the visuals under reduced motion (heavy motion fx dropped, impact/abilityHit/dissolve remain). The match scene drives music states + economy/feedback cues by consuming phase/scene like the renderer (no game logic). `resume()` (first user gesture) resumes the suspended context and (re)starts the current state so menu music begins on first interaction; muting/zero-volume/music-off stop generative nodes
  - **File slots**: per-state music at `public/audio/music/<state>.(mp3|ogg)` (state ∈ menu/planning/combat/results) and optional per-event SFX overrides at `public/audio/sfx/<name>.(mp3|ogg)`; generative/procedural is the fallback, a dropped-in file always wins, absent files no-op cleanly. See `public/audio/README.md`
- `onboarding.ts` — first-Practice-match coachmark gating (localStorage `ab.coachmarksSeen`, shown once/skippable) + step data; full scripted tutorial match is out of scope (see design-notes.md)
- `auth.ts` — guest auth: deviceId (crypto.randomUUID) + token persisted in localStorage; registers as "Guest" via POST /auth/guest, reuses/validates the stored token via GET /profile; helpers `fetchProfile`/`fetchHistory`/`patchName`/`fetchLeaderboard`; NetDriver sends the token in QUEUE_JOIN
- `mmrToRank(mmr)` (from `@autobattler/data`, thresholds in `ranks.json`) maps MMR → rank band; used by Profile + Leaderboard rows
- Post-match overlay shows placement + MMR delta (from MATCH_END `mmr`) and a Main Menu button; leaving an online match disconnects (driver.dispose → NetClient.stop), forfeiting to last via the server's AFK path (no SURRENDER message exists)
- `driver.ts` — `IDriver` interface + `LocalDriver`: wraps match.ts with 30s planning timer, skippable via ready(); AI commands applied at phase end; emits DriverEvent stream
- `netDriver.ts` — `NetDriver implements IDriver`: drives scene from server messages; runs local sim from received seed for rendering; reconciles with COMBAT_RESULT (logs mismatch)
- `net.ts` — `NetClient`: WS wrapper with reconnect backoff + token; PING/PONG RTT measurement for clock offset
- `scenes/match.ts` — single screen, stage-2 chrome (all Pixi, rendered from the MatchState snapshot): status row (stage chip + planning timer m:ss, tinting `hpLow` under 5s; ☰ pause stays the DOM `#match-overlay` hook), opponent rail (8 seat tiles: avatar + HP bar, current opponent gold-outlined, eliminated dimmed, tap-to-scout), hex board (player 4 rows + opponent 4 rows), trait strip (`renderTraitStrip` from `traitStripModel`: diamond+glyph chips, active colored / inactive dimmed `count/next`; tap a chip → trait-detail panel), HUD row (`renderControls`: level chip + `xpProgress` bar, gold, streak, reroll + buy-xp buttons), bench (9 full-cell slots with clear occupied/empty states + forgiving hit areas, via `benchGeom`), sell control (lights up + shows the exact gold refund from `sellValue` when a unit is selected/dragged; tap or drag-to-sell), shop cards (5: tier-top-border + portrait disc + name + Origin·Class + cost), full-width Ready button. Inspect: long-press any unit (shop/bench/board) → `renderUnitInspect`; modal panels live in `inspectLayer`, torn down on every phase change
- `combat/` — event-log playback: `reducer.ts` (pure fold of CombatEvents → positions/hp/mana/alive per uid; `stateAtTick`), `player.ts` (tick→ms clock at ticksPerSec, 1x/2x speed, skip-to-end, lerped MOVE spans, typed fx stream; `toDisplayHex` keeps my units on the bottom rows regardless of pairing side, row flip is involutive), `view.ts` (Pixi layer rendering player frames via the shared UnitToken + the fx stream)
- **Combat VFX/fx stream (stage 3)**: every visual and every combat sound is derived in `player.ts` from the CombatEvent log — playback stays a pure deterministic function of (log, seed). `CombatPlayer(log, ticksPerSec, data, {reducedMotion})` resolves positions from the reducer state at each event tick, ranged-vs-melee from each unit's `range`, and the ability kind from the caster's `ability.effect.kind` (both via the passed `data`). Fx kinds: `projectile` (ranged bolt, travels `fromPos→toPos` over `travelTicks`, view spawns the landing `impact`) / `contact` (melee lunge) / `impact {pos,targetUid,crit}` (hit-spark + target recoil; crit → scale-pop + shake) / `floater` (weighted damage number: crit larger + gold) / `abilityCast {casterPos,effect}` + `abilityHit {targetPos,targetUid,effect}` (per-kind: magic burst / shield bubble / buff aura / burn flicker / stealth fade) / `dissolve {uid,pos}` (death fade + sink/scale + burst) / `overtime`. `view.ts` animates HP down smoothly with a trailing white damage-chip (`unitToken` bars `hpChipFrac`), fills mana smoothly, screen-shakes (capped) on crit/death, and adds an `overtime` board-edge tint beside the banner. **Reduced-motion gating** lives in BOTH layers: `player.ts` downgrades the *emitted* set (drops `projectile`/`contact`/`abilityCast`, emits `impact` directly for ranged) so audio + readability survive; `view.ts` skips all particle spawns + shake and snaps bars near-instantly. Planning-phase juice (`scenes/match.ts`): star-up flourish on a merge (derived from the board/bench star-count change, no new game logic) + buy/sell pops, all reduced-motion-gated. **Perf**: fx objects pool a Graphics free-list, concurrent particles + projectiles are capped (oldest evicted past budget) for smooth full-board mobile playback
- **Renderer-is-dumb invariant**: no game logic in the renderer; render strictly from MatchState snapshots and CombatEvent logs; all actions go through driver.playerCommand → applyCommand
- Planning phase: tap shop card to buy (long-press to inspect); tap unit then tap hex/bench slot to move; tap the sell control (shows refund) or drag onto it to sell; long-press a unit / tap a trait chip to inspect; rejections shown as brief toast
- Combat phase: event-log playback of my pairing with speed/skip HUD buttons; single `COMBAT · vs X` header sits in the clear band below the board panel with an explicit high zIndex so it never renders behind the hex tiles (the sortable combatLayer keeps insertion order at equal zIndex — see `combatLayout.ts`); LocalDriver holds RESOLUTION until the scene calls `combatPlaybackDone()` (capped at 1x duration + buffer); online, playback auto-skips to the end if the server advances first; PvE/bye rounds show a static board
- Resolution: round-result overlay with a wide thumb-reachable Continue button + a VISIBLE auto-advance countdown (draining bar + "Auto in Ns" label synced to `resolutionSeconds`, ticker-driven, reduced-motion still shows the seconds); the countdown ticker is cleared alongside the timer in `clearResolutionTimer` (and on phase change / match-over / destroy) so the overlay always tears down cleanly
