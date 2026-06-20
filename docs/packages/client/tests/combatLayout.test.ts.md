# Path & purpose

`packages/client/tests/combatLayout.test.ts` -- regression-guard tests asserting the RELATIVE ORDERING of `combatLayout.ts`'s zIndex constants (`Z_COMBAT_TILE`, `Z_COMBAT_HEADER`, `Z_RESOLUTION_OVERLAY`, `Z_RESOLUTION_BUTTON`, `Z_RESOLUTION_CONTROL`), guarding against two specific previously-encountered visual bugs (stray combat-header text rendering behind hex tiles, and a resolution overlay co-rendering beneath a leftover combat header during a fast PvE round).

# Responsibility

Owns: the contract that the combat-layer z-stack constants, wherever else they're consumed (in `scenes/match.ts`'s combat/resolution rendering), maintain a specific partial order regardless of their absolute numeric values -- this file tests ORDERING relationships only (`toBeGreaterThan`), never specific numbers, so it survives renumbering the whole constant set as long as the relative order is preserved.

# Exports

None (a Vitest test file).

# Key behavior

Four assertions, each documented with an inline comment explaining the SPECIFIC historical bug it guards against:

1. **"keeps the combat header strictly above the board tiles"**: `Z_COMBAT_HEADER > Z_COMBAT_TILE`. Per the file's header comment, this guards against "the stray text behind the hexes during combat" bug -- the combat header was originally added to the sortable `combatLayer` BEFORE the hex tiles, so at EQUAL zIndex (Pixi's `sortableChildren` ties break by insertion/`addChild` order per CLAUDE.md's documented invariant), the header rendered behind the board. Giving the header a strictly higher zIndex than tiles fixes this regardless of insertion order.

2. **"keeps resolution controls above the board tiles"**: both `Z_RESOLUTION_BUTTON > Z_COMBAT_TILE` and `Z_RESOLUTION_CONTROL > Z_COMBAT_TILE` -- the resolution screen's interactive elements (Continue button, the auto-advance countdown control) must always render above the board, which stays visible/static underneath during the resolution phase.

3. **"keeps the resolution overlay strictly above the combat header"**: `Z_RESOLUTION_OVERLAY > Z_COMBAT_HEADER`. This guards against a SPECIFIC race-condition bug described in detail in the inline comment: "a fast PvE round can hit RESOLUTION before the planning→combat fade finishes" -- i.e. if the resolution phase's overlay surface doesn't strictly outrank the combat header's zIndex, a leftover combat header (`"PvE · ...Resolution... · Creeps"`, per the comment's garbled-text example) could co-render visibly UNDER/alongside the resolution modal instead of being cleanly hidden beneath it. The fix ensures "the round-result modal always wins."

4. **"keeps resolution controls above the resolution surface"**: both `Z_RESOLUTION_CONTROL > Z_RESOLUTION_OVERLAY` and `Z_RESOLUTION_BUTTON > Z_RESOLUTION_OVERLAY` -- the resolution screen's own interactive elements must render ABOVE its own backing surface/overlay panel (an unsurprising but necessary ordering, completing the full stack: tiles < header < resolution overlay < resolution controls).

# Invariants & constraints

- This file tests RELATIVE ORDER ONLY -- it never asserts a specific numeric zIndex value for any constant. This means `combatLayout.ts`'s actual numbers can be freely renumbered/rescaled (e.g. moving from a 0-10 range to a 0-1000 range) without breaking this test, AS LONG AS the four documented orderings are preserved. A maintainer adding a NEW layer to the combat/resolution stack should add a corresponding NEW ordering assertion here if that layer has a load-bearing stacking relationship with any of the existing five constants.
- Each assertion in this file traces back to an ACTUAL bug previously observed in production/testing (per the inline comments) -- this is one of the few files in the test suite explicitly framed as bug-regression documentation rather than spec-from-scratch coverage; a reader investigating a new "thing X renders behind/in front of thing Y" visual bug in the combat/resolution UI should both (a) check whether this file already covers the specific pair involved, and (b) consider adding a new assertion here (with the same documentary-comment style) if it's a genuinely new ordering bug, mirroring the established pattern.
- The bug being guarded against in assertion 3 is specifically a TIMING/RACE issue (a fast PvE round outrunning an in-progress fade transition), not a static layout bug -- this is a reminder that zIndex ordering alone isn't sufficient to prevent ALL such races (the underlying phase-transition logic in `scenes/match.ts` still has to correctly tear down/hide the old header), but it ensures that EVEN IF a stale header element is still present when the resolution overlay appears, it will be correctly hidden behind it rather than visibly clashing.

# Depends on

- `vitest` (`describe`, `it`, `expect`, `toBeGreaterThan`).
- `../src/combatLayout.js` (`Z_COMBAT_TILE`, `Z_COMBAT_HEADER`, `Z_RESOLUTION_OVERLAY`, `Z_RESOLUTION_BUTTON`, `Z_RESOLUTION_CONTROL`).

# Used by

Not imported by any other file (a leaf test file); run as part of the client package's `npm test`/vitest suite. Indirectly validates a property relied upon throughout `scenes/match.ts`'s combat/resolution rendering, which constructs Pixi containers using these same exported constants as their `zIndex`.

# Notes

- This file is referenced directly in CLAUDE.md's client internals notes ("a single `COMBAT · vs X` header sits in the clear band... with an explicit high zIndex... the sortable combatLayer keeps insertion order at equal zIndex — see `combatLayout.ts`") -- it's one of the few test files explicitly called out by name in the project's own living architecture document, signaling its importance as a durable regression guard rather than incidental coverage.
- Despite being only 4 short assertions, this file is disproportionately valuable per line: each one encodes a SPECIFIC, previously-shipped visual bug, making it cheap insurance against regressing either issue if `combatLayout.ts`'s constants are ever touched during an unrelated refactor.
