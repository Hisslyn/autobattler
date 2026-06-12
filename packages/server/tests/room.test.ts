import { describe, it, expect, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { gameData } from "@autobattler/data";
import { decodeS2C } from "@autobattler/protocol";
import type { S2CMessage, S2C_CombatStart, S2C_CombatResult } from "@autobattler/protocol";
import { simulateCombat } from "@autobattler/sim";
import type { UnitInstance, CombatResult } from "@autobattler/sim/src/types.js";
import { derivePairingSeed, boardToCombatState } from "@autobattler/rules/src/rounds.js";
import { createRoom, markReady, handlePlayerCommand } from "../src/room.js";
import type { Room } from "../src/room.js";
import type { Session } from "../src/session.js";

// READY from all human seats during PLANNING runs combat (→ RESOLUTION),
// and during RESOLUTION skips the pause (→ next PLANNING).
function readyAll(room: Room): void {
  markReady(room, 0);
  markReady(room, 1);
}

function playFullRound(room: Room): void {
  readyAll(room); // PLANNING → combat → RESOLUTION
  readyAll(room); // RESOLUTION → PLANNING
}

function makeFakeSession(id: string): { session: Session; messages: S2CMessage[] } {
  const messages: S2CMessage[] = [];
  const ws = {
    readyState: 1,
    send: (data: string) => {
      const m = decodeS2C(String(data));
      if (m) messages.push(m);
    },
  } as unknown as Session["ws"];
  const session: Session = {
    id,
    ws,
    roomId: null,
    seatIndex: null,
    token: `tok-${id}`,
    afk: false,
    cmdCount: 0,
    cmdWindowStart: Date.now(),
  };
  return { session, messages };
}

function makeUnit(uid: number, defId: string): UnitInstance {
  const def = gameData.units.find((d) => d.id === defId)!;
  return {
    uid,
    defId,
    tier: def.tier,
    star: 1,
    team: 0,
    pos: { q: 0, r: 0 },
    hp: def.hp,
    maxHp: def.hp,
    ad: def.ad,
    as: def.as,
    armor: def.armor,
    mr: def.mr,
    range: def.range,
    mana: def.manaStart,
    maxMana: def.mana,
    abilityDamage: def.abilityDamage,
    attackCooldown: 0,
    statusEffects: [],
    items: [],
  };
}

function eventsHash(events: CombatResult["events"]): string {
  return createHash("sha256").update(JSON.stringify(events)).digest("hex");
}

// A fake client re-simulation: uses ONLY its own board plus the COMBAT_START
// payload (pairings, opponent snapshot, roundSeed), exactly like NetDriver.
function resimulate(
  seatId: number,
  myBoard: (UnitInstance | null)[],
  cs: S2C_CombatStart
): { result: CombatResult; side: 0 | 1 } | null {
  const idx = cs.pairings.findIndex(([a, b]) => a === seatId || b === seatId);
  if (idx < 0) return null;
  const [aId, bId] = cs.pairings[idx]!;
  const side: 0 | 1 = aId === seatId ? 0 : 1;
  if (side === 0 && bId < 0) return null; // ghost: not covered here
  const snap = cs.opponentSnapshots[seatId] as { board: (UnitInstance | null)[] } | undefined;
  if (!snap) return null;
  const myCombat = boardToCombatState(myBoard, side);
  const oppCombat = boardToCombatState(snap.board, side === 0 ? 1 : 0);
  const seed = derivePairingSeed(cs.roundSeed, idx);
  const result = simulateCombat(
    side === 0 ? myCombat : oppCombat,
    side === 0 ? oppCombat : myCombat,
    seed,
    gameData
  );
  return { result, side };
}

describe("server combat protocol (in-process room)", () => {
  let room: Room | null = null;

  afterEach(() => {
    if (room?.phaseTimer) clearTimeout(room.phaseTimer);
    room = null;
  });

  it("clients re-simulate from COMBAT_START and match COMBAT_RESULT event-log hashes (A-side and B-side)", () => {
    const a = makeFakeSession("a");
    const b = makeFakeSession("b");
    room = createRoom([a.session, b.session], 0xabcdef);

    // Give both human seats fixed boards
    for (const seat of [0, 1]) {
      const player = room.state.players[seat]!;
      player.level = 3;
      player.board[seat * 3 + 0] = makeUnit(room.state.nextUid++, "warrior");
      player.board[seat * 3 + 7] = makeUnit(room.state.nextUid++, "archer");
      player.board[seat * 3 + 14] = makeUnit(room.state.nextUid++, "mage");
    }

    const sidesCovered = new Set<0 | 1>();
    const msgCursor = { 0: 0, 1: 0 } as Record<number, number>;
    const seatMsgs: Record<number, S2CMessage[]> = { 0: a.messages, 1: b.messages };

    for (let round = 0; round < 12 && sidesCovered.size < 2; round++) {
      if (!room.state.players.every((p) => [0, 1].includes(p.id) ? p.alive : true)) break;
      // Keep human seats alive so their boards persist across rounds
      room.state.players[0]!.hp = 100;
      room.state.players[1]!.hp = 100;

      // Snapshot of each fake client's own board, as a client would track it
      const myBoards: Record<number, (UnitInstance | null)[]> = {
        0: structuredClone(room.state.players[0]!.board),
        1: structuredClone(room.state.players[1]!.board),
      };

      playFullRound(room);

      for (const seat of [0, 1]) {
        const fresh = seatMsgs[seat]!.slice(msgCursor[seat]);
        msgCursor[seat] = seatMsgs[seat]!.length;
        const cs = fresh.find((m): m is S2C_CombatStart => m.type === "COMBAT_START");
        const cr = fresh.find((m): m is S2C_CombatResult => m.type === "COMBAT_RESULT");
        if (!cs || !cr || cs.pairings.length === 0) continue; // PvE round

        const local = resimulate(seat, myBoards[seat]!, cs);
        if (!local) continue;

        const serverResult = (cr.results as Record<number, CombatResult>)[seat];
        expect(serverResult, `seat ${seat} must receive its COMBAT_RESULT (side ${local.side})`).toBeDefined();
        expect(eventsHash(local.result.events)).toBe(eventsHash(serverResult!.events));
        expect(local.result.winner).toBe(serverResult!.winner);
        sidesCovered.add(local.side);
      }
    }

    expect([...sidesCovered].sort()).toEqual([0, 1]);
  });

  it("COMBAT_START carries the CURRENT round's pairings", () => {
    const a = makeFakeSession("c");
    const b = makeFakeSession("d");
    room = createRoom([a.session, b.session], 42);

    // Rounds 1 and 2 are PvE: COMBAT_START must carry no stale pairings
    playFullRound(room);
    let cs = a.messages.filter((m): m is S2C_CombatStart => m.type === "COMBAT_START");
    expect(cs[cs.length - 1]!.pairings).toEqual([]);

    playFullRound(room);
    cs = a.messages.filter((m): m is S2C_CombatStart => m.type === "COMBAT_START");
    expect(cs[cs.length - 1]!.pairings).toEqual([]);

    // Round 3 is PvP: pairings must cover all 8 alive players
    readyAll(room);
    cs = a.messages.filter((m): m is S2C_CombatStart => m.type === "COMBAT_START");
    const pvp = cs[cs.length - 1]!;
    expect(pvp.pairings.length).toBe(4);
    const ids = new Set(pvp.pairings.flat());
    expect(ids.size).toBe(8);
  });

  it("holds a real RESOLUTION pause: phase sequence and just-finished round label", () => {
    const a = makeFakeSession("e");
    const b = makeFakeSession("f");
    room = createRoom([a.session, b.session], 7);

    // Round 1: PLANNING(1) → combat → RESOLUTION(1); pause until next READY
    readyAll(room);
    expect(room.state.phase).toBe("RESOLUTION");
    expect(room.state.round).toBe(1);

    let phases = a.messages
      .filter((m): m is Extract<S2CMessage, { type: "PHASE_CHANGE" }> => m.type === "PHASE_CHANGE")
      .map((m) => ({ phase: m.phase, round: m.round }));
    expect(phases).toEqual([
      { phase: "PLANNING", round: 1 },
      { phase: "RESOLUTION", round: 1 }, // labels the just-finished round
    ]);
    const resolution = a.messages.find(
      (m): m is Extract<S2CMessage, { type: "PHASE_CHANGE" }> =>
        m.type === "PHASE_CHANGE" && m.phase === "RESOLUTION"
    )!;
    expect(resolution.endsAt).toBeGreaterThan(Date.now());

    // All human seats READY again → resolution ends, next planning begins
    readyAll(room);
    expect(room.state.phase).toBe("PLANNING");
    expect(room.state.round).toBe(2);
    phases = a.messages
      .filter((m): m is Extract<S2CMessage, { type: "PHASE_CHANGE" }> => m.type === "PHASE_CHANGE")
      .map((m) => ({ phase: m.phase, round: m.round }));
    expect(phases).toEqual([
      { phase: "PLANNING", round: 1 },
      { phase: "RESOLUTION", round: 1 },
      { phase: "PLANNING", round: 2 },
    ]);
  });

  it("STATE_DELTA privacy: another seat's delta never contains gold or shop", () => {
    const a = makeFakeSession("g");
    const b = makeFakeSession("h");
    room = createRoom([a.session, b.session], 99);

    room.state.players[0]!.gold = 50;
    handlePlayerCommand(room, 0, { type: "REROLL" });
    handlePlayerCommand(room, 0, { type: "BUY_XP" });

    const deltasForB = b.messages.filter((m) => m.type === "STATE_DELTA") as Array<{
      type: "STATE_DELTA";
      delta: { changedSeat: number; me?: unknown; players: Array<Record<string, unknown>> };
    }>;
    expect(deltasForB.length).toBeGreaterThan(0);
    for (const msg of deltasForB) {
      // No private payload at all for a foreign seat...
      expect(msg.delta.me).toBeUndefined();
      // ...and no gold/shop/item-inventory keys anywhere in the message
      const raw = JSON.stringify(msg.delta);
      expect(raw).not.toContain('"gold"');
      expect(raw).not.toContain('"shop"');
      // Public fields are present for scouting
      expect(msg.delta.players[0]).toHaveProperty("board");
      expect(msg.delta.players[0]).toHaveProperty("bench");
      expect(msg.delta.players[0]).toHaveProperty("xp");
      expect(msg.delta.players[0]).toHaveProperty("winStreak");
    }

    // The acting seat itself still receives its full private state
    const deltasForA = a.messages.filter((m) => m.type === "STATE_DELTA") as typeof deltasForB;
    expect(deltasForA.length).toBeGreaterThan(0);
    const mine = deltasForA[deltasForA.length - 1]!.delta;
    expect(mine.me).toBeDefined();
    expect(mine.me).toHaveProperty("gold");
    expect(mine.me).toHaveProperty("shop");
  });
});
