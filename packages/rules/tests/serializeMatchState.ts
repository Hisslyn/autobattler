import type { MatchState } from "../src/state.js";

// JSON.stringify drops Map/Set fields; this replacer includes them so
// determinism / state-equality comparisons cover pool, pairingHistory,
// lastCombatResults, and lastOpponentBoards.
function mapAwareReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) return { __map: [...value.entries()] };
  if (value instanceof Set) return { __set: [...value.values()] };
  return value;
}

export function serializeMatchState(state: MatchState): string {
  return JSON.stringify(state, mapAwareReplacer);
}
