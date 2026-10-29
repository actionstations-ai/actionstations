# ADR-0032: The LAN session server runs inside the app, on the shared session hub

Date: 2026-10-29 · Status: Accepted · Issue: #407 · Spec: [0407](../specs/0407-live-lan-server.md) · Related: ADR-0027 (protocol), #408, #409, #411, #418

## Context

Most tabletops happen in one room with guest Wi-Fi and no internet. Live play (#418) needs a server between the facilitator's app and the players' phones; the first one is the facilitator's own laptop (spec 0407). The protocol library (ADR-0027) already carried a complete server contract in `MemoryServer`, written for tests. The relay (#408) and the self-hosted server (#409) are being built in parallel with their own `relay/core` package, which was not on `main` when this landed. Project rules 3 says no listener may exist unless the user started that action, and nothing may leave the computer but what the user chose.

## Decision

- **One server contract, one implementation.** `MemoryServer`'s logic moved into `src/shared/live/hub.ts` (`SessionHub`: join token, resume-token identity, size and parse checks, `seq`, controller-only types, rate limit, store with a cap, routing, catch-up by destination, blobs, presence). `MemoryServer` is a thin in-process adapter over it, and so are the LAN server's WebSocket and SSE connections. The controller attaches to the hub through the memory adapter: the app never opens a socket to itself. A conformance suite (`src/shared/live/server-conformance.ts`) runs the same cases against the memory adapter and against the LAN server over real WebSocket and SSE + POST connections; the relay's `relay/core` is expected to converge on this hub or run the same suite (follow-up with #408).
- **Two deviations from `MemoryServer`'s earlier behaviour, both from the spec text:** catch-up never returns a client's own frames (0406 routing), and `STORE_FULL` is answered to participants without eviction once the stored cap is reached, because arrival indexes are array positions and eviction would shift them.
- **HTTPS by default with a per-session certificate.** ECDSA P-256, SAN = the bound IP address, seven days, generated with `@peculiar/x509` on Node's WebCrypto; the private key lives in memory only. Plain HTTP is an explicit choice with the risk named in the UI. End-to-end encryption (ADR-0027) does not depend on the choice.
- **An SSE + POST fallback transport.** Safari refuses a WebSocket to a certificate the user clicked through for the page; the server also offers `GET …/events` (the connection) and `POST …/send` (one envelope), with a POST accepted only for an open stream with the same client id and resume token. It is written once in the LAN server and meant to be lifted into `relay/core` for #409.
- **A fixed route table.** `/`, `/s/:sessionId`, `/assets/*` from a map built at start by walking the bundle folder, `/v1/health`, and the four session routes. Request strings pick a branch and are never joined to a path. Hardening headers and a `default-src 'none'` content security policy on every response. Unknown paths are 404 JSON without stack traces.
- **Nothing listens at rest.** The listener is created by `live:session-start`, bound to one chosen address (never `0.0.0.0`), and destroyed by `live:session-end`, the app's `before-quit` (which ends the session first), or test teardown. Idle sockets are pinged every 25 s and dropped after 60 s; connection attempts over 10/s per address are dropped for 10 s; participants are limited to 60 frames a minute; the listener accepts at most 200 sockets.
- **Logs record events, not content.** The connection log (`userData/live/lan.log`, 5 MB × 3) has fixed fields and never a frame or a query string. The session log (`scenarios/<id>/live/<sessionId>/log.jsonl`, spec 0417 format) refuses entries that carry client ids, tokens, keys or addresses, and strips display names in a `role` session; `env.from` carries the salted `clientRef`, not the raw id.
- **Session secrets stay out of the project.** The staff root and the controller's signing and ECDH keys are written to `userData/live/sessions/<id>.json` as `safeStorage` ciphertext for a later resume (0417) and deleted at `session.end`.

## Consequences

- Every server, including the test one, is the same code path, so a feature tested against `MemoryServer` behaves the same on the LAN; the 190 existing protocol tests pass unchanged over the extracted hub.
- The LAN server has no controller token and no session creation route: the controller is the process. The relay and self-hosted servers add those on top of the same hub.
- Phones see one certificate warning per session on HTTPS; the fingerprint on the Facilitate page lets a player check it. Safari users get the fetch transport without noticing.
- `@peculiar/x509` (MIT, pure JavaScript) and `qrcode` (MIT) are new runtime dependencies; `pnpm dedupe` was needed so `@peculiar/asn1-schema` resolves to one copy (two copies break its schema registry).
- The player bundle (#411) is served from `out/player/` when present and a placeholder page otherwise; `electron-builder.yml`'s `extraResources` entry for it lands with #411.
