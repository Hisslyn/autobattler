# Path & purpose

`packages/client/tests/combatFx.test.ts` -- known-answer tests for `combat/player.ts`'s `CombatPlayer` class: verifies the exact fx stream (`CombatFx[]`) emitted while advancing playback over a small, hand-built, fully deterministic `CombatEvent` log, plus playback-speed pacing (0.5x/1x/2x tick-rate scaling and the 0.5x-takes-2x-wall-clock duration relationship).

# Responsibility

Owns: regression coverage for the fx-derivation logic that turns a raw `CombatEvent` log into the visual/audio cue stream the renderer (`combat/view.ts`) and audio manager (`audio/manager.ts`) consume -- confirming each event TYPE produces the right fx KIND with the right payload fields (positions, target uid, crit flag, damage amount, travel ticks), that ranged vs melee attacks correctly diverge into `projectile` vs `contact` fx, that reduced-motion correctly downgrades the emitted set (dropping heavy-motion fx while preserving audio/readability-essential ones), and that the fx stream and the playback clock are both deterministic and correctly speed-scaled.

# Exports

None (a Vitest test file). Defines:
- `DATA`: a MINIMAL synthetic `GameData`-shaped object (cast via `as unknown as GameData`) with 4 unit defs (`archer` range 3 + `magic_damage` ability, `knight` range 1 melee no ability, `mage` range 1 + `shield` ability, `dummy` range 1 the target) -- only the fields `CombatPlayer` actually reads (`range`, `ability.effect.kind`) are populated, everything else is omitted, since the type cast bypasses full `GameData` shape requirements.
- Position constants `ARCHER {q:0,r:0}`, `KNIGHT {q:1,r:0}`, `MAGE {q:2,r:0}`, `TARGET {q:0,r:3}`.
- `snap(uid, defId, side, hex)`: builds a minimal unit-snapshot object for the log's `init` event (hardcoded `hp:1000/maxHp:1000`, `mana:0/maxMana:100`, `star:1`, `items:[]`).
- `fixedLog()`: returns a brand-new (fresh array each call) 6-event `CombatEvent[]` -- `init` (4 units: archer/knight/mage on side 0, dummy as the lone target on side 1), `attack` tick 1 (archer→dummy, dmg 50, non-crit -- the RANGED attack), `attack` tick 2 (knight→dummy, dmg 80, CRIT -- the MELEE attack), `cast` tick 3 (mage→dummy, dmg 0 -- the shield-ability cast), `death` tick 4 (dummy dies), `end` tick 5 (side 0 wins, survivors 1/2/3).
- `allFx(reducedMotion)`: constructs a `CombatPlayer(fixedLog(), 20, DATA, {reducedMotion})` (20 ticks/sec) and calls `p.advance(10_000).fx` (a huge 10-second advance, guaranteeing the ENTIRE 5-tick log is drained in one call) -- returns every fx emitted across the whole log.

# Key behavior

**"ranged attack emits a projectile with correct from/to/travel"**: confirms a `projectile` fx exists with `fromPos===ARCHER`, `toPos===TARGET`, `targetUid===10`, `crit===false`, and `travelTicks` exactly equal to `max(2, min(8, round(hexDistance(ARCHER,TARGET)*1.5)))` -- i.e. this test PINS DOWN the exact travel-time formula (clamped to `[2,8]` ticks, scaling with hex distance × 1.5, rounded) rather than just checking it's "reasonable." Also confirms a `contact` fx targeting uid 10 exists too (from the SEPARATE melee attack in the same log, noted by the inline comment "(from the melee unit, below)" -- this assertion is really testing that BOTH attack-types' fx coexist in the combined stream, not that the ranged attack itself produces a contact).

