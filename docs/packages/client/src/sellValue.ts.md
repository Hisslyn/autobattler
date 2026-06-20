# Path & purpose

`packages/client/src/sellValue.ts` -- a pure, single-function display helper that mirrors the rules package's SELL refund formula so the client can show the exact gold refund BEFORE the player commits to selling (e.g. on the sell control, or while a unit is being dragged toward it).

# Responsibility

Owns nothing authoritative -- this is a DISPLAY-ONLY duplicate of a formula whose real, enforced computation lives in `packages/rules/src/commands.ts`'s SELL command handler. Its only job is to let the UI preview the refund without round-tripping a command.

# Exports

- `function sellValue(unit: UnitInstance, data: GameData): number` -- looks up the unit's `UnitDef` by `defId` in `data.units` (returns `0` if not found -- e.g. a PvE mob defId absent from `data.units`, though mobs are never sellable so this is a defensive fallback rather than an expected path); reads `copies = data.gameplay.copiesPerStar[String(unit.star)] ?? 1` (the number of base copies consumed to reach that star level); returns `def.tier * copies * data.gameplay.sellValueMultiplier`.

# Key behavior

The formula is a straight three-term product: `tier × copiesPerStar[star] × sellValueMultiplier`. `copiesPerStar` is keyed by the star level AS A STRING (`String(unit.star)`, e.g. `"1"`/`"2"`/`"3"`) -- a unit instance with no matching key (an unexpected star value) silently falls back to `1` copy rather than throwing.

# Invariants & constraints

- **Must be kept byte-for-byte in sync with `packages/rules/src/commands.ts`'s SELL handler** (confirmed identical formula at lines 231/235 of that file: `def.tier * copies * data.gameplay.sellValueMultiplier`, same `copiesPerStar` lookup). If the rules formula ever changes, this file must change too or the displayed refund will silently diverge from what the player actually receives -- there is no shared single-source function between the two packages, just a comment-level promise ("Pure mirror... Kept in sync with rules").
- Returns `0` for any unit whose `defId` isn't found in `data.units` -- this is a graceful degradation, not an error path; nothing here throws.
- Purely a function of `(unit, data)` -- no I/O, no state, deterministic, trivially unit-testable (confirmed by the manifest's pending `sellValue.test.ts`).

# Depends on

- `@autobattler/sim/src/types.js` (`UnitInstance` type) -- reads `unit.defId`/`unit.star`.
- `@autobattler/data` (`GameData` type) -- reads `data.units` (unit defs for `tier`), `data.gameplay.copiesPerStar`, `data.gameplay.sellValueMultiplier`.

# Used by

`packages/client/src/scenes/match.ts` -- `renderSellButton`/`sellTargetUnit`/the sell-zone display call `sellValue(unit, gameData)` to show "the exact gold refund" on the sell control when a unit is selected or dragged toward it (per CLAUDE.md: "the sell control shows only a dim dagger glyph at rest (label/refund only when armed)").

# Notes

- This file is a textbook example of the "display mirrors authoritative logic" pattern used throughout this client (see also `combinePreview.ts` mirroring rules' EQUIP auto-combine, and `inspectModel.ts`'s ability descriptions) -- a reviewer auditing rules-formula changes (especially anything touching `economy.json`'s `sellValueMultiplier` or `gameplay.json`'s `copiesPerStar`) should grep for this file as a required co-change.
- No test currently enforces the cross-package formula equality directly (the pending `sellValue.test.ts` per the manifest presumably unit-tests THIS file's pure math against fixed inputs, but does not appear to cross-check against `commands.ts`'s implementation) -- a divergence introduced in either file would not be caught by CI unless a future test explicitly compares both.
