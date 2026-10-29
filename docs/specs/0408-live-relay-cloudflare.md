# Spec 0408: Live play: Action Stations relay on Cloudflare's free plan

Issue: #408 · Milestone: 0.6.0 · Status: Implemented (core, Cloudflare adapter, deploy guide; first deploy, live and load tests, and the app transport (#410) open) · Depends on: #406 · Related: #418 (epic), #407 (shares the core), #409 (Node adapter of the same core), #410 (connection choice), #411 (player bundle)

## Summary

Remote and hybrid players need a meeting point on the internet. The Action Stations relay is a
Cloudflare Worker with one Durable Object per session that forwards end-to-end encrypted
frames between the facilitator's app and players' browsers, stores them only for late-joiner
catch-up, and deletes them at session end or after 72 hours. It runs on a Cloudflare account on
the free Workers plan with no payment method: when a daily limit is reached, requests fail
with an error and nothing is billed. Per-session caps keep one session from using the shared
daily allowance. The session logic is a dependency-free core package that the self-hosted
server (#409) and the in-app LAN server (#407) reuse.

## Requirements

### User stories

- As a facilitator running a hybrid exercise, I want remote players to join from home with a
  link, so that the exercise is not limited to one room.
- As the project owner, I want the relay to cost nothing in any month, including a month in
  which it is abused, so that the service can stay up without a budget.
- As a security reviewer, I want to read the relay's source and confirm it cannot read
  exercise content, so that our organization can use it.
- As a facilitator whose session hits a relay limit, I want a clear message and a way out
  (this computer, our own server), not a hang.

### Functional requirements

- **FR-1** Cloudflare adapter. A Worker routes `POST /v1/sessions`, `GET|POST
/v1/sessions/:id/*` and `GET /v1/health` to a Durable Object per session (`idFromName
(sessionId)`) that holds the WebSockets with the hibernation API, stores envelopes and blob
  chunks in its SQLite storage, and implements the server contract of #406 through the shared
  core.
- **FR-2** Player bundle. The Worker serves the player page (#411, `out/player/`) as static
  assets at `/s/:sessionId` and `/assets/*` with the same headers as the LAN server (#407).
- **FR-3** Retention. Stored frames and blobs are deleted when the controller sends
  `session.end`, or by an alarm 72 hours after creation; a content-free tombstone stays for one
  hour after end. There is no other storage anywhere (no KV, R2, D1, logs with payloads).
- **FR-4** Free plan only. The account has no payment method and stays on the Workers Free
  plan; the Durable Objects use the SQLite backend (the only one available on the free plan);
  no paid features (Logpush, Workers Paid, Observability retention, Rate Limiting rules,
  custom domains that need a paid zone feature). Over a daily limit, Cloudflare fails the
  operation with an error, the Worker maps it to `relay.error DAILY_LIMIT` / HTTP 503, and the
  app explains.
- **FR-5** Per-session caps (`LIMITS.relay`, #406): 60 clients; 64 KiB envelopes; 30
  incoming frames per minute per client, 600 per minute per session, bursts of 10; 4,000
  stored envelopes; blobs ≤ 8 MiB each, ≤ 64 MiB per session; 20 reconnects per client per
  hour. Account-wide: 25 sessions created per UTC day, enforced by a singleton `Quota` Durable
  Object; the 26th gets `503 DAILY_LIMIT`.
- **FR-6** Health. `GET /v1/health` returns `{ kind: 'relay', version, protocol: [1], caps,
playerBundleSha256 }` and nothing session-specific; the app calls it only when the user
  presses Test or Start (#410).
- **FR-7** Shown only on choice. The app never contacts the relay unless the facilitator
  selected "Action Stations relay" for a session and pressed Test or Start. No update checks,
  no telemetry.
- **FR-8** Source and deploy. The relay lives in this public repository under `relay/`
  (`relay/core`, `relay/cloudflare`, later `relay/node` for #409) as pnpm workspace packages;
  it is deployed by hand with `wrangler deploy` from a developer machine logged in to the
  project's Cloudflare account; `wrangler.toml` is checked in with no secrets (the Worker has
  none). The deployed version and the player bundle hash are visible in `/v1/health`.
- **FR-9** Logging. The Worker logs connection events (session id, client id, event, close
  code, country from `cf.country`) to the Workers dashboard tail only when a developer is
  tailing (`wrangler tail`); nothing is persisted. Payloads, join tokens and controller tokens
  are never logged.

### Non-functional requirements

- **NFR-1** Cost: zero, provably. No payment method on the account; free-plan products only;
  every limit fails closed. Budget table in [Allowance budget](#allowance-budget).
  (CONTRIBUTING, Project rules 1; ADR-0023 for the same stance on GitHub)
- **NFR-2** Privacy: the relay sees what #406's "What each party sees" says and nothing more;
  Cloudflare additionally sees TLS endpoints and IP addresses as any edge does. The app says so
  before the first connection (#410). (Project rules 3)
- **NFR-3** Accessibility: not a UI component beyond error strings; those are plain language
  with a next step.
- **NFR-4** Performance: a frame reaches 60 clients within 200 ms of arrival at the edge
  (single Durable Object fan-out); hibernation keeps idle sessions at zero duration; a
  reconnect with catch-up of 2,000 frames completes in under 5 s on a phone.
- **NFR-5** Platforms: Workers runtime (`compatibility_date` pinned, `nodejs_compat` off; the
  core uses only Web APIs), tests in `workerd` through `@cloudflare/vitest-pool-workers`.

### Out of scope

- Any paid Cloudflare product; multi-region or multi-account failover.
- Serving a web version of the facilitator's app; the controller is always the desktop app.
- Accounts, authentication, or any identity for facilitators: the relay is an anonymous
  meeting point protected by capability tokens.
- Media transcoding; the app chooses device renditions (#412).

## Design

### Packages

```
relay/
  core/                       @actionstations/relay-core — no runtime dependencies except zod
    src/
      hub.ts                  SessionHub: connections, routing, rate limits, caps, join-token check
      store.ts                SessionStore interface (envelopes, blobs, meta) + MemoryStore
      limits.ts               re-export of LIMITS from src/shared/live/protocol (via tsconfig path)
      frames.ts               parse/validate with src/shared/live/schemas (header only)
      http-fallback.ts        SSE + POST adapter (used by #407 and #409; not by Cloudflare)
      quota.ts                token-bucket rate limiter, per-session counters
      tokens.ts               controllerToken / joinToken hashing and constant-time compare
      index.ts
    test/                     contract tests on MemoryStore + fixtures from src/shared/live/fixtures
  cloudflare/                 @actionstations/relay-cloudflare
    src/
      worker.ts               fetch router, static assets, health, quota check, DO forwarding
      session-object.ts       SessionObject (Durable Object): hibernation handlers, SqliteStore, alarms
      quota-object.ts         QuotaObject: sessions-per-day counter
      sqlite-store.ts         SessionStore on ctx.storage.sql
      errors.ts               map Cloudflare limit errors → relay.error / 503
    wrangler.toml             name, main, compatibility_date, DO bindings + sqlite migrations, assets
    test/                     vitest-pool-workers: DO + Worker integration
    DEPLOY.md                 how to deploy by hand, what to check in the dashboard
  README.md                   what the relay is, what it can and cannot see, limits, how to run your own
```

`pnpm-workspace.yaml` gains `packages: ['relay/*']`. The app does not depend on
`relay/cloudflare`; it depends on `relay/core` only through the LAN server (#407), which
electron-vite bundles (`noExternal: ['@actionstations/relay-core']`) so nothing changes in
`electron-builder.yml`'s `files`. Both packages import the protocol schemas from
`src/shared/live/` with a `@shared/*` tsconfig path; wrangler's esbuild honours it.

### Relay core

`SessionHub` is the server contract of #406 as a pure state machine:

```ts
export interface Connection {
  id: ClientId
  isController: boolean
  send(frame: string): void
  close(code: number, reason: string): void
  remote?: string // for logs only
}
export interface SessionStore {
  meta(): Promise<SessionMeta | undefined> // createdAt, joinTokenHash, controllerTokenHash, endedAt
  setMeta(meta: SessionMeta): Promise<void>
  append(envelope: string, type: MessageType, from: ClientId): Promise<number> // returns arrival index
  readAfter(index: number, limit: number): Promise<{ index: number; envelope: string }[]>
  count(): Promise<number>
  putChunk(
    blobId: string,
    index: number,
    count: number,
    bytes: Uint8Array,
  ): Promise<{ complete: boolean; total: number }>
  getChunks(blobId: string): AsyncIterable<{ index: number; count: number; bytes: Uint8Array }>
  blobBytes(): Promise<number>
  lastSeq(from: ClientId): Promise<number>
  deleteAll(): Promise<void>
}
export class SessionHub {
  constructor(store: SessionStore, limits: Limits, clock: () => number, log: (e: LogEvent) => void)
  create(input: { joinTokenHash: string; controllerTokenHash: string }): Promise<SessionMeta>
  accept(
    conn: Connection,
    auth: { joinToken?: string; controllerToken?: string },
  ): Promise<AcceptResult> // sends relay.hello
  onFrame(conn: Connection, frame: string | Uint8Array): Promise<void>
  onClose(conn: Connection, code: number): Promise<void>
  kick(client: ClientId): Promise<void>
  setJoinTokenHash(hash: string): Promise<void>
  end(): Promise<void>
}
```

Processing order in `onFrame` is the one #406 fixes: size → parse → `from` matches → `seq` →
type allowed for this connection → rate limit → store (unless ephemeral) → route. Routing fans
out `all`, `role:*`, `team:*` to every other connection, `client:<id>` to one, `controller` to
the controller connections. `catchup.request` reads from the store in pages of 200;
`relay.blob.put/get` go to the chunk store. Everything is independent of where the
connections come from: WebSocket on Cloudflare, `ws` in Node, SSE/POST through
`http-fallback.ts`, or an in-process loopback in the Electron app.

The core never parses a payload; `frames.ts` validates the header fields only with a
`EnvelopeHeader` schema (`Envelope.omit({ payload: true, sig: true })` plus a check that
`payload` is an object) so a payload bug in a client cannot crash a server and a server never
needs the payload schemas.

### Durable Object

`SessionObject`:

- `fetch()` handles the WebSocket upgrade: reads `?j=` (join token) or the
  `Authorization: Bearer <controllerToken>` header, calls `hub.accept()`, and on success
  `this.ctx.acceptWebSocket(ws, [clientId])` with `ws.serializeAttachment({ clientId,
isController, since })`. A refused connection is accepted and closed with the protocol's
  close code so the client gets a reason (`4001`, `4004`, `4029`).
- `webSocketMessage(ws, message)` → `hub.onFrame(connFor(ws), message)`;
  `webSocketClose/Error` → `hub.onClose()`. Connection objects are rebuilt from
  `ws.deserializeAttachment()` after hibernation; `this.ctx.getWebSockets()` is the connection
  list, so no in-memory roster needs to survive.
- `this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"ping":1}', '{"pong":1}'))`
  answers keepalives without waking the object. Presence timeouts use the hibernation-safe
  `ws.readyState` on the next wake rather than timers.
- `SqliteStore` on `this.ctx.storage.sql` with tables `meta`, `envelopes(idx INTEGER PRIMARY
KEY, type, sender, frame TEXT)`, `chunks(blob_id, idx, count, bytes BLOB, PRIMARY KEY
(blob_id, idx))`, `seqs(sender PRIMARY KEY, last)`. Chunks are 192 KiB (under the 2 MB row
  limit); a frame is one row; `deleteAll()` is `this.ctx.storage.deleteAll()`.
- `alarm()` fires at `createdAt + 72 h` (set in `create()`) and at `endedAt + 1 h` (set in
  `end()`), deletes everything, and closes any sockets with `4002`.
- `POST /kick`, `POST /join-token`, `POST /end` from the Worker (controller-token checked in
  the DO) map to `hub.kick/setJoinTokenHash/end`.
- HTTP fallback is not mounted: WebSockets always work behind Cloudflare's certificates, and an
  SSE stream would hold the object awake (duration billing is the only meter hibernation does
  not stop).

`QuotaObject` (one, named `quota`): `POST /take` increments `sessions:<yyyy-mm-dd>` in
SQLite and returns `{ ok, remaining }`; an alarm at the next UTC midnight deletes yesterday's
rows. It costs one request per session creation.

### Worker

```
GET  /                         "Scan the QR code" page (static)
GET  /s/:sessionId             player index.html (static asset, SPA fallback for /s/*)
GET  /assets/*                 player bundle, immutable
GET  /v1/health                { kind: 'relay', version, protocol, caps, playerBundleSha256 }
POST /v1/sessions              body { v, joinTokenHash, name? } → QuotaObject.take → DO.create → { sessionId, controllerToken, caps, expiresAt }
GET  /v1/sessions/:id/ws       WebSocket upgrade → DO
POST /v1/sessions/:id/kick     Bearer controllerToken → DO
POST /v1/sessions/:id/join-token  Bearer controllerToken → DO
POST /v1/sessions/:id/end      Bearer controllerToken → DO (same effect as the signed session.end frame; used when the controller's socket is gone)
POST /v1/sessions/:id/controllers  Bearer host controllerToken → DO: mints one more controller token for a co-controller (#440; 0406 lifecycle)
```

Static assets use Workers Static Assets (`[assets] directory = "../../out/player"` built into
`relay/cloudflare/public/` by the deploy script, `not_found_handling = "single-page-application"`
scoped to `/s/*`). Static asset requests are not metered on the free plan, which is why the
player page is served by the Worker and not fetched from the laptop.

`sessionId` is 128 random bits from the Worker (`crypto.getRandomValues`), base64url; the DO
id is `idFromName(sessionId)`, so a request for an unknown session reaches an empty object
that answers 404 without creating storage (the first `meta()` read is free of writes).

Headers on HTML and API responses mirror #407 (`no-store`, `nosniff`, `no-referrer`, strict
CSP with `connect-src 'self' wss://<host>`). CORS is not enabled: the page and the API share an
origin, and the desktop app is not a browser.

### Allowance budget

Free-plan meters that matter (Durable Objects and Workers Free, from the Cloudflare pricing
pages; the deploy doc links them and the numbers are re-checked at each release):

| Meter                   | Free allowance    | What consumes it here                                                     | Per 60-client session (worst case)                                                                    | Sessions/day before the limit                                                                    |
| ----------------------- | ----------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Workers requests        | 100,000 / day     | WebSocket upgrades, API calls (static assets are not counted)             | 60 joins + 20 reconnects/client-hour × 4 h max ≈ 5,000 (capped by the reconnect limit; typical < 300) | ≥ 20 at the cap, hundreds in practice                                                            |
| Durable Object requests | 100,000 / day     | one per upgrade and API call; incoming WebSocket messages at 20:1; alarms | 600 frames/min × 240 min ÷ 20 = 7,200 (cap); typical 500                                              | 13 at the cap; the 25-session quota assumes typical use and Cloudflare fails closed for the rest |
| DO duration             | 13,000 GB-s / day | awake time only; hibernation between frames                               | ≈ 128 MB × (frames × ~5 ms) ≈ 100 GB-s                                                                | ≥ 100                                                                                            |
| SQLite rows written     | 100,000 / day     | one per stored envelope and per blob chunk                                | 4,000 envelopes + 341 chunks (64 MiB) = 4,341                                                         | 23 → hence the 25-session daily cap and the 4,000-envelope cap                                   |
| SQLite rows read        | 5,000,000 / day   | catch-up pages, blob gets                                                 | 60 clients × 4,000 = 240,000                                                                          | ≥ 20                                                                                             |
| SQLite storage          | 5 GB total        | sealed envelopes and blobs, ≤ 72 h                                        | ≤ 64 MiB blobs + ~16 MiB frames                                                                       | 60 live sessions' worth                                                                          |
| WebSocket message size  | 1 MiB             | 192 KiB chunk + base64 ≈ 256 KiB                                          | —                                                                                                     | —                                                                                                |

Reading: a hostile or very busy session is bounded by the per-session caps, and the day is
bounded by the session quota, so one actor cannot spend more than roughly a quarter of the
day's row writes or requests. Everything past that is Cloudflare's own fail-closed behaviour
("further operations of that type will fail with an error"), surfaced as `DAILY_LIMIT`.
Outgoing WebSocket messages are free, which is why fan-out and blob delivery go over the
sockets and never over HTTP.

### App side (controller transport)

`src/main/live/transport/relay-client.ts` (#410 wires the choice; this spec implements the
client):

- `createSession(baseUrl, { joinTokenHash })` → `fetch` POST with the same safety rules as
  `src/main/packs/fetch.ts` (`https` only, no credentials in URLs, no redirects off `https`,
  30 s idle timeout, response capped at 64 KiB). The relay base URL is the constant
  `RELAY_URL = 'https://relay.actionstations.ai'` in `src/shared/ipc/live.ts` (fallback
  `https://actionstations-relay.<account>.workers.dev` until the custom hostname exists, see
  Open questions); it is not user-editable here (an organization's own server is the third
  connection type, #409/#410).
- `connect()` opens `wss://…/v1/sessions/:id/ws` with `ws` and the `Authorization` header,
  implements `Transport` (#406) for the controller's `LiveClient`, reconnects with exponential
  backoff (1 s → 30 s, jitter) and `catchup.request { after }` on resume, and maps close codes
  to `AppError` codes: `4029`/`503 DAILY_LIMIT` → `PROVIDER` with the message "The Action
  Stations relay has reached today's free limit. Switch this session to This computer or Your
  server, or try after 00:00 UTC."; `4004` → `VALIDATION` "Session is full (60 devices)".
- The app pre-stages inject media (#412) by uploading blobs at session start up to the
  session cap and tells the facilitator which injects exceed the relay's 8 MiB blob limit ("show
  this one on the main screen instead").

### Deploy and operate (by hand, no automation)

`relay/cloudflare/DEPLOY.md`:

1. `pnpm --filter @actionstations/relay-cloudflare build` builds the Worker and copies
   `out/player/` (built by `pnpm build:player`, #411) into `public/`; the script writes
   `playerBundleSha256` into `public/manifest.json` and the Worker reads it for `/v1/health`.
2. `pnpm --filter @actionstations/relay-cloudflare exec wrangler login` (browser OAuth to the
   project's account; no API token stored anywhere) then `wrangler deploy`. The DO migration
   `new_sqlite_classes = ["SessionObject", "QuotaObject"]` is in `wrangler.toml`.
3. Dashboard checks after deploy: account on _Workers Free_, no payment method, Logpush off,
   `wrangler tail` only when debugging. The deploy doc shows where to read the day's requests.
4. Release note lists the Worker version id and the player bundle hash; the app's
   `RELAY_PLAYER_BUNDLE_SHA256` constant (#410's Test shows "bundle matches the one shipped with
   this app" or a warning) is updated in the same release.

No GitHub Actions workflow deploys the relay (ADR-0023 allows free Actions, but a deploy needs
a Cloudflare API token as a secret and an automatic push to production; a hand deploy from a
logged-in developer keeps both out). `scripts/check-workflows.mjs` is unchanged.

### Documentation

- `relay/README.md`: purpose, what the relay can and cannot see (table from #406), limits,
  retention, how to run your own (#409), how to report a problem.
- `docs/guides/live-play.md` section "Remote and hybrid: the Action Stations relay": when to
  use it, the limits in plain numbers, the daily-limit message and what to do.
- `docs/adr/0034-live-relay-hosting.md`: Cloudflare free plan, repository location, hand
  deploy, caps, and the reasons.

## Security and privacy

| Threat                                                   | Mitigation                                                                                                                                                                                                     |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Relay operator (the project) or Cloudflare reads content | #406: ciphertext only, opaque ids; nothing stored elsewhere; no Logpush, no payload logging; deletion at end / 72 h by alarm                                                                                   |
| A stranger joins with a guessed session id               | 128-bit ids plus a join token derived from the session key; wrong token → `4001`; connection attempts are rate-limited per IP at the Worker (in-memory token bucket per isolate; best effort)                  |
| Impersonating the controller to the relay                | controller token (256 bits) hashed at rest, compared in constant time; the relay refuses controller-only types from non-controller sockets; players verify signatures anyway                                   |
| Abuse of the free allowance (a flood, a scripted client) | per-client and per-session rate limits (`4008` with `retryAfterMs`), stored-envelope and blob caps, reconnect cap, 25 sessions/day; Cloudflare fails closed                                                    |
| Billing surprise                                         | no payment method; Workers Free; free-plan products only; `DEPLOY.md` checklist; nothing in the account can incur a charge without adding a card                                                               |
| Altered player page from the relay                       | reproducible build from this repository; `playerBundleSha256` in `/v1/health` compared by the app at Test/Start (a tripwire, labelled so in #410); organizations that cannot accept this risk use #407 or #409 |
| Session data outliving its purpose                       | alarms delete at 72 h regardless of the controller; `session.end` deletes at once; tombstone has no content                                                                                                    |
| Oversize frames, zip-like blowups                        | 64 KiB frame cap enforced before parsing; chunk size fixed; blob caps enforced on every `relay.blob.put` against the running total                                                                             |
| Cross-session leakage                                    | one DO per session; ids are not reused; `deleteAll` on end                                                                                                                                                     |
| Secrets in the repository                                | the Worker has no secrets; `wrangler.toml` holds names and bindings only; `gitleaks` runs in `ci:local`                                                                                                        |
| Dependency compromise                                    | the core depends on zod only; the Cloudflare package on `wrangler` and `@cloudflare/workers-types` as dev dependencies; `pnpm audit` in `ci:local`                                                             |

What leaves the computer when this connection is chosen (#410 shows it): session creation
request, the WebSocket to `relay.actionstations.ai` carrying sealed frames and blobs, and the
facilitator's IP address, all through Cloudflare; players' browsers connect to the same host.
Nothing is sent before the user presses Test or Start.

## Testing

Core (`relay/core/test`, Vitest, Node): contract tests of `SessionHub` on `MemoryStore` using
the fixtures from `src/shared/live/fixtures/`: accept with good/bad tokens; `relay.hello`
content; routing for each `to` form; `from` mismatch dropped; `seq` replay dropped;
controller-only types from a player dropped; rate limiter (`4008`, `retryAfterMs`); stored
envelope cap (`STORE_FULL`, controller frames still stored); blob put/get in and out of order,
caps per blob and per session; catch-up paging and `done`; `end` deletes and tombstones; kick
closes and refuses the old join token; SSE/POST adapter (shared with #407). A "no payload
parsing" test feeds envelopes with garbage payload objects and checks they route unchanged.

Cloudflare adapter (`relay/cloudflare/test`, `@cloudflare/vitest-pool-workers`, runs in local
`workerd`, offline, free): session create → quota → DO; WebSocket upgrade with and without
token; hibernation path (`webSocketMessage` after `getWebSockets()` rebuild) by driving the DO
through `runInDurableObject`; SQLite store round trip; alarm at 72 h deletes everything
(`vi.useFakeTimers` + `runDurableObjectAlarm`); end tombstone; static asset routes and headers;
`/v1/health` shape; quota rollover at UTC midnight; `errors.ts` maps a thrown limit error to
`503 DAILY_LIMIT`.

App transport (`src/main/live/transport/relay-client.test.ts`): against a local Node server
running the same core (the Node adapter from #409, or `ws` + `MemoryStore` before it lands):
create, connect, reconnect with catch-up, close-code mapping, URL safety (http refused,
credentials refused, redirect off https refused), response cap.

Live (`LIVE=1`, `relay/cloudflare/test/live.test.ts`): against the deployed relay: health,
create, two `ws` clients plus a controller, one round trip, end; asserts the bundle hash in
health equals the local build's. Never in `ci:local`.

Load (`LIVE=1 LOAD=1`): 60 synthetic clients for 10 minutes at the rate cap against a local
`wrangler dev` instance; asserts no frame loss and reports counts for the budget table.

E2E (Playwright, `e2e/live/relay.spec.ts`, `E2E=1`): the Electron app with
`TTX_LIVE_RELAY_URL=http://127.0.0.1:8787` pointing at `wrangler dev` started by the spec;
start a session with the relay connection, a Chromium player joins through the relay, one
inject round trip, end. Covers the app ↔ relay path without the internet.

## Tasks

1. **Workspace and core.** `pnpm-workspace.yaml` packages; `relay/core` package with `hub.ts`,
   `store.ts` (+ `MemoryStore`), `frames.ts`, `quota.ts`, `tokens.ts`, `limits.ts`; contract
   tests; `pnpm test` runs them (root `vitest.config.ts` adds `relay/core/test`), so
   `ci:local` covers the core with no new step.
2. **Cloudflare adapter.** `relay/cloudflare` with `worker.ts`, `session-object.ts`,
   `sqlite-store.ts`, `quota-object.ts`, `errors.ts`, `wrangler.toml` (SQLite DO migration,
   assets, pinned `compatibility_date`), `vitest-pool-workers` tests; `scripts/local-ci.sh`
   gains `step "relay (workerd)"; pnpm --filter @actionstations/relay-cloudflare test` after
   the unit tests.
3. **Player bundle serving and health.** Build script copying `out/player/` into `public/`
   with `manifest.json` and `playerBundleSha256`; `/v1/health`; static headers; tests.
4. **App transport.** `src/main/live/transport/relay-client.ts`, `RELAY_URL` and
   `RELAY_PLAYER_BUNDLE_SHA256` constants in `src/shared/ipc/live.ts`, close-code → message
   mapping, pre-staging hook for #412; tests against a local core server.
5. **Deploy, docs, ADR.** `relay/cloudflare/DEPLOY.md`, `relay/README.md`,
   `docs/adr/0034-live-relay-hosting.md`, `docs/guides/live-play.md` relay section; first hand
   deploy to the free account; `live.test.ts` and `e2e/live/relay.spec.ts`.
6. **Load test and budget check.** `LOAD=1` script, numbers written into the budget table of
   this spec and `relay/README.md`; adjust caps if the measurements disagree with the
   estimates.

## Changes after implementation

Made in the pull request for #408; the sections above keep the original design where they
still hold.

- **Owner decisions.** The relay code lives in this repository under `relay/` (open question 1);
  the hostname is `relay.actionstations.ai` from the start, since the zone's DNS is already on
  Cloudflare (open question 2); the account must be on the Workers Free plan with no payment
  method, and `relay/cloudflare/DEPLOY.md` makes checking both the first step of every deploy.
  Nothing was deployed in the pull request.
- **Core API.** `SessionHub` is the spec's class with a synchronous `SessionStore` (every backend
  is synchronous: Durable Object `sql.exec`, `node:sqlite`, a Map), which keeps a frame's
  processing atomic. `accept(conn, auth)` takes the wire form (`clientId`, `joinToken`,
  `resumeToken` as base64url, or `controllerToken`; `trustedController` for the LAN server's
  in-process controller) and does the refusal itself (`relay.error` then the close code).
  `attach(conn, since)` re-registers a connection after a hibernation without a hello. `create()`
  mints the controller token; `addController()` mints a co-controller's. `frames.ts` validates
  the whole `Envelope` schema (which only requires `payload` to be an object), not a separate
  header schema: that is what `MemoryServer` does and it costs the same.
- **Caps.** `HubLimits` adds `storedEnvelopes` and `rates` to the protocol's `Limits`
  (`relay/core/src/limits.ts`). Controllers get their own rate (600 a minute, bursts of 60),
  because a blob upload is many frames; participants keep 30 a minute with bursts of 10. A
  rate-limited frame is dropped with `RATE_LIMITED` and `retryAfterMs`; a connection that keeps
  going past its burst is closed with `4008`. Past `storedEnvelopes`, participant frames are
  refused with `STORE_FULL` and controller frames are still stored.
- **Session creation.** `POST /v1/sessions` takes `{ v, joinTokenHash? }` and no `name`: the
  server stores no name at all. The hash is optional because the join token is derived from the
  session id the server is about to mint; the app sets it with `POST …/join-token` right after.
  Until then no participant can connect.
- **`MemoryServer` corrected** (`src/shared/live/transport-memory.ts`) where it strayed from
  this spec and 0406: a refused connection no longer produces a `presence offline` to the
  controller, and catch-up never returns a client's own frames. The conformance suite is the
  regression test.
- **Tests.** `@cloudflare/vitest-pool-workers` pins vitest 4 and the repository is on 5, so the
  Durable Object runs under a shim (`relay/cloudflare/test/shim.ts`: `SqlStorage` on
  `node:sqlite`, a `DurableObjectState` with alarms, hibernatable fake sockets whose server end
  reports to whichever object is bound) inside the root Vitest run; `scripts/local-ci.sh` gains
  no step. The Worker bundle is checked with `wrangler deploy --dry-run`. `@cloudflare/workers-types`
  is not used (it replaces the DOM globals `src/shared/live` compiles against); the adapter
  declares the runtime slice it uses in `src/workers-runtime.d.ts`. The live test, the load test
  and `e2e/live/relay.spec.ts` are follow-ups that need a deployed or `wrangler dev` relay.
- **Tooling.** `wrangler` is run through `pnpm dlx` at a pinned version and is not a dependency,
  so the lockfile stays small and the release workflow installs nothing for the relay.
  `pnpm typecheck` covers `relay/core` and `relay/cloudflare`.
- **App transport (task 4)** belongs to #410 with the connection choice; `RELAY_URL` and the
  bundle-hash constant land there.
- The ADR is `docs/adr/0034-live-relay-hosting.md` (0025 was taken when the work landed).

## Open questions

1. **Where the relay code lives.** This repository under `relay/` (recommended: protocol and
   server change together, one `ci:local`, one issue tracker, the repository is already public)
   or a separate `actionstations-ai/relay` repository (cleaner for organizations that only
   want the server; costs a published protocol package and two release trains). Recommendation:
   this repository now; split later only if the self-hosted server gets its own audience.
2. **Hostname.** `relay.actionstations.ai` needs the zone's DNS on Cloudflare (free plan) to
   attach a Workers custom domain; the site is on GitHub Pages today. Recommendation: ship with
   the `workers.dev` hostname as `RELAY_URL`, move DNS for the zone to Cloudflare's free plan
   when convenient, then change the constant in a release; the app shows the host it will use.
3. **Daily session cap: 25.** Conservative against the 100k rows-written meter at worst-case
   use. Recommendation: start at 25, read the dashboard after the first month, raise toward 50
   if typical sessions write far fewer rows (expected).
4. **Deploy by hand vs a release workflow.** Recommendation: by hand, as specified; a
   workflow would need a Cloudflare API token stored in GitHub and would deploy on push.
5. **Receipts in the store.** They are a third of the row writes. Recommendation: keep storing
   them (a controller reconnect must not lose read status); revisit if the budget table shows
   pressure.
