# Path & purpose

`/Users/azat/Desktop/autobattler/autobattler.md` — the original product/architecture design document ("Auto-Battler Mobile Game — Architecture & Design Doc", working title "Riftless"), written pre-implementation. It is the vision/rationale document: game design (match structure, economy, units/pool, traits, items, combat sim rules), the originally proposed technical architecture (stack, services map, match lifecycle, networking, anti-cheat, content pipeline), data models, scalability targets, monetization, build phases, and top risks.

# Responsibility

Captures WHY the system is shaped the way it is — the design intent and original technical plan that `CLAUDE.md` and the actual code have since implemented (with some divergence/evolution). It is a planning artifact, not a living spec: it predates and does not reflect later concrete decisions recorded in `CLAUDE.md` (e.g. exact trait counts, item counts, specific stat formulas, the eventual choice of plain `ws` over Colyseus/uWebSockets, Postgres-or-in-memory repo, etc.).

# Exports

None — markdown design document, not code.

# Key behavior

N/A (static document). Eight sections: 1 Product Overview, 2 Game Design (match structure/economy/units&pool/traits/items/combat simulation), 3 Technical Architecture (core decision rationale for server-authoritative deterministic sim, recommended stack, services map ASCII diagram, match lifecycle, networking protocol, anti-cheat, content/data pipeline), 4 Data Models, 5 Scalability Targets, 6 Monetization & Meta, 7 Build Phases (1 sim core -> 2 single-player slice -> 3 multiplayer -> 4 meta layer -> 5 content & balance -> 6 ship prep), 8 Top Risks.

# Invariants & constraints

- Treat as historical/aspirational, NOT authoritative for current implementation details — where it conflicts with `CLAUDE.md` or the actual source, the code and `CLAUDE.md` win. Known examples of drift:
  - Player starting HP is stated as 100 here; verify against `packages/data/src/gameplay.json` / `packages/data/src/economy.json` for the actual current value used by `packages/rules`.
  - The architecture doc recommends Capacitor-wrapped Pixi client, Redis for matchmaking, Colyseus/uWebSockets for the room server, and a multi-service split (auth/profile/store/leaderboard as separate stateless services) — the actual implementation in `packages/server` is a single-process Node + `ws` server with HTTP API on the same port and no Redis (see `packages/server/src/index.ts`, `http.ts`); the matchmaker is in-process (`matchmaker.ts`), not Redis-queue-based.
  - Unit/trait/item counts ("50 units", "~12 origins, ~10 classes", "9 base components... 36 completed items") happen to match the current `packages/data` content per `CLAUDE.md`, but should still be verified against `packages/data/src/units.json`/`traits.json`/`items.json` directly rather than assumed from this doc.
  - The reconnect/AFK and anti-cheat sections describe intent; the actual mechanisms live in `packages/server/src/session.ts`/`room.ts`/`auth.ts` and may differ in detail.
  - Cosmetic-only monetization and a ranked ladder with seasonal reset are stated goals; no monetization code exists in the repo as of this documentation pass (none found in `packages/server` or `packages/client`).
- The core architectural thesis IS still true today and is worth treating as load-bearing context: server-authoritative state machine, deterministic pure sim shared by server and client, client renders from a seed + server-sent results, integer-only math for cross-platform determinism. This thesis is precisely what `CLAUDE.md`'s "Hard invariants" section encodes more rigorously.

# Depends on

Nothing programmatically. Conceptually precedes and motivates `packages/sim`, `packages/rules`, `packages/protocol`, `packages/server`, `packages/client`.

# Used by

Nothing in code (not imported/read by any program). Historical reference only; `CLAUDE.md` has superseded it as the operational source of truth.

# Notes

- "Working title: Riftless (placeholder)" — the project is referred to as "autobattler" everywhere else in the repo (package name `autobattler`, directory name `autobattler`); no code references "Riftless".
- Section 3.2 presents Unity+C# as an explicitly rejected alternative stack; useful context for why this is a TypeScript-only monorepo end-to-end.
- Section 7's "Build Phases" roughly map to the eventual package boundaries (`sim` -> rules/client slice -> server/protocol -> server meta (auth/mmr/recorder) -> `data`/`balance` -> ship), though phases blurred together in actual delivery per `CLAUDE.md`'s much more granular "phase 10b"/"stage" labels.
