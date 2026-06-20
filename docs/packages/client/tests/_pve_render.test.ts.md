# Path & purpose

`packages/client/tests/_pve_render.test.ts` -- two test suites verifying PvE (creep) rendering behavior: (1) an integration-level check that a PvE combat result's event log actually contains both player-side and mob-side units, and (2) a set of STRUCTURAL/SOURCE-TEXT scans of `scenes/match.ts`'s `renderBoard` method confirming the pre-combat creep preview is read-only and visually distinct, without instantiating Pixi.

# Responsibility

Owns: regression coverage for the "PvE creeps render inline on the enemy half during planning, as a read-only preview" behavior described in CLAUDE.md's PvE-round-presentation notes. Notably, the SECOND suite doesn't render anything or invoke any function -- it reads `scenes/match.ts`'s raw source text and asserts structural/textual properties of the `renderBoard` method body, which is an unusual but pragmatic testing strategy for a method that's otherwise extremely costly to unit test directly (since `MatchScene` requires a live `PIXI.Application`, a driver, layout, settings, and audio to construct).

# Exports

None (a Vitest test file -- `describe`/`it` blocks only, no exports).

# Key behavior

**`renderBoardBody()`** (module-private helper): reads `scenes/match.ts`'s raw source text via `readFileSync` at `import.meta.dirname + "../src/scenes/match.ts"`, locates the start of the `private renderBoard(` method via `indexOf`, and the end via the next occurrence of `private benchGeom()` (asserting both are found and properly ordered) -- slicing out exactly the `renderBoard` method's source text body for further string/regex assertions. This confirms (and DEPENDS ON) the exact ordering of these two private methods in the source file: `renderBoard` immediately precedes `benchGeom` with nothing else between them currently, which is a structural assumption baked into the test, not a documented invariant of `match.ts` itself -- if a future refactor reorders these methods, this helper's `end` index would either fail the `toBeGreaterThan` assertion or (worse) silently slice the wrong range if another `private benchGeom()`-like string appears elsewhere first.

**Suite 1, "pve combat result renders mobs"**: builds a real match (`createMatch(42, gameData)`), manually injects ONE real unit (`gameData.units[0]`) onto player 0's board slot 24 (constructing a full `UnitInstance` object literal by hand, with all required engine fields), sets `state.round = 1`, then calls `runPveRound(state, mulberry32(state.prngState), gameData)` (the actual rules PvE-round runner). Reads back `state.lastCombatResults.get(0)` and asserts its event log is non-empty, then uses the REAL reducer (`stateAtTick(result.events, 0)`) to read the tick-0 unit-state snapshot and confirms units exist on BOTH `side: 1` (mob side) and `side: 0` (player side) -- i.e. this is an end-to-end check that a PvE combat result genuinely contains a two-sided engagement, not just the player's own units replayed against nothing.

