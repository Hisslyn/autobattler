# Documentation Index

Readable map from source path to its documentation file. One line per documented source file.

- AUDIT.md -> docs/AUDIT.md.md — point-in-time (2026-06-13) repo health/invariant audit report, now stale relative to current code
- CLAUDE.md -> docs/CLAUDE.md.md — canonical, living project brief: architecture, hard invariants, workspace layout, per-package internals reference
- autobattler.md -> docs/autobattler.md.md — original pre-implementation design doc (vision/rationale, now partly superseded by CLAUDE.md)
- docker-compose.yml -> docs/docker-compose.yml.md — local Postgres 16 container for dev/test persistence
- package.json -> docs/package.json.md — root npm workspace manifest: workspaces glob, shared dev tooling, top-level scripts
- packages/balance/package.json -> docs/packages/balance/package.json.md — @autobattler/balance manifest: ESM, depends only on sim+data
- packages/balance/src/cli.ts -> docs/packages/balance/src/cli.ts.md — balance CLI entry; the only I/O-permitted script outside the server; writes balance-report.md/.json
