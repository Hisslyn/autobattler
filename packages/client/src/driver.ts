import { gameData } from "@autobattler/data";
import type { MatchState, RoundResult } from "@autobattler/rules/src/state.js";
import type { UnitInstance, CombatResult, BoardState } from "@autobattler/sim/src/types.js";
import type { LootOrb } from "@autobattler/rules/src/loot.js";
import type { MatchStats } from "@autobattler/protocol";
import { createMatch, advancePhase, isMatchOver } from "@autobattler/rules";
import { applyCommand } from "@autobattler/rules/src/commands.js";
import { applyAiCommands } from "@autobattler/rules/src/ai.js";
import { getPairingFor, isPveRound, pveStageForRound, previewPveStage } from "@autobattler/rules/src/rounds.js";
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
  /** True when the current round is a PvE creep round (not PvP / not a bye). */
  isPveRound(): boolean;
  /** The PvE stage's display name for the current round, or null if not PvE. */
  getPveStageName(): string | null;
  /** Loot orbs this seat earned this round (already decided by rules); empty when none. */
  getMyLootOrbs(): LootOrb[];
  /** This seat's result for the just-finished round (resolution screen), or null. */
  getMyRoundResult(): RoundResult | null;
  /** Per-seat accumulated match stats (round W/L, total damage), or null until known. */
  getMatchStats(): Record<number, MatchStats> | null;
  /**
   * Returns the upcoming PvE mob board for the current round during PLANNING,
   * or null when not in PLANNING phase or the round is not a PvE round. The
   * returned BoardState uses negative uids (never collides with real combat uids)
   * and is display-only — never feed to the sim.
   */
  getUpcomingPveBoard(): BoardState | null;
  /**
   * Scene → driver: combat playback finished (or was skipped). LocalDriver
   * holds the RESOLUTION phase until this is called (capped); NetDriver is
   * server-paced and ignores it.
   */
  combatPlaybackDone(): void;
  advanceFromResolution(): void;
  /** Returns ms remaining in current planning phase, or 0 if not applicable. */
  getPlanningTimeLeft(): number;
  /**
   * Playtest-only convenience: end the current PLANNING phase immediately by
   * firing the SAME path the planning timer fires on expiry (AI commands +
   * deterministic sim + normal phase advance — no sim bypass, no new logic).
   * Present only on drivers that own the planning clock (LocalDriver); absent on
   * NetDriver, where the server owns the clock — the scene hides the Skip
   * affordance when this is undefined.
   */
  skipPlanning?(): void;
  /** Tear down timers/sockets when leaving a match. */
  dispose(): void;
}

const HUMAN_PLAYER_ID = 0;
/** Authoritative planning-phase window (ms). Exported so the HUD timer dial can
 *  derive its fill fraction from the same constant the local clock counts down. */
export const PLANNING_TIMER_MS = 30_000;
// Fallback cap for combat playback: slowest-speed duration plus a buffer. The
// scene normally calls combatPlaybackDone() sooner (faster speed / skip / no
// scene fx). Scaled by the slowest playback speed so the cap never fires before
// genuine playback finishes (0.25x default → real duration is 4x the 1x duration).
const PLAYBACK_CAP_BUFFER_MS = 2_000;
const SLOWEST_PLAYBACK_SPEED = 0.25;
// Presentation-only playback time-scale the scene applies on top of the speed
// setting (see combat/player.ts PLAYBACK_TIME_SCALE). The cap must account for
// it so it never fires before genuine playback finishes. Kept in sync with the
// scene's source constant (1 = no extra slowdown).
const PLAYBACK_TIME_SCALE = 1;

export type DriverEvent =
  | { type: "state"; state: MatchState }
  | { type: "phase_change"; phase: string; round: number }
  | {
      type: "match_over";
      placements: number[];
      mmr?: Record<number, { before: number; after: number }>;
      stats?: Record<number, MatchStats>;
    };

export class LocalDriver implements IDriver {
  readonly seatIndex = 0;
  private state: MatchState;
  private prng: () => number;
  private listeners: Array<(e: DriverEvent) => void> = [];
  private planningTimerId: ReturnType<typeof setTimeout> | null = null;
  private resolutionTimerId: ReturnType<typeof setTimeout> | null = null;
  private playbackCapTimerId: ReturnType<typeof setTimeout> | null = null;
  private pendingResolution = false;
  private planningStartTime = 0;

  constructor(seed = Date.now(), humanName?: string) {
    this.prng = mulberry32(seed);
    this.state = createMatch(seed, gameData);
    // Practice parity with online: seat 0 is the human (profile name), the rest
    // are named bots. Names live only on the client view (not used by the sim).
    for (let i = 0; i < this.state.players.length; i++) {
      (this.state.players[i] as { name?: string }).name =
        i === HUMAN_PLAYER_ID ? (humanName ?? "You") : `Bot ${i + 1}`;
    }
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
    // PvE rounds carry no pairing; the mob board is keyed by player id directly.
    if (this.isPveRound()) return this.state.lastOpponentBoards.get(HUMAN_PLAYER_ID) ?? null;
    return getPairingFor(this.state, HUMAN_PLAYER_ID)?.opponentBoard ?? null;
  }

  getMyCombatResult(): CombatResult | null {
    if (this.isPveRound()) return this.state.lastCombatResults.get(HUMAN_PLAYER_ID) ?? null;
    return getPairingFor(this.state, HUMAN_PLAYER_ID)?.result ?? null;
  }

