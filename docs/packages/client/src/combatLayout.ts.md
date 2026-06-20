# Path & purpose

`packages/client/src/combatLayout.ts` -- pure layout constants for the match-scene's z-order stack: two related but distinct numbering systems (the combat overlay's internal zIndex layout, and the whole match scene's 9-layer Pixi/DOM stack).

# Responsibility

Owns the canonical zIndex values for (1) the combat-phase overlay's internal stacking (board tiles vs the "COMBAT · vs X" header vs the resolution modal/controls), and (2) the entire match scene's top-level container stack (board environment through DOM meta overlays), including regression-guard ordering invariants a test enforces. Pure data -- no logic, no Pixi calls.

# Exports

**Section 1 -- combat overlay internal z-order (unchanged historically):**
- `const Z_COMBAT_TILE = 0` -- board panel + hex tiles + tokens (default insertion-order baseline).
- `const Z_COMBAT_HEADER = 50` -- the "COMBAT · vs X" header text; must sit strictly above `Z_COMBAT_TILE` (regression guard for a "stray text behind the hexes" bug).
- `const Z_RESOLUTION_OVERLAY = 60` -- the resolution overlay's scrim + modal box + title; ranked strictly above `Z_COMBAT_HEADER` so a fast PvE round hitting RESOLUTION before the planning->combat fade finishes still shows the round-result modal cleanly on top, rather than the combat header and resolution title text garbling together visually.
- `const Z_RESOLUTION_CONTROL = 70` -- resolution overlay controls (Continue button + countdown), above the resolution surface.
- `const Z_RESOLUTION_BUTTON = 70` -- the Continue button specifically (same value as `Z_RESOLUTION_CONTROL` -- interactive, sits above the dim scrim).

**Section 2 -- scene-level 9-layer stack (the "design-bible rewrite" stage 1):**
- `const L0_BOARD_ENV = 0` -- board environment/background.
- `const L1_HEX_GRID = 1` -- hex grid + deploy highlights.
- `const L2_UNITS = 2` -- units/nameplates/VFX.
- `const L3_WATERMARK = 3` -- board-anchored center watermark; reserved layer only, currently empty/no-op (no content yet).
- `const L4_FRAME = 4` -- ornate edge frame, 9-slice, non-interactive; reserved layer only, frame art deferred.
- `const L5_HUD = 5` -- in-match HUD chrome: top bar / left rail / right rail / bottom bar / shop / sell zones.
- `const L8_TOAST = 6` -- toasts. NOTE: VALUE is 6, deliberately placed between `L5_HUD` and `L6_INSPECT` despite the name's "8" suffix -- the suffix is the spec's original enumeration label, NOT the stacking value.
- `const L6_INSPECT = 7` -- inspect panel / scout overlay.
- `const L7_DOM_META = 8` -- DOM meta overlays (`#ui-root`, `#match-overlay`); the comment notes this is conceptual only -- real DOM stacking is enforced by `ui/styles.ts`'s CSS z-index, not this Pixi-side constant.
- `const SCENE_LAYER_ORDER: readonly number[]` -- `[L0_BOARD_ENV, L1_HEX_GRID, L2_UNITS, L3_WATERMARK, L4_FRAME, L5_HUD, L8_TOAST, L6_INSPECT, L7_DOM_META]`, i.e. listed in ascending VALUE order (so `L8_TOAST` appears BEFORE `L6_INSPECT`/`L7_DOM_META` in this array despite its higher name-suffix) -- used for pairwise-ordering assertions in tests.
- `const SCENE_LAYER_NAMES: readonly string[]` -- the matching string labels 1:1 with `SCENE_LAYER_ORDER`, for readable test failure messages.

# Key behavior

