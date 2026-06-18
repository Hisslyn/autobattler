// Pure layout constants for the match-scene z-order stack.
//
// Two related but distinct concerns live here:
//
// 1. The COMBAT OVERLAY z-order (Z_COMBAT_*, Z_RESOLUTION_*) — fine-grained
//    zIndex values inside the single sortable `combatLayer` container. The
//    combat layer is a single sortable Pixi container; equal-zIndex children
//    keep insertion order, so the header text (added before the hex tiles for
//    code locality) MUST carry a higher zIndex than the tiles or it renders
//    behind the board. UNCHANGED by the stage-1 region rewrite — kept exactly
//    as before so the existing regression-guard tests keep passing verbatim.
//
// 2. The SCENE-LEVEL 9-layer stack (L0_*..L8_*) — the spec's named layers for
//    the whole match scene container tree, bottom to top. These map 1:1 onto
//    the Pixi containers assembled in scenes/match.ts's constructor (see the
//    L#_ constants below for the exact container each layer corresponds to).
//    DOM layers (L7) and the combat-overlay's own internal stack (consumed by
//    L2/L5 as applicable) are documented here for completeness even though
//    DOM and Pixi don't share one real z-index space.
//
//    IMPORTANT — the `L#_` numeric SUFFIX is the spec's ENUMERATION label
//    (bottom-to-top order as originally listed), NOT each constant's
//    stacking VALUE. The spec's toast bullet is authoritative and deviates
//    from a strictly-ascending-by-suffix stack: toast sits ABOVE the HUD
//    (L5) but BELOW the modal layers (L6 inspect, L7 DOM meta). The VALUES
//    below encode that true visual stacking; SCENE_LAYER_ORDER /
//    SCENE_LAYER_NAMES are sorted by VALUE (ascending), so L8_TOAST appears
//    before L6_INSPECT/L7_DOM_META in both arrays even though its name
//    suffix is highest.

// ── 1. Combat overlay internal z-order (UNCHANGED) ────────────────────────────

// Regression guard for the "stray text behind the hexes" bug: keep
// Z_COMBAT_HEADER strictly above Z_COMBAT_TILE.

/** Board panel + hex tiles + tokens (default insertion order, zIndex 0). */
export const Z_COMBAT_TILE = 0;
/** "COMBAT · vs X" header — must sit above the tiles. */
export const Z_COMBAT_HEADER = 50;
/**
 * Resolution overlay surface (scrim + modal box + title). Ranked strictly above
 * Z_COMBAT_HEADER so the resolution screen always covers a combat header — a
 * fast PvE round can hit RESOLUTION before the planning→combat fade finishes, and
 * this guarantees the round-result modal wins instead of the two strings
 * garbling together ("PvE · …Resolution… · Creeps"). Regression-guarded.
 */
export const Z_RESOLUTION_OVERLAY = 60;
/** Resolution overlay controls (Continue button + countdown) — above the surface. */
export const Z_RESOLUTION_CONTROL = 70;
/** Resolution Continue button (interactive, above the dim scrim). */
export const Z_RESOLUTION_BUTTON = 70;

// ── 2. Scene-level 9-layer stack (stage 1 of the design-bible rewrite) ────────
//
// Bottom to top by VALUE (see the IMPORTANT note above re: suffix vs value).
// Each constant's value is BOTH its stack order AND the literal Pixi `.zIndex`
// applied to the matching scene container: the match-scene root container is
// `sortableChildren = true` and `scenes/match.ts`'s `buildSceneLayers` binds
// every layer's `zIndex` to its constant 1:1, so stacking derives from these
// values, not addChild insertion order. Several containers may share one layer
// (L2_UNITS / L5_HUD / L6_INSPECT); equal zIndex falls back to the stable
// insertion order (see `buildSceneLayers`). These also remain assertion
// constants a test checks pairwise.
//
//   L0_BOARD_ENV   — board environment/background (Pixi)
//   L1_HEX_GRID    — hex grid + deploy highlights (Pixi)
//   L2_UNITS       — units/nameplates/VFX (Pixi)
//   L3_WATERMARK   — board-anchored center watermark (Pixi) — NEW, empty/no-op
//   L4_FRAME       — ornate edge frame, 9-slice, non-interactive (Pixi) — NEW, empty/no-op
//   L5_HUD         — in-match HUD chrome: top bar / left rail / right rail /
//                    bottom bar / shop / sell zones (Pixi)
//   L8_TOAST       — toasts: above L5 (HUD), below L6/L7 (modals/DOM meta) —
//                    deviates from suffix order per the spec's toast bullet
//   L6_INSPECT     — inspect panel / scout overlay (Pixi)
//   L7_DOM_META    — DOM meta overlays (#ui-root, #match-overlay) — conceptually
//                    above L6; DOM paints in its own compositing layer above the
//                    canvas element, so real stacking is enforced by DOM order +
//                    CSS z-index (see ui/styles.ts), not by this constant.

export const L0_BOARD_ENV = 0;
export const L1_HEX_GRID  = 1;
export const L2_UNITS     = 2;
/** NEW — board-anchored center watermark. Reserved layer only (no content). */
export const L3_WATERMARK = 3;
/** NEW — ornate edge frame, 9-slice. Reserved layer only (frame art deferred). */
export const L4_FRAME     = 4;
export const L5_HUD       = 5;
/** Toasts: above L5 (HUD), below L6/L7 (modals/DOM meta) — VALUE-ordered
 *  ahead of L6/L7 below even though its name suffix (8) is highest; see the
 *  IMPORTANT note at the top of section 2. */
export const L8_TOAST     = 6;
export const L6_INSPECT   = 7;
/** DOM layer — see ui/styles.ts `#ui-root`/`#match-overlay` z-index for the
 *  real enforcement; this constant only documents the intended order. */
export const L7_DOM_META  = 8;

/** Ordered list of the 9 layer constants by ascending VALUE, for pairwise-ordering assertions. */
export const SCENE_LAYER_ORDER = [
  L0_BOARD_ENV,
  L1_HEX_GRID,
  L2_UNITS,
  L3_WATERMARK,
  L4_FRAME,
  L5_HUD,
  L8_TOAST,
  L6_INSPECT,
  L7_DOM_META,
] as const;

/** Named labels matching SCENE_LAYER_ORDER 1:1 (by ascending VALUE), for readable test failures. */
export const SCENE_LAYER_NAMES = [
  "L0_BOARD_ENV",
  "L1_HEX_GRID",
  "L2_UNITS",
  "L3_WATERMARK",
  "L4_FRAME",
  "L5_HUD",
  "L8_TOAST",
  "L6_INSPECT",
  "L7_DOM_META",
] as const;
