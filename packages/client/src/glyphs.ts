// Procedural class/origin glyphs drawn with PIXI.Graphics — Tabler's webfont
// (<i> tags) cannot render in canvas/WebGL, so each trait maps to a small vector
// shape we draw directly with the Pixi v8 path API. Every origin and class in
// traits.json has an entry in TRAIT_GLYPH (test-enforced); a unit renders its
// primary class glyph (origins are mapped too, for tooltips/future use).
import type { Graphics } from "pixi.js";

export type GlyphKind =
  | "sword" | "swords" | "dagger" | "axe" | "bow" | "shield" | "crosshair"
  | "flame" | "bolt" | "droplet" | "snowflake" | "leaf" | "claw"
  | "star" | "sun" | "moon" | "spark" | "skull" | "eye" | "orb" | "heart"
  // non-trait HUD icons (stage 2): not in TRAIT_GLYPH
  | "coin" | "refresh"
  // non-trait item icons (phase 10b): not in TRAIT_GLYPH
  | "gem" | "component" | "bag";

/** Every origin + class trait id → glyph kind. Completeness is test-enforced. */
export const TRAIT_GLYPH: Record<string, GlyphKind> = {
  // origins
  holy: "sun",
  shadow: "moon",
  arcane: "spark",
  frost: "snowflake",
  forest: "leaf",
  beast: "claw",
  celestial: "star",
  dragon: "flame",
  storm: "bolt",
  undead: "skull",
  elemental: "droplet",
  abyssal: "eye",
  // classes
  knight: "shield",
  ranger: "bow",
  sorcerer: "orb",
  assassin: "dagger",
  warden: "heart",
  berserker: "axe",
  mystic: "spark",
  gunner: "crosshair",
  duelist: "sword",
  summoner: "swords",
};

/** Resolve the glyph kind for a unit given its trait ids (prefers a class). */
export function glyphForTraits(
  traits: readonly string[],
  classes?: readonly string[]
): GlyphKind {
  const preferred = classes?.[0] ?? traits[0];
  return (preferred && TRAIT_GLYPH[preferred]) || "orb";
}

/**
 * Draw `kind` centered at (cx, cy), sized to roughly `size` px across, in
 * `color`. Uses the Pixi v8 path API: build a sub-path, then fill()/stroke().
 */
