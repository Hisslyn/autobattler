# Path & purpose

`packages/client/src/itemIcon.ts` -- pure (no Pixi) procedural item-icon registry and asset drop-in resolver: maps every base component to a distinct visual "emblem" archetype, composes completed items from their two recipe components' emblems, and resolves the optional `public/items/<id>.png` art override path.

# Responsibility

Owns the RESOLUTION half of the item-icon system (the DRAWING half lives in `itemIconDraw.ts`) -- deciding, for any item id, which emblem(s) represent it (or, for radiant variants, which base item's icon to reuse), and whether a drop-in PNG texture should override the procedural icon. Deliberately split from the Pixi drawing code specifically so resolution logic is unit-testable without a renderer.

# Exports

- `type ItemEmblem = "blade" | "vest" | "crystal" | "bow" | "cloak" | "belt" | "rod" | "glove" | "flask"` -- the 9 emblem archetypes, one per base component, each named/commented with its source component and dominant stat (`blade`=iron_sword/AD, `vest`=chain_vest/armor, `crystal`=mana_crystal/mana+AP, `bow`=recurve_bow/AS, `cloak`=negatron_cloak/MR, `belt`=giants_belt/health, `rod`=sorcerer_rod/AP, `glove`=sparring_gloves/AD+AS, `flask`=tear_flask/mana+health).
- `const COMPONENT_EMBLEM: Record<string, ItemEmblem>` -- the 1:1 mapping of all 9 base component item ids to their emblem. Completeness (every component resolves, no gaps) is test-enforced.
- `interface ComponentIcon { kind: "component"; id: string; emblem: ItemEmblem }` -- icon spec for a loose base component (drawn raw/unframed, neutral-tinted, per the drawing module).
- `interface CompletedIcon { kind: "completed"; id: string; emblems: [ItemEmblem, ItemEmblem]; components: [string, string] }` -- icon spec for a completed item: BOTH its recipe components' emblems (composed together inside a frame by the drawing module), plus the source component ids themselves "for legibility / tooltips."
- `type ItemIcon = ComponentIcon | CompletedIcon` -- the discriminated union every resolved icon spec belongs to.
- `function itemIcon(itemId: string, data: GameData): ItemIcon | null` -- the main resolver. Special-cases radiant variants FIRST (`itemId.startsWith("radiant_")`): strips the prefix, recursively resolves the BASE item's icon, and returns a copy with `id` overwritten to the radiant id (so a radiant item visually reuses its base item's icon spec, since "a radiant variant has no recipe of its own"). Otherwise looks up `itemId` in `data.items`; returns `null` if unknown. If the def has a `recipe` (a completed item), looks up both recipe component ids' emblems via `COMPONENT_EMBLEM` and returns a `CompletedIcon` -- or `null` if either component lacks an emblem mapping (shouldn't normally happen given the completeness guarantee, but defensively checked). If the def has NO recipe (a base component), looks up its OWN emblem and returns a `ComponentIcon`, or `null` if unmapped.
- `const ITEM_ART_BASE = "/items"` -- the base URL path for drop-in item art (mirrors `sprites.ts`'s unit-art convention).
- `function itemArtPath(itemId: string, base = ITEM_ART_BASE): string` -- builds the lookup path `${base}/${itemId}.png` (Vite serves `public/` at the site root, so this resolves to `public/items/<itemId>.png` on disk).
- `function resolveItemTexture<T>(itemId: string, lookup: (path:string)=>T|null, base = ITEM_ART_BASE): T | null` -- pure, generic-over-texture-type art resolver: calls `lookup(itemArtPath(itemId, base))` and returns whatever the lookup function returns (null = no art found, caller draws the procedural emblem instead). Generic specifically so this is testable with a fake `lookup` function, without any real Pixi texture cache.

# Key behavior

- The radiant-variant special case is RECURSIVE but only ever recurses exactly once in practice (a radiant id strips to a non-radiant base id, which then takes the normal lookup path) -- there's no expectation of radiant-of-radiant chains, the recursion is just a clean way to reuse the exact same resolution logic for the base id before relabeling the result.
- `itemIcon` never falls back to a generic glyph itself -- it either resolves a real `ItemIcon` or returns `null`; per the doc comment, "the renderer then falls back to the generic glyph; the tests assert this never happens for any real item" -- meaning the `null` path exists structurally (for safety/unknown ids) but is asserted UNREACHABLE for any item actually defined in `items.json`, given the completeness of `COMPONENT_EMBLEM` and the recipe-resolution logic.
- `resolveItemTexture`'s generic `lookup` parameter is the seam that lets this pure module stay decoupled from any actual Pixi texture cache -- the real caller (`requestItemArt`, presumably in `itemIconDraw.ts` or a sibling) supplies a lookup backed by a real cache/`PIXI.Assets`, while tests supply a trivial in-memory map.

# Invariants & constraints

- **`COMPONENT_EMBLEM` MUST stay complete over all 9 base components** -- test-enforced; adding a 10th base component to `items.json` without adding its emblem mapping here would break that test and (per the design intent) leave that component with no real icon.
- **Every completed item's icon composition depends entirely on its `recipe` pair both resolving to known component emblems** -- if `items.json` ever introduces a completed item whose `recipe` references a component id not in `COMPONENT_EMBLEM` (e.g. a future new base component added to items.json but not yet wired into this emblem map), `itemIcon` for that completed item silently returns `null` rather than throwing -- a reader debugging "this item shows the generic glyph" bug should check `COMPONENT_EMBLEM` completeness first.
- The `radiant_` prefix convention is a NAMING contract this file assumes holds for all radiant item ids -- if radiant items are ever named differently (not literally `radiant_<baseId>`), this special-case branch would silently fail to detect them and fall through to the normal (likely failing, since a radiant item probably also lacks a `data.items` entry of its own under that assumption) lookup path.
- This file is PURE -- no Pixi imports, no I/O beyond the generic `lookup` callback parameter (which itself is supplied by the caller, keeping this module testable in isolation).

# Depends on

`@autobattler/data` (types `GameData`, `ItemDataDef`).

# Used by

`packages/client/src/itemIconDraw.ts` (the Pixi drawing half: calls `itemIcon` to get the resolution, then either draws the procedural emblem(s) or, if `resolveItemTexture` finds a drop-in PNG, renders that instead). Any UI surface drawing an item icon -- inventory bar chips, loot-orb reveal contents, equipped-item dots/icons on `UnitToken`s, the inspect panel's items row and item-detail modal -- ultimately routes through `itemIconDraw.ts`'s consumption of this module.

# Notes

- The file explicitly states it "mirrors sprites.ts for the optional `public/items/<id>.png` drop-in slot" -- the unit-art and item-art drop-in systems are deliberately parallel in design (`ITEM_ART_BASE`/`itemArtPath`/`resolveItemTexture` here mirror whatever `sprites.ts` defines for units), so a reader familiar with one slot system can assume the other behaves identically.
- Per `CLAUDE.md`'s item-art drop-in note, the on-disk filename convention for a COMPLETED item's PNG override is the underscore-joined component-pair name (e.g. `iron_sword__sorcerer_rod.png`). Verified against `items.json`: completed-item ids are ALREADY stored in exactly that underscore-joined form (e.g. `"id": "iron_sword__chain_vest"` with `"recipe": ["iron_sword","chain_vest"]`) -- so `itemArtPath(itemId)` using the item's own `id` directly is correct as-is, with no separate translation step needed anywhere in the pipeline.
