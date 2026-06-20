# Path & purpose

`/Users/azat/Desktop/autobattler/CLAUDE.md` — the canonical, continuously-maintained project brief for this repo. It is the single source of truth for architecture, hard invariants, workspace layout, dev commands, and a package-by-package internals reference covering every workspace (`data`, `sim`, `balance`, `rules`, `protocol`, `server`, `client`). It is read automatically by Claude Code agents as project instructions and OVERRIDES default agent behavior.

# Responsibility

Defines and enforces (in prose, not code) the system-wide contracts that all packages must honor: determinism, purity boundaries, fixed-point math, server authority, pool conservation, renderer-dumbness, and persistence rules. It also serves as a living architectural index — every significant module across the client gets a one-paragraph behavioral description here, updated as features ship. It is the first document any agent (human or AI) should read before touching code, and the most up-to-date single artifact in the repo (more current than `AUDIT.md` or `autobattler.md`).

# Exports

None — markdown instructions, not code.

# Key behavior

Structured as: (1) one-line elevator pitch; (2) "Hard invariants" — the 10 non-negotiable rules of the system (purity of `sim`, fixed-point-only math, seeded PRNG only, data-driven content, balance-is-only-I/O-package, determinism tests must stay green, pool conservation, seeded PvE loot, server-side command legality, server-is-canon, reducer-only combat playback, bots-never-persist); (3) workspace layout tree; (4) `npm`/docker commands + env vars; (5) one internals section per package (`sim`, `data`, `balance`, `rules`, `protocol`, `server`, `client`) enumerating every file's responsibility and notable behavior/edge cases at a level of detail that lets an agent act without opening the file; (6) an "Agent routing policy" instructing delegation to specialist subagents (ui-designer, ux-designer, audio-engineer, etc.) for non-trivial work, falling back to a generalist coder only when no specialist matches.

# Invariants & constraints

This file states the invariants other docs/files must obey; the most consequential ones for any agent editing code:
- `packages/sim` must stay free of I/O, `Math.random`, `Date`, and floats — integer fixed-point only (scale 1000 = 1.0).
- All randomness must route through the seeded mulberry32 PRNG (`packages/sim/src/prng.ts`).
- All tuning numbers live in `packages/data`; no content logic in code.
- `packages/balance` is the only package allowed to do I/O.
- `npm test` (determinism tests) must stay green after every change.
- Pool conservation: total unit copies across pool + all benches/boards is constant; PvE mobs and items are excluded from this conservation law (mobs aren't pooled, items aren't pooled).
- PvE loot must be derivable purely from `(match prng, loot.json)` — same seed+config → identical orbs.
- Command legality is enforced only in `packages/rules`; commands never throw, they return typed errors.
- The server's combat result is canonical; client-side sim is presentation-only and must reconcile against `COMBAT_RESULT`, logging (not crashing on) mismatches.
- Combat playback in the client must be a pure reducer over the event log — the Pixi layer never touches `MatchState` or re-runs game logic.
- Bots never persist to the database; all persistence goes through the `Repository` interface.
- Agent routing: prefer the most specific subagent (ui-designer/ux-designer/audio-engineer/etc.) over the generalist coder for any non-trivial task; state which agent is handling work before starting.

# Depends on

Nothing programmatically. Conceptually summarizes/depends on the actual implementation across every package — it is documentation OF the code, and an agent should treat the live source as ground truth if this file and the code ever disagree (though in practice this file is kept current by the project's own workflow).

# Used by

Read by Claude Code (and any agent operating in this repo) at the start of every session as the project's system prompt extension; referenced implicitly by every other doc in `docs/` as the architectural ground truth. `docs/AUDIT.md.md` quotes an older snapshot of this file showing content drift over time (proof that this file is actively edited as the project evolves).

# Notes

- This file is far more detailed and current than `autobattler.md` (the original design pitch) — when the two conflict, this file wins for current implementation status; `autobattler.md` should be read as the original vision/design rationale instead.
- Several "phase" and "stage" labels appear inline (e.g. "phase 10b", "visual-overhaul stage 1-5", "polish-pass", "legibility-pass") — these correspond to sequential development milestones and are useful breadcrumbs for understanding why a given constant/module exists, but are not phases tracked anywhere else in the repo (no separate phase-tracking file).
- The "Agent routing policy" section includes a placeholder line `- [map your other niche agents to their domains]` — this is unresolved template text, not a real rule; treat it as a TODO for whoever maintains the subagent roster.
