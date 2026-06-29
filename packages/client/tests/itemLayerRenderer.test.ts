import { describe, it, expect } from "vitest";
import { assetStackFor } from "@autobattler/data/asset-manifest";
import { layerPathToUrl, ITEM_LAYERS_PUBLIC } from "../src/itemLayerUrl.js";

// `drawLayeredItemIconById` is a thin delegate over `assetStackFor` (returns
// false on a miss, else composites the resolved stack); these assertions cover
// the resolution it relies on plus the pure path→URL helper. The renderer's
// centering/same-size contract (anchor 0.5, width = height = size, position =
// (cx, cy)) is a fixed invariant asserted on the source below.

describe("layerPathToUrl", () => {
  it("prepends the served root and encodes each segment (layers path)", () => {
    expect(layerPathToUrl("layers/bg_glow.png")).toBe("/item-layers/layers/bg_glow.png");
    expect(ITEM_LAYERS_PUBLIC).toBe("/item-layers");
  });

  it('encodes the space in a "tier 2/<id>.png" path', () => {
    expect(layerPathToUrl("tier 2/iron_sword__chain_vest.png")).toBe(
      "/item-layers/tier%202/iron_sword__chain_vest.png"
    );
  });

  it("encodes a consumables path", () => {
    expect(layerPathToUrl("consumables/item_remover.png")).toBe(
      "/item-layers/consumables/item_remover.png"
    );
  });

  it("honors a base override", () => {
    expect(layerPathToUrl("layers/bg_glow.png", "/x")).toBe("/x/layers/bg_glow.png");
  });
});

describe("assetStackFor (the by-id renderer's source of truth)", () => {
  it("returns null for an unknown id (renderer would return false → fallback)", () => {
    expect(assetStackFor("not_a_real_item")).toBeNull();
  });

  it("component → 4 layers ending in frame_component", () => {
    const stack = assetStackFor("iron_sword");
    expect(stack).toEqual([
      "layers/bg_glow.png",
      "layers/emblem_square.png",
      "tier 1/iron_sword.png",
      "layers/frame_component.png",
    ]);
    expect(stack).toHaveLength(4);
    expect(stack!.at(-1)).toBe("layers/frame_component.png");
    expect(stack).toContain("layers/emblem_square.png");
  });

  it("completed → 4 layers ending in frame_completed", () => {
    const stack = assetStackFor("iron_sword__chain_vest");
    expect(stack).toEqual([
      "layers/bg_glow.png",
      "layers/emblem_square.png",
      "tier 2/iron_sword__chain_vest.png",
      "layers/frame_completed.png",
    ]);
    expect(stack).toHaveLength(4);
    expect(stack!.at(-1)).toBe("layers/frame_completed.png");
  });

  it("artifact → 4 layers ending in frame_artifact", () => {
    const stack = assetStackFor("warblade");
    expect(stack).toHaveLength(4);
    expect(stack!.at(-1)).toBe("layers/frame_artifact.png");
    expect(stack![0]).toBe("layers/bg_glow.png");
    expect(stack![1]).toBe("layers/emblem_square.png");
    expect(stack![2]).toBe("tier 3/warblade.png");
  });

  it("mythical → 4 layers ending in frame_mythical with a tier 5 glyph", () => {
    const stack = assetStackFor("eclipse_crown");
    expect(stack).toHaveLength(4);
    expect(stack!.at(-1)).toBe("layers/frame_mythical.png");
    expect(stack![2]).toBe("tier 5/eclipse_crown.png");
  });

  it("radiant → 4 layers ending in frame_radiant, reusing the source tier-2 glyph", () => {
    const stack = assetStackFor("radiant_iron_sword__chain_vest");
    expect(stack).toEqual([
      "layers/bg_glow.png",
      "layers/emblem_square.png",
      "tier 2/iron_sword__chain_vest.png", // source glyph, no unique radiant glyph
      "layers/frame_radiant.png",
    ]);
    expect(stack!.at(-1)).toBe("layers/frame_radiant.png");
  });

  it("consumable → 2 layers (bg_plain + glyph), NO emblem and NO frame", () => {
    const stack = assetStackFor("item_remover");
    expect(stack).toEqual(["layers/bg_plain.png", "consumables/item_remover.png"]);
    expect(stack).toHaveLength(2);
    expect(stack).not.toContain("layers/emblem_square.png");
    expect(stack!.some((p) => p.startsWith("layers/frame_"))).toBe(false);
    expect(stack!.some((p) => p === "layers/bg_glow.png")).toBe(false);
  });
});

describe("the six sample ids resolve correctly (renderer fed centered/same-size)", () => {
  const SAMPLES = {
    component: "iron_sword",
    completed: "iron_sword__chain_vest",
    artifact: "warblade",
    mythical: "eclipse_crown",
    radiant: "radiant_iron_sword__chain_vest",
    consumable: "item_remover",
  } as const;

  it("each item stack carries emblem_square + the correct frame; the consumable carries neither", () => {
    for (const [kind, id] of Object.entries(SAMPLES)) {
      const stack = assetStackFor(id);
      expect(stack, `${kind} (${id}) must resolve to a stack`).not.toBeNull();
      if (kind === "consumable") {
        expect(stack).toHaveLength(2);
        expect(stack).not.toContain("layers/emblem_square.png");
        expect(stack!.some((p) => p.startsWith("layers/frame_"))).toBe(false);
      } else {
        expect(stack).toHaveLength(4);
        expect(stack, `${kind} must include emblem_square`).toContain("layers/emblem_square.png");
        const frame = stack!.at(-1)!;
        expect(frame.startsWith("layers/frame_"), `${kind} must end in a frame`).toBe(true);
      }
    }
  });

  it("renderer composites centered + same-size (anchor 0.5, width/height = size) — source contract", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("../src/itemLayerRenderer.ts", import.meta.url), "utf8")
    );
    expect(src).toContain("sprite.anchor.set(0.5)");
    expect(src).toContain("sprite.width = size");
    expect(src).toContain("sprite.height = size");
    expect(src).toContain("sprite.position.set(cx, cy)");
  });
});
