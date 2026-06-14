import type { GameData, LootEntry, LootRarity } from "@autobattler/data";
import type { PlayerState } from "./state.js";
import type { Prng } from "@autobattler/sim/src/prng.js";

/** A resolved loot reward (gold folded into gold; ids land in the inventory). */
export type LootReward =
  | { kind: "gold"; amount: number }
  | { kind: "component"; id: string }
  | { kind: "item"; id: string };

/** A revealed orb: its rarity (for the future client animation) + its reward. */
export interface LootOrb {
  rarity: LootRarity;
  reward: LootReward;
}

/** Weighted pick over loot entries; deterministic given the prng stream. */
function pickEntry(entries: LootEntry[], prng: Prng): LootEntry {
  const total = entries.reduce((s, e) => s + e.weight, 0);
  let roll = prng() % total;
  for (const e of entries) {
    if (roll < e.weight) return e;
    roll -= e.weight;
  }
  return entries[entries.length - 1]!;
}

function entryToReward(entry: LootEntry): LootReward {
  return entry.kind === "gold"
    ? { kind: "gold", amount: entry.amount }
    : { kind: entry.kind, id: entry.id };
}

/**
 * Pure, seeded loot generation for a PvE round: builds the round's orbs from
 * loot.json roundDrops and resolves each from its rarity table using the
 * passed prng. Same seed + config → identical orbs and contents.
 */
export function generateLoot(round: number, prng: Prng, data: GameData): LootOrb[] {
  const drops = data.loot.roundDrops[String(round)] ?? [];
  const orbs: LootOrb[] = [];
  for (const drop of drops) {
    const table = data.loot.tables[drop.rarity] ?? [];
    if (table.length === 0) continue;
    for (let i = 0; i < drop.count; i++) {
      orbs.push({ rarity: drop.rarity, reward: entryToReward(pickEntry(table, prng)) });
    }
  }
  return orbs;
}

/** Applies one orb's reward to a player (gold → gold, ids → inventory). */
export function applyLootOrb(player: PlayerState, orb: LootOrb): void {
  if (orb.reward.kind === "gold") {
    player.gold += orb.reward.amount;
  } else {
    player.items.push(orb.reward.id);
  }
}
