# Spec 0409: Live play: self-hosted session server for offline networks

Issue: #409 · Milestone: 0.6.0 · Status: Draft · Depends on: #406, #408 (relay core) · Related: #418 (epic), #407 (shares the fallback transport), #410 (connection choice, fingerprint pinning)

## Summary

The relay as a server an organization installs on its own network: the same core as the
Action Stations relay (#408) with a Node + SQLite storage adapter, packaged as a Docker image
and as a single executable for Windows and Linux with a Windows service and a systemd unit. It
runs with no internet at all, serves several sessions across buildings and network segments,
uses TLS with the organization's certificate or a self-signed one whose fingerprint the app
pins, makes no outbound connection, and logs connections but never content. Because it speaks
the protocol of #406, the organization's IT cannot read session content either.

## Requirements

### User stories

- As an exercise planner at an air-gapped emergency operations centre, I want live play across
  three rooms on our internal network with no internet and no third party, so that we can run
  the exercise at all.
- As the IT administrator installing it, I want one binary or one container, a short config
  file, a service unit, and a log I can read, so that the install takes an afternoon and passes
  our change review.
- As a security officer, I want to confirm that the server never connects out, stores only
  ciphertext for a bounded time, and cannot read session content, so that I can sign off.
- As a facilitator, I want to point the app at `https://ttx.internal:8485`, see the
  certificate fingerprint once, confirm it, and start.

### Functional requirements

- **FR-1** Node adapter. `relay/node` runs the shared core (#408) on Node 22 with `ws` for
  WebSockets, the `http-fallback` adapter (SSE + POST, #407) for browsers that refuse `wss:` to
  an untrusted certificate, and a `SqliteStore` on `node:sqlite` (one database file, WAL mode),
  with blob chunks in the database (default) or on disk under the data directory (`--blobs
disk`) for large media.
- **FR-2** Several sessions. Always on; one `SessionHub` per session in memory with its rows
  in the shared database; `maxSessions` (default 20) and `maxClients` per session (default 60)
  are operator settings; limits beyond `LIMITS['self-hosted']` defaults (envelope 256 KiB,
  blob 64 MiB, 1 GiB per session, 20,000 stored envelopes) are configurable up to hard
  ceilings (blob 1 GiB, session 8 GiB).
- **FR-3** Session creation requires a **server key**: a random secret the installer prints at
  first start (and can rotate), entered once in the app for "Your server" (#410) and sent as
  `Authorization: Bearer <serverKey>` on `POST /v1/sessions`. Players never need it; the
  controller token and join token work as in #406. Without the key the server is read-only for
  strangers on the network.
- **FR-4** TLS. `--tls cert,key` (PEM) for the organization's certificate, or `--tls
self-signed` which generates an ECDSA P-256 certificate on first start (SAN from `--host`
  entries), persists it in the data directory, and prints its SHA-256 fingerprint for the app
  to pin. Plain HTTP is allowed only with `--insecure-http` and a startup warning (for a
  reverse proxy that terminates TLS in front).
- **FR-5** Settings via a TOML file, environment variables or flags, in that precedence
  reversed (flags win): `port` (8485), `bind` (`0.0.0.0` or an address), `host` (names/IPs for
  the certificate and the invite URL), `data-dir`, `retention-hours` (≤ 72, default 72),
  `max-sessions`, `max-clients`, `allow` (CIDR list; empty = any), `blobs` (`db`|`disk`),
  `log-dir`, `log-level`, limit overrides.
- **FR-6** Retention. A sweeper every 5 minutes deletes sessions past `createdAt + retention`
  or `endedAt + 1 h`, their rows and chunk files; `session.end` deletes at once (tombstone 1 h).
- **FR-7** No outbound connections. The server contains no HTTP client, DNS lookup, update
  check or telemetry; it is tested for zero outgoing sockets during a full session.
- **FR-8** Logs. `connections.log` (JSON lines: time, event, remote address, session id, client
  id, close code, bytes) rotated at 10 MB × 5; `server.log` for startup, config, errors. Never a
  frame, token or key. `--log-level` `info` or `warn` only (no `debug` that could print frames).
- **FR-9** Packaging. (a) Docker image from a multi-stage `Dockerfile` (`node:22-alpine`,
  non-root, read-only root filesystem, `/data` volume, `HEALTHCHECK` on `/v1/health`) with a
  `compose.yaml` example; (b) single executables `actionstations-relay-win-x64.exe` and
  `actionstations-relay-linux-x64` built with Node's single executable application (SEA)
  tooling; (c) `actionstations-relay service install|uninstall` on Windows (registers a service
  with `sc.exe`) and a `systemd` unit file plus `install.sh` on Linux; all serve the bundled
  player page (#411).
- **FR-10** Health and admin. `GET /v1/health` → `{ kind: 'self-hosted', version, protocol,
caps, playerBundleSha256, fingerprintSha256 }` (fingerprint only when self-signed);
  `actionstations-relay status` (CLI → unix socket / named pipe) prints sessions, clients,
  storage use; `actionstations-relay rotate-key` prints a new server key.
- **FR-11** App integration (`src/main/live/transport/self-hosted-client.ts`): the same
  controller transport as the relay client (#408) with a URL, an optional pinned fingerprint,
  and the server key from `safeStorage`; a pinned fingerprint mismatch is a hard failure with
  the message "The server's certificate changed. Confirm the new fingerprint with your IT
  team before continuing."

### Non-functional requirements

- **NFR-1** Cost: nothing; the organization runs it on hardware it has; no license key, no
  phone-home. Docker image and binaries are published on GitHub Releases (free). (CONTRIBUTING,
  Project rules 1)
- **NFR-2** Privacy: the server sees #406's metadata and nothing else; the connection screen
  (#410) says so; the organization's logs are theirs. The app connects to the server only after
  the facilitator entered its URL and pressed Test or Start. (Project rules 3)
- **NFR-3** Accessibility: CLI output is plain text with no colour-only meaning; docs follow
  the guides' style.
- **NFR-4** Performance: 20 sessions × 60 clients on a 2-vCPU, 2 GB VM; fan-out under 100 ms;
  SQLite WAL with one writer per process; memory under 512 MB at that load.
- **NFR-5** Platforms: Windows Server 2019+/Windows 10+, Linux x64 (glibc 2.31+; the Alpine
  image is musl), Docker 24+. macOS by `node dist/server.js` only (no packaged binary; the
  facilitator's own Mac uses #407).

### Out of scope

- Clustering or HA across machines; one process per server.
- LDAP/SSO; the server key is the only credential and it protects session creation only.
- A web admin UI; the CLI and logs are the interface.
- Serving the facilitator app over the web.

## Design

### Package

```
relay/node/                          @actionstations/relay-node
  src/
    cli.ts                           commands: serve (default), status, rotate-key, service install|uninstall, print-config
    config.ts                        zod Config; TOML + env (AS_RELAY_*) + flags; validation messages
    server.ts                        http/https server, ws upgrade, routes, allow-list, request limits
    sqlite-store.ts                  SessionStore on node:sqlite (WAL, busy timeout, prepared statements)
    sessions.ts                      SessionHub registry, server-key check, sweeper, tombstones
    tls.ts                           load PEM or generate self-signed (@peculiar/x509), fingerprint
    allowlist.ts                     CIDR parsing and matching (IPv4 + IPv6)
    logs.ts                          rotating JSONL writers; redaction guard (refuses to log objects with `payload`)
    admin.ts                         unix socket / named pipe for `status`
    static.ts                        player bundle from the embedded assets (SEA) or ./public (Docker)
    service/windows.ts, service/systemd.ts
  public/                            player bundle copied at build (out/player)
  Dockerfile, compose.yaml, actionstations-relay.toml.example, actionstations-relay.service
  scripts/build-sea.mjs              node --experimental-sea-config → postject → binaries per OS
  test/
  README.md                          → docs/guides/self-hosted-server.md is the user guide
```

Dependencies: `@actionstations/relay-core` (workspace), `ws`, `zod`, `@peculiar/x509`,
`smol-toml`. No HTTP client library; `fetch` is not referenced anywhere (an ESLint
`no-restricted-globals` rule in this package refuses `fetch`, `XMLHttpRequest`, `net.connect`,
`dns`, `http.request`, `https.request`).

### Storage

`node:sqlite` (`DatabaseSync`) in Node 22.13+, which needs no native addon and therefore fits a
single executable. Schema (`schema.sql`, versioned with `PRAGMA user_version`):

```sql
sessions(id TEXT PRIMARY KEY, created_at INTEGER, ended_at INTEGER, join_token_hash TEXT,
         controller_token_hash TEXT, stored INTEGER, blob_bytes INTEGER)
envelopes(session_id TEXT, idx INTEGER, type TEXT, sender TEXT, frame TEXT,
          PRIMARY KEY (session_id, idx))
seqs(session_id TEXT, sender TEXT, last INTEGER, PRIMARY KEY (session_id, sender))
chunks(session_id TEXT, blob_id TEXT, idx INTEGER, count INTEGER, bytes BLOB,
       PRIMARY KEY (session_id, blob_id, idx))             -- or a path when --blobs disk
```

`PRAGMA journal_mode=WAL; synchronous=NORMAL; busy_timeout=5000`. Deletion of a session is one
transaction (`DELETE … WHERE session_id = ?` × 4, then `unlink` chunk files when on disk).
`VACUUM` runs after the sweeper deletes more than 256 MiB. `better-sqlite3` is a drop-in
alternative behind the same `SessionStore` interface if `node:sqlite` proves unsuitable
(open question 1).

### Server

- `https.createServer({ cert, key, minVersion: 'TLSv1.2', honorCipherOrder: true })` or
  `http` with `--insecure-http`. `bind` default `0.0.0.0`; `host` entries name the certificate's
  SANs and the base URL the app shows in invites (the app can override with the URL it used).
- Routes = the relay's (#408) plus the fallback (`/events`, `/send`, `/blobs/:id`, #407) plus
  `POST /v1/sessions` with `Authorization: Bearer <serverKey>` (hash compared in constant
  time; the key is stored as a SHA-256 hash in `data-dir/server-key.hash`; the plaintext is
  shown once at generation).
- Allow-list: checked on `connection` (TCP) before TLS; refused sockets are destroyed and
  counted per source (one log line per minute per address at most).
- Request limits: body ≤ 256 KiB except blob chunks; header timeout 10 s; 1,000 concurrent
  connections cap (`server.maxConnections`); per-address connection rate 20/s.
- `ws`: `maxPayload = envelopeBytes` (256 KiB + base64 slack for chunks), `perMessageDeflate:
false` (ciphertext does not compress; avoids compression side channels and memory).
- Sessions registry: `Map<sessionId, SessionHub>`, lazily rehydrated from the database after a
  restart (sockets are gone, stored frames remain, controllers reconnect with their token and
  players with the join token; `relay.hello` carries the index so catch-up resumes).
- Sweeper (`setInterval` 5 min): expired sessions → `hub.end()` + delete; tombstones after 1 h.
- Graceful stop (SIGTERM / service stop): stop accepting, close sockets with `1001`, checkpoint
  WAL, exit within 10 s.
- Static assets: the SEA embeds `public/` with `sea.getAsset()`; Docker reads `./public` from
  the image; the route map is fixed at startup (no path joins with request input, as in #407).

### CLI

```
actionstations-relay serve [--config FILE] [--port 8485] [--bind 0.0.0.0] [--host ttx.internal --host 10.20.0.5]
                            [--tls self-signed | --tls cert.pem,key.pem | --insecure-http] [--data-dir DIR]
                            [--retention-hours 72] [--max-sessions 20] [--max-clients 60] [--allow 10.0.0.0/8,...]
                            [--blobs db|disk] [--log-dir DIR] [--log-level info|warn]
actionstations-relay status [--config FILE]           sessions, clients, storage, uptime
actionstations-relay rotate-key [--config FILE]       prints a new server key; old key stops working at once
actionstations-relay print-config [--config FILE]     effective settings (key hash redacted)
actionstations-relay service install|uninstall        Windows: registers "Action Stations Relay" via sc.exe (runs as LocalService by default)
```

First start prints: the URL(s) from `host` + `port`, the certificate fingerprint when
self-signed, the server key (once), and the data directory. `print-config` never prints the
key.

### Windows service and systemd

- Windows: `service install` writes `%ProgramData%\ActionStationsRelay\config.toml` (if
  absent), creates the service with `sc.exe create "ActionStationsRelay" binPath=
"<exe> serve --config <path>" start= auto obj= "NT AUTHORITY\LocalService"`, grants the
  data directory to LocalService, and adds a Windows Defender Firewall rule for the port
  (`netsh advfirewall firewall add rule … profile=domain,private`), printing each command it
  ran; `uninstall` reverses it.
- Linux: `actionstations-relay.service` (`Type=simple`, `DynamicUser=yes`,
  `StateDirectory=actionstations-relay`, `ProtectSystem=strict`, `PrivateNetwork=no`,
  `IPAddressDeny=any` + `IPAddressAllow=<org ranges>` as a commented example that also
  enforces "no outbound" at the kernel level, `AmbientCapabilities=` empty since the port is
  above 1024); `install.sh` copies the binary to `/usr/local/bin`, the unit to
  `/etc/systemd/system`, and enables it.
- Docker: `compose.yaml` with `read_only: true`, `tmpfs: /tmp`, `cap_drop: [ALL]`,
  `user: 10001`, volume `relay-data:/data`, the port, env `AS_RELAY_TLS=self-signed` by default;
  `docker compose logs` shows the fingerprint and key on first run.

### App integration

`self-hosted-client.ts` extends the relay client (#408) with:

- `test(url, pin?)`: `GET /v1/health` with a custom `checkServerIdentity`; when `pin` is
  absent and the certificate is not trusted by the system store, the result carries
  `fingerprintSha256` and `untrusted: true` so #410 can show "This server uses a self-signed
  certificate: A1:B2:… — confirm with your IT team" with a Confirm button that stores the pin;
  when `pin` is present it must match or the call fails with `FORBIDDEN`.
- All sockets (`https`, `ws`) use `rejectUnauthorized: pin ? false : true` with
  `checkServerIdentity` comparing `cert.fingerprint256` to the pin (and still the hostname when
  the certificate is CA-signed).
- `http://` URLs are refused unless the host is loopback or a private address _and_ the
  facilitator ticked "This server has no TLS (reverse proxy or trusted network)" in #410; the
  statement of what leaves the computer then says "unencrypted transport; session content stays
  encrypted end to end".
- The server key is stored with `setSecret('live-server:<sha256(url)>', key)` in
  `src/main/secrets/index.ts` (safeStorage), never in `facilitator.json` or settings.

Players' browsers cannot pin; with a self-signed certificate they see the browser warning once
and (on Safari) use the fetch fallback. The guide recommends the organization's own CA or a
certificate from its PKI, which also removes the warning, and explains MDM trust profiles for
the self-signed case.

### Documentation

`docs/guides/self-hosted-server.md`: requirements, install (Docker, Windows service, systemd),
configuration reference, TLS options and how to get the fingerprint into the app, firewall
ports, network segments (the server must be reachable from every room; one TCP port),
retention, logs and what they contain, upgrades (`data-dir` is forward compatible via
`user_version`), uninstall, troubleshooting (certificate warnings per browser, Safari and
WebSockets, allow-list refusals), and the security statement an IT department can paste into a
change request (what the server can and cannot see, no outbound connections, how to verify).
`relay/README.md` (#408) links it.

## Security and privacy

| Threat                                                   | Mitigation                                                                                                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organization IT reads exercise content                   | #406: ciphertext only; the server has no keys; the guide says this is by design and how to verify (`strings` on a database file shows no plaintext) |
| Anyone on the network creates sessions or fills the disk | server key on `POST /v1/sessions`; caps on sessions, clients, stored envelopes, blobs; allow-list; per-address connection rate                      |
| Anyone on the network joins a session                    | join token derived from the session key (#406); the app's kick/rotate work unchanged                                                                |
| Server impersonation / interception on the LAN           | TLS; the app pins the self-signed fingerprint or validates a CA-signed certificate; a changed fingerprint is a hard stop                            |
| Server calls home                                        | no HTTP client code; ESLint rule; outbound-socket test; the systemd example denies egress at the kernel; Docker network can be `internal: true`     |
| Content in logs                                          | fixed-field JSONL; `logs.ts` refuses objects with `payload`, `frame`, `token`, `key` fields (test)                                                  |
| Stale data                                               | sweeper; retention ≤ 72 h enforced by `Config` (a larger value is a validation error); `session.end` deletes at once                                |
| Privilege                                                | runs as LocalService / DynamicUser / uid 10001; port > 1024; read-only filesystem except the data directory                                         |
| Supply chain                                             | workspace dependencies pinned in the lockfile; SEA built from the tagged commit; release lists sha256 of binaries and the image digest              |
| Path traversal                                           | fixed asset map; the data directory is the only write location; blob paths are built from validated base64url ids                                   |

What leaves the facilitator's computer when "Your server" is chosen: session creation (with
the server key), the WebSocket of sealed frames and blobs, to the URL the facilitator entered.
Players' devices connect to the same URL. Nothing is sent before Test or Start.

## Testing

Unit (`relay/node/test`, Vitest, plain Node — these run in `ci:local` through
`pnpm --filter @actionstations/relay-node test`, so the step added in #408 covers both relay
packages):

- `config.test.ts`: precedence (file < env < flags), validation (retention > 72 refused, bad
  CIDR, missing TLS without `--insecure-http`), `print-config` redaction.
- `sqlite-store.test.ts`: the core's store contract suite (shared from `relay/core/test/
store-contract.ts`) against `node:sqlite`; WAL recovery after a simulated crash (kill
  between writes, reopen); `deleteAll` leaves no rows; blobs on disk and in the database.
- `server.test.ts`: TLS self-signed generation, fingerprint stable across restarts, PEM
  loading, `minVersion`; server key required for create; wrong key → 401 with no detail;
  allow-list refusal before TLS; routes and headers; WebSocket + fallback round trips with
  the shared fixtures; multiple concurrent sessions; restart rehydration (frames survive,
  controller reconnects, player catch-up resumes); graceful stop within 10 s.
- `sweeper.test.ts`: fake timers; expiry at retention and at end + 1 h; VACUUM threshold.
- `no-outbound.test.ts`: wraps `net.Socket.prototype.connect` and `dns.lookup`; runs a full
  session (create, 3 clients, blobs, end); asserts zero calls. ESLint rule test for the
  restricted globals.
- `logs.test.ts`: rotation; redaction guard throws on a `payload` field.
- `cli.test.ts`: argument parsing, `status` over the admin socket, `rotate-key` invalidates
  the old key immediately.

App (`src/main/live/transport/self-hosted-client.test.ts`): against a server started in-process:
untrusted certificate → `untrusted` result with fingerprint; pin match connects; pin mismatch
→ `FORBIDDEN`; `http://` refusal rules; server key from `safeStorage` (mocked as in
`secrets/index.test.ts`).

Packaging (opt-in, not in `ci:local`): `DOCKER=1 pnpm --filter @actionstations/relay-node
test:docker` builds the image, runs it with `--tls self-signed`, hits `/v1/health`, runs a
session round trip from the host, checks the container has no outbound route (`network:
internal`). `SEA=1 … test:sea` builds the Linux binary on Linux (and Windows on Windows,
through the existing cross-platform notes in `docs/RELEASING.md`), starts it, same round trip.
Release builds for both run on GitHub-hosted standard runners in the existing release workflow,
uploading binaries and `.sha256` files to the draft release (allowed by ADR-0023; no artifacts,
no caches).

E2E (`e2e/live/self-hosted.spec.ts`, `E2E=1`): the Electron app with "Your server" pointing at
a `relay/node` instance the spec starts on `127.0.0.1` with a self-signed certificate: Test
shows the fingerprint, Confirm pins it, Start, a Chromium player (`ignoreHTTPSErrors`) joins,
one inject round trip, end; then the spec restarts the server with a new certificate and
asserts the app refuses with the "certificate changed" message.

Manual, recorded in the PR: Windows service install on a Windows 11 VM (UTM, per the
cross-platform notes), systemd on Ubuntu 22.04 in Docker, iPhone and Android joins.

## Tasks

1. **Node adapter core.** `relay/node` package: `config.ts`, `sqlite-store.ts` (`node:sqlite`),
   `sessions.ts`, `server.ts` (routes, `ws`, fallback from `relay/core/http-fallback`),
   `tls.ts`, `allowlist.ts`, `logs.ts`; tests `config`, `sqlite-store` (contract suite),
   `server`, `sweeper`, `logs`; the ESLint no-outbound rule and `no-outbound.test.ts`.
2. **CLI, admin, services.** `cli.ts`, `admin.ts`, `service/windows.ts`, `service/systemd.ts`,
   `actionstations-relay.service`, `install.sh`, `actionstations-relay.toml.example`;
   `cli.test.ts`.
3. **Packaging.** `Dockerfile`, `compose.yaml`, `scripts/build-sea.mjs`, `static.ts` for
   embedded assets, `test:docker` and `test:sea` scripts; release workflow job for the two
   binaries and the image (standard runners, draft release upload only; `check-workflows.mjs`
   must pass).
4. **App transport and pinning.** `src/main/live/transport/self-hosted-client.ts`,
   `secrets` key naming for the server key, `test()` result shape in `src/shared/ipc/live.ts`
   (coordinated with #410), tests.
5. **Guide, ADR note, e2e.** `docs/guides/self-hosted-server.md`, the security statement,
   a paragraph in `docs/adr/0025-live-relay-hosting.md` (#408) on the Node adapter and SEA;
   `e2e/live/self-hosted.spec.ts`; `relay/README.md` links.

## Open questions

1. **`node:sqlite` vs `better-sqlite3` for the server.** `node:sqlite` needs no native addon,
   so the single executable is one file; it is newer and its API is smaller. Recommendation:
   `node:sqlite` behind the `SessionStore` interface, with the contract suite proving parity;
   switch only if a blocking defect appears. (Project rules 6 fixes `better-sqlite3` for the
   app; the server is a separate program with its own constraints.)
2. **Single executable tooling.** Node SEA (built in, needs `postject` at build time) vs
   `pkg`-style bundlers (unmaintained forks). Recommendation: Node SEA.
3. **Default `bind`.** `0.0.0.0` (reachable across segments, the point of this server) vs
   requiring an explicit address. Recommendation: `0.0.0.0` with the allow-list as the
   recommended restriction in the guide.
4. **Server key or open creation.** The relay (#408) has no server key because its sessions
   are capped per day; a self-hosted server on an internal network could skip it for
   simplicity. Recommendation: keep the key; "anyone on the network can create sessions and
   fill the disk" is a finding most IT reviews would raise.
5. **Publishing the Docker image.** GitHub Container Registry for a public image is free, but
   ADR-0023's "nothing stored on GitHub" was written for artifacts and caches. Recommendation:
   publish the `Dockerfile` and the binaries only; organizations build the image themselves
   (`docker build` takes under two minutes); add GHCR publication only after confirming the
   organization's Packages budget shows no charge for public images.