**Suite 2, "PvE creeps render inline on the enemy half (read-only)"**: four `it` blocks, all pure source-text regex/substring assertions against `renderBoardBody()`'s output:
1. Confirms the enemy-zone hex fill expression matches `isPveRound ? C.mobZone : C.enemyHex` (mirroring the same PvE-tint pattern used during actual combat per `onCombatPhase`'s documented behavior).
2. Confirms the method calls `this.driver.getUpcomingPveBoard()` (the pure driver accessor for the NEXT PvE round's mob layout, used to preview it during planning) and that the resulting `drawUnit(...)` call's trailing boolean arguments match `..., false, false, true)` (interpreted by the test's own comment as `withBars=false, withItems=false, isPiece=true` -- no HP/mana bars, no item dots, but checkers-piece 3D volume enabled).
3. Isolates the source slice between the `getUpcomingPveBoard()` call and the next `// Player zone` comment, and asserts that slice (a) DOES call `this.armInspect(...)` (long-press-to-inspect is the only wired interaction) and DOES set `cursor = "default"` (non-grabbing, signaling read-only), and (b) does NOT contain `"startDragBoard"`, `"startDrag"`, or a `cursor = "grab"` assignment anywhere -- i.e. mob tokens have zero drag-related wiring.
4. Isolates the source slice between a `// Enemy zone` comment and a `"PvE creep preview"` comment/string, and asserts that the enemy-zone HEX TILES (not the mob tokens themselves) carry no `onHexPointerDown`, no `eventMode = "static"`, and no `cursor = "pointer"` -- confirming the enemy hexes are non-interactive (never a valid drop target for a dragged unit), independent of whether mob tokens are drawn on top of them.

# Invariants & constraints

- **This test file is tightly coupled to `scenes/match.ts`'s literal source text** (method names, comment strings like `"// Player zone"`/`"// Enemy zone"`/`"PvE creep preview"`, and the exact trailing-argument shape of a `drawUnit(...)` call) -- any refactor of `renderBoard` (renaming the method, removing/rewording those exact comments, reordering the enemy-zone/mob-preview/player-zone sections, or changing `drawUnit`'s call signature) WILL silently break these assertions even if the actual rendered behavior is unchanged. This is the well-known tradeoff of structural/text-based testing: it catches accidental behavior regressions cheaply (no Pixi needed) but is brittle to pure refactors. A maintainer renaming these comments/methods must update this test file in lockstep.
- The test explicitly chose this approach BECAUSE constructing a real `MatchScene` for a true rendering test would require a live `PIXI.Application` + full driver/layout/settings/audio wiring -- the file itself doesn't say this, but the testing strategy strongly implies it was judged not worth that setup cost for what is fundamentally a "did we wire the right calls with the right flags" check.
- Suite 1's manually-constructed `UnitInstance` object literal hardcodes EVERY required engine field (`uid`, `defId`, `tier`, `star`, `team`, `pos`, `hp`/`maxHp`, `ad`, `as`, `armor`, `mr`, `range`, `mana`/`maxMana`, `abilityDamage`, `attackCooldown`, `statusEffects: []`, `items: []`) -- if `UnitInstance`'s shape in `sim/src/types.ts` ever gains a new required field, this literal (cast via `as any`) would still type-check (the `as any` cast suppresses the compiler's missing-field error) but could produce a runtime-invalid unit depending on what the new field is used for; this is a latent fragility specific to the `as any` escape hatch used here.
- `runPveRound`'s call requires `state.round` to be explicitly set to a PvE round number (`state.round = 1`) BEFORE calling it -- the test manually sets this rather than relying on `createMatch`'s default round value, implying round 1 is (at minimum) a valid PvE round per `pveRounds` configuration in this data set; a reader modifying which rounds are PvE in `economy.json`/rules should re-verify round 1 is still PvE or this test's setup would need updating.

# Depends on

- `vitest` (`describe`, `it`, `expect`).
- `fs` (`readFileSync`), `path` (`join`) -- reads `scenes/match.ts`'s raw source as text.
- `@autobattler/data` (`gameData`).
- `@autobattler/rules` (`createMatch`) and `@autobattler/rules/src/rounds.js` (`runPveRound`).
- `@autobattler/sim/src/prng.js` (`mulberry32`).
- `../src/combat/reducer.js` (`stateAtTick`) -- the real pure reducer, used to verify the event log's tick-0 state.

# Used by

Not imported by any other file (a leaf test file); run as part of the client package's `npm test`/vitest suite.

# Notes

- The filename's leading underscore (`_pve_render.test.ts`) is unusual relative to other test files in this directory (none of the others observed so far have this prefix) -- this MAY be a convention to sort it differently in directory listings (e.g. grouping "special"/structural tests apart from straightforward unit tests), or simply incidental; no comment in the file explains the naming choice.
- This is a good example of a "regression guard via source inspection" pattern that appears at least once elsewhere in this codebase (`combatLayout.ts`'s own regression-guard test, per CLAUDE.md's mention of "a dedicated theme test" and "the combatLayout.test.ts regression guard") -- a reader investigating PvE-creep-preview behavior changes should expect to ALSO update this file's regex/substring expectations, not just the implementation.
- A genuine behavioral gap this test does NOT cover: it never asserts anything about WHAT the mob preview visually looks like (colors, positions, sizing) -- only that the right flags/calls are present in source. Actual visual correctness of the PvE preview would only be caught by manual QA or a future Pixi-instantiating snapshot test, neither of which this file provides.
