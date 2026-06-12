import { gameData } from "@autobattler/data";
import type { MatchState } from "@autobattler/rules/src/state.js";
import type { UnitInstance, CombatResult } from "@autobattler/sim/src/types.js";
import { createMatch, advancePhase, isMatchOver } from "@autobattler/rules";
import { applyCommand } from "@autobattler/rules/src/commands.js";
import { applyAiCommands } from "@autobattler/rules/src/ai.js";
import { mulberry32 } from "@autobattler/sim/src/prng.js";

export interface IDriver {
  readonly seatIndex: number;
  on(listener: (e: DriverEvent) => void): () => void;
  getState(): MatchState;
  startPlanning(): void;
  playerCommand(cmd: Parameters<typeof applyCommand>[2]): ReturnType<typeof applyCommand>;
  ready(): void;
  getMyPairing(): { opponentId: number; isGhost: boolean } | null;
  getMyOpponentBoard(): (UnitInstance | null)[] | null;
  getMyCombatResult(): CombatResult | null;
  advanceFromResolution(): void;
  /** Returns ms remaining in current planning phase, or 0 if not applicable. */
  getPlanningTimeLeft(): number;
}

const HUMAN_PLAYER_ID = 0;
const PLANNING_TIMER_MS = 30_000;

export type DriverEvent =
  | { type: "state"; state: MatchState }
  | { type: "phase_change"; phase: string; round: number }
  | { type: "match_over"; placements: number[] };

export class LocalDriver implements IDriver {
  readonly seatIndex = 0;
  private state: MatchState;
  private prng: () => number;
  private listeners: Array<(e: DriverEvent) => void> = [];
  private planningTimerId: ReturnType<typeof setTimeout> | null = null;
  private planningStartTime = 0;

  constructor(seed = Date.now()) {
    this.prng = mulberry32(seed);
    this.state = createMatch(seed, gameData);
    this.emit({ type: "state", state: this.state });
  }

  on(listener: (e: DriverEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(e: DriverEvent): void {
    for (const l of this.listeners) l(e);
  }

  getState(): MatchState {
    return this.state;
  }

  /** Returns [myPairingOpponentId, isGhost] for the human player in the last combat. */
  getMyPairing(): { opponentId: number; isGhost: boolean } | null {
    const pairing = this.state.lastPairings.find(([a]) => a === HUMAN_PLAYER_ID);
    if (!pairing) return null;
    const [, bId] = pairing;
    return bId !== undefined
      ? { opponentId: bId, isGhost: bId < 0 }
      : null;
  }

  getMyOpponentBoard(): (UnitInstance | null)[] | null {
    return this.state.lastOpponentBoards.get(HUMAN_PLAYER_ID) ?? null;
  }

  getMyCombatResult(): CombatResult | null {
    return this.state.lastCombatResults.get(HUMAN_PLAYER_ID) ?? null;
  }

  getPlanningTimeLeft(): number {
    if (this.state.phase !== "PLANNING") return 0;
    const elapsed = Date.now() - this.planningStartTime;
    return Math.max(0, PLANNING_TIMER_MS - elapsed);
  }

  startPlanning(): void {
    this.planningStartTime = Date.now();
    this.emit({ type: "phase_change", phase: "PLANNING", round: this.state.round });
    this.planningTimerId = setTimeout(() => this.ready(), PLANNING_TIMER_MS);
  }

  playerCommand(cmd: Parameters<typeof applyCommand>[2]): ReturnType<typeof applyCommand> {
    if (this.state.phase !== "PLANNING") {
      return { ok: false, error: "INVALID_POSITION" };
    }
    const result = applyCommand(this.state, HUMAN_PLAYER_ID, cmd, this.prng, gameData);
    if (result.ok) {
      this.emit({ type: "state", state: this.state });
    }
    return result;
  }

  ready(): void {
    if (this.planningTimerId !== null) {
      clearTimeout(this.planningTimerId);
      this.planningTimerId = null;
    }
    if (this.state.phase !== "PLANNING") return;
    this._applyAllAiCommands();
    this._advanceToResolution();
  }

  private _applyAllAiCommands(): void {
    for (const player of this.state.players) {
      if (player.id === HUMAN_PLAYER_ID) continue;
      if (!player.alive) continue;
      applyAiCommands(this.state, player.id, this.prng, gameData);
    }
  }

  private _advanceToResolution(): void {
    // PLANNING -> COMBAT -> RESOLUTION
    advancePhase(this.state, gameData);
    this.emit({ type: "phase_change", phase: "COMBAT", round: this.state.round });
    this.emit({ type: "state", state: this.state });

    // Auto-advance to next planning after a short delay for animation
    if (isMatchOver(this.state)) {
      this.emit({ type: "match_over", placements: [...this.state.placements] });
      return;
    }

    // Now in RESOLUTION, advance again
    advancePhase(this.state, gameData);
    this.emit({ type: "phase_change", phase: "RESOLUTION", round: this.state.round });
    this.emit({ type: "state", state: this.state });
  }

  advanceFromResolution(): void {
    if (this.state.phase !== "RESOLUTION") return;
    if (isMatchOver(this.state)) {
      this.emit({ type: "match_over", placements: [...this.state.placements] });
      return;
    }
    this.startPlanning();
    this.emit({ type: "state", state: this.state });
  }
}
