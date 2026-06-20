# Path & purpose

`packages/client/tests/sellValue.test.ts` — unit test for `sellValue()` (`packages/client/src/sellValue.ts`), verifying it returns 0 for an unrecognized unit and otherwise mirrors the rules-side SELL refund formula exactly, using real `@autobattler/data` content.

# Responsibility

Guards that the client's display-only sell-refund preview never drifts from the formula `tier × copiesPerStar[star] × sellValueMultiplier` used by `packages/rules/src/commands.ts`'s SELL command, by computing the expected value independently from the same `gameData.gameplay` constants and comparing.

# Exports

None — Vitest test file, no exports.

# Key behavior

- `inst(defId, star)` helper builds a minimal fake `UnitInstance` (just `{defId, star}` cast to the type) since `sellValue` only reads those two fields.
- Test 1: `sellValue(inst("__nope__", 1), gameData)` returns `0` — the not-found branch (no matching `data.units` entry by id).
- Test 2: picks the first tier-1 unit def from real `gameData.units`, then for star 1/2/3 asserts `sellValue(...)` equals `def.tier * cps[star] * mult`, where `cps = gameData.gameplay.copiesPerStar` and `mult = gameData.gameplay.sellValueMultiplier` — i.e. it recomputes the same formula from the same data source rather than hardcoding expected numbers, so the test stays valid if `gameplay.json` tuning changes.

# Invariants & constraints

- This test will pass even if `gameData.gameplay.copiesPerStar`/`sellValueMultiplier` change, because it reads the constants live rather than hardcoding values — it only catches a divergence in the FORMULA (e.g. if `sellValue` started using a different exponent or dropped the tier factor), not a divergence in tuning numbers.
- Relies on at least one tier-1 unit existing in `gameData.units` (`.find(...)!` non-null assertion) — would throw if tier-1 units were ever removed from `units.json`.
- Does NOT test against the actual rules `commands.ts` SELL implementation directly (no cross-package import of rules' internal refund logic) — the "mirrors the rules SELL formula" claim is asserted only by comment + shared formula structure, not by importing rules and diffing. A real divergence between `commands.ts`'s SELL and this file's formula would NOT be caught by this test alone.

# Depends on

- `@autobattler/data` (`gameData`) — real loaded game content (units.json, gameplay.json `copiesPerStar`/`sellValueMultiplier`).
- `@autobattler/sim/src/types.js` (`UnitInstance` type only, for the cast).
- `../src/sellValue.js` (`sellValue`) — the function under test.
- `vitest`.

# Used by

Not imported elsewhere — standalone Vitest test file.

# Notes

- The `as UnitInstance` cast in `inst()` means TypeScript does not check that the fake object satisfies the full `UnitInstance` shape — acceptable here since `sellValue` only reads `defId`/`star`, but a future change to `sellValue` reading other fields would not be caught by the type system in this test, only at runtime (likely `undefined` reads, not a compile error).