  getMyOutcome(): Outcome | null {
    if (this.isPveRound()) {
      // PvE never damages HP; outcome is purely informational (side 0 = player).
      const r = this.state.lastCombatResults.get(HUMAN_PLAYER_ID);
      if (!r) return null;
      return r.winner === "draw" ? "draw" : r.winner === 0 ? "win" : "loss";
    }
    return getPairingFor(this.state, HUMAN_PLAYER_ID)?.outcome ?? null;
  }

  isPveRound(): boolean {
    return isPveRound(this.state.round, gameData);
  }

  getPveStageName(): string | null {
    if (!this.isPveRound()) return null;
    return pveStageForRound(this.state.round, gameData)?.name ?? null;
  }

  getMyLootOrbs(): LootOrb[] {
    return this.state.lastLootOrbs.get(HUMAN_PLAYER_ID) ?? [];
  }

  getMyRoundResult(): RoundResult | null {
    return this.state.lastRoundResult.get(HUMAN_PLAYER_ID) ?? null;
  }

  getMatchStats(): Record<number, MatchStats> | null {
    const out: Record<number, MatchStats> = {};
    for (const p of this.state.players) {
      out[p.id] = {
        roundWins: p.roundWins,
        roundLosses: p.roundLosses,
        totalDamageTaken: p.totalDamageTaken,
        totalDamageDealt: p.totalDamageDealt,
      };
    }
    return out;
  }

  getUpcomingPveBoard(): BoardState | null {
    // Only meaningful during PLANNING — outside this phase the "upcoming" board
    // is either already the active combat board (COMBAT) or stale (RESOLUTION).
    if (this.state.phase !== "PLANNING") return null;
    return previewPveStage(this.state, gameData);
  }

  getPlanningTimeLeft(): number {
    if (this.state.phase !== "PLANNING") return 0;
    const elapsed = Date.now() - this.planningStartTime;
    return Math.max(0, PLANNING_TIMER_MS - elapsed);
  }

  startPlanning(): void {
    this.planningStartTime = Date.now();
    this.emit({ type: "phase_change", phase: "PLANNING", round: this.state.round });
    // Planning always runs the full duration; the timer (not a manual ready)
    // is the only thing that advances out of planning.
    this.planningTimerId = setTimeout(() => this._onPlanningTimerFired(), PLANNING_TIMER_MS);
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

  /**
   * Public ready() is a no-op: planning always runs the full PLANNING_TIMER_MS.
   * Kept on the IDriver interface (and called by no one now) so callers that
   * still hold a reference stay harmless. Advancing out of planning happens only
   * via the startPlanning timer (→ _onPlanningTimerFired).
   */
  ready(): void {
    /* no-op — planning runs full duration */
  }

  /**
   * Playtest convenience: collapse the remaining planning time by invoking the
   * exact path the planning timer fires on expiry — no sim bypass, no new logic.
   * Guarded against non-PLANNING phases by `_onPlanningTimerFired`.
   */
  skipPlanning(): void {
    this._onPlanningTimerFired();
  }

  /** Fired by the startPlanning timer when planning's full duration elapses. */
  private _onPlanningTimerFired(): void {
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

    // Hold RESOLUTION until the scene finishes event-log playback. The cap is a
    // fallback (the scene normally calls combatPlaybackDone() when playback truly
    // ends) so a missing scene can never stall the match. It must never fire
    // BEFORE genuine playback completes, so it's scaled by the SLOWEST playback
    // speed (0.25x → real duration is 4x the 1x duration). Use the PvE-aware
    // accessor: a PvE round has no pairing but still produces a combat result
    // whose log the scene plays back, so the cap must reflect that duration
    // (else capMs=0 would fire immediately and tear the mob board down on frame 1).
    const result = this.getMyCombatResult();
    const oneXMs = result ? Math.ceil((result.ticks * 1000) / gameData.gameplay.ticksPerSec) : 0;
    const capMs = result
      ? Math.ceil(oneXMs / (SLOWEST_PLAYBACK_SPEED * PLAYBACK_TIME_SCALE)) + PLAYBACK_CAP_BUFFER_MS
      : 0;
    this.pendingResolution = true;
    this.playbackCapTimerId = setTimeout(() => this.combatPlaybackDone(), capMs);
  }

  combatPlaybackDone(): void {
    if (!this.pendingResolution) return;
    this.pendingResolution = false;
    if (this.playbackCapTimerId !== null) {
      clearTimeout(this.playbackCapTimerId);
      this.playbackCapTimerId = null;
    }

    if (isMatchOver(this.state)) {
      const stats = this.getMatchStats();
      this.emit({ type: "match_over", placements: [...this.state.placements], ...(stats ? { stats } : {}) });
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
    if (this.pendingResolution) return; // playback still running
    if (this.resolutionTimerId !== null) {
      clearTimeout(this.resolutionTimerId);
      this.resolutionTimerId = null;
    }
    if (isMatchOver(this.state)) {
      const stats = this.getMatchStats();
      this.emit({ type: "match_over", placements: [...this.state.placements], ...(stats ? { stats } : {}) });
      return;
    }
    // RESOLUTION → PLANNING (income + shop refresh)
    advancePhase(this.state, gameData);
    this.startPlanning();
    this.emit({ type: "state", state: this.state });
  }

  dispose(): void {
    if (this.planningTimerId !== null) clearTimeout(this.planningTimerId);
    if (this.resolutionTimerId !== null) clearTimeout(this.resolutionTimerId);
    if (this.playbackCapTimerId !== null) clearTimeout(this.playbackCapTimerId);
    this.planningTimerId = this.resolutionTimerId = this.playbackCapTimerId = null;
    this.listeners = [];
  }
}
