// Pure loot-reveal sequencing model (phase 10b). No Pixi, no game logic — the
// orbs and their contents are already decided by rules (seeded LootOrb list);
// this only turns that list into an ordered, deterministic sequence of reveal
// steps the Pixi layer plays back, plus a reduced-motion summary form. Same orb
// list → identical steps.
import type { GameData, LootRarity } from "@autobattler/data";
import type { LootOrb, LootReward } from "@autobattler/rules/src/loot.js";
import { rarityColor } from "./theme.js";
import { itemModel } from "./itemModel.js";

/** Order rarities ascend so the reveal builds from common → legendary. */
const RARITY_ORDER: Record<LootRarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  legendary: 3,
};

export type RevealContent =
  | { kind: "gold"; amount: number; label: string }
  | { kind: "component"; id: string; name: string }
  | { kind: "item"; id: string; name: string };

export interface RevealStep {
  /** Stable order index (0-based) — the playback order. */
  order: number;
  rarity: LootRarity;
  /** Orb shell color for this rarity. */
  color: number;
  /** Where the revealed reward flies: the gold counter or the item inventory. */
  destination: "gold" | "inventory";
  content: RevealContent;
}

export interface LootRevealModel {
  steps: RevealStep[];
  /** Total gold across all gold orbs (for the reduced-motion summary). */
  totalGold: number;
  /** Count of component + completed-item orbs (summary). */
  itemCount: number;
  /** True when there's nothing to reveal. */
  empty: boolean;
}

function rewardName(reward: LootReward, data: GameData): string {
  if (reward.kind === "gold") return `${reward.amount} gold`;
  return itemModel(reward.id, data)?.name ?? reward.id;
}

function rewardContent(reward: LootReward, data: GameData): RevealContent {
  if (reward.kind === "gold") {
    return { kind: "gold", amount: reward.amount, label: `+${reward.amount}` };
  }
  return { kind: reward.kind, id: reward.id, name: rewardName(reward, data) };
}

/**
 * Build the ordered reveal sequence from a round's orbs. Orbs reveal lowest
 * rarity first (so the sequence escalates), stable within a rarity by their
 * original drop order. Gold flies to the gold counter; components / completed
 * items fly to the inventory.
 */
export function lootRevealModel(orbs: readonly LootOrb[], data: GameData): LootRevealModel {
  const indexed = orbs.map((orb, i) => ({ orb, i }));
  indexed.sort((a, b) => {
    const ra = RARITY_ORDER[a.orb.rarity] - RARITY_ORDER[b.orb.rarity];
    return ra !== 0 ? ra : a.i - b.i;
  });

  let totalGold = 0;
  let itemCount = 0;
  const steps: RevealStep[] = indexed.map(({ orb }, order) => {
    const reward = orb.reward;
    if (reward.kind === "gold") totalGold += reward.amount;
    else itemCount += 1;
    return {
      order,
      rarity: orb.rarity,
      color: rarityColor(orb.rarity),
      destination: reward.kind === "gold" ? "gold" : "inventory",
      content: rewardContent(reward, data),
    };
  });

  return { steps, totalGold, itemCount, empty: steps.length === 0 };
}
