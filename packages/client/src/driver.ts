import { gameData } from "@autobattler/data";
import type { MatchState } from "@autobattler/rules/src/state.js";
import type { UnitInstance, CombatResult } from "@autobattler/sim/src/types.js";
import { createMatch, advancePhase, isMatchOver } from "@autobattler/rules";
import { applyCommand } from "@autobattler/rules/src/commands.js";
import { applyAiCommands } from "@autobattler/rules/src/ai.js";
import { getPairingFor } from "@autobattler/rules/src/rounds.js";
import { mulberry32 } from "@autobattler/sim/src/prng.js";

export type Outcome = "win" | "loss" | "draw";

export interface IDriver {
  readonly seatIndex: number;
  on(listener: (e: DriverEvent) => void): () => void;
  getState(): MatchState;
  startPlanning(): void;
  playerCommand(cmd: Parameters<typeof applyCommand>[2]): ReturnType<typeof applyCommand>;
  ready(): void;
  getMyPairing(): { opponentId: number; isGhost: boolean; side: 0 | 1 } | null;
  getMyOpponentBoard(): (UnitInstance | null)[] | null;
  getMyCombatResult(): CombatResult | null;
  /** Win/loss/draw normalized to this driver's seat. */
  getMyOutcome(): Outcome | null;
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
  private resolutionTimerId: ReturnType<typeof setTimeout> | null = null;
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

  getMyPairing(): { opponentId: number; isGhost: boolean; side: 0 | 1 } | null {
    const view = getPairingFor(this.state, HUMAN_PLAYER_ID);
    if (!view) return null;
    return { opponentId: view.opponentId, isGhost: view.isGhost, side: view.side };
  }

  getMyOpponentBoard(): (UnitInstance | null)[] | null {
    return getPairingFor(this.state, HUMAN_PLAYER_ID)?.opponentBoard ?? null;
  }

  getMyCombatResult(): CombatResult | null {
    return getPairingFor(this.state, HUMAN_PLAYER_ID)?.result ?? null;
  }

  getMyOutcome(): Outcome | null {
    return getPairingFor(this.state, HUMAN_PLAYER_ID)?.outcome ?? null;
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
      return { ok: false, error: "PHASE_INVALID" };
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
    // PLANNING → COMBAT (runs combat) → state ends in RESOLUTION
    advancePhase(this.state, gameData);
    this.emit({ type: "phase_change", phase: "COMBAT", round: this.state.round });
    this.emit({ type: "state", state: this.state });

    if (isMatchOver(this.state)) {
      this.emit({ type: "match_over", placements: [...this.state.placements] });
      return;
    }

    // Emit RESOLUTION while the state is actually in RESOLUTION; pause, then
    // advance (Continue button can advance earlier via advanceFromResolution).
    this.emit({ type: "phase_change", phase: "RESOLUTION", round: this.state.round });
    this.emit({ type: "state", state: this.state });
    this.resolutionTimerId = setTimeout(
      () => this.advanceFromResolution(),
      gameData.economy.resolutionSeconds * 1000
    );
  }

  advanceFromResolution(): void {
    if (this.state.phase !== "RESOLUTION") return;
    if (this.resolutionTimerId !== null) {
      clearTimeout(this.resolutionTimerId);
      this.resolutionTimerId = null;
    }
    if (isMatchOver(this.state)) {
      this.emit({ type: "match_over", placements: [...this.state.placements] });
      return;
    }
    // RESOLUTION → PLANNING (income + shop refresh)
    advancePhase(this.state, gameData);
    this.startPlanning();
    this.emit({ type: "state", state: this.state });
  }
}
