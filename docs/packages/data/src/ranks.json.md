# packages/data/src/ranks.json

**Path & purpose** — `packages/data/src/ranks.json`. Content-only JSON defining the ordered MMR rank bands (Bronze through Master) used to label a player's competitive rank. Loaded by `packages/data/src/loader.ts` into the `RANK_BANDS` constant and consumed by the pure `mmrToRank(mmr)` helper.

**Responsibility** — Owns the single source of truth for rank-band thresholds: where each named rank tier (Bronze/Silver/Gold/Platinum/Diamond/Master) begins in MMR space. No other file defines or duplicates these thresholds.

**Exports** — This is a data file; no JS/TS exports. Its shape: `{ bands: RankBand[] }` where `RankBand = {id: string, name: string, minMmr: number}` (interface declared in `loader.ts`). Six bands, ordered ascending by `minMmr`:
- `bronze` (Bronze, minMmr 0)
- `silver` (Silver, minMmr 1000)
- `gold` (Gold, minMmr 1200)
- `platinum` (Platinum, minMmr 1400)
- `diamond` (Diamond, minMmr 1600)
- `master` (Master, minMmr 1800)

**Key behavior** — Read once at module load by `loader.ts` into `export const RANK_BANDS: RankBand[]` (a direct cast of `bands`, in file order — already ascending). The pure helper `mmrToRank(mmr)` (in `loader.ts`) walks `RANK_BANDS` in order and returns the last band whose `minMmr <= mmr` (boundary inclusive on the low end: a player exactly at a band's `minMmr` is in that higher band, not the one below); MMR below the lowest band's `minMmr` (0) clamps to `bronze`. Since `economy.json`'s `mmrStart` is 1000, a brand-new player starts exactly at the Silver threshold.

**Invariants & constraints**
- `bands` MUST stay sorted ascending by `minMmr` — `mmrToRank`'s linear scan assumes this and has no sort-correctness fallback; an out-of-order entry would silently produce wrong ranks.
- Every band needs a unique `id` (lowercase, used as a lookup key by `rankColor`/`rankCssVar` in the client's `theme.ts` and as the CSS custom-property suffix `--rank`).
- No band may be removed without checking the client's per-rank CSS color map (`RANK_COLOR` in `theme.ts`) and the `RANK_COLOR`-completeness expectations — every band id here is expected to have a matching client color.
- This file has no schema enforcement at runtime beyond TypeScript's structural cast (`rawRanks as { bands: RankBand[] }`); malformed JSON here is a load-time crash, not a typed error.

**Depends on** — Nothing (leaf JSON file).

**Used by**
- `packages/data/src/loader.ts` — imports as `rawRanks`, exposes `RANK_BANDS` + `mmrToRank(mmr)`.
- `packages/client/src/ui/app.ts` — calls `mmrToRank(profile.mmr)` / `mmrToRank(p.mmr)` to render the Profile screen's rank badge and per-row leaderboard rank badges.
- `packages/client/src/theme.ts` — `rankColor(rankId)`/`rankCssVar(rankId)` map a band `id` from here to a themed badge color (`RANK_COLOR` keyed by these same ids).
- `packages/server` does not import this directly (MMR computation in `mmr.ts` is independent of rank labels — rank is a display-only derivation, never used in matchmaking or persistence logic).

**Notes** — Rank bands are purely cosmetic/display: MMR itself (not the rank label) is what's persisted and used by matchmaking math (`packages/server/src/mmr.ts`). Adding/removing/renaming a band only affects how a given MMR is labeled in the UI, never gameplay or matchmaking behavior.
