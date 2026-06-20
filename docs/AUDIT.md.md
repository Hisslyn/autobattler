# Path & purpose

`/Users/azat/Desktop/autobattler/AUDIT.md` — a point-in-time, dated repo audit ("Repo Audit — 2026-06-13") grading the codebase against build/test health, determinism/purity, rules/sim correctness, client invariants, data-driven-ness, code health, and the invariants enumerated in `CLAUDE.md`, with a severity-ranked list of gaps found at that time.

# Responsibility

Historical/reference documentation only. It is a snapshot audit report, not code and not living documentation — it records the state of the repo as of 2026-06-13 (tests passing 137/137, specific line-numbered evidence for each invariant). It is NOT automatically regenerated and will drift from the current code (the codebase has since grown substantially per `CLAUDE.md`, e.g. items/loot/PvE "phase 10b" and multiple "visual-overhaul" stages postdate this audit).

# Exports

None — this is a markdown document, not code.

# Key behavior

N/A (static document). Structure: 8 graded tables (Build & tests; Determinism & purity; Rules correctness; Sim correctness; Client invariants; Data-driven check; Code health; CLAUDE.md invariants vs enforcing tests) each with Item / Grade (PASS/PARTIAL/FAIL) / Evidence (file:line citations), followed by a "Severity-ranked gaps" section split into Blocker / Major / Minor.

# Invariants & constraints

- This file should be treated as **stale evidence**, not a current source of truth — any agent using it must verify claims against the live source (e.g. line numbers like `engine.ts:43-50` may have shifted).
- Notable findings recorded at the time (useful as a "things to double check" list, not as current fact):
  - Major #1: placement semantics were inverted — first-eliminated player got `placement = 1` and the winner never got a placement; this affected `rounds.ts`, `room.ts` MATCH_END, and the match-over screen. Whether this has since been fixed is NOT verified by this doc — check `packages/rules/src/rounds.ts` and `packages/server/src/room.ts` directly.
  - Major #2: online clock offset was dead — `net.ts` consumed PONG without emitting, so `netDriver.ts`'s offset-update path never ran.
  - Major #3: renderer (`scenes/match.ts`) duplicated trait-counting logic and diverged from the engine's unique-defId counting rule, violating the renderer-is-dumb invariant.
  - Several CLAUDE.md-documented invariants had no enforcing test at the time: star multipliers, tick phase order, targeting tiebreak, `calcPlayerDamage` formula, item stat application in combat.
  - CLAUDE.md vs shipped content drift was noted (audit's CLAUDE.md snapshot said "2 traits" vs traits.json's 5) — current CLAUDE.md (see `/Users/azat/Desktop/autobattler/CLAUDE.md`) documents 22 traits, so content has grown well past this audit.

# Depends on

Nothing (static prose). References specific source files by path/line as evidence, but does not import or execute anything.

# Used by

Nothing in code. It's a human/agent-readable report. No grep hits expected from source files (markdown is not imported).

# Notes

- Given the project has since advanced through many more phases (visual-overhaul stages 1-5, phase 10b items/loot/PvE, polish passes, audio system, etc. — all listed in current `CLAUDE.md`), most of this audit's "Minor"/"Major" findings should be re-verified rather than assumed still true. Treat it as a historical artifact for context on past known issues, not a current health report.
- No newer dated audit file exists in the repo as of this documentation pass; if one is added later it should get its own doc entry.
