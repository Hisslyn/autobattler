# Documentation Index

Readable map from source path to its documentation file. One line per documented source file.

- AUDIT.md -> docs/AUDIT.md.md — point-in-time (2026-06-13) repo health/invariant audit report, now stale relative to current code
- CLAUDE.md -> docs/CLAUDE.md.md — canonical, living project brief: architecture, hard invariants, workspace layout, per-package internals reference
- autobattler.md -> docs/autobattler.md.md — original pre-implementation design doc (vision/rationale, now partly superseded by CLAUDE.md)
- docker-compose.yml -> docs/docker-compose.yml.md — local Postgres 16 container for dev/test persistence
- package.json -> docs/package.json.md — root npm workspace manifest: workspaces glob, shared dev tooling, top-level scripts
- packages/balance/package.json -> docs/packages/balance/package.json.md — @autobattler/balance manifest: ESM, depends only on sim+data
- packages/balance/src/cli.ts -> docs/packages/balance/src/cli.ts.md — balance CLI entry; the only I/O-permitted script outside the server; writes balance-report.md/.json
- packages/balance/src/compositions.ts -> docs/packages/balance/src/compositions.ts.md — 24 budget-normalized archetype comps + buildBoard/activeTraits helpers for the sweep
- packages/balance/src/index.ts -> docs/packages/balance/src/index.ts.md — public barrel re-exporting runner/sweep/report/compositions
- packages/balance/src/report.ts -> docs/packages/balance/src/report.ts.md — pure markdown renderer for the balance sweep output
- packages/balance/src/runner.ts -> docs/packages/balance/src/runner.ts.md — runs N seeded combats between two boards via simulateCombat, aggregates MatchupResult
- packages/balance/src/sweep.ts -> docs/packages/balance/src/sweep.ts.md — round-robin tournament over all comps; aggregates per-comp/unit/tier/trait win rates into SweepReport
- packages/balance/tests/balance.test.ts -> docs/packages/balance/tests/balance.test.ts.md — end-to-end balance package tests: determinism, budget/coverage invariants, smoke report round-trip
- packages/client/PORTRAIT_LAYOUT_SPEC.md -> docs/packages/client/PORTRAIT_LAYOUT_SPEC.md.md — implemented spec for the height-driven portrait layout budget algorithm in layout.ts
- packages/client/index.html -> docs/packages/client/index.html.md — Vite entry HTML: viewport lock, #app canvas mount, #safe-probe safe-area reader, main.ts script tag
- packages/client/package.json -> docs/packages/client/package.json.md — @autobattler/client manifest: depends on data/protocol/rules/sim + pixi.js v8, dev/build/typecheck scripts
- packages/client/public/audio/README.md -> docs/packages/client/public/audio/README.md.md — audio drop-in-file convention: per-state music + per-event SFX overrides, generative/procedural fallback
- packages/client/public/items/README.md -> docs/packages/client/public/items/README.md.md — item-art drop-in slot convention: <itemId>.png overrides procedural emblem icons
- packages/client/public/units/README.md -> docs/packages/client/public/units/README.md.md — unit-art drop-in slot convention: <unitId>.png overrides procedural class glyph
- packages/client/src/audio/director.ts -> docs/packages/client/src/audio/director.ts.md — pure phase->music-state mapping, file/generative resolution, crossfade math, autoplay-unlock state machine
- packages/client/src/audio/manager.ts -> docs/packages/client/src/audio/manager.ts.md — Web Audio engine: node graph, SFX voice synthesis, music crossfade/file-override, combat fx -> sound bridge
- packages/client/src/audio/music.ts -> docs/packages/client/src/audio/music.ts.md — generative loopable music: pure progression/motif/voice-leading theory + Web Audio lookahead scheduler engine
- packages/client/src/audio/sfx.ts -> docs/packages/client/src/audio/sfx.ts.md — pure SFX palette data (layered ADSR voice specs) + total event->sound coverage map
- packages/client/src/auth.ts -> docs/packages/client/src/auth.ts.md — guest auth bootstrap (deviceId+token persistence) + profile/leaderboard/history/rename HTTP wrappers
- packages/client/src/benchLayout.ts -> docs/packages/client/src/benchLayout.ts.md — pure bench/sell-control geometry (landscape + portrait region variants) and pointer-to-slot hit test
- packages/client/src/boardProjection.ts -> docs/packages/client/src/boardProjection.ts.md — exact projective homography warping the flat hex board into a tilted on-screen trapezoid (forward/inverse/scaleAt)
- packages/client/src/combat/player.ts -> docs/packages/client/src/combat/player.ts.md — playback clock + pure fx-stream derivation from the CombatEvent log (no Pixi)
- packages/client/src/combat/reducer.ts -> docs/packages/client/src/combat/reducer.ts.md — pure fold of CombatEvents into positions/hp/mana/alive playback state (stateAtTick, applyEvent)
- packages/client/src/combat/view.ts -> docs/packages/client/src/combat/view.ts.md — Pixi combat rendering: tokens, bars, projectiles/particles/auras/dissolves/shake, all driven by the fx stream
- packages/client/src/combatLayout.ts -> docs/packages/client/src/combatLayout.ts.md — pure zIndex constants for the combat overlay + the match scene's 9-layer stack, with regression-guard ordering
