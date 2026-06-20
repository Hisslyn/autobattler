# Path & purpose

`packages/client/PORTRAIT_LAYOUT_SPEC.md` -- a detailed implementation spec written to drive (and originally hand to a "Coder" agent for) the height-driven portrait match layout rework. Describes the problem, the exact budget algorithm for computing region heights/positions from the usable viewport height, signature changes to `layout.ts`, expected test breakage/fixes, new tests to add, and an implementation checklist.

# Responsibility

Documents the design rationale and the precise algorithm behind `packages/client/src/layout.ts`'s `portraitRegions(designH)` function and the `portraitDesignH` field on `MatchLayout`. This spec has been IMPLEMENTED -- confirmed present in the current `layout.ts` (`portraitRegions` exported, `portraitDesignH` field present, `portraitLayout` calls `portraitRegions(dH)` and sets `portraitDesignH: dH`). Treat this file as the authoritative rationale/derivation behind that code, not a pending TODO.

# Exports

None -- markdown specification document, not code.

# Key behavior

N/A (static document), but it fully specifies a real, now-implemented algorithm worth understanding if touching `layout.ts`'s portrait path:
- **Supported floor**: 360x640 CSS px viewport (the smallest common in-use Android size), usable height ~606px after a 34px Android nav-bar safe-area allowance.
- **Core change**: in portrait mode, design height `dH` is no longer a fixed 844 -- it equals the usable viewport height (`viewportH - safe.top - safe.bottom`), and `scale` is width-only (`usableW / 390`), so height fills the screen exactly rather than uniformly scaling down.
- **Region budget algorithm**: fixed/flexible region height table (statusRow, opponentRail, board, traitRail, hud, bench, shop, readyButton, itemBar) each with a hard minimum; board height scales proportionally with available height (clamp(280, round(availableH*0.427), 360)); a flexible 8-gap pool (gap floor 3-4px, design-height gap 8px) absorbs slack; trait rail gets a target fraction of remaining space then clamps to [32,44]; any leftover "surplus" at taller viewports is distributed back into regions in a fixed priority order (board -> shop -> readyButton frozen at 44 -> itemBar -> hud -> bench -> traitRail -> gap) so the original 844-design-height hardcoded values are exactly restored when usableH equals 844.
- **Backward compatibility requirement**: at usableH = 844 the new dynamic algorithm must reproduce the prior hardcoded region positions (within ~1px rounding) -- this is the spec's central correctness constraint, verified by worked arithmetic examples for usableH = 844, 736, and 606.
- Documents the exact vertical stack order and cumulative y-position formulas (statusRow -> opponentRail -> board -> traitRail -> hud -> bench -> shop -> readyButton -> itemBar), and the derived sellControl/bench x-split math (unchanged from before: margin 8, sellW 44, gap 6).
- Section 5 specifies the exact signature additions: `portraitRegions(designH: number): MatchRegions` (new pure exported helper) and `MatchLayout.portraitDesignH?: number` (new optional field) -- both confirmed present in the live layout.ts.
- Sections 6-7 catalog which existing layout.test.ts assertions would need loosening (e.g. exact-pixel assertions become "greater-than-or-equal" with -1px rounding tolerance) and which NEW tests to add (non-overlap invariant across multiple heights, stack-fits-within-designH, interactive-region minimums, stack-order invariant, design-height backward-compatibility, and a direct portraitRegions vs resolveLayout equivalence check).
- Section 9 flags a specific risk for match.ts: any code using a hardcoded 844/PORTRAIT_H literal for bottom-of-screen overlay positioning must be migrated to read layout.designH (now dynamic) instead.
- Section 10 is an implementation checklist (add portraitRegions, update portraitLayout, add portraitDesignH, verify surplus restores design values, audit match.ts literals, add tests, run npm test, manual-check on 390x640 and 375x667).

# Invariants & constraints

- This document encodes the EXACT invariants the shipped portraitRegions function must satisfy (Section 8's numbered list) -- useful as a checklist when reviewing or modifying layout.ts's portrait path: board.y=58, board.w=374, board.h in [280,360], readyButton.h>=44, bench/hud.h>=32, shop.h>=64, itemBar.h>=44, no region overlap, no region exceeds designH, bench.x=8/w=324, sellControl.x=338/w=44, and exact reproduction of pre-existing literals at usableH=844.
- Landscape layout is explicitly OUT OF SCOPE -- the spec states "Landscape is untouched" and "zero changes" required there; all changes are confined to portraitLayout/portraitRegions.
- Per CLAUDE.md's client internals section, this exact feature is now described tersely as the height-driven portrait design with width-only scale and the pure portraitRegions budgeting; this spec is the long-form derivation of that one paragraph.

# Depends on

Nothing programmatically -- references `packages/client/src/layout.ts` (the file it specifies), `packages/client/src/benchLayout.ts` (states no changes needed there), `packages/client/src/scenes/match.ts` (flags an audit item: replace PORTRAIT_H/844 literals with this.layout.designH), and `packages/client/tests/layout.test.ts` (the test file whose assertions it predicts will need adjusting/extending).

# Used by

Historical/reference document for anyone modifying portrait match layout; not imported or read by any program. The actual behavior it specifies now lives in and should be verified against `packages/client/src/layout.ts` directly.

# Notes

- The document shows its own derivation work-in-progress in Section 3 (a live arithmetic self-correction) -- this is intentional scratch-work left in the spec showing the author's arithmetic correction live; harmless but stylistically unusual for a finished spec.
- Since the feature is already implemented, an agent should treat any discrepancy between this spec's worked numbers and the live layout.ts/layout.test.ts as the spec being approximate/exploratory and the code+tests as ground truth.
