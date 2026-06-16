// Procedural item-icon registry + asset drop-in resolver (pure, no Pixi). Items
// no longer render a single generic glyph: every base component has a distinct
// emblem signalling its stat archetype, and every completed item composes the
// two emblems of its recipe pair into one icon (so it reads as "built from X+Y").
//
// This module is the PURE side — emblem ids, the component→emblem map, and
// composition resolution (which two emblems + which rarity tint a completed item
// is drawn from). The actual Pixi drawing lives in itemIconDraw.ts; keeping them
// split makes resolution unit-testable without a renderer. It mirrors sprites.ts
// for the optional public/items/<id>.png drop-in slot.
import type { GameData, ItemDataDef } from "@autobattler/data";

// ─── Component emblems ───────────────────────────────────────────────────────
// One emblem per base component, chosen from its stat bundle's archetype.

export type ItemEmblem =
  | "blade"   // iron_sword      — attack damage
  | "vest"    // chain_vest      — armor
  | "crystal" // mana_crystal    — mana + ability power
  | "bow"     // recurve_bow     — attack speed
  | "cloak"   // negatron_cloak  — magic resist
  | "belt"    // giants_belt     — health
  | "rod"     // sorcerer_rod    — ability power
  | "glove"   // sparring_gloves — attack damage + attack speed
  | "flask";  // tear_flask      — mana + health

/**
 * Base-component id → emblem. The 9 stat-only components map one-to-one; the
 * archetype is derived from the dominant stat each component grants (see the
 * comments above). Completeness is test-enforced (every component resolves, no
 * generic-glyph fallback).
 */
export const COMPONENT_EMBLEM: Record<string, ItemEmblem> = {
  iron_sword: "blade",
  chain_vest: "vest",
  mana_crystal: "crystal",
  recurve_bow: "bow",
  negatron_cloak: "cloak",
  giants_belt: "belt",
  sorcerer_rod: "rod",
  sparring_gloves: "glove",
  tear_flask: "flask",
};

/** A component icon (raw/unframed, neutral-tinted). */
export interface ComponentIcon {
  kind: "component";
  id: string;
  emblem: ItemEmblem;
}

/**
 * A completed icon, composed from its two recipe components' emblems. The two
 * emblems are drawn together inside a subtle frame; `rarity` drives the frame /
 * shine tint so the rarity reads consistently with the loot orbs.
 */
export interface CompletedIcon {
  kind: "completed";
  id: string;
  emblems: [ItemEmblem, ItemEmblem];
  /** Source component ids (recipe pair), for legibility / tooltips. */
  components: [string, string];
}

export type ItemIcon = ComponentIcon | CompletedIcon;

/**
 * Resolve an item id to its icon spec — a single emblem for a base component, or
 * the two recipe emblems for a completed item. Returns null for an unknown id or
 * a component with no emblem mapping (the renderer then falls back to the generic
 * glyph; the tests assert this never happens for any real item).
 */
export function itemIcon(itemId: string, data: GameData): ItemIcon | null {
  // A radiant variant has no recipe of its own; render its base item's icon.
  if (itemId.startsWith("radiant_")) {
    const baseIcon = itemIcon(itemId.slice("radiant_".length), data);
    return baseIcon ? { ...baseIcon, id: itemId } : null;
  }

  const def: ItemDataDef | undefined = data.items.find((i) => i.id === itemId);
  if (!def) return null;

  if (def.recipe) {
    const [aId, bId] = def.recipe;
    const a = COMPONENT_EMBLEM[aId];
    const b = COMPONENT_EMBLEM[bId];
    if (!a || !b) return null;
    return { kind: "completed", id: def.id, emblems: [a, b], components: [aId, bId] };
  }

  const emblem = COMPONENT_EMBLEM[def.id];
  if (!emblem) return null;
  return { kind: "component", id: def.id, emblem };
}

// ─── Asset drop-in slot (mirrors sprites.ts) ─────────────────────────────────
// Drop a PNG at public/items/<itemId>.png and the icon renders it instead of the
// procedural emblem; absent → procedural fallback, no-op clean.

export const ITEM_ART_BASE = "/items";

/** `items/<id>.png` lookup path (Vite serves public/ at the site root). */
export function itemArtPath(itemId: string, base = ITEM_ART_BASE): string {
  return `${base}/${itemId}.png`;
}

/**
 * Pure art resolver: returns the texture the lookup holds for this item, or null
 * (→ caller draws the procedural emblem). Generic over the texture type so it is
 * testable without Pixi. This is the exists/fallback branch the tests exercise.
 */
export function resolveItemTexture<T>(
  itemId: string,
  lookup: (path: string) => T | null,
  base = ITEM_ART_BASE
): T | null {
  return lookup(itemArtPath(itemId, base));
}
