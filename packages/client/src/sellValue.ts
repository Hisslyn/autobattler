// Pure mirror of the rules SELL refund formula (commands.ts): the gold returned
// when selling a unit. Kept in sync with rules — sell value = tier × pool-copies
// for the unit's star × sellValueMultiplier. Display-only; the authoritative
// refund is still computed server-side / by applyCommand.
import type { UnitInstance } from "@autobattler/sim/src/types.js";
import type { GameData } from "@autobattler/data";

/** Gold refunded for selling `unit`, matching rules/commands.ts SELL. */
export function sellValue(unit: UnitInstance, data: GameData): number {
  const def = data.units.find((d) => d.id === unit.defId);
  if (!def) return 0;
  const copies = data.gameplay.copiesPerStar[String(unit.star)] ?? 1;
  return def.tier * copies * data.gameplay.sellValueMultiplier;
}
