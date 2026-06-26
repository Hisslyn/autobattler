# Sell-Gold Floater Investigation

**Date:** 2026-06-27
**Status:** Diagnosis only — no fix applied. Instrumentation was temporary and removed; tree clean, tests green (714 pass / 1 skip), typecheck clean.

## Problem

Selling a unit during the planning phase is supposed to spawn a "+X" gold floater that appears over / flies to the shop-gold medallion. Despite multiple fix attempts the floater never visibly appears, for both sell paths (tap-sell and drag-to-sell).

## Method

All findings below were **observed at runtime** by driving the real `MatchScene` methods (`spawnSellPop`, `shopToggleRect`, `onSellZoneClick`, `onDragEnd`) and a real `LocalDriver` under a recording Pixi mock. Only the final visual-occlusion judgment is **reasoned-from-code/geometry** (not directly renderable headless) and is marked as such.

Primary file: `packages/client/src/scenes/match.ts`. Supporting: `torchMeter.ts`, `benchLayout.ts`, `theme.ts`.

## Findings

### 1. Is the floater-spawn function invoked on each sell path?
Yes — on **both** paths, exactly once each, with a real sold unit.
- Tap-sell (`onSellZoneClick`) → `spawnSellPop` called 1×, added 1 node to `sellPopLayer`.
- Drag-to-sell (`onDragEnd` → `inSellZone` true at drop point → SELL ok) → `spawnSellPop` called 1×, added 1 node.
- Both correctly guard on `result.ok`.

Spawn is **not** the missing link.

### 2. Computed spawn coordinates + anchor source
Anchor = `shopToggleRect()` (the gold/shop "money-sack" medallion slot). x = rect center, y = rect top, node placed at `y − 6`.
- Landscape: rect `{x:1143.88, y:463.44, w:124.12, h:124.12}` → spawn `(1205.94, 457.44)` on a 1280×592 design.
- Portrait: rect `{x:339.12, y:508.24, w:41.76, h:41.76}` → spawn `(360, 502.24)` on 390×844.

Both well within design bounds. Anchor is always the bottom-corner medallion — **not** the sold unit, **not** the pointer position.

### 3. Display container + parent + transform
- Floater node parent = `sellPopLayer`.
- `sellPopLayer` parent = `this.container` (scene root).
- Chain: `sellPopLayer (z=880) → container (z=0, sortableChildren=true) → app.stage` (no transform; canvas is CSS-scaled, not Pixi-scaled).
- Container transform = identity (pos 0,0; scale 1,1; rotation 0; pivot 0,0).

**NOT under the board-group container.** `boardGroup` is a separate sibling child of the same root (`sellPopUnderBoardGroup = false`). No inherited transform distorts it.

### 4. Medallion on-screen position + bounds
- Landscape: bounds `{x:1143.88, y:463.44, w:124.12, h:124.12}` → spans x 1143.88–1268, y 463.44–587.56 (**bottom-right corner** of the 1280×592 canvas). Anchor global `(1205.94, 463.44)`.
- Portrait: bounds `{x:339.12, y:508.24, w:41.76, h:41.76}`, anchor `(360, 508.24)`.

The floater spawns directly over this medallion.

### 5. Floater zIndex vs board group / HUD
- `sellPopLayer.zIndex = 880`
- `boardGroup = 0`, `hudLayer = 5`, `toastLayer = 6`, shop panel/backdrop = `871`/`870`, drag sprite = `999`.
- Root `sortableChildren = true`; children added ascending with `sellPopLayer` LAST (`sellPopIsLastChild = true`).

The floater is the **top-most non-drag overlay** — **not** occluded by the board group or any HUD/shop layer in z-order.

### 6. Reduced-motion / early-return guard
Single guard at the top of `spawnSellPop`:
```
if (this.opts.settings.get().reducedMotion) return;
```
Default `reducedMotion = false`, so it does **not** fire normally (`spawnedDespiteGuard = true`). It WOULD silently suppress the floater on both paths for any user who has enabled Reduced Motion in Settings. No other early-return suppresses it.

## Single most likely break point

**Not a logic break** — the floater spawns and renders correctly on a top-most layer. The cause is the **spawn anchor + motion budget**:

- It is placed only `y − 6` (6px) above the gold/shop medallion, which sits in the extreme **bottom-right** screen corner (landscape, the primary orientation).
- It rises only ~36px total over a brief 720ms life (with a 140ms hold).
- It uses the same gold-on-dark palette as the medallion beneath it.

So the "+N" is visually swallowed by / co-located with the corner medallion and reads as "never appears." *(This final visual-occlusion judgment is reasoned-from-code/geometry; Findings 1–6 are observed-at-runtime.)*

**Secondary contributor:** if the user has enabled Reduced Motion (Finding 6), the floater is suppressed outright.

## Suggested direction (not yet implemented)

A fix should target presentation, not the spawn logic: increase travel distance / lifetime, offset the spawn clearly off the medallion (e.g. upward into open space), and/or raise contrast against the medallion — rather than re-touching the call sites, which already fire correctly.
