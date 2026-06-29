import { gameData, itemKind, recipeResult, type ItemKind } from "./loader.js";

/**
 * Render-asset manifest: maps every item id and consumable id to its full
 * back-to-front render layer stack (an ordered list of asset paths).
 *
 * The stacks are DERIVED from the live item catalog (gameData.items + the 3
 * consumables) and the layering rules below, so the manifest stays in sync with
 * the catalog instead of duplicating a static table. Radiant variants reuse
 * their source tier-2 item's glyph; consumables use a plain background.
 *
 * Pure data only (no I/O). Paths are RELATIVE TO `ASSET_BASE_DIR`; a consumer
 * resolves an absolute path by joining the base dir with each layer.
 */

/**
 * The art source-of-truth folder, relative to the repo root. Every path in a
 * layer stack is relative to this directory. Consumers resolve absolutes by
 * joining (e.g. `path.join(repoRoot, ASSET_BASE_DIR, layer)`).
 *
 * Subfolders: "tier 1", "tier 2", "tier 3", "tier 5", "consumables", "layers"
 * (note the spaces). There is no "tier 4" folder — radiant (tier-4) items have
 * no unique glyph and reuse their source tier-2 item's glyph.
 */
export const ASSET_BASE_DIR = "placeholder for the future ideas/items";

/** Shared layer asset paths (relative to ASSET_BASE_DIR). */
const LAYER = {
  bgGlow: "layers/bg_glow.png",
  bgPlain: "layers/bg_plain.png",
  emblemSquare: "layers/emblem_square.png",
} as const;

/** Tier-frame layer paths keyed by the visual frame bucket. */
const FRAME = {
  component: "layers/frame_component.png",
  completed: "layers/frame_completed.png",
  artifact: "layers/frame_artifact.png",
  mythical: "layers/frame_mythical.png",
  radiant: "layers/frame_radiant.png",
} as const;

/** Glyph subfolder for each glyph-bearing tier. */
const GLYPH_DIR = {
  component: "tier 1",
  completed: "tier 2",
  artifact: "tier 3",
  mythical: "tier 5",
  consumable: "consumables",
} as const;

/** The radiant id prefix (mirrors loader.radiantItemId). */
const RADIANT_PREFIX = "radiant_";

/** Glyph path for a glyph-bearing item id in a known tier subfolder. */
function glyphPath(dir: string, id: string): string {
  return `${dir}/${id}.png`;
}

/**
 * The ordered (back-to-front) render layer stack for a single item or
 * consumable id, or null if the id is not in the catalog.
 *
 * Layering rules:
 *  - component / completed / artifact / mythical:
 *      bg_glow → emblem_square → <glyph> → <tier frame>
 *  - radiant (tier 4): no unique glyph — reuses the SOURCE tier-2 item's glyph
 *      bg_glow → emblem_square → <source tier-2 glyph> → frame_radiant
 *  - consumable: plain background, no emblem, no frame
 *      bg_plain → <glyph>
 */
