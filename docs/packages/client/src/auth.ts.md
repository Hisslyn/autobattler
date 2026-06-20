# Path & purpose

`packages/client/src/auth.ts` -- guest authentication client: device-bound identity bootstrapping, token persistence, and the HTTP API wrapper functions for profile/leaderboard/history/rename.

# Responsibility

Owns the client-side half of the server's guest-auth HTTP API (`packages/server/src/http.ts`): generating/persisting a device id, registering or reusing a guest account, and exposing typed fetch wrappers for every authenticated/public HTTP endpoint the client needs (profile, leaderboard, match history, profile rename). Does NOT touch the WebSocket protocol -- `NetDriver`/`net.ts` separately read the resulting token to include in `QUEUE_JOIN`.

# Exports

- `interface AuthProfile { accountId: string; name: string; mmr: number }` -- the public profile shape returned by the server.
- `interface AuthState { accountId: string; token: string; profile: AuthProfile }` -- the full bootstrap result: account id, the opaque bearer token, and the profile snapshot.
- `function bootAuth(httpBase: string): Promise<AuthState | null>` -- the boot-time entry point. Reads/creates a persistent `deviceId` (via `crypto.randomUUID()`, stored in localStorage key `ab.deviceId`). If a token is already stored (`ab.token`), tries to validate it via `fetchProfile`; on success returns immediately (reusing the existing account). If that fails (stale token, server offline) OR no token was stored, POSTs `${httpBase}/auth/guest` with `{deviceId, name:"Guest"}`; on success persists the new token and returns the full `AuthState`. Returns `null` (never throws) if the server is unreachable or the registration request fails for any reason -- this is the documented contract that keeps offline Practice mode functional.
- `function fetchLeaderboard(httpBase: string, n = 50): Promise<AuthProfile[]>` -- GETs `${httpBase}/leaderboard?n=${n}` (no auth header, public endpoint), throws `Error("leaderboard failed: <status>")` on a non-ok response.
- `interface MatchHistoryEntry { matchId, dataVersion, endedAt, seat, placement, mmrBefore: number|null, mmrAfter: number|null }` -- one row of a player's match history.
- `function fetchProfile(httpBase: string, token: string): Promise<AuthProfile>` -- GETs `${httpBase}/profile` with `Authorization: Bearer <token>`, throws on non-ok, unwraps `{profile}` from the JSON body.
- `function fetchHistory(httpBase: string, token: string, limit = 20): Promise<MatchHistoryEntry[]>` -- GETs `${httpBase}/history?limit=${limit}` with the bearer token, throws on non-ok, unwraps `{history}`.
- `function patchName(httpBase: string, token: string, name: string): Promise<AuthProfile>` -- PATCHes `${httpBase}/profile` with `{name}` and the bearer token; on failure throws an `Error` using the server's `body.error` message if present (falls back to `"rename failed: <status>"`), tolerating a non-JSON error body via `.catch(() => ({}))`. On success returns the updated `profile` (non-null asserted, since a 2xx response is assumed to always include it).

# Key behavior

- Identity persistence is two-layer: `deviceId` (permanent, generated once via `crypto.randomUUID()`) identifies the physical device/browser across token loss; `token` (the opaque HMAC-signed bearer token from the server, see `packages/server/src/auth.ts`) is the actual auth credential, regenerable by re-registering with the same `deviceId` (the server's `POST /auth/guest` is documented as idempotent per device id).
- `bootAuth`'s fallback chain is: stored token works -> reuse; stored token fails or absent -> re-register with the stored (or newly generated) deviceId -> get a fresh token; any network failure at any stage -> return `null` cleanly, never throwing, so callers (`main.ts`) can treat a null result as "proceed offline."
- All authenticated requests use a simple `Authorization: Bearer <token>` header -- no refresh mechanism, no token expiry handling visible in this file (the server's HMAC tokens are presumably long-lived/non-expiring, or expiry is handled by `bootAuth` re-registering on next boot if `fetchProfile` fails).

# Invariants & constraints

- `bootAuth` must NEVER throw -- every code path either returns a valid `AuthState` or `null`; this is explicitly relied upon by `main.ts`'s boot flow (per `CLAUDE.md`: "`bootAuth` (guest auth, tolerant of an offline server -> null)").
- A `null` from `bootAuth` means "Practice works offline; Online/Profile/Leaderboard need a reachable server" -- those three other functions (`fetchLeaderboard`/`fetchProfile`/`fetchHistory`) DO throw on failure and must be called only where the caller can handle/display that error (they are not given the same offline-tolerant treatment as `bootAuth`).
- `patchName` is the ONLY way to change a player's display name -- per `CLAUDE.md`: "Player name is NOT a setting -- changed via `PATCH /profile` (`patchName`)." The server enforces name validity (length 2-16, charset `[A-Za-z0-9 _-]`) and returns a typed `INVALID_NAME` error in the body which this function surfaces via its thrown `Error`'s message.
- Token storage is plain localStorage (not encrypted/sandboxed) -- acceptable given these are guest/low-stakes accounts with no password, consistent with the "Bots never persist... accountId null" model but note real guest accounts DO persist (this module is for the human guest flow specifically).

# Depends on

Browser globals only: `localStorage`, `crypto.randomUUID()`, `fetch`. No imports from other repo packages -- this file has zero dependency on `@autobattler/protocol`/`rules`/`sim` (it's pure HTTP, separate from the WS protocol layer).

# Used by

`packages/client/src/main.ts` (boot flow: calls `bootAuth` before showing the Main Menu). `packages/client/src/netDriver.ts` (reads the resulting token to include in `QUEUE_JOIN`). The meta-screen UI (`packages/client/src/ui/app.ts`) for Profile (`fetchProfile`/`patchName`) and Leaderboard (`fetchLeaderboard`) screens, and presumably a match-history view (`fetchHistory`).

# Notes

- `httpBase` is passed as a parameter to every function rather than being a module-level constant -- callers control the server URL (likely derived from the WS server's host/port, since `packages/server/src/http.ts` documents the HTTP API as living "on the WS port").
- No retry/backoff logic here for transient failures -- a single failed fetch in `fetchLeaderboard`/`fetchProfile`/`fetchHistory` immediately throws; only `bootAuth` has any fallback behavior (re-registering), and even that isn't a retry loop, just a one-shot fallback path.