Purely declarative -- no functions, no runtime computation. The file's entire "behavior" is the documented mapping from semantic layer name to numeric zIndex, consumed by `scenes/match.ts`'s `buildSceneLayers` which assigns each constant's value directly as a Pixi container's `.zIndex` (1:1, per the section-2 comment: "Each constant's value is BOTH its stack order AND the literal Pixi `.zIndex` applied to the matching scene container"). The match-scene root container has `sortableChildren = true`, so actual visual stacking is driven by these zIndex values, with `addChild` insertion order only as the tiebreak for layers sharing the same zIndex value (explicitly noted: `L2_UNITS`/`L5_HUD`/`L6_INSPECT` may have multiple containers sharing one layer value).

# Invariants & constraints

- **`Z_COMBAT_HEADER` MUST stay strictly greater than `Z_COMBAT_TILE`** -- this is an explicit regression guard against a previously-fixed bug (header text rendering behind the hex tiles); a test checks this pairwise ordering.
- **`Z_RESOLUTION_OVERLAY` MUST stay strictly greater than `Z_COMBAT_HEADER`** -- guards against the resolution modal and the lingering combat header text visually garbling together during a fast PvE-round transition; also regression-guarded by a test.
- Section 1's combat-overlay z-order is explicitly marked UNCHANGED by the later stage-1 region rewrite, "kept exactly as before so the existing regression-guard tests keep passing verbatim" -- any future refactor of the scene-level layer system (section 2) must NOT touch section 1's values without separately verifying/updating those specific regression tests.
- **The `L#_` numeric suffix in each constant's NAME is the spec's original bottom-to-top enumeration label, NOT its stacking VALUE** -- this is called out as critically important inline (an "IMPORTANT" comment block) precisely because `L8_TOAST`'s value (6) is LOWER than `L6_INSPECT`'s value (7) despite the name implying toast should stack above inspect. A reader must always reason from the numeric VALUE, never infer ordering from the `L#` name suffix.
- `SCENE_LAYER_ORDER`/`SCENE_LAYER_NAMES` are deliberately sorted by ascending VALUE (not by name-suffix) so that iterating either array in order directly reflects true bottom-to-top visual stacking -- any test or consumer iterating these arrays gets correct visual order "for free."
- `L3_WATERMARK`/`L4_FRAME` are explicitly reserved/empty layers ("NEW, empty/no-op") -- their presence in the zIndex scheme is forward-looking design-bible scaffolding, not yet populated with real content; a reader should not expect to find anything currently rendering at these layers.
- `L7_DOM_META`'s Pixi-side zIndex value is largely symbolic -- DOM elements (`#ui-root`, `#match-overlay`) composite in a SEPARATE browser layer above the canvas entirely, with their real stacking governed by `ui/styles.ts`'s CSS, not by anything in this file.

# Depends on

Nothing -- pure constants, zero imports.

# Used by

`packages/client/src/scenes/match.ts` (`buildSceneLayers` assigns these values 1:1 to the scene's Pixi containers; the combat-overlay z-order constants are used wherever the combat header/tile/resolution-overlay containers are constructed). A dedicated regression test (referenced inline, likely in `packages/client/tests/`) asserts the `Z_COMBAT_HEADER > Z_COMBAT_TILE` and `Z_RESOLUTION_OVERLAY > Z_COMBAT_HEADER` invariants, and presumably iterates `SCENE_LAYER_ORDER`/`SCENE_LAYER_NAMES` to assert the full 9-layer pairwise ordering holds.

# Notes

- The file's own header comment is unusually long and explicit specifically because the toast-layer naming/value mismatch (`L8_TOAST` having a LOWER value than `L6_INSPECT`) is exactly the kind of subtle inconsistency a future editor could "fix" incorrectly by reordering based on the name suffix alone -- the extensive inline documentation is a deliberate guard against that mistake.
- `Z_RESOLUTION_CONTROL` and `Z_RESOLUTION_BUTTON` share the identical value (70) -- they are not layered relative to each other, only relative to the overlay surface beneath them; if they ever need independent stacking (e.g. a tooltip above the Continue button), a new distinct constant would be needed.
