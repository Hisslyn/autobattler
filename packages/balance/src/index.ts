export { runMatchup, type MatchupResult } from "./runner.js";
export {
  runSweep,
  DEFAULT_CONFIG,
  type SweepConfig,
  type SweepReport,
  type CompStat,
  type UnitStat,
  type TierStat,
  type TraitStat,
} from "./sweep.js";
export { renderMarkdown } from "./report.js";
export {
  COMPOSITIONS,
  buildBoard,
  activeTraits,
  compGold,
  unitGoldCost,
  LEVEL,
  BUDGET,
  BUDGET_TOLERANCE,
  type Composition,
  type CompUnit,
} from "./compositions.js";
