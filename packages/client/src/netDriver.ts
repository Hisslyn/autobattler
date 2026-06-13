import { gameData } from "@autobattler/data";
import type { MatchState } from "@autobattler/rules/src/state.js";
import type { UnitInstance, CombatResult } from "@autobattler/sim/src/types.js";
import { simulateCombat } from "@autobattler/sim";
import { applyCommand } from "@autobattler/rules/src/commands.js";
import { derivePairingSeed, boardToCombatState, ghostToCombatState } from "@autobattler/rules/src/rounds.js";
import { NetClient } from "./net.js";
import type { IDriver, DriverEvent, Outcome } from "./driver.js";

export class NetDriver implements IDriver {
  private net: NetClient;
  private _state: MatchState | null = null;
  get seatIndex(): number { return this.mySeat; }
  private _myPairing: { opponentId: number; isGhost: boolean; side: 0 | 1 } | null = null;
  private _myOpponentBoard: (UnitInstance | null)[] | null = null;
  private _myCombatResult: CombatResult | null = null;
  private _phaseEndsAt = 0;
  private _clockOffset = 0;
  private listeners: Array<(e: DriverEvent) => void> = [];
  private mySeat = -1;

  constructor(url: string, authToken?: string) {
    this.net = new NetClient(url);

    this.net.on((e) => {
      if (e.type === "connected") {
        // On reconnect NetClient sends RECONNECT itself; only queue fresh connections
        if (!this.net.seatToken) {
          this.net.send(authToken ? { type: "QUEUE_JOIN", authToken } : { type: "QUEUE_JOIN" });
        }
        return;
      }
      if (e.type === "disconnected") return;

      switch (e.type) {
        case "MATCH_FOUND":
          this.mySeat = e.seatIndex;
          break;

        case "STATE_SNAPSHOT": {
          const snap = e.state as { round: number; phase: string; me: MatchState["players"][0]; players: MatchState["players"]; lastPairings: [number, number][] };
          if (!this._state) {
            this._state = this._buildStateFromSnapshot(snap);
          } else {
            this._applySnapshot(snap);
          }
          this.emit({ type: "state", state: this._state! });
          if (this._state!.phase === "PLANNING") {
            this.emit({ type: "phase_change", phase: "PLANNING", round: this._state!.round });
          }
          break;
        }

        case "STATE_DELTA": {
          if (!this._state) break;
          // Server sends per-seat deltas: `me` (full private state) is present
          // only when this seat is the acting player; others are public views.
          const delta = e.delta as {
            changedSeat: number;
            players: MatchState["players"];
            me?: MatchState["players"][0];
          };
          if (delta.me && delta.changedSeat === this.mySeat) {
            this._state.players[this.mySeat] = delta.me;
          }
          for (let i = 0; i < delta.players.length; i++) {
            const pub = delta.players[i]!;
            const existing = this._state.players[i]!;
            existing.hp = pub.hp;
            existing.alive = pub.alive;
            existing.placement = pub.placement;
            existing.level = pub.level;
            existing.xp = pub.xp;
            existing.winStreak = pub.winStreak;
            existing.loseStreak = pub.loseStreak;
            if (i !== this.mySeat) {
              existing.board = pub.board;
              existing.bench = pub.bench;
            }
          }
          this.emit({ type: "state", state: this._state });
          break;
        }

        case "PHASE_CHANGE":
          if (this._state) {
            this._state.phase = e.phase as MatchState["phase"];
            this._state.round = e.round;
            this._phaseEndsAt = e.endsAt;
          }
          this.emit({ type: "phase_change", phase: e.phase, round: e.round });
          if (this._state) this.emit({ type: "state", state: this._state });
          break;

        case "COMBAT_START": {
          if (!this._state) break;
          this._state.lastPairings = e.pairings;
          this._myPairing = null;
          this._myOpponentBoard = null;
          this._myCombatResult = null;

          const pairingIndex = e.pairings.findIndex(([a, b]) => a === this.mySeat || b === this.mySeat);
          if (pairingIndex >= 0) {
            const [aId, bId] = e.pairings[pairingIndex]!;
            const side: 0 | 1 = aId === this.mySeat ? 0 : 1;
            const isGhost = side === 0 && bId < 0;
            this._myPairing = { opponentId: side === 0 ? bId : aId, isGhost, side };
            const oppSnap = e.opponentSnapshots[this.mySeat] as { board: (UnitInstance | null)[] } | undefined;
            this._myOpponentBoard = oppSnap?.board ?? null;

            // Run local sim for rendering, mirroring the server's board
            // construction exactly (shared helpers + derived pairing seed).
            try {
              const myPlayer = this._state.players[this.mySeat]!;
              const myCombat = boardToCombatState(myPlayer.board, side);
              const oppBoard = this._myOpponentBoard ?? [];
              const oppCombat = isGhost
                ? ghostToCombatState(oppBoard.filter((u): u is UnitInstance => u != null))
                : boardToCombatState(oppBoard, side === 0 ? 1 : 0);
              const boardA = side === 0 ? myCombat : oppCombat;
              const boardB = side === 0 ? oppCombat : myCombat;
              const seed = derivePairingSeed(e.roundSeed, pairingIndex);
              this._myCombatResult = simulateCombat(boardA, boardB, seed, gameData);
            } catch {
              // local sim failed; wait for COMBAT_RESULT
            }
          }
          this.emit({ type: "phase_change", phase: "COMBAT", round: this._state.round });
          if (this._state) this.emit({ type: "state", state: this._state });
          break;
        }

        case "COMBAT_RESULT": {
          if (!this._state) break;
          const results = e.results as Record<number, CombatResult>;
          const serverResult = results[this.mySeat];
          if (serverResult) {
            if (this._myCombatResult &&
                JSON.stringify(this._myCombatResult.events) !== JSON.stringify(serverResult.events)) {
              console.warn("[net] combat result mismatch: local winner", this._myCombatResult.winner, "server winner", serverResult.winner);
            }
            // Server result is canon
            this._myCombatResult = serverResult;
          }
          break;
        }

        case "MATCH_END":
          this.emit({ type: "match_over", placements: e.placements, ...(e.mmr ? { mmr: e.mmr } : {}) });
          break;

        case "PONG":
          // clock offset: serverTs - (clientSendTs + rtt/2)
          this._clockOffset = e.serverTs - (e.ts + this.net.rttMs / 2);
          break;
      }
    });
  }

