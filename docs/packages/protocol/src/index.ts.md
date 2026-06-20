# packages/protocol/src/index.ts

**Path & purpose** — `packages/protocol/src/index.ts`. Public barrel module for `@autobattler/protocol`; re-exports everything from `messages.ts` and `envelope.ts`. This is the single import path other packages use (`import { ... } from "@autobattler/protocol"`), per the package manifest's `exports["."]` pointing at this file... actually pointing at `index.ts` is implied by convention; the manifest's `main`/`exports` literally point at `./src/index.ts` (see `package.json`).

**Responsibility** — Owns the package's public surface: aggregates the two source modules into one flat export namespace so consumers never need to know the internal file split between message type definitions and envelope/codec logic.

**Exports** — Everything `messages.ts` exports (the `C2SMessage`/`S2CMessage` unions, every individual message interface, `LootOrbWire`/`LootRewardWire`/`LOOT_RARITIES`/`LootRarityWire`, `RoundResultWire`/`ROUND_RESULT_STATUSES`/`RoundResultStatusWire`, `MatchStats`) plus everything `envelope.ts` exports (`PROTOCOL_VERSION`, `Envelope`, `encode`, `decodeEnvelope`, `decodeC2S`, `decodeS2C`, `validateC2S`, `isValidName`, `validateNameMap`, `validateLootOrbs`, `validateRoundResult`, `validateMatchStatsMap`, `validateUseConsumableCmd`). No new symbols are defined here — pure re-export (`export *`).

**Key behavior** — Module-resolution only; no runtime logic. `export * from "./messages.js"` and `export * from "./envelope.js"` (the `.js` extensions are TypeScript's ESM-resolution convention even though the actual files are `.ts` — Node's ESM loader + this monorepo's module resolution settings map `.js` import specifiers to the corresponding `.ts` source).

**Invariants & constraints** — If `messages.ts` and `envelope.ts` ever export two symbols with the same name, `export *` would create an ambiguous re-export (a TypeScript compile error) — this hasn't happened yet (the two files are designed with disjoint export names) but is a constraint any future addition to either file must respect.

**Depends on** — `./messages.js` (message type definitions) and `./envelope.js` (envelope/codec/validators) — both siblings in this same package.

**Used by** — Every package that imports `@autobattler/protocol` (per the package manifest's `exports["."]` mapping `"@autobattler/protocol"` to this file): `packages/server` (message construction/decoding, room/session logic) and `packages/client` (`net.ts`, `netDriver.ts`, and anywhere protocol types are referenced).

**Notes** — Trivial barrel file; no logic to verify beyond the two `export *` statements existing and resolving. Kept as its own file (rather than inlining everything into one module) purely for source organization — `messages.ts` is pure type/const definitions, `envelope.ts` is the codec/validation logic that operates on those types.
