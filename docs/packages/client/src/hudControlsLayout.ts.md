# Path & purpose

`packages/client/src/hudControlsLayout.ts` -- pure geometry for the landscape HUD control cluster (reroll + buy-xp buttons), extracted from `scenes/match.ts` specifically so it can be unit-tested against the layout's HUD region bounds.

# Responsibility

Owns the exact width/position split of the two HUD action buttons (reroll, buy-xp) within the landscape HUD region, guaranteeing both buttons fit fully inside the region regardless of the region's actual width. Fixes a specific historical bug (a fixed 106px-per-button layout that overflowed the region by 58px after a region-bounds rework).

# Exports

- `interface HudControlsGeom { reroll: Rect; buyXp: Rect }` -- the two button rects.
- `const HUD_BTN_Y_OFFSET = 26` -- vertical offset of the button sub-row from the top of the HUD region (the button row sits below the economy-display sub-row, per `CLAUDE.md`'s "landscape HUD splits into two sub-rows").
- `const HUD_BTN_H = 20` -- fixed button height.
- `const HUD_BTN_GAP = 6` -- fixed horizontal gap between the two buttons.
- `function landscapeHudControls(hud: Rect): HudControlsGeom` -- computes `btnW = floor((hud.w - HUD_BTN_GAP) / 2)` (splits the region's width minus one gap evenly between the two buttons) and `btnY = hud.y + HUD_BTN_Y_OFFSET`; returns `reroll` at `(hud.x, btnY)` and `buyXp` immediately to its right at `(hud.x + btnW + HUD_BTN_GAP, btnY)`, both `btnW` wide and `HUD_BTN_H` tall.

# Key behavior

Pure arithmetic, no Pixi, no game logic, no internal state. Given any `hud: Rect`, always derives button widths PROPORTIONAL to the region's actual width (rather than a fixed pixel constant) -- this is the core fix: as the HUD region's width changes (e.g. from a future layout rework), the two buttons automatically resize to still fit exactly within `hud.w`, with the fixed `HUD_BTN_GAP` between them and zero overflow past either edge.

# Invariants & constraints

- **Both buttons must always stay fully inside the `hud` region's horizontal bounds** -- this is the entire reason this function exists (the historical "BUG 2": old fixed 106px-each layout ran 58px past the right-column region edge after the Phase-2 region rework shrank the HUD region). Any future change to this function must preserve `reroll.x + reroll.w <= hud.x + hud.w` and likewise for `buyXp` (by construction, since `buyXp`'s right edge is exactly `hud.x + 2*btnW + HUD_BTN_GAP = hud.x + (hud.w - HUD_BTN_GAP) + HUD_BTN_GAP = hud.x + hud.w` when `hud.w - HUD_BTN_GAP` is even, with a 1px slack when it's odd due to the `floor`).
- `HUD_BTN_Y_OFFSET` assumes the HUD region has at least two conceptual sub-rows (economy display above, buttons below) -- if `hud.h` is ever shrunk below `HUD_BTN_Y_OFFSET + HUD_BTN_H`, the button row would render partially or fully outside the region's bottom edge; this function does NOT clamp/guard against that, it's a caller responsibility to ensure the region is tall enough.
- This module is LANDSCAPE-SPECIFIC (`landscapeHudControls` -- the name says so explicitly); portrait's HUD button layout is handled elsewhere (likely inline in `scenes/match.ts` or via a different helper, not documented in this file).

# Depends on

`./layout.js` (type-only: `Rect` -- the generic `{x,y,w,h}` rect shape shared across the client's layout system).

# Used by

`packages/client/src/scenes/match.ts` (landscape HUD rendering: positions the reroll and buy-xp buttons via this function's output rects). A dedicated layout/geometry test suite (referenced in the file's header comment: "so it can be unit-tested against the layout's hud region bounds") asserts both buttons stay within the HUD region across a range of region widths -- the regression guard for BUG 2.

# Notes

- This file was explicitly "Extracted from scenes/match.ts" -- it used to be inline logic there; the extraction was motivated purely by testability, not by any architectural layering requirement beyond what other `*Layout.ts` pure-geometry files (`benchLayout.ts`, `combatLayout.ts`) already establish as the pattern for this codebase (pure geometry functions kept separate from the Pixi rendering code that consumes them).
- The function name's "landscape" prefix combined with the generic `HudControlsGeom`/`Rect` types suggests a portrait equivalent (`portraitHudControls` or similar) could be added following the same pattern if portrait's button layout ever needs the same testable extraction treatment -- no such sibling exists yet in this file.
