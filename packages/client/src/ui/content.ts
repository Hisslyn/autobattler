// How-to-Play content pages. Pure presentation copy (not gameplay tuning), so it
// lives with the UI rather than packages/data. Rendered as readable DOM pages.

export interface HelpPage {
  title: string;
  paragraphs: string[];
}

export const HELP_PAGES: HelpPage[] = [
  {
    title: "Economy",
    paragraphs: [
      "Each round you earn base income plus interest (1 gold per 10 banked, capped) and a win/lose streak bonus. Holding gold to hit interest thresholds compounds quickly.",
      "Spend on buying units, rerolling the shop, or buying XP. Selling a unit returns its gold value to the pool.",
      "Balancing economy against board strength is the core tension: greed too long and you bleed HP, spend too early and you fall behind on interest.",
    ],
  },
  {
    title: "Combat & Traits",
    paragraphs: [
      "Combat is automatic. Units move to the nearest enemy, attack to build mana, then cast their ability when full.",
      "Traits come from each unit's origin and classes. Fielding enough units sharing a trait unlocks breakpoints (at 2 / 4 / 6) that buff your whole team.",
      "Positioning matters: front-line tanks soak damage while back-line carries and casters deal it. After 60s combat enters overtime with ramping true damage.",
    ],
  },
  {
    title: "Items",
    paragraphs: [
      "Items are stat bundles, some with a passive — an on-hit burn or a start-of-combat shield.",
      "Equip an item onto a unit to make it stronger. Stack stats toward your carries; defensive items keep front-liners alive longer.",
      "Damage routes through any active shield before it touches HP.",
    ],
  },
  {
    title: "Leveling & Shop Odds",
    paragraphs: [
      "Buying XP raises your level, which unlocks more board slots and shifts the shop odds toward higher-tier units.",
      "Early levels mostly offer tier 1–2 units; tier 4–5 only appear with meaningful odds at higher levels.",
      "Three copies of a unit merge into a 2-star (stronger); three 2-stars cascade into a 3-star. Plan rerolls around the units you want to upgrade.",
    ],
  },
];