  get phaseEndsAt(): number { return this._phaseEndsAt; }
  get clockOffset(): number { return this._clockOffset; }

  on(listener: (e: DriverEvent) => void): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter((l) => l !== listener); };
  }

  private emit(e: DriverEvent): void {
    for (const l of this.listeners) l(e);
  }

  getState(): MatchState {
    if (!this._state) {
      // Return a minimal stub while waiting for snapshot
      return {
        players: [],
        pool: new Map(),
        round: 1,
        phase: "PLANNING",
        prngState: 0,
        nextUid: 0,
        pairingHistory: new Map(),
        placements: [],
        lastPairings: [],
        lastRoundSeed: 0,
        lastCombatResults: new Map(),
        lastOpponentBoards: new Map(),
      };
    }
    return this._state;
  }

  startPlanning(): void {
    // Server drives phase; nothing to do locally
  }

  playerCommand(cmd: Parameters<typeof applyCommand>[2]): ReturnType<typeof applyCommand> {
    this.net.send({ type: "CMD", cmd: cmd as { type: string; [key: string]: unknown } });
    // Optimistic ok; server will send delta or ERROR
    return { ok: true };
  }

  ready(): void {
    this.net.send({ type: "READY" });
  }

  getMyPairing(): { opponentId: number; isGhost: boolean; side: 0 | 1 } | null {
    return this._myPairing;
  }

  getMyOpponentBoard(): (UnitInstance | null)[] | null {
    return this._myOpponentBoard;
  }

  getMyCombatResult(): CombatResult | null {
    return this._myCombatResult;
  }

  getMyOutcome(): Outcome | null {
    const result = this._myCombatResult;
    if (!result || !this._myPairing) return null;
    if (result.winner === "draw") return "draw";
    return result.winner === this._myPairing.side ? "win" : "loss";
  }

  combatPlaybackDone(): void {
    // Server paces phases; playback completion is purely visual here
  }

  advanceFromResolution(): void {
    // Server auto-advances; nothing to do
  }

  getPlanningTimeLeft(): number {
    if (!this._state || this._state.phase !== "PLANNING") return 0;
    return Math.max(0, this._phaseEndsAt - (Date.now() + this._clockOffset));
  }

  dispose(): void {
    // Leaving an online match disconnects; the server marks the seat AFK and the
    // match continues without us (effectively forfeiting to last place). No
    // SURRENDER message exists in the protocol, so disconnect is the leave path.
    this.listeners = [];
    this.net.stop();
  }

  private _buildStateFromSnapshot(snap: { round: number; phase: string; me: MatchState["players"][0]; players: MatchState["players"]; lastPairings: [number, number][] }): MatchState {
    const players = snap.players.map((pub, i) => {
      if (i === this.mySeat) return snap.me;
      // Public view lacks private fields; fill with placeholders
      return {
        ...pub,
        gold: 0,
        items: [],
        shop: [null, null, null, null, null],
        lastBoard: null,
      } as MatchState["players"][0];
    });

    return {
      players,
      pool: new Map(),
      round: snap.round,
      phase: snap.phase as MatchState["phase"],
      prngState: 0,
      nextUid: 0,
      pairingHistory: new Map(),
      placements: [],
      lastPairings: snap.lastPairings ?? [],
      lastRoundSeed: 0,
      lastCombatResults: new Map(),
      lastOpponentBoards: new Map(),
    };
  }

  private _applySnapshot(snap: { round: number; phase: string; me: MatchState["players"][0]; players: MatchState["players"]; lastPairings: [number, number][] }): void {
    if (!this._state) return;
    this._state.round = snap.round;
    this._state.phase = snap.phase as MatchState["phase"];
    this._state.lastPairings = snap.lastPairings ?? [];
    if (this.mySeat >= 0) this._state.players[this.mySeat] = snap.me;
    for (let i = 0; i < snap.players.length; i++) {
      if (i === this.mySeat) continue;
      const pub = snap.players[i]!;
      const existing = this._state.players[i];
      if (existing) {
        existing.hp = pub.hp;
        existing.alive = pub.alive;
        existing.placement = pub.placement;
        existing.level = pub.level;
        existing.xp = pub.xp;
        existing.winStreak = pub.winStreak;
        existing.loseStreak = pub.loseStreak;
        existing.board = pub.board;
        existing.bench = pub.bench;
      }
    }
  }
}
