# Path & purpose

`packages/client/tests/torchMeter.test.ts` — unit tests for `litCount`/`torchLit` (`packages/client/src/torchMeter.ts`), the pure gold→lit-torch-pillar mapping used by the arena's tealight-candle/torch gold meter, covering the floor/cap math and the asymmetric left/right fill-direction convention.

# Responsibility

Verifies the gold-to-lit-pillar-count formula (`floor(gold/10)` capped at 5) and the per-side boolean array generation, including the deliberately asymmetric fill order: the left (player) side fills front-to-back while the right (opponent) side fills back-to-front, both indexed 0=back/last=front.

# Exports

None — Vitest test file.

# Key behavior

- "lit count is floor(gold/10) capped at 5": exhaustively walks the floor-division boundaries — `litCount(0)=0`, `litCount(9)=0` (just under the first threshold), `litCount(10)=1` (exactly at threshold), `litCount(29)=2`, `litCount(49)=4` (just under 50), `litCount(50)=5` (max), `litCount(120)=5` (capped well past max). Also asserts the two exported constants `TORCH_GOLD_PER === 10` and `TORCHES_PER_SIDE === 5` directly.
- "tolerates negative / non-finite gold (reads empty)": `litCount(-5)` and `litCount(NaN)` both return `0` — confirms the guard `if (!Number.isFinite(gold) || gold <= 0) return 0` short-circuits before the floor/div math, so malformed gold values never produce `NaN`/negative array indices downstream.
- "LEFT fills front→back: index 0 = back, last = front": with the per-pillar index convention `0=back ... TORCHES_PER_SIDE-1=front`, `torchLit(20, "left")` (2 lit) → `[false,false,false,true,true]` — the two HIGHEST indices (frontmost pillars) light first. `torchLit(0,"left")` → all false. `torchLit(50,"left")` → all true (fully lit, direction is moot at the cap).
- "RIGHT fills back→front: index 0 = back, last = front": same index convention but OPPOSITE fill order — `torchLit(20,"right")` (2 lit) → `[true,true,false,false,false]` — the two LOWEST indices (backmost pillars) light first. `torchLit(0,"right")`/`torchLit(50,"right")` mirror the left-side all-empty/all-lit cases.
- "each side always reports exactly TORCHES_PER_SIDE flags": for gold values `[0,7,33,99]`, both `torchLit(g,"left").length` and `torchLit(g,"right").length` equal `TORCHES_PER_SIDE` (5) regardless of gold amount — guards against an off-by-one in the loop bound.

# Invariants & constraints

- The asymmetry (left fills front-up, right fills back-down) is a deliberate visual design choice documented in the source's module header — this test is the regression guard ensuring that asymmetry is never accidentally "fixed" into a symmetric fill, since both sides share the same `0=back/last=front` index convention but apply opposite comparison directions (`i >= TORCHES_PER_SIDE - n` for left vs `i < n` for right).
- `litCount`'s `gold <= 0` check treats exactly `0` the same as negative — both yield `0` lit, consistent with "no gold, no torches."
- No test exercises a non-integer gold value (e.g. `litCount(15.7)`) — `Math.floor` on the divided result handles this implicitly but isn't explicitly asserted.

# Depends on

- `../src/torchMeter.js` (`TORCHES_PER_SIDE`, `TORCH_GOLD_PER`, `litCount`, `torchLit`) — all four exports under test.
- `vitest` (`describe`, `it`, `expect`).

# Used by

Not imported elsewhere — standalone Vitest test file.

# Notes

- This module is purely a renderer/presentation concern — the sim/rules packages never see torch state; gold is the only input, read straight off `PlayerState.gold` by the scene that renders the arena's candle/torch decoration (per the source's own header comment, "the sim/rules never see this").
