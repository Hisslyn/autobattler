# Path & purpose

`packages/client/src/torchMeter.ts` -- a pure, renderer-only mapping from a player's gold amount to which of the 5 arena tealight/torch pillars flanking their side of the board should be lit. No Pixi, no game logic; sim/rules never see this.

# Responsibility

Owns: the gold-to-lit-torch-count formula and the per-pillar lit/unlit boolean pattern, including the asymmetric fill DIRECTION convention (player/left side fills front-to-back, opponent/right side fills back-to-front) so the two columns visually "meet in the middle" rather than both filling the same way.

# Exports

- `const TORCHES_PER_SIDE = 5` -- pillar count per side.
- `const TORCH_GOLD_PER = 10` -- gold required per lit torch; 50 gold lights all five.
- `function litCount(gold: number): number` -- `Math.min(5, Math.floor(gold/10))`, with a guard: non-finite or `<= 0` gold returns `0` directly (so `NaN`/`Infinity`/negative inputs degrade to "no torches lit" rather than producing `NaN`/nonsensical counts).
- `function torchLit(gold: number, side: "left" | "right"): boolean[]` -- returns a 5-element array of lit flags indexed back→front (index 0 = the BACK/far pillar, index 4 = the FRONT/near pillar). Computes `n = litCount(gold)` then fills the array per `side`: for `"left"` (the player's own side), the array entry at index `i` is lit if `i >= TORCHES_PER_SIDE - n` (i.e. the `n` FRONTMOST/highest-index pillars light first, so lighting fills bottom-up / front-to-back as gold increases); for `"right"` (the opponent's side), the entry is lit if `i < n` (the `n` BACKMOST/lowest-index pillars light first, filling top-down / back-to-front).

# Key behavior

This is a tiny, total, side-effect-free numeric formula with one piece of "visual semantics" baked in: the asymmetric lighting DIRECTION per side. The module-header comment explicitly states the design intent -- the LEFT (player) column lights its FRONT (near) pillar first and fills toward the back, while the RIGHT (opponent) column lights its BACK (far) pillar first and fills toward the front, so that as both gold meters fill, the lit torches visually converge toward the board's center/depth rather than one column reading "upside down" relative to the other.

# Invariants & constraints

- The function is PURELY a display mapping from gold to a lit pattern -- it has zero coupling to game logic, the sim, or rules; gold is read directly off the already-computed `PlayerState.gold` by the caller, and this module just decides which pillars glow. Changing `TORCH_GOLD_PER` or `TORCHES_PER_SIDE` has NO gameplay effect, purely visual.
- The "index 0 = back, index N-1 = front" convention is used EVERYWHERE in this module and presumably by its caller's rendering code (`drawArenaTorches`/`drawTorchPillar` in `scenes/match.ts`) -- a caller must respect this index ordering when mapping array entries to actual screen pillar positions, since the fill-direction logic depends entirely on which end of the array represents "near" vs "far".
- `litCount`'s clamp to `[0, TORCHES_PER_SIDE]` means gold beyond `50` (at the current `TORCH_GOLD_PER=10`) has no additional visual effect -- there's no overflow/glow-intensity escalation past all-five-lit.
- The non-finite/negative guard in `litCount` is a defensive measure against unexpected input (e.g. a transient negative gold value during a mid-update render) rather than an expected game state -- gold should never legitimately be negative, but this function won't crash or render garbage if it transiently is.

# Depends on

Nothing -- zero imports. Pure, standalone.

# Used by

`packages/client/src/scenes/match.ts` -- `drawArenaTorches`/`drawTorchPillar` (per CLAUDE.md's "Arena tealight candles" description, the file's own internal naming uses TORCH_W/H/FRONT/BACK/MID constants for tealight-candle layout) calls `torchLit(gold, side)` for both the player's (left) and the active opponent's (right) gold to decide each of the 10 total candle pillars' lit state.

# Notes

- The module comment and constant/function naming say "torch"/"pillar"/"flame" throughout, while `scenes/match.ts`'s actual rendering implementation (per the earlier session's reading of that file) refers to the same visual feature as "tealight candles" (`TORCH_W=32`, `TORCH_H=9.1`, `TORCH_FRONT=0.9`, etc., explicitly commented "tealight candle layout") -- this is a naming drift between this logic module (torch/pillar/flame) and the consuming render code's more specific visual metaphor (tealight candles); both refer to the same feature, just with different vocabulary inherited from different design passes (see CLAUDE.md's git log: "noticeable stage-bar improvements", "tea candles repositioning attempt", "visual update for tea candles" -- this confirms the feature was originally torches and was later re-skinned visually as tea candles without renaming this underlying logic file).
- `TORCH_GOLD_PER=10` and `TORCHES_PER_SIDE=5` together hardcode an assumption that "50 gold = max meter" -- if the economy's typical/max gold range changes significantly (e.g. via a future economy.json tuning pass), these two constants would need re-tuning to keep the meter visually meaningful (always-all-lit or never-lit-enough would both reduce the meter's usefulness as a gold-at-a-glance indicator).
