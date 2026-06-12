# Auto-Battler Mobile Game — Architecture & Design Doc

**Working title:** Riftless (placeholder)
**Genre:** 8-player PvP auto-battler (TFT-like), original fantasy IP
**Platforms:** iOS + Android
**Status:** v1 design, pre-implementation

---

## 1. Product Overview

8 players join a lobby. Each round, players buy units from a randomized shop, place them on a hex board, and watch automated combat against another player's board. Losers take damage; last player standing wins. Match length ~25–35 min.

v1 ships with: full PvP loop, 50 original units across 5 cost tiers, traits/synergies, item system, ranked MMR, cosmetic-only monetization.

---

## 2. Game Design

### 2.1 Match structure
- 8 players per lobby, eliminated at 0 HP (start 100 HP).
- Stages of rounds: PvE creep rounds (stages 1, and one per later stage for item drops), PvP rounds otherwise.
- Round phases: **Planning** (30s: shop, positioning, items) → **Combat** (auto-resolved, ~30s cap) → **Resolution** (damage, gold payout).
- Pairings: round-robin-ish scheduler that avoids repeat matchups; with odd survivors, one player fights a **ghost** (clone of a recently-eliminated or random board).
- Player damage on loss = base per stage + per surviving enemy unit (scaled by star/tier).

### 2.2 Economy
- Income per round: base 5g + interest (1g per 10g banked, cap 5) + win/loss streak bonus (1–3g).
- Unit costs: tiers 1–5 cost 1–5g. Sell-back at cost (1-stars) / discounted (upgraded).
- Reroll: 2g for a new shop of 5. XP purchase: 4g for 4 XP.
- Player level (1–10) gates board slots (units fielded = level) and shifts shop odds toward higher tiers.

### 2.3 Units & pool
- 50 units: 13/13/12/8/4 across tiers 1–5.
- Shared pool: limited copies per unit (29/22/18/12/10 by tier) drawn without replacement across all 8 players — contested comps are a core strategic axis.
- 3 copies merge into 2-star (×1.8 stats), 3× 2-star into 3-star (×3.24).
- Each unit: HP, AD, AS, armor, MR, range, mana pool, one ability (cast at full mana; mana from attacking + taking damage).

### 2.4 Traits
- Each unit has 1 origin + 1–2 classes (e.g. Emberborn / Sentinel).
- ~12 origins, ~10 classes, with breakpoints (2/4/6) granting team or trait-member buffs.
- v1 keeps trait effects stat-based or simple-behavioral (shields, on-hit burn, start-of-combat stealth) — no effects requiring new AI behaviors.

### 2.5 Items
- 9 base components drop from PvE rounds; 2 components combine into 1 of 36 completed items (3×3 symmetric recipe grid).
- Max 3 items per unit. Items are stat bundles + one passive effect.

### 2.6 Combat simulation
- Hex grid 7×8 (each player owns 4 rows; boards mirrored for the fight).
- Fully deterministic, fixed-timestep tick simulation (20 ticks/s): given (board A, board B, RNG seed) → identical result everywhere.
- Per tick: status effects → mana/cast checks → movement (A* to nearest target by default targeting rules) → attacks → death cleanup.
- Hard cap ~60s sim time; overtime applies ramping true damage to force resolution.

---

## 3. Technical Architecture

### 3.1 Core decision: server-authoritative deterministic sim
The combat simulator is a pure, deterministic, side-effect-free module. The **server is the source of truth**: it validates every planning-phase action (legal purchase, legal placement, enough gold) and runs the combat sim. Clients run the *same* sim code locally from the same seed to render combat smoothly with zero per-tick network traffic — server only sends `(opponent board snapshot, seed)` at combat start and the canonical result at the end. Mismatch = client resyncs to server result.

This kills the two classic problems at once: cheating (client never decides outcomes) and bandwidth (no streaming of combat ticks).