export function drawGlyph(
  g: Graphics,
  kind: GlyphKind,
  cx: number,
  cy: number,
  size: number,
  color: number
): void {
  const s = size / 2; // half-extent
  // Step-based stroke weight so small (chip/rail) and large (panel) glyphs read
  // with consistent ink rather than the same hairline across sizes 8–12.
  const lw = size <= 9 ? 1.2 : size <= 13 ? 1.5 : size <= 20 ? 2 : Math.max(2, size * 0.1);
  const strokeIt = (): void => { g.stroke({ width: lw, color, alpha: 1, cap: "round", join: "round" }); };
  const fillIt = (): void => { g.fill({ color, alpha: 1 }); };

  switch (kind) {
    case "sword":
      g.moveTo(cx - s * 0.7, cy + s * 0.7).lineTo(cx + s * 0.7, cy - s * 0.7);
      g.moveTo(cx - s * 0.55, cy + s * 0.25).lineTo(cx - s * 0.05, cy + s * 0.75); // guard
      strokeIt();
      break;
    case "swords":
      g.moveTo(cx - s * 0.7, cy - s * 0.7).lineTo(cx + s * 0.7, cy + s * 0.7);
      g.moveTo(cx + s * 0.7, cy - s * 0.7).lineTo(cx - s * 0.7, cy + s * 0.7);
      strokeIt();
      break;
    case "dagger":
      g.moveTo(cx, cy - s * 0.85).lineTo(cx, cy + s * 0.8);
      g.moveTo(cx - s * 0.45, cy + s * 0.15).lineTo(cx + s * 0.45, cy + s * 0.15);
      strokeIt();
      break;
    case "axe":
      g.moveTo(cx + s * 0.5, cy + s * 0.85).lineTo(cx - s * 0.2, cy - s * 0.4);
      strokeIt();
      g.poly([
        cx - s * 0.2, cy - s * 0.8,
        cx + s * 0.7, cy - s * 0.55,
        cx + s * 0.3, cy - s * 0.05,
        cx - s * 0.45, cy - s * 0.2,
      ]);
      fillIt();
      break;
    case "bow":
      g.arc(cx - s * 0.2, cy, s, -Math.PI / 2.2, Math.PI / 2.2);
      strokeIt();
      g.moveTo(cx - s * 0.55, cy - s * 0.8).lineTo(cx - s * 0.55, cy + s * 0.8); // string
      g.moveTo(cx - s * 0.55, cy).lineTo(cx + s * 0.85, cy); // arrow
      strokeIt();
      break;
    case "shield":
      g.poly([
        cx, cy - s * 0.9,
        cx + s * 0.8, cy - s * 0.5,
        cx + s * 0.6, cy + s * 0.5,
        cx, cy + s * 0.95,
        cx - s * 0.6, cy + s * 0.5,
        cx - s * 0.8, cy - s * 0.5,
      ]);
      fillIt();
      break;
    case "crosshair":
      g.circle(cx, cy, s * 0.7);
      g.moveTo(cx, cy - s).lineTo(cx, cy - s * 0.3);
      g.moveTo(cx, cy + s * 0.3).lineTo(cx, cy + s);
      g.moveTo(cx - s, cy).lineTo(cx - s * 0.3, cy);
      g.moveTo(cx + s * 0.3, cy).lineTo(cx + s, cy);
      strokeIt();
      break;
    case "flame":
      g.poly([
        cx, cy - s,
        cx + s * 0.75, cy + s * 0.2,
        cx + s * 0.35, cy + s * 0.85,
        cx - s * 0.35, cy + s * 0.85,
        cx - s * 0.75, cy + s * 0.2,
      ]);
      fillIt();
      break;
    case "bolt":
      g.poly([
        cx + s * 0.5, cy - s,
        cx - s * 0.5, cy + s * 0.15,
        cx + s * 0.1, cy + s * 0.15,
        cx - s * 0.5, cy + s,
        cx + s * 0.5, cy - s * 0.15,
        cx - s * 0.1, cy - s * 0.15,
      ]);
      fillIt();
      break;
    case "droplet":
      g.moveTo(cx, cy - s);
      g.bezierCurveTo(cx + s * 0.9, cy, cx + s * 0.6, cy + s, cx, cy + s);
      g.bezierCurveTo(cx - s * 0.6, cy + s, cx - s * 0.9, cy, cx, cy - s);
      fillIt();
      break;
    case "snowflake":
      for (let i = 0; i < 3; i++) {
        const a = (Math.PI / 3) * i;
        const dx = Math.cos(a) * s;
        const dy = Math.sin(a) * s;
        g.moveTo(cx - dx, cy - dy).lineTo(cx + dx, cy + dy);
      }
      strokeIt();
      break;
    case "leaf":
      g.moveTo(cx - s * 0.7, cy + s * 0.7);
      g.bezierCurveTo(cx - s * 0.7, cy - s * 0.8, cx + s * 0.6, cy - s * 0.8, cx + s * 0.7, cy - s * 0.7);
      g.bezierCurveTo(cx + s * 0.6, cy + s * 0.6, cx - s * 0.6, cy + s * 0.6, cx - s * 0.7, cy + s * 0.7);
      fillIt();
      break;
    case "claw":
      for (let i = -1; i <= 1; i++) {
        const dx = i * s * 0.55;
        g.moveTo(cx + dx, cy - s * 0.85).lineTo(cx + dx * 1.3, cy + s * 0.85);
      }
      strokeIt();
      break;
    case "star": {
      const pts: number[] = [];
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const rr = i % 2 === 0 ? s : s * 0.42;
        pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      g.poly(pts);
      fillIt();
      break;
    }
    case "sun":
      g.circle(cx, cy, s * 0.45);
      fillIt();
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI / 4) * i;
        g.moveTo(cx + Math.cos(a) * s * 0.62, cy + Math.sin(a) * s * 0.62);
        g.lineTo(cx + Math.cos(a) * s, cy + Math.sin(a) * s);
      }
      strokeIt();
      break;
    case "moon":
      // Crescent: outer left arc closed by an inner offset arc.
      g.arc(cx - s * 0.1, cy, s, Math.PI * 0.45, Math.PI * 1.55);
      g.arc(cx + s * 0.45, cy, s * 0.85, Math.PI * 1.5, Math.PI * 0.5, true);
      fillIt();
      break;
    case "spark":
      g.poly([
        cx, cy - s,
        cx + s * 0.25, cy - s * 0.25,
        cx + s, cy,
        cx + s * 0.25, cy + s * 0.25,
        cx, cy + s,
        cx - s * 0.25, cy + s * 0.25,
        cx - s, cy,
        cx - s * 0.25, cy - s * 0.25,
      ]);
      fillIt();
      break;
    case "skull":
      g.circle(cx, cy - s * 0.1, s * 0.7);
      g.rect(cx - s * 0.35, cy + s * 0.3, s * 0.7, s * 0.5);
      fillIt();
      break;
    case "eye":
      g.moveTo(cx - s, cy);
      g.bezierCurveTo(cx - s * 0.3, cy - s * 0.8, cx + s * 0.3, cy - s * 0.8, cx + s, cy);
      g.bezierCurveTo(cx + s * 0.3, cy + s * 0.8, cx - s * 0.3, cy + s * 0.8, cx - s, cy);
      strokeIt();
      g.circle(cx, cy, s * 0.3);
      fillIt();
      break;
    case "heart":
      g.moveTo(cx, cy + s * 0.85);
      g.bezierCurveTo(cx - s * 1.2, cy - s * 0.2, cx - s * 0.4, cy - s, cx, cy - s * 0.3);
      g.bezierCurveTo(cx + s * 0.4, cy - s, cx + s * 1.2, cy - s * 0.2, cx, cy + s * 0.85);
      fillIt();
      break;
    case "coin":
      g.circle(cx, cy, s * 0.85);
      fillIt();
      // The depth self-stroke reads as a muddy halo at small sizes; gate it.
      if (size > 10) {
        g.circle(cx, cy, s * 0.85);
        g.stroke({ width: lw * 0.8, color, alpha: 0.5, cap: "round", join: "round" });
      }
      break;
    case "refresh":
      // Two-thirds arc with a small arrowhead at the open end.
      g.arc(cx, cy, s * 0.75, -Math.PI / 2, Math.PI);
      strokeIt();
      g.moveTo(cx - s * 0.2, cy - s * 0.75)
        .lineTo(cx, cy - s * 0.95)
        .lineTo(cx + s * 0.12, cy - s * 0.55);
      strokeIt();
      break;
    case "gem":
      // Faceted completed-item gem: a hexagon-ish cut diamond.
      g.poly([
        cx, cy - s,
        cx + s * 0.85, cy - s * 0.3,
        cx + s * 0.55, cy + s * 0.9,
        cx - s * 0.55, cy + s * 0.9,
        cx - s * 0.85, cy - s * 0.3,
      ]);
      fillIt();
      g.moveTo(cx, cy - s).lineTo(cx, cy + s * 0.9);
      g.moveTo(cx - s * 0.85, cy - s * 0.3).lineTo(cx + s * 0.85, cy - s * 0.3);
      g.stroke({ width: lw * 0.7, color, alpha: 0.4, cap: "round", join: "round" });
      break;
    case "component":
      // Loose component: a simple rounded square (a "shard"/part).
      g.roundRect(cx - s * 0.7, cy - s * 0.7, s * 1.4, s * 1.4, s * 0.3);
      strokeIt();
      g.moveTo(cx - s * 0.3, cy + s * 0.3).lineTo(cx + s * 0.3, cy - s * 0.3);
      g.stroke({ width: lw * 0.7, color, alpha: 0.6, cap: "round", join: "round" });
      break;
    case "bag":
      g.moveTo(cx - s * 0.7, cy - s * 0.3);
      g.lineTo(cx - s * 0.85, cy + s * 0.8);
      g.lineTo(cx + s * 0.85, cy + s * 0.8);
      g.lineTo(cx + s * 0.7, cy - s * 0.3);
      g.closePath();
      fillIt();
      g.arc(cx, cy - s * 0.3, s * 0.4, Math.PI, 0);
      g.stroke({ width: lw, color, alpha: 1, cap: "round", join: "round" });
      break;
    case "orb":
    default:
      g.circle(cx, cy, s * 0.55);
      fillIt();
      g.circle(cx, cy, s);
      strokeIt();
      break;
  }
}
