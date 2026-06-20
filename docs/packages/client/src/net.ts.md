# Path & purpose

`packages/client/src/net.ts` -- the low-level WebSocket transport wrapper: connects to the server, encodes/decodes protocol envelopes, auto-reconnects with backoff, measures round-trip time via PING/PONG, and exposes an event-listener API. This is the thinnest layer between the browser `WebSocket` and the rest of the client; it knows the wire envelope shape but not match semantics.

# Responsibility

Owns: the WebSocket lifecycle (connect/reconnect/stop), translating `C2SMessage` objects to wire JSON (`{v, t, p}` envelope) on send, decoding inbound JSON to `S2CMessage` via the protocol package's validated decoder, the reconnect backoff schedule, the periodic PING heartbeat + RTT computation, and re-using a previously issued seat token to RECONNECT instead of re-queueing after a disconnect. Does NOT own match state, command validation, or any game logic -- `netDriver.ts` owns that layer on top of this.

# Exports

- `type NetEvent = S2CMessage | {type:"connected"} | {type:"disconnected"}` -- everything a listener can receive: any decoded server message, OR one of two synthetic lifecycle events this class injects itself.
- `class NetClient` -- the WebSocket wrapper.
  - `constructor(url: string, token?: string)` -- stores the URL and optional seat token, then immediately calls `connect()` (connection starts on construction, not lazily).
  - `get rttMs(): number` -- the most recently measured round-trip time in ms (updated on each PONG; 0 until the first PONG arrives).
  - `get seatToken(): string | null` -- the current seat token (set at construction, or overwritten when a `MATCH_FOUND` message arrives with a fresh token).
  - `on(listener: (e: NetEvent) => void): () => void` -- subscribes a listener to every emitted `NetEvent`; returns an unsubscribe function.
  - `send(msg: C2SMessage): void` -- wraps `msg` in the protocol envelope (`{v: PROTOCOL_VERSION, t: msg.type, p: msg}`) and sends as JSON over the socket, but ONLY if the socket is currently `OPEN` -- silently drops the message otherwise (no queueing, no error).
  - `stop(): void` -- permanently stops this client: sets an internal `stopped` flag (suppresses future auto-reconnect), clears the reconnect timer and ping interval, and closes the socket.

# Key behavior

**Connection lifecycle (`connect`)**: opens a `new WebSocket(this.url)`. On `onopen`: resets the reconnect-attempt counter to 0, emits `{type:"connected"}`, starts the ping heartbeat, and -- if a seat `token` is already held (either passed at construction or received from a prior `MATCH_FOUND`) -- immediately sends `{type:"RECONNECT", token}` instead of waiting for the caller to re-queue, so a network blip mid-match resumes the same seat rather than re-entering matchmaking.

On `onmessage`: decodes the raw string via `decodeS2C` (protocol package's validating decoder); a `null` result (malformed message) is silently dropped. A `PONG` message is intercepted here (never forwarded to listeners) to compute `_rttMs = Date.now() - msg.ts`. A `MATCH_FOUND` message updates the stored `token` from `msg.token` (used for future RECONNECT attempts) before being forwarded. Every other decoded message is emitted to listeners as-is.

On `onclose`: stops the ping timer, emits `{type:"disconnected"}`, and -- unless `stop()` was explicitly called (`this.stopped`) -- schedules a reconnect attempt.

On `onerror`: simply closes the socket (which then triggers `onclose`'s reconnect-scheduling path) -- no separate error event is emitted to listeners.

**Reconnect backoff (`scheduleReconnect`)**: delays are `[500, 1000, 2000, 4000, 8000]` ms, indexed by `min(reconnectAttempt, 4)` (so it caps at 8s and stays there for further attempts, never giving up entirely as written -- there is no max-attempts cutoff). Each scheduled attempt increments `reconnectAttempt` before the timer fires (not after), and a successful `onopen` resets it back to 0.

**Heartbeat (`startPing`/`stopPing`)**: every `PING_INTERVAL_MS` (5000ms) sends `{type:"PING", ts: Date.now()}`. The server is expected to PONG back with the same timestamp echoed (`msg.ts`), letting `onmessage`'s PONG handler compute RTT as `now - originalTs`. `startPing` first calls `stopPing` defensively (avoids double intervals if called twice).

# Invariants & constraints

- `send` has NO outbound queue -- if the socket isn't `OPEN` (e.g. mid-reconnect), the message is silently dropped, never buffered/retried. Callers relying on command delivery must handle this themselves (or rely on the server's reconciliation/resync mechanisms).
- The reconnect loop has no maximum-attempts ceiling -- it will retry forever at 8s intervals until `stop()` is called. A reader implementing a "give up after N attempts" UX would need to add that in the consumer (`netDriver.ts`), not here.
- RECONNECT-on-reopen depends entirely on `this.token` being truthy; a client that never received a `MATCH_FOUND` (e.g. disconnected before matchmaking completed) will reconnect cleanly via a fresh open but will NOT auto-RECONNECT into a match (there's nothing to reconnect to).
- PONG messages are NEVER forwarded to listeners -- any consumer wanting raw RTT samples (vs. just the `rttMs` getter) cannot observe them via `on()`.
- `stop()` is irreversible for that `NetClient` instance -- there is no `restart()`; a caller needing to reconnect after `stop()` must construct a new `NetClient`.

# Depends on

- `@autobattler/protocol` (`decodeS2C`, `encode` -- though `encode` is imported but NOT used in this file's `send`, which manually builds the envelope object instead of calling `encode`; `PROTOCOL_VERSION`; `S2CMessage`/`C2SMessage` types) -- the wire envelope shape and message type unions.
- Browser `WebSocket` global -- no abstraction/polyfill layer.

# Used by

`packages/client/src/netDriver.ts` -- `NetDriver` constructs a single `NetClient` (`new NetClient(url)`, optionally with a token) and subscribes to its `NetEvent` stream to drive the `IDriver` interface for Online-mode matches (per CLAUDE.md's description of `netDriver.ts`).

# Notes

- `encode` is imported from `@autobattler/protocol` but never called -- `send()` constructs the envelope object literal directly (`{v, t, p}`) rather than using the shared `encode(S2CMessage)` helper (which per CLAUDE.md's protocol description is for the SERVER side encoding S2C messages; this file is the CLIENT sending C2S messages, so there may be no equivalent `encodeC2S` helper, making the manual construction here the only option -- worth confirming if protocol.ts is ever extended with a client-side encode helper, this call site should switch to it for consistency).
- There's no exponential-backoff jitter -- all clients reconnecting after a server restart will retry in lockstep at the same fixed delays, a minor thundering-herd risk at scale (not flagged as a concern by the code, but worth noting for a server-ops reader).