### 3.2 Stack (recommended)
- **Shared sim + game rules:** TypeScript package (`@game/sim`) — pure logic, seeded PRNG (mulberry32/xoshiro), integer/fixed-point math only (no floats — float nondeterminism across devices breaks lockstep).
- **Client:** TypeScript + PixiJS (2D WebGL) wrapped in Capacitor for iOS/Android builds. Rationale: maximizes code sharing with the sim and matches existing web skills; an auto-battler is UI-heavy and 2D, so Unity's 3D strengths aren't needed. (Alternative: Unity + C# server sim port — better long-term for 3D/VFX ambition, but doubles sim maintenance.)
- **Realtime server:** Node.js + TypeScript, WebSockets (uWebSockets.js or Colyseus rooms). One stateful **room process per match**.
- **Services (stateless HTTP/REST):** auth, matchmaking, profile/inventory, store.
- **Data:** PostgreSQL (accounts, MMR, match history, purchases), Redis (matchmaking queues, session tokens, live lobby registry, pub/sub).
- **Infra:** containerized; room servers on autoscaling node pool with a director service assigning matches to least-loaded hosts. CDN for static assets/art bundles.

### 3.3 Services map
```
[Mobile Client]
   │  HTTPS                     │ WSS
   ▼                            ▼
[API Gateway]            [Match Director] ──assigns──▶ [Game Room Servers]
   │                            ▲                              │
   ├─ Auth svc                  │                              │ results
   ├─ Profile/Inventory svc   [Matchmaker (Redis queues)]      ▼
   ├─ Store svc                                          [Match Result svc]
   └─ Leaderboard svc ◀──────────────────────────────────── PostgreSQL
```

### 3.4 Match lifecycle
1. Client queues → Matchmaker groups 8 by MMR band (widening window over wait time).
2. Director spins/assigns a room, returns WS endpoint + match token to clients.
3. Room runs an authoritative state machine: `LOBBY → PLANNING(n) → COMBAT(n) → RESOLUTION(n) → … → END`.
4. Planning actions are client → server commands (`BUY i`, `MOVE unit hex`, `REROLL`, `BUY_XP`, `SELL`, `EQUIP`); server validates, applies, broadcasts state deltas.
5. Combat: server pairs players, snapshots boards, generates seed, broadcasts `(pairings, snapshots, seed)`, runs sim itself, broadcasts canonical results.
6. On end: results → Match Result svc → MMR update (per-placement Elo-like, e.g. each placement scored vs lobby average), match history persisted, room torn down.

### 3.5 Networking protocol
- Binary or compact JSON over WSS; client→server commands are small and rate-limited.
- Server→client: full state snapshot on join/reconnect, deltas otherwise.
- **Reconnect:** room holds player slot for full match; on reconnect, replay snapshot + current phase timer. AFK players auto-pilot (no purchases, board persists).
- Clock: server-authoritative phase timers; client renders countdown with latency offset.

### 3.6 Anti-cheat & fairness
- All economy/board mutations validated server-side; client is a dumb renderer.
- Seeds generated server-side per combat; shop rolls server-side.
- Rate limiting + command schema validation at the room boundary.
- Telemetry on impossible action sequences → flagging pipeline (post-v1).

### 3.7 Content/data pipeline
- Units, traits, items, and tuning numbers live in versioned JSON/data files consumed by both sim and client — balance patches without client code changes (asset/data hot-update via CDN, subject to store policies).
- Every match logs its data version; sim replays require matching version.

---

## 4. Data Models (key entities)

- **Account**(id, auth provider, created_at)
- **Profile**(account_id, name, mmr, rank, cosmetics[])
- **Match**(id, started_at, data_version, seed_log)
- **MatchPlayer**(match_id, account_id, placement, final_board, mmr_delta)
- **UnitDef / TraitDef / ItemDef** — static data, versioned
- **LiveMatchState** (in-room memory only): players[gold, hp, xp, level, bench, board, items, shop, streak], pool counts, round index, pairing history

---

## 5. Scalability Targets (v1)

- One room ≈ 8 WS connections, low CPU except ~4 concurrent combat sims per round (each <50ms on one core). A modest 4-vCPU node hosts ~150–300 concurrent matches.
- Stateless services scale horizontally behind the gateway; Postgres handles match-result write volume trivially at launch scale.
- Bottleneck watch: matchmaking fairness at low population (region/MMR fragmentation) — start with wide MMR bands and few regions.

---

## 6. Monetization & Meta (v1)

- Free-to-play, cosmetic-only: board skins, avatar, unit visual variants. No gameplay purchases (also simplifies fairness and store review).
- Ranked ladder with seasonal reset; casual queue shares the same systems.

---

## 7. Build Phases

1. **Sim core** — deterministic combat engine + unit/trait/item data model, headless, fully unit-tested (replay determinism tests across platforms). *Everything depends on this.*
2. **Single-player vertical slice** — client UI (shop/bench/board/drag-drop), local match vs scripted AI boards, full economy.
3. **Multiplayer** — room server, protocol, matchmaking, reconnect, ghost rounds.
4. **Meta layer** — auth, profiles, MMR, match history, leaderboard.
5. **Content & balance** — full 50-unit roster, trait web, item table; internal playtests; tuning loop on data files.
6. **Ship prep** — store builds (Capacitor), cosmetics store, telemetry, soft launch one region.

---

## 8. Top Risks

- **Sim nondeterminism** across devices → mitigated by integer math + cross-platform replay tests in CI from day one.
- **Balance complexity** (50 units × traits × items) → data-driven tuning + sim-vs-sim batch autobattles for rough balance signals.
- **Low launch population** breaks 8-player matchmaking → bots backfilling casual lobbies at launch.
- **Scope** — full PvP v1 is large; phases 1–2 are the kill-or-commit checkpoint.
