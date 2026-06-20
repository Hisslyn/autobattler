# packages/rules/src/state.ts

**Path & purpose** — `packages/rules/src/state.ts`. The canonical type definitions for the entire match state machine: `MatchState`, `PlayerState`, `ShopSlot`, `RoundResult`/`RoundResultStatus`, `Phase`. Pure type declarations, zero runtime code (no functions, no logic) — this file IS the schema every other `rules` module (and the server/client that consume `MatchState`) reads and mutates against.

**Responsibility** — Owns the shape of the match's entire mutable state. Every other file in `packages/rules` (`match.ts`, `commands.ts`, `rounds.ts`, `shop.ts`, `pool.ts`, `economy.ts`, `loot.ts`, `ai.ts`) operates on these exact types. This file defines WHAT exists, not how it changes — all mutation logic lives elsewhere.

**Exports**
- `ShopSlot` — `{defId: string, tier: number}` — one rolled shop slot's unit identity + tier (cost = tier, per `commands.ts`'s BUY).
- `PlayerState` — the full per-player record:
  - `id: number` — seat index (0-based, stable for the match's lifetime, used as the key into `players[]` and every `Map<number, ...>` in `MatchState`).
  - `hp: number` — match HP (starts at `gameplay.startingHp`; reaching `<= 0` triggers elimination in `rounds.ts`).
  - `gold: number`, `xp: number`, `level: number` — economy state.
  - `bench: UnitInstance[]` — dense array (no nulls — bench slots are always packed), up to `gameplay.benchMax`.
  - `board: (UnitInstance | null)[]` — fixed-length array (`gameplay.boardSlots` long) with nulls for empty slots; ACTIVE unit count is constrained by `level` (checked in `commands.ts`'s MOVE/BUY paths), not by array length.
  - `items: string[]` — the player's UNEQUIPPED inventory: a flat multiset of item ids (loose components + completed items; duplicates allowed, order matters for some command index lookups in `commands.ts`'s COMBINE_ITEMS).
  - `shop: (ShopSlot | null)[]` — fixed-length (`economy.shopSlots`, 5), nulls for slots already bought or that failed to roll (pool exhaustion).
  - `winStreak`/`loseStreak: number` — mutually-exclusive-by-convention counters (one resets to 0 whenever the other increments, per `rounds.ts`'s win/loss handling) feeding `economy.ts`'s `calcIncome` streak bonus.
  - `alive: boolean` — false once eliminated; eliminated players' bench/board/shop are wiped to empty by `rounds.ts`.
  - `lastBoard: BoardState | null` — a dense (no-null) snapshot of this player's board AS OF their last combat — used as the "ghost" source board if an UNRELATED future odd-count round needs a bye opponent and randomly picks this (now possibly eliminated) player as the ghost source.
  - `placement: number | null` — final match placement (1 = winner... 8 = first eliminated), assigned only at elimination time by `rounds.ts`; `null` while still alive/match ongoing.
  - `roundWins`/`roundLosses: number` — accumulated COMBAT-ROUND-ONLY win/loss counts across the match (explicitly: bye and PvE rounds never increment either).
  - `totalDamageTaken`/`totalDamageDealt: number` — accumulated HP lost/dealt across all combat rounds (same "combat rounds only" scope as the win/loss counters — see the inline comment "Accumulated match stats (combat rounds only; bye/PvE don't count as W/L)").
- `RoundResultStatus` — `"won" | "lost" | "bye" | "pve"` — the per-round outcome tag shown on the resolution screen. Notably has NO separate `"draw"` value — a draw collapses into the pre-set `"bye"` default at the `lastRoundResult` level (see `rounds.ts`'s doc for why), even though `getPairingFor`'s `outcome` field (computed independently from `CombatResult.winner`) DOES expose `"draw"` as a distinct value elsewhere.
- `RoundResult` — `{status, damageTaken, damageDealt}` — one round's resolution-screen payload for one player; `damageTaken` is 0 on win/bye/pve, `damageDealt` is 0 on loss/bye/pve (each round's record is one-directional: at most one of the two fields is ever nonzero for a given player+round).
- `Phase` — `"PLANNING" | "COMBAT" | "RESOLUTION"` — the three-state match phase cycle (see `match.ts`'s `advancePhase`).
- `MatchState` — the top-level match record:
  - `players: PlayerState[]` — indexed by seat id (parallel array, `players[i].id === i` by construction).
  - `pool: Map<string, number>` — the shared unit pool (defId → remaining count); see `pool.ts`.
  - `round: number` — 1-based current round number, drives the `stageForRound`/`isPveRound` schedule in `rounds.ts`.
  - `phase: Phase`.
  - `prngState: number` — the single persisted PRNG checkpoint between phase transitions; every randomness consumer re-seeds a fresh `mulberry32` from this value then advances it (see `match.ts`'s doc for the exact store/reseed/advance pattern).
  - `nextUid: number` — monotonic counter shared by BOTH player units (across the whole match — merges, purchases) AND PvE mob units (`buildMobBoard` in `rounds.ts`) — one namespace, starting at 10000 (set in `match.ts`'s `createMatch`).
  - `pairingHistory: Map<number, Map<number, number>>` — symmetric meet-count tracking (player id → opponent id → times met) feeding `rounds.ts`'s anti-repeat pairing algorithm.
  - `placements: number[]` — player ids pushed in ELIMINATION order (first eliminated pushed first) as `rounds.ts` assigns `placement` numbers.
  - `lastPairings: [number, number][]` — this round's PvP pairings; second element negative encodes a ghost match (decode via `-(bId+1)` to get the real eliminated-player source id); empty array on a PvE round (no pairing concept).
  - `lastRoundSeed: number` — the round's seed as drawn from the match's prng stream (before per-pairing/per-player seed derivation) — exposed so combat can be re-simulated/verified given this single value plus `derivePairingSeed`.
  - `lastCombatResults: Map<number, CombatResult>` — keyed by player id; BOTH sides of a real pairing share the same `CombatResult` object reference; ghost opponents (negative ids, possibly long-eliminated players) get no entry.
  - `lastOpponentBoards: Map<number, (UnitInstance | null)[]>` — keyed by player id → what THEY fought (their opponent's board at combat start, or the shared mob board on a PvE round).
  - `lastLootOrbs: Map<number, LootOrb[]>` — keyed by player id → the round's ALREADY-DECIDED loot orbs (populated only on PvE rounds; empty on PvP/bye rounds — `rounds.ts`'s PvP path explicitly resets this to a fresh empty Map so a non-PvE round never shows stale orbs from a prior PvE round).
  - `lastRoundResult: Map<number, RoundResult>` — keyed by player id → this round's resolution-screen payload; REBUILT FRESH every round (both PvP and PvE paths construct a brand-new `Map` rather than mutating the previous round's entries).

**Key behavior** — N/A (pure type declarations; no runtime behavior of its own). All "behavior" implied by these types is implemented in the sibling files listed under Used by.

**Invariants & constraints**
- `PlayerState.items` is a flat array of ids with NO uniqueness constraint — duplicate item ids are valid and meaningful (e.g. two loose `iron_sword`s); several `commands.ts` operations (COMBINE_ITEMS) explicitly handle "the same id appears twice" by index rather than by value.
- `board`'s array LENGTH is fixed at `gameplay.boardSlots` for the player's entire lifetime (never resized) — only its CONTENTS (null vs occupied) change; the same is true of `shop` (fixed at `economy.shopSlots`).
- `bench` has NO fixed length in the type itself — it's constrained to `<= gameplay.benchMax` only by the LOGIC in `commands.ts` (BUY/MOVE), not by the type system; a caller bypassing `commands.ts` could technically push past the cap (a discipline invariant, not a type-level one).
- The "combat rounds only" scoping comment on `roundWins`/`roundLosses`/`totalDamageTaken`/`totalDamageDealt` is the SOLE source of truth for what counts as a "real" round for stats purposes — bye and PvE rounds NEVER touch these four fields (confirmed by `rounds.ts`'s `recordRoundWin`/`recordRoundLoss` only being called from the real-pairing win/loss branches, never from the PvE or ghost-fight-without-opponent paths).
- `lastLootOrbs`/`lastRoundResult`/`lastCombatResults`/`lastOpponentBoards`/`lastPairings` are all explicitly ROUND-SCOPED "last" snapshots — they hold ONLY the most recently resolved round's data, fully replaced (not appended) every time `runCombatPhase`/`runPveRound` runs. Any consumer wanting historical data across multiple rounds must capture these snapshots itself (e.g. the server's recorder persists final per-match accumulators, not round-by-round history).
- `MatchState` is a single mutable object passed by reference through the whole rules layer — there's no immutability/copy-on-write discipline; every function in sibling files (`applyCommand`, `runCombatPhase`, `advancePhase`, etc.) mutates it directly.

**Depends on** — `@autobattler/sim/src/types.js` — `UnitInstance`, `BoardState`, `CombatResult` (the sim-layer shapes embedded throughout `PlayerState`/`MatchState`); `./loot.js` — `LootOrb` (the loot reward shape used by `lastLootOrbs`).

**Used by** — every other file in `packages/rules` (`match.ts`, `commands.ts`, `rounds.ts`, `shop.ts`, `pool.ts`, `economy.ts`, `ai.ts`) imports `MatchState`/`PlayerState`/etc. from here; `packages/server/src/room.ts` holds a live `MatchState` per room and serializes relevant fields into S2C messages; `packages/client/src/driver.ts`/`netDriver.ts` read `MatchState` fields (locally for Practice, reconstructed/mirrored for Online) to drive the renderer.

**Notes** — This file has a dedicated per-shape subpath export in `packages/rules/package.json` (`"./state"` → `state.ts`), consistent with the package's unusual per-file-subpath `exports` map noted in that file's own doc — consumers can import `@autobattler/rules/state` directly rather than going through the package's default export.