export function assetStackFor(id: string): string[] | null {
  const item = gameData.items.find((i) => i.id === id);
  if (!item) return null;
  const kind = itemKind(item);

  // Radiant (tier 4): a `radiant_<completedId>` variant (synthesized at load as
  // a `completed`-kind item). Strip the prefix to recover the source tier-2 item
  // whose glyph it reuses — the radiant itself has no glyph file. The
  // `radiant_enhancer` CONSUMABLE shares the prefix but is excluded here by
  // resolving its source as a completed item (the consumable does not).
  if (id.startsWith(RADIANT_PREFIX)) {
    const baseId = id.slice(RADIANT_PREFIX.length);
    const base = gameData.items.find((i) => i.id === baseId);
    if (base && itemKind(base) === "completed") {
      return [
        LAYER.bgGlow,
        LAYER.emblemSquare,
        glyphPath(GLYPH_DIR.completed, baseId),
        FRAME.radiant,
      ];
    }
    // Not a radiant variant (e.g. the radiant_enhancer consumable) — fall
    // through to the kind-based resolution below.
  }

  if (kind === "consumable") {
    return [LAYER.bgPlain, glyphPath(GLYPH_DIR.consumable, id)];
  }

  if (kind === "component") {
    return [LAYER.bgGlow, LAYER.emblemSquare, glyphPath(GLYPH_DIR.component, id), FRAME.component];
  }
  if (kind === "completed") {
    return [LAYER.bgGlow, LAYER.emblemSquare, glyphPath(GLYPH_DIR.completed, id), FRAME.completed];
  }
  if (kind === "artifact") {
    return [LAYER.bgGlow, LAYER.emblemSquare, glyphPath(GLYPH_DIR.artifact, id), FRAME.artifact];
  }
  // mythical
  return [LAYER.bgGlow, LAYER.emblemSquare, glyphPath(GLYPH_DIR.mythical, id), FRAME.mythical];
}

/**
 * The complete id → layer-stack manifest. Covers every catalog id:
 * 9 components + 36 completed + 36 radiants + 6 artifacts + 3 mythicals
 * (= 90 item entries) plus the 3 consumables (93 total).
 *
 * Built once from the live catalog. `recipeResult` is imported (and referenced
 * in the self-check below) so the manifest is tied to the same recipe table the
 * rest of the catalog uses — completed-item ids ARE their recipe-pair glyph ids.
 */
export const ASSET_MANIFEST: Readonly<Record<string, string[]>> = (() => {
  const out: Record<string, string[]> = {};
  for (const item of gameData.items) {
    const stack = assetStackFor(item.id);
    if (stack) out[item.id] = stack;
  }
  return out;
})();

/**
 * Pure compile-time-friendly self-check: asserts the manifest covers every
 * catalog id with the verified counts and that every completed-item glyph id is
 * its own recipe result (the on-disk tier-2 filename equals the completed id).
 * Returns the per-kind counts; throws on any gap so a stale catalog surfaces
 * the moment this module is imported. No I/O.
 */
export function verifyAssetManifest(): Record<ItemKind | "radiant", number> {
  const counts: Record<ItemKind | "radiant", number> = {
    component: 0,
    completed: 0,
    artifact: 0,
    mythical: 0,
    consumable: 0,
    radiant: 0,
  };
  for (const item of gameData.items) {
    if (!ASSET_MANIFEST[item.id]) {
      throw new Error(`asset manifest missing stack for "${item.id}"`);
    }
    const kind = itemKind(item);
    // A `radiant_<completedId>` variant (kind "completed") counts as radiant;
    // the `radiant_enhancer` consumable shares the prefix but is a consumable.
    if (item.id.startsWith(RADIANT_PREFIX) && kind === "completed") {
      counts.radiant++;
      continue;
    }
    counts[kind]++;
    // Completed-item glyph filenames equal the recipe-pair completed id.
    if (kind === "completed" && item.recipe) {
      const [a, b] = item.recipe;
      if (recipeResult(a, b) !== item.id) {
        throw new Error(`asset manifest recipe mismatch for "${item.id}"`);
      }
    }
  }
  const expected: Record<ItemKind | "radiant", number> = {
    component: 9,
    completed: 36,
    radiant: 36,
    artifact: 6,
    mythical: 3,
    consumable: 3,
  };
  for (const [kind, n] of Object.entries(expected)) {
    const got = counts[kind as ItemKind | "radiant"];
    if (got !== n) {
      throw new Error(`asset manifest count mismatch: ${kind} expected ${n}, got ${got}`);
    }
  }
  return counts;
}

// Eagerly self-verify on import: a catalog that drifts (or a missing derivation)
// fails fast rather than silently rendering an incomplete stack. Pure (throws
// only), no I/O.
verifyAssetManifest();