**"melee attack emits a contact lunge"**: confirms a `contact` fx exists with `fromPos===KNIGHT`, `toPos===TARGET`, and that filtering all `projectile` fx by their `fromPos` yields ONLY `[ARCHER]` -- i.e. the melee attacker never ALSO emits a projectile (ranged vs melee fx kinds are mutually exclusive per attack, determined by the attacker's `range` stat from `DATA`).

**"crit attack emits a crit-flagged impact + floater"**: confirms an `impact` fx with `crit:true` exists, and a `floater` fx with `crit:true` exists whose `amount===80` (the knight's crit damage) and `magic===false` (a physical floater, since `attack` events are always physical regardless of crit).

**"CAST emits abilityCast + abilityHit of the right kind"**: confirms BOTH an `abilityCast` and an `abilityHit` fx exist for the `cast` event, both carrying `effect==="shield"` (read from the caster's `ability.effect.kind` in `DATA`, NOT from the event itself -- the event only carries `uid`/`targetUid`/`dmg`, so `CombatPlayer` must look up the caster's def to determine which ability-kind fx to emit), `hit.targetUid===10`, and `cast.casterPos===MAGE`.

**"DEATH emits a dissolve for the dying uid"**: confirms a `dissolve` fx exists with `uid===10` and `pos===TARGET` (the dying unit's last-known position).

**"non-crit ranged floater is lighter (not crit, physical)"**: confirms a SEPARATE `floater` fx (distinguished from the crit one by `!f.crit && !f.magic`) has `amount===50` (the archer's non-crit damage) -- together with the crit-floater test, this confirms the fx stream emits ONE distinct floater per attack/cast event, correctly tagged with that event's own crit/magic/amount, not a single merged or miscounted floater.

**"reduced motion downgrades the emitted set"**: compares `allFx(false)` (full) vs `allFx(true)` (reduced). Confirms `projectile`/`contact`/`abilityCast` ALL appear in the full set but NONE appear in the reduced set (heavy-motion fx dropped entirely), while `impact`/`floater`/`abilityHit`/`dissolve` ALL still appear in the reduced set (readability/audio-essential fx survive), and the reduced set's total length is strictly smaller than the full set's. This directly verifies CLAUDE.md's documented behavior: "player.ts downgrades the emitted set (drops projectile/contact/abilityCast, emits impact directly for ranged) so audio + readability survive."

**"playback fx are a deterministic function of the log"**: confirms calling `allFx(false)` (or `allFx(true)`) TWICE produces deep-equal results both times -- the fx stream has no hidden randomness or time-dependent nondeterminism; given the same log + same `reducedMotion` flag, the output is always identical.

**"playback speed pacing"** (separate `describe` block): two tests on `CombatPlayer.setSpeed`/`advance`/`durationMs`. (1) confirms that advancing by a fixed wall-clock `dt=100ms` at speed `0.5` reaches HALF the tick that speed `1` reaches, and speed `2` reaches DOUBLE the tick that speed `1` reaches (`tHalf ≈ t1x/2`, `t2x ≈ t1x*2`, sampled mid-playback at 100ms specifically to avoid any speed already having hit the end-of-log tick clamp, which would flatten the comparison). (2) confirms that at 0.5x speed, advancing by exactly ONE `p.durationMs` (the 1x-speed total duration) is NOT yet `done` (half-speed playback isn't finished after only the 1x duration's worth of wall-clock time), but advancing by a SECOND `p.durationMs` (cumulative 2x the 1x duration) DOES report `done:true` -- confirming 0.5x speed genuinely takes twice the real-world wall-clock time to finish, not just that it "feels slower."

# Invariants & constraints

- This test file is the PRIMARY pinning-down of `CombatPlayer`'s exact fx-emission contract -- the travel-ticks formula, the ranged/melee mutual exclusivity, the ability-kind lookup via the caster's def (not the event), and the reduced-motion downgrade SET (exactly which kinds are dropped vs kept) are all exact-value assertions here, not approximate ones. A maintainer changing any of these formulas/behaviors in `combat/player.ts` MUST update this test in lockstep, and conversely, a regression in any of them would be caught precisely here.
- The synthetic `DATA` object is intentionally minimal and type-unsafe (`as unknown as GameData`) -- this means `CombatPlayer` must only read the specific fields populated here (`id`, `range`, `ability.effect.kind`, and for shield specifically `amount`/`duration` though those aren't asserted on in this file) to determine fx kind/ranged-vs-melee; if `CombatPlayer` were changed to read additional `GameData` fields for fx derivation (e.g. a new stat affecting projectile visuals), this synthetic fixture would need those fields added or the test would fail/throw on an undefined access.
- `fixedLog()` returns a FRESH array on every call specifically so each test (and each `allFx` call within the determinism test) operates on an independent, unmutated log -- this guards against `CombatPlayer` or the test itself ever accidentally mutating the shared log in place causing test-order-dependent flakiness.
- The speed-pacing tests' choice of sampling at `dt=100ms` (rather than the full duration) is a deliberate technique to compare tick progression strictly proportionally BEFORE any speed setting's playback would have already hit the end-tick clamp -- a reader modifying these tests to sample at a different `dt` should verify the chosen value still keeps all three speeds within their proportional (non-clamped) playback range for this specific 5-tick/20-ticks-per-second fixed log.

# Depends on

- `vitest` (`describe`, `it`, `expect`).
- `@autobattler/data` (`GameData` type only).
- `@autobattler/sim/src/types.js` (`CombatEvent` type).
- `@autobattler/sim/src/hex.js` (`hexDistance`) -- used to independently compute the expected projectile travel-ticks formula's input.
- `../src/combat/player.js` (`CombatPlayer` class, `CombatFx` type).

# Used by

Not imported by any other file (a leaf test file); run as part of the client package's `npm test`/vitest suite.

# Notes

- This file is the best single reference for understanding `CombatPlayer`'s fx stream's EXACT shape per event type, since it exercises one of each (attack-ranged, attack-melee-crit, cast, death) against a known, hand-traceable log -- a reader needing to know "what fx does a `cast` event produce, and what fields does each fx variant carry" can treat this file as executable documentation more reliably than skimming `player.ts`'s implementation directly.
- The "ranged attack... also emits a contact" assertion's comment is slightly confusingly worded in the source (`// ranged emits no melee contact for that attack` followed immediately by an assertion that `contact` DOES exist) -- as written, the assertion is actually testing the COMBINED stream contains both fx kinds (one from each of the two different attacks in the log), not that the ranged attack itself emits a contact; a reader should not be misled by the comment's phrasing into thinking ranged attacks ever produce melee contact fx (they don't, per the immediately-following "melee attack emits a contact lunge" test's `projTargets` assertion, which explicitly confirms ONLY the archer produced a projectile).
