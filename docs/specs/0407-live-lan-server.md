# Spec 0407: Live play: serve sessions from this computer over the room's Wi-Fi

Issue: #407 · Milestone: 0.6.0 · Status: Draft · Depends on: #406 · Related: #418 (epic), #408 (relay core reuse), #410 (connection choice), #411 (player page), #417 (dashboard)

## Summary

The desktop app can run a session server itself: it listens on the laptop's Wi-Fi address,
serves the player page and relays the session's encrypted frames to the devices in the room. No
internet, no account, no IT ticket. It starts when the facilitator starts a live session with
the connection "This computer" (#410), shows the address and a QR code, and stops when the
session ends; nothing listens at any other time.

## Requirements

### User stories

- As a facilitator in a training room with guest Wi-Fi and no internet, I want players to join
  from their phones by scanning a QR code on the projector, so that live play works with what
  is in the room.
- As a facilitator, I want to see which address the session is on and switch it if the laptop
  has several (Wi-Fi, Ethernet, a VPN), so that the QR code points where the phones can reach.
- As a player on an iPhone or an Android phone, I want to join without installing anything and
  with at most one certificate warning, so that joining takes under a minute.
- As an IT reviewer, I want to know exactly which port is open, when, and what it serves, so
  that I can approve the laptop on our network.

### Functional requirements

- **FR-1** Start and stop. `live:session-start` with connection `lan` starts an HTTP(S) +
  WebSocket server bound to one chosen interface address and a port; `live:session-end` (or
  the app quitting, or the Facilitate page being closed with the session ended) stops it and
  releases the port. The server exists only between these calls.
- **FR-2** Addresses. The app lists the computer's non-loopback IPv4 addresses with interface
  names, marks the likely Wi-Fi one as default, and warns when there is none ("This computer is
  not on a network") or when only link-local (`169.254.*`) addresses exist.
- **FR-3** Invite. The Facilitate page shows the join URL, a QR code (≥ 240 px, high contrast,
  also usable on the presentation window, #417), and a "Copy link" button. The URL carries the
  session key in its fragment (#406); the QR encodes the same URL.
- **FR-4** Transport security. Default: HTTPS with a certificate the app generates for this
  session (ECDSA P-256, SAN = the chosen IP address, 7-day validity) and `wss:`. Alternative,
  by explicit choice with a warning: plain HTTP and `ws:` for networks the facilitator trusts.
  Both keep end-to-end encryption (#406); the choice is about page integrity and the join
  experience, and the UI says so.
- **FR-5** Fallback transport. Because Safari on iOS refuses WebSocket connections to a
  certificate it has not trusted even after the page's warning was accepted, the server also
  offers a fetch-based transport: `GET /v1/sessions/:id/events` (server-sent events, one
  envelope per event) and `POST /v1/sessions/:id/send` (one envelope per request). The player
  page (#411) tries WebSocket first and falls back automatically.
- **FR-6** Served routes, nothing else: `GET /` (a page that says "Scan the QR code" with no
  session info), `GET /s/:sessionId` (the player page), `GET /assets/*` (the player bundle,
  immutable, hashed names), `GET /v1/health`, `GET /v1/sessions/:id/ws`, `/events`, `/send`,
  `GET /v1/sessions/:id/blobs/:blobId`. Anything else is 404; no directory listing; no file
  paths from the URL reach the filesystem.
- **FR-7** Server contract. The session logic is the shared relay core (#408): join token
  check, header validation, routing, in-memory store for catch-up, blob chunks, rate limits,
  LAN caps from `LIMITS.lan` (#406). The controller is attached in-process (no WebSocket from
  the app to itself).
- **FR-8** Firewall guidance. Before the first start on each OS, the page explains the prompt
  the OS is about to show (macOS "accept incoming network connections", Windows Defender
  Firewall "Allow access" with _Private networks_ ticked) and how to recover when it was
  denied. The app detects "no device could connect for 60 s after the QR was shown" and
  surfaces that guidance again.
- **FR-9** Status. The Facilitate page shows: listening address and port, HTTPS or HTTP,
  certificate fingerprint (SHA-256, grouped), connected device count, and a "Stop" button.
- **FR-10** Port. Default `8485`; if busy, the next free port in `8485–8495`, else an
  OS-assigned port. The QR always carries the actual port.
- **FR-11** Several sessions. One LAN session per app instance at a time; starting a second
  asks to end the first.

### Non-functional requirements

- **NFR-1** Cost: nothing; no service involved. (CONTRIBUTING, Project rules 1)
- **NFR-2** Privacy: the app opens a listening socket only after the facilitator starts a
  session with "This computer" selected; the connection screen states what is served and to
  whom (#410). The server logs connections (time, remote address, client id, close code) to
  the session's dashboard and to `userData/live/lan.log` (rotated at 5 MB × 3), never payloads.
  No outbound connection is made by the LAN server. (Project rules 3)
- **NFR-3** Accessibility: QR code has a text alternative (the URL) and a "Copy link"; the
  status line is a live region; firewall guidance is readable at 200 % zoom. WCAG 2.2 AA.
- **NFR-4** Performance: 60 devices on one laptop; fan-out of a 64 KiB frame to 60 sockets in
  under 50 ms; a 20 MB inject video delivered to 10 devices at once without stalling the UI
  (the server runs in the main process on the event loop; blob chunks stream from disk with
  back-pressure, never read whole into memory per client).
- **NFR-5** Platforms: macOS, Windows, Linux (AppImage); works with the display asleep on the
  laptop (the app asks `powerSaveBlocker.start('prevent-app-suspension')` for the session's
  duration and releases it at end).

### Out of scope

- mDNS / Bonjour names; the QR carries the IP address.
- Captive-portal detection or Wi-Fi hotspot creation.
- Internet exposure (port forwarding, tunnels): use the relay (#408).
- The player page itself (#411) and the controller dashboard (#417).

## Design

### Module layout

```
src/main/live/
  transport/lan/
    server.ts            start/stop; http or https + ws; route table; binds the relay core hub
    addresses.ts         listLanAddresses(): os.networkInterfaces() → ranked candidates
    cert.ts              per-session certificate with @peculiar/x509; fingerprint
    static.ts            serve the player bundle from app-resources/player with CSP headers
    fallback.ts          SSE + POST transport adapter for the relay core
    firewall.ts          platform text + "no connections yet" detector
    log.ts               connection log (rotating) — never payloads
  session.ts             (epic #418) lifecycle; this spec plugs the LAN transport into it
  keys.ts                userData/live/sessions/<id>.json (safeStorage) read/write/delete (#406)
relay/core/              (#408) SessionHub, stores, limits — imported here with an in-memory store
src/shared/ipc/live.ts   (#410) live:* channels; this spec adds the LAN-specific request fields and events
src/renderer/src/routes/facilitate/live/
  LanPanel.tsx           address picker, HTTPS/HTTP choice, QR, status, firewall guidance
  QrCode.tsx             renders the invite with `qrcode` (SVG), alt text = URL
```

`out/player/` (the player bundle built by #411) ships as `extraResources` →
`app-resources/player/` in `electron-builder.yml`, next to `app-resources/templates/_shared`.
Unpackaged runs read `out/player/` directly (`TTX_RESOURCES` override as for templates).

### Server

`startLanServer(opts)`:

```ts
interface LanServerOptions {
  address: string // one of listLanAddresses()
  port?: number // default 8485, fallback range, then 0
  tls: 'self-signed' | 'none'
  session: LiveSession // keys + controller client (from session.ts)
  hub: SessionHub // relay core, in-memory store with LIMITS.lan
}
interface LanServerStatus {
  url: string // https://192.168.4.20:8485/s/<sessionId>
  inviteUrl: string // url + '#' + fragment (never logged)
  address: string
  port: number
  tls: 'self-signed' | 'none'
  fingerprintSha256?: string // "A1:B2:…" for the self-signed certificate
  connected: number
  startedAt: string
}
```

- `node:https` with the generated certificate (or `node:http`), listening on `address` only
  (never `0.0.0.0`), `requestTimeout` 30 s, `maxHeaderSize` default, `keepAliveTimeout` 65 s.
- `ws` `WebSocketServer({ noServer: true, maxPayload: LIMITS.lan.envelopeBytes })` upgraded
  only on `/v1/sessions/:id/ws` after the join-token check (`?j=`); each socket becomes a
  `Connection` in the relay core hub. Ping every 25 s; a socket silent for 60 s is closed
  (`1001`), which emits `presence offline`.
- The controller attaches to the hub in-process: `hub.attachController(localConnection)`, where
  `localConnection` is a loopback `Transport` (#406) feeding the app's `LiveClient`. No
  controller token exists for LAN; the in-process attachment is the controller.
- Blob chunks are stored under `userData/live/lan/<sessionId>/blobs/<blobId>/<index>` and
  removed at stop; the in-memory envelope store caps at `LIMITS.lan.storedEnvelopes` (20,000)
  and 64 MiB of JSON, after which the oldest receipts are evicted first, then the hub answers
  `relay.error STORE_FULL` for new non-controller frames (controller frames are always stored).
- HTTP headers on every response: `Cache-Control: no-store` (except `/assets/*`:
  `public, max-age=31536000, immutable`), `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`,
  `Cross-Origin-Opener-Policy: same-origin`, and for HTML:
  `Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; media-src blob:; connect-src 'self'; font-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`.
  `'self'` resolves to the LAN origin, so `wss:`/`ws:` to the same host is allowed by
  `connect-src 'self'` (same-origin WebSocket is covered in current browsers; the header also
  lists the explicit `wss://<host>:<port>` / `ws://…` origin for older ones).
- Static files: a fixed map built at start from `app-resources/player/manifest.json` (path →
  file, content type, size). A request is looked up in the map; it never touches
  `path.join` with request input. The player page is the same `index.html` for every
  `/s/:sessionId` (the page reads the id from `location.pathname` and the key from the
  fragment).
- `GET /v1/health` → `{ kind: 'lan', version, protocol: [1], caps }`; no session information.
- Errors are JSON `{ error: { code, message } }` without stack traces; 404 for unknown paths,
  405 for wrong methods, 413 over size, 429 rate-limited.

### Fallback transport (SSE + POST)

Implemented once in `relay/core` as `HttpFallbackAdapter` and used by this server and by the
Node server (#409); not by the Cloudflare adapter (#408) where WebSockets always work and an
open SSE stream would bill duration.

- `GET /v1/sessions/:id/events?j=<joinToken>&client=<clientId>&after=<index>` →
  `text/event-stream`; the server registers a `Connection` whose `send()` writes
  `data: <frame>\n\n`; `relay.hello` first; a comment line every 20 s keeps the stream alive;
  `Last-Event-ID` carries the arrival index for resume.
- `POST /v1/sessions/:id/send?j=<joinToken>&client=<clientId>` with one envelope as the body
  (≤ `envelopeBytes`) → `202` or `relay.error` JSON. `relay.blob.put` chunks go through the same
  endpoint. `relay.blob.get` responses come down the event stream like any other frame.
- A client is "connected" while its stream is open; presence works the same.

Why both: Chrome, Edge, Samsung Internet and Firefox accept a `wss:` connection to a host whose
certificate the user clicked through for the page; Safari (iOS and macOS) does not, and gives
no prompt. The fetch path inherits the page's acceptance on every browser. The player page
reports which transport it uses in `join.ua` so the dashboard can show it.

### Addresses

`listLanAddresses()` returns, from `os.networkInterfaces()`:

```ts
interface LanAddress {
  address: string // IPv4 dotted
  interface: string // en0, wlan0, "Wi-Fi", …
  kind: 'wifi' | 'ethernet' | 'virtual' | 'other' // by name heuristics per platform
  private: boolean // RFC 1918 or 100.64/10
  linkLocal: boolean // 169.254/16
  recommended: boolean // first private, non-virtual, preferring wifi
}
```

Virtual adapters (`utun*`, `vboxnet*`, `docker*`, `br-*`, `vEthernet*`, `tailscale*`,
`ZeroTier*`) are listed last and never recommended. IPv6 is not offered in v1 (QR length,
bracket URLs, phones on IPv4-only guest networks). The list refreshes when the user opens the
picker and when the OS reports an interface change (`os.networkInterfaces()` polled every 10 s
while the picker is open).

### Certificate

`cert.ts` uses `@peculiar/x509` on Node's WebCrypto to create an ECDSA P-256 key pair and a
self-signed certificate per session: `CN = Action Stations session <sessionId prefix>`,
`subjectAltName = IP:<address>`, `notBefore = now − 5 min`, `notAfter = now + 7 days`,
key usage digitalSignature, extended key usage serverAuth. The private key lives only in
memory and in the TLS context; the fingerprint (SHA-256 of the DER) is shown on the Facilitate
page and on the presentation window beside the QR so a player can compare it with what the
phone's warning page shows (Chrome on Android shows it under "Certificate details"; Safari does
not show one, which the guide says).

Changing the address after start requires a restart of the server with a new certificate (the
SAN must match); the UI does this as one action ("Switch address") and shows a new QR.

### Renderer

`LanPanel` sits inside the Live play section of the Facilitate page (#410 owns the section
and the connection selector; this panel is the body shown when "This computer" is selected and
the session runs):

- Before start: address select (recommended first, with interface name and kind), security
  radio (HTTPS recommended / plain HTTP with a one-paragraph warning), the firewall note for the
  current platform, "Start session".
- Running: QR (SVG via `qrcode`, `aria-label` = "Join link: <url>"), the URL in monospace with
  "Copy link" and "Show on presentation screen" (#417 adds the QR view to the present route),
  status line (address, port, HTTPS/HTTP, fingerprint, N devices connected), "Switch address",
  "Stop session". After 60 s with zero connections the firewall guidance appears inline with
  the OS-specific recovery steps.
- All strings in `src/renderer/src/routes/facilitate/live/strings.ts` so the guide and the
  UI say the same thing.

IPC (channel definitions in `src/shared/ipc/live.ts`, owned by #410; the LAN fields are):

```ts
'live:lan-addresses': channel(z.void(), z.array(LanAddress))
// live:session-start request.connection = { kind: 'lan', address, tls: 'self-signed' | 'none', port? }
// live:session-status response includes lan?: LanServerStatus
'live:lan-switch-address': channel(z.object({ address: z.string() }), LanServerStatus)
```

Events: `live:changed` (#410) carries `{ reason: 'started' | 'stopped' | 'presence' | 'error', connected }`.

### Firewall text (platform-specific, `firewall.ts`)

- macOS: first start shows "Do you want the application 'Action Stations' to accept incoming
  network connections?" → Allow. If it was denied: System Settings → Network → Firewall →
  Options → set Action Stations to "Allow incoming connections". Unsigned builds may ask on
  every launch.
- Windows: "Windows Defender Firewall has blocked some features" → tick _Private networks_
  → Allow access. If the room's Wi-Fi is set to _Public_, Windows blocks incoming connections
  regardless: Settings → Network & Internet → Wi-Fi → the network → Network profile → Private,
  or ask IT.
- Linux: usually nothing; with `ufw`, `sudo ufw allow 8485/tcp` (port shown live).

### Data

Nothing new in the project folder. `userData/live/lan/<sessionId>/` holds blob chunks for the
session's duration and is removed at stop and swept at startup (like `packs/.staging`).
`userData/live/lan.log` is the rotating connection log. `userData/live/sessions/<id>.json`
(#406) holds the keys.

## Security and privacy

| Threat                                                           | Mitigation                                                                                                                                                                                                                   |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Someone on the Wi-Fi reads exercise content                      | sealed payloads (#406); the server holds ciphertext in memory only                                                                                                                                                           |
| Someone on the Wi-Fi joins the session                           | join token required for `/ws`, `/events`, `/send`; only holders of the invite have it; the facilitator can rotate and kick (#406)                                                                                            |
| Someone on the Wi-Fi serves a fake page (ARP spoofing, rogue AP) | HTTPS with the shown fingerprint is the default; plain HTTP is an explicit choice with the risk named; end-to-end encryption still protects stored and relayed content, not a rewritten page                                 |
| Path traversal to the laptop's files                             | static files come from a fixed map; no request string reaches `fs`; the server never serves outside `app-resources/player/`                                                                                                  |
| The server stays up unnoticed                                    | starts only with the session, stops at `session.end`, app quit (`before-quit` → `stopLanServer()`), window close; the Facilitate page shows "Listening on …" the whole time; `TTX_HEADLESS` test runs stop it in `afterEach` |
| Resource exhaustion from the room                                | `LIMITS.lan`: 60 clients, 256 KiB envelopes, 60 frames/min/client, 20,000 stored envelopes, blobs 256 MiB / 2 GiB per session; connection attempts over 10/s per address are dropped for 10 s                                |
| Certificate private key leak                                     | memory only; new key per session                                                                                                                                                                                             |
| Logs leaking content                                             | the connection log has fixed fields; `redact()` from `src/main/packs/fetch.ts` style for any URL (fragment never logged)                                                                                                     |
| Binding to all interfaces                                        | bound to the chosen address only; a VPN or Ethernet interface is served only if chosen                                                                                                                                       |
| Firewall prompt denied silently                                  | 60-second "no connections" detector with recovery steps                                                                                                                                                                      |

What leaves the computer: the player page and sealed frames, to devices on the chosen network
only. No connection is made to anything. The connection screen (#410) says exactly this.

## Testing

Unit (`src/main/live/transport/lan/*.test.ts`, Vitest under Electron's Node, loopback only):

- `addresses.test.ts`: ranking with fixture `networkInterfaces()` outputs from macOS, Windows,
  Linux (Wi-Fi, Ethernet, Docker, VPN, link-local only, none).
- `cert.test.ts`: certificate parses, SAN equals the address, validity window, fingerprint
  format; `https` server accepts a client that pins the fingerprint.
- `server.test.ts`: starts on `127.0.0.1` with port 0; serves `/s/<id>` with the CSP header
  set; `/assets/<hash>.js` immutable; `../` and encoded traversal → 404; unknown route → 404;
  `/v1/health` has no session data; WebSocket without `?j=` closed `4001`; with a valid token
  gets `relay.hello`; a full join → welcome → catch-up round trip through the real relay core
  with two `ws` clients and the in-process controller; blob put/get through `/blobs/:id` and
  over the socket; frame over 256 KiB → closed `4013`; rate limit → `4008`.
- `fallback.test.ts`: SSE stream receives `relay.hello` and fan-out frames; POST send routes;
  `Last-Event-ID` resumes; a dropped stream emits `presence offline`.
- `stop`: port released, blob directory removed, no timers left (`vi.getTimerCount()`).
- `log.test.ts`: rotation; a frame with a fake "payload" never appears in the log.

E2E (Playwright, `e2e/live/lan.spec.ts`, under `E2E=1`): launch the app headless with
`TTX_MOCK_PROVIDERS=1 TTX_LIVE_BIND=127.0.0.1` (the bind override every live e2e uses, epic #418), open an example project's scenario, start a LAN session on `127.0.0.1`
with HTTPS; read the invite URL from the page; open a second browser context
(`ignoreHTTPSErrors: true`) at the invite, join as a player; the app releases an inject (MSEL
row with a rendered PNG); the player page shows it; the dashboard shows 1 connected; stop; the
player page shows "Session ended"; `/v1/health` now refuses to connect. A second run uses plain
HTTP and the fetch fallback (`page.route` blocks WebSocket upgrades) to cover both paths.

Packaged smoke (`scripts/package-smoke.mjs`): `app-resources/player/manifest.json` and the
files it lists exist in the installed app.

Manual, recorded in the PR: iPhone Safari and Android Chrome join over HTTPS (one warning
each) and over HTTP; macOS and Windows firewall prompts appear once and the guidance matches.

## Tasks

1. **Addresses and certificate.** `src/main/live/transport/lan/addresses.ts`, `cert.ts` (+
   `@peculiar/x509` dependency), tests. No UI.
2. **Static player bundle plumbing.** `electron-builder.yml` `extraResources` for
   `out/player → app-resources/player`, `src/main/lib/paths.ts` `playerBundleDir()`,
   `src/main/live/transport/lan/static.ts` with the fixed route map and headers, `package-smoke.mjs`
   check, tests. Depends on #411 producing `out/player/manifest.json`; until then a stub
   `index.html` from `src/player/harness/` keeps the tests running.
3. **LAN server on the relay core.** `src/main/live/transport/lan/server.ts`, `log.ts`, `firewall.ts`,
   `src/main/live/keys.ts` (safeStorage-encrypted session keys, #406; shared with #408–#410, first landing here) and the hooks into `src/main/live/session.ts` (epic #418), the
   in-process controller attachment, `before-quit` stop in `src/main/index.ts`, tests
   (`server.test.ts`, `log.test.ts`).
4. **Fallback transport.** `relay/core/src/http-fallback.ts` (SSE + POST adapter, used by
   #409 too), wired in `server.ts`; `fallback.test.ts`.
5. **IPC and renderer panel.** LAN fields in `src/shared/ipc/live.ts` (coordinated with
   #410), handler additions in `src/main/ipc/handlers/live.ts`,
   `src/renderer/src/routes/facilitate/live/LanPanel.tsx`, `QrCode.tsx` (+ `qrcode`
   dependency), `strings.ts`, `facilitate.css` additions, component tests (happy-dom).
6. **E2E and docs.** `e2e/live/lan.spec.ts`; `docs/guides/live-play.md` section "In the
   room: this computer" (addresses, HTTPS vs HTTP, certificate warnings per phone, firewall
   prompts, troubleshooting); screenshots in `docs/guides/images/`; `docs/02-ARCHITECTURE.md`
   process-boundaries note ("LAN session server runs in main, only during a session").

## Open questions

1. **Default transport security on the LAN: HTTPS (self-signed) or plain HTTP?** Self-signed
   HTTPS costs one scary warning per device and the Safari fallback; HTTP has neither but lets
   an attacker on the same Wi-Fi rewrite the page. Recommendation: HTTPS default as the issue
   says, HTTP as the explicit alternative, and revisit after the first field exercises; the
   code supports both either way.
2. **Default port 8485 vs an OS-assigned port.** A fixed default makes firewall rules and IT
   approvals possible; recommendation: fixed default with the fallback range, as specified.
3. **Keep the laptop awake.** `powerSaveBlocker` prevents sleep during a session; some
   facilitators close the lid between phases. Recommendation: block app suspension only (not
   display sleep), and show "Keep this computer awake while the session runs" in the panel.
4. **IPv6.** Recommendation: not in v1; add when a user asks, behind the address picker.
