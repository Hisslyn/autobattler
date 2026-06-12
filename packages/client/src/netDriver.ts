import { gameData } from "@autobattler/data";
import type { MatchState } from "@autobattler/rules/src/state.js";
import type { UnitInstance, CombatResult } from "@autobattler/sim/src/types.js";
import { simulateCombat } from "@autobattler/sim";
import { applyCommand } from "@autobattler/rules/src/commands.js";
import { NetClient } from "./net.js";
import type { IDriver, DriverEvent } from "./driver.js";

export class NetDriver implements IDriver {
  private net: NetClient;
  private _state: MatchState | null = null;
  get seatIndex(): number { return this.mySeat; }
  private _myPairing: { opponentId: number; isGhost: boolean } | null = null;
  private _myOpponentBoard: (UnitInstance | null)[] | null = null;
  private _myCombatResult: CombatResult | null = null;
  private _phaseEndsAt = 0;
  private _clockOffset = 0;
  private listeners: Array<(e: DriverEvent) => void> = [];
  private mySeat = -1;

  constructor(url: string) {
    this.net = new NetClient(url);

    this.net.on((e) => {
      if (e.type === "connected") {
        this.net.send({ type: "QUEUE_JOIN" });
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
          const delta = e.delta as { changedSeat: number; player: MatchState["players"][0]; players: MatchState["players"] };
          this._state.players[delta.changedSeat] = delta.player;
          for (let i = 0; i < delta.players.length; i++) {
            const pub = delta.players[i]!;
            const existing = this._state.players[i]!;
            existing.hp = pub.hp;
            existing.alive = pub.alive;
            existing.placement = pub.placement;
            existing.level = pub.level;
            if (i !== this.mySeat) existing.board = pub.board;
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
          const myPairing = e.pairings.find(([a]) => a === this.mySeat);
          if (myPairing) {
            const [, bId] = myPairing;
            this._myPairing = bId !== undefined ? { opponentId: bId, isGhost: bId < 0 } : null;
            const oppSnap = e.opponentSnapshots[this.mySeat] as { board: (UnitInstance | null)[] } | undefined;
            this._myOpponentBoard = oppSnap?.board ?? null;
          }

          // Run local sim for rendering
          if (this.mySeat >= 0 && this._state) {
            try {
              const myPlayer = this._state.players[this.mySeat]!;
              const boardA = {
                units: myPlayer.board
                  .map((u, i) => u ? { ...u, team: 0 as const, pos: { q: i % 7, r: Math.floor(i / 7) } } : null)
                  .filter((u): u is NonNullable<typeof u> => u !== null),
              };
              const oppBoard = this._myOpponentBoard ?? [];
              const boardB = {
                units: oppBoard
                  .map((u, i) => u ? { ...u, team: 1 as const, pos: { q: i % 7, r: 7 - Math.floor(i / 7) } } : null)
                  .filter((u): u is NonNullable<typeof u> => u !== null),
              };
              const localResult = simulateCombat(boardA, boardB, e.seed, gameData);
              this._myCombatResult = localResult;
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
            if (this._myCombatResult) {
              if (this._myCombatResult.winner !== serverResult.winner) {
                console.warn("[net] combat result mismatch: local winner", this._myCombatResult.winner, "server winner", serverResult.winner);
              }
            }
            this._myCombatResult = serverResult;
          }
          break;
        }

        case "MATCH_END":
          this.emit({ type: "match_over", placements: e.placements });
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
        pairingHistory: new Map(),
        placements: [],
        lastPairings: [],
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

  getMyPairing(): { opponentId: number; isGhost: boolean } | null {
    return this._myPairing;
  }

  getMyOpponentBoard(): (UnitInstance | null)[] | null {
    return this._myOpponentBoard;
  }

  getMyCombatResult(): CombatResult | null {
    return this._myCombatResult;
  }

  advanceFromResolution(): void {
    // Server auto-advances; nothing to do
  }

  getPlanningTimeLeft(): number {
    if (!this._state || this._state.phase !== "PLANNING") return 0;
    return Math.max(0, this._phaseEndsAt - (Date.now() + this._clockOffset));
  }

  private _buildStateFromSnapshot(snap: { round: number; phase: string; me: MatchState["players"][0]; players: MatchState["players"]; lastPairings: [number, number][] }): MatchState {
    const players = snap.players.map((pub, i) => {
      if (i === this.mySeat) return snap.me;
      return {
        ...pub,
        gold: 0,
        xp: 0,
        bench: [],
        items: [],
        shop: [null, null, null, null, null],
        winStreak: 0,
        loseStreak: 0,
        lastBoard: null,
      } as MatchState["players"][0];
    });

    return {
      players,
      pool: new Map(),
      round: snap.round,
      phase: snap.phase as MatchState["phase"],
      prngState: 0,
      pairingHistory: new Map(),
      placements: [],
      lastPairings: snap.lastPairings ?? [],
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
        existing.board = pub.board;
      }
    }
  }
}
