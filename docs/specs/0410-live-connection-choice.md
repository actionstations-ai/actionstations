# Spec 0410: Live play: choose the connection per exercise

Issue: #410 · Milestone: 0.6.0 · Status: Implemented (kick and key rotation excepted) · Depends on: #406, #407, #408, #409 · Related: #418 (epic), #411 (player page), #417 (dashboard)

## Summary

Each live session starts by choosing how devices will reach the facilitator's app: **This
computer** (the laptop serves the room's Wi-Fi), **Action Stations relay** (Cloudflare, for
remote and hybrid players) or **Your server** (an organization's own installation, by URL).
The Facilitate page shows the three options with a plain statement of what each one sends
where, a Test button, and the certificate fingerprint for a self-signed server. The app makes
no network call for live play until the facilitator picks a connection and presses Test or
Start.

## Requirements

### User stories

- As a facilitator, I want to pick the connection that fits today's exercise (room, hybrid,
  air-gapped) in one place, so that I do not have to think about it again during play.
- As a facilitator, I want to test the connection before players arrive, so that a firewall
  prompt, a daily limit or a wrong URL shows up at setup time, not at STARTEX.
- As a security reviewer, I want to read on the screen exactly what the app will send and to
  whom for the chosen option, so that approval does not need a code review.
- As a facilitator at an organization with its own server, I want to enter its address once,
  confirm its certificate fingerprint with IT, and have the app remember it for every
  exercise.

### Functional requirements

- **FR-1** Connection choice per scenario. `facilitator.json` gains `live.connection`:
  `{ kind: 'lan', address?, tls: 'self-signed' | 'none', port? }` |
  `{ kind: 'relay' }` | `{ kind: 'self-hosted', url, fingerprintSha256?, insecureHttp?:
boolean }`. Absent means "not chosen": the Live play section shows the chooser and nothing
  listens or connects.
- **FR-2** App-level memory. `AppSettings.live` holds `defaultConnectionKind` (`'lan'` by
  default) and `servers: Array<{ url, name?, fingerprintSha256?, addedAt, lastTestedAt?,
lastError? }>` (max 20) so a "Your server" entry is offered to every scenario. Server keys
  (#409) live in `safeStorage` under `live-server:<sha256(url)>`, never in settings.
- **FR-3** The chooser. Three radio cards, each with: a one-line summary, a "What this sends
  and where" paragraph (fixed text per option, from `strings.ts`), requirements ("needs
  internet", "needs your organization's server", "needs a shared Wi-Fi"), and option-specific
  fields: LAN — address picker, HTTPS/HTTP (#407); relay — the hostname it will use and the
  limits (60 devices, 8 MiB media, 72-hour retention, 25 sessions per day across all users);
  self-hosted — URL, remembered servers dropdown, fingerprint display with Confirm, server key
  field (password input, stored encrypted), "no TLS" tick for reverse-proxy setups.
- **FR-4** Test. `live:connection-test` runs the option's probe without starting a session:
  LAN — binds the port on the chosen address for 2 s, lists addresses, reports firewall
  guidance if the bind failed; relay — `GET /v1/health`, reports version, protocol match, caps
  and whether `playerBundleSha256` matches the bundle shipped with this app; self-hosted —
  `GET /v1/health` with pin handling (#409), reports fingerprint, trusted/untrusted, caps,
  protocol match, and whether the server key is accepted (`POST /v1/sessions/probe`, a
  dry-run endpoint that validates the key without creating a session). Results show as a
  checklist with pass/fail per line and a next step on failure.
- **FR-5** Start. `live:session-start { projectPath, scenarioId, connection, name?,
attribution }` (the epic's channel, #418) validates the connection, performs the test's
  checks again, starts the server (#407) or creates the remote session (#408/#409), stores the
  keys (#406), and returns `LiveSessionStatus` including the invite URL and the chosen
  connection's status. Any failure leaves nothing running and nothing created.
- **FR-6** Status while running. The Live play section header shows the connection kind, the
  host (address:port, `relay.actionstations.ai`, or the server URL), security (HTTPS /
  self-signed / HTTP), connected devices, and Stop. Changing the connection while a session
  runs is not possible; Stop first.
- **FR-7** Consent and disclosure. The first time a scenario uses the relay or a self-hosted
  server, a confirmation step repeats the "what this sends" statement and asks to continue.
  No network call is made before that confirmation. (The LAN option asks nothing extra but
  shows the firewall note, #407.)
- **FR-8** Kick and rotate. Dashboard actions (#417) call `live:kick { clientId }` and
  `live:rotate-key`; the second returns the new invite URL and QR and the chooser shows "New
  link issued at 14:02; the old link no longer works".
- **FR-9** Errors are specific: daily limit (relay), session full, certificate changed
  (self-hosted), server key refused, port in use, no network, protocol mismatch ("The server
  speaks protocol 2; update Action Stations or ask your administrator to update the server").
- **FR-10** Settings page. A "Live play" section in Settings lists remembered servers (edit
  name, forget, re-test), the default connection kind, and the server keys' presence
  ("stored" / "not set", never the value).

### Non-functional requirements

- **NFR-1** Cost: the relay option's caps and the daily-limit message are shown before use; no
  option can incur a charge. (CONTRIBUTING, Project rules 1)
- **NFR-2** Privacy: this spec is where Project rules 3 is made visible: no live-play network
  activity before an explicit Test or Start on a chosen connection; the statement of what
  leaves the computer is on the same screen as the action; the relay is never contacted for
  anything but a session the user asked for. (Project rules 3)
- **NFR-3** Accessibility: the chooser is a radio group with visible focus, each card's
  statement is associated with its radio by `aria-describedby`, test results are announced in
  a live region, fingerprint text is selectable and grouped in pairs for reading aloud; works
  at 200 % zoom and in both themes. WCAG 2.2 AA.
- **NFR-4** Offline: the LAN and self-hosted options need no internet; the chooser itself
  never fetches. Test completes or fails within 10 s.
- **NFR-5** Platforms: macOS, Windows, Linux; strings per platform for firewall guidance.

### Out of scope

- Switching connection mid-session or running two connections at once (a hybrid exercise uses
  the relay for everyone, or the self-hosted server for everyone).
- Managing the relay (nothing to manage) or administering a self-hosted server from the app.
- The dashboard and session log (#417), the player page (#411).

## Design

### Data

`src/shared/ipc/facilitator.ts` — `FacilitatorState` gains:

```ts
export const LiveConnection = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('lan'),
    address: z.string().optional(),
    tls: z.enum(['self-signed', 'none']).default('self-signed'),
    port: z.number().int().min(1024).max(65535).optional(),
  }),
  z.object({ kind: z.literal('relay') }),
  z.object({
    kind: z.literal('self-hosted'),
    url: HttpUrl,
    fingerprintSha256: Fingerprint.optional(),
    insecureHttp: z.boolean().default(false),
  }),
])
// FacilitatorState: live: z.object({ connection: LiveConnection.optional(), consented: z.array(z.enum(['relay','self-hosted'])).default([]) }).default({})
```

`Fingerprint = z.string().regex(/^([A-F0-9]{2}:){31}[A-F0-9]{2}$/)`. Existing
`facilitator.json` files parse unchanged (`.default({})`), so no migration.

`src/shared/schemas/settings.ts` — `AppSettings.live`:

```ts
export const LiveServerEntry = z.object({
  url: HttpUrl,
  name: z.string().max(80).optional(),
  fingerprintSha256: Fingerprint.optional(),
  addedAt: IsoDateTime,
  lastTestedAt: IsoDateTime.optional(),
  lastError: z.string().max(500).optional(),
})
export const LiveSettings = z.object({
  defaultConnectionKind: z.enum(['lan', 'relay', 'self-hosted']).default('lan'),
  servers: z.array(LiveServerEntry).max(20).default([]),
})
// AppSettings: live: LiveSettings.default({ defaultConnectionKind: 'lan', servers: [] })
```

### IPC (`src/shared/ipc/live.ts`, the epic's domain file; this spec adds)

```ts
'live:connection-test': channel(
  z.object({ projectPath: z.string(), connection: LiveConnection, serverKey: z.string().max(200).optional() }),
  ConnectionTestResult,
)
'live:kick': channel(z.object({ projectPath: z.string(), scenarioId: SafeId, clientId: ClientId }), z.void())
'live:rotate-key': channel(z.object({ projectPath: z.string(), scenarioId: SafeId }), InviteView)
'live:lan-addresses': channel(z.void(), z.array(LanAddress))          // #407
'live:servers-list': channel(z.void(), z.array(LiveServerEntry.extend({ hasKey: z.boolean() })))
'live:server-save': channel(LiveServerEntry.pick({ url: true, name: true, fingerprintSha256: true }).extend({ serverKey: z.string().max(200).optional() }), LiveServerEntry)
'live:server-forget': channel(z.object({ url: HttpUrl }), z.void())

export const ConnectionTestResult = z.object({
  ok: z.boolean(),
  checks: z.array(z.object({ id: z.string(), label: z.string(), status: z.enum(['pass', 'warn', 'fail']), detail: z.string().optional(), nextStep: z.string().optional() })),
  server: z.object({ kind: z.enum(['lan', 'relay', 'self-hosted']), version: z.string().optional(), protocol: z.array(z.number()).optional(), caps: Limits.optional(), fingerprintSha256: Fingerprint.optional(), untrusted: z.boolean().optional(), playerBundleMatches: z.boolean().optional() }).optional(),
  lan: z.object({ addresses: z.array(LanAddress), bound: z.boolean(), firewallHint: z.string().optional() }).optional(),
})
export const InviteView = z.object({ url: z.string(), epoch: z.number().int(), issuedAt: IsoDateTime, qrSvg: z.string() })
export const RELAY_URL = 'https://relay.actionstations.ai'
export const RELAY_PLAYER_BUNDLE_SHA256 = '<set at release>'
```

`live:session-start` / `live:session-status` / `live:session-end` / `live:changed` are the
epic's; `LiveSessionStatus` carries `connection: LiveConnection`, `host`, `security:
'https' | 'self-signed' | 'http'`, `connected`, `invite: InviteView`.

### Main process

```
src/main/live/
  connection.ts            resolveConnection(scenario state, settings) → effective LiveConnection; validation
  test.ts                  connectionTest(connection): the three probes; builds ConnectionTestResult
  transport/
    index.ts               createTransport(connection, keys): LanServerTransport | RelayClient | SelfHostedClient
    lan/…                  #407
    relay-client.ts        #408
    self-hosted-client.ts  #409
    fake.ts                tests (epic)
  keys.ts                  #406 (safeStorage session keys)
src/main/ipc/handlers/live.ts   adds the channels above (one handler file, epic)
src/main/settings/store.ts      unchanged API; LiveSettings through updateSettings
```

`connectionTest`:

- `lan`: `listLanAddresses()`; try `net.createServer().listen(port, address)` for 2 s then
  close (reports `EADDRINUSE` → "Port 8485 is in use; the session will use the next free
  port", `EACCES`/`EADDRNOTAVAIL` → the address list to choose from); checks the player bundle
  is present (`playerBundleDir()`); no network traffic at all.
- `relay`: `fetch` `${RELAY_URL}/v1/health` through the same guarded fetch as the pack
  catalog (`https` only, no credentials, 10 s idle timeout, 64 KiB cap); checks: reachable,
  `protocol` includes 1, caps readable, `playerBundleSha256 === RELAY_PLAYER_BUNDLE_SHA256`
  (`warn` when different: "The relay runs a different player page than this app shipped with;
  it may be newer or older. Session content stays encrypted either way."). A `503 DAILY_LIMIT`
  is `fail` with the next step.
- `self-hosted`: `assertFetchUrl`-style validation (https; http only with `insecureHttp` and a
  loopback or private host); `GET /v1/health` with pin handling from #409: untrusted and no
  pin → `warn` with the fingerprint and the Confirm action (the renderer calls
  `live:server-save` with it); pinned mismatch → `fail` "certificate changed"; key check via
  `POST /v1/sessions/probe` when a key is stored or supplied → `pass`/`fail`.

Every probe runs only inside `live:connection-test` or `live:session-start`; there is no
timer, startup hook or background refresh anywhere in `src/main/live/`. A test in
`src/main/live/connection.test.ts` imports the module graph and asserts no module calls
`fetch`, `net.connect` or `listen` at import time (spy on them before import).

`live:session-start` sequence: `requireProject` → read `FacilitatorState.live.connection` (or
the request's) → consent check (`consented` includes the kind for remote kinds, else
`VALIDATION` "Confirm what this connection sends first") → `connectionTest` (fail → the same
`ConnectionTestResult` in `AppError.details`) → `generateSessionKeys()` (#406) → transport
`start()` (LAN) or `createSession()` + `connect()` (remote) → `keys.ts` save → `session.ts`
(epic) takes over → `emit('live:changed', …)`. Any throw after keys were generated deletes the
key file and stops/ends what was started.

### Renderer

`src/renderer/src/routes/facilitate/live/`:

- `LivePanel.tsx` (epic) hosts `ConnectionChooser.tsx` when no session runs and
  `ConnectionStatus.tsx` plus the per-kind running panel (`LanPanel` #407; `RemotePanel` for
  relay/self-hosted: host, security, connected, "New link", Stop) while one runs.
- `ConnectionChooser.tsx`: radio cards (`role="radiogroup"`, each card a `label` wrapping the
  input; the statement paragraph `id` referenced by `aria-describedby`), option fields,
  `TestResults.tsx` (checklist, `role="status"`), `ConsentNotice.tsx` (shown inline for remote
  kinds the scenario has not consented to; its Continue button writes
  `facilitator.json.live.consented`), Start button (disabled until the chooser is valid; for
  remote kinds also until consent).
- `ServerFields.tsx`: URL input, dropdown of remembered servers (`live:servers-list`), server
  key password field ("stored" badge when `hasKey`), `FingerprintView.tsx` (pairs separated by
  spaces for screen readers, "Copy"), Confirm button after an untrusted test, "no TLS" tick with
  its warning text.
- `strings.ts`: the three "What this sends and where" statements (also pasted into
  `docs/guides/live-play.md` so the guide and the screen match), requirement lines, error
  messages per code, firewall guidance imported from #407.
- Settings: `src/renderer/src/routes/settings/LivePlaySection.tsx` (default connection kind;
  remembered servers with name/forget/re-test; stored key presence), following
  `PackCatalogsSection.tsx`.

The three statements (final text in `strings.ts`; the guide copies them):

- **This computer.** "Your computer listens on the Wi-Fi at the address shown. Players'
  devices load the player page from it and exchange encrypted session messages with it. Nothing
  is sent to the internet. Stops when you end the session."
- **Action Stations relay.** "Your computer connects to relay.actionstations.ai, run by the
  Action Stations project on Cloudflare. It sends the session id, encrypted messages and media,
  their sizes and timing, and your IP address. The relay cannot read session content and keeps
  encrypted messages only for late joiners, deleting them when you end the session or after 72
  hours. Limits: 60 devices, 8 MB per media file, 25 sessions per day for everyone; when the
  free limit is reached it stops with an error and nothing is ever billed."
- **Your server.** "Your computer connects to the server address you enter, run by your
  organization. It sends the same things as to the relay: session id, encrypted messages and
  media, sizes and timing, your IP address, plus the server key you were given. The server
  cannot read session content. Its retention and limits are set by whoever runs it."

### Flow

```
Facilitate → Live play section
  no connection chosen → ConnectionChooser (default kind from settings)
    pick kind → fields → [Test] → checklist → (remote: ConsentNotice → Continue) → [Start session]
      live:session-start → LiveSessionStatus → ConnectionStatus + LanPanel | RemotePanel + dashboard (#417)
        [New link] → live:rotate-key → InviteView (QR + URL replaced, notice)
        [Stop] → live:session-end → chooser again (connection remembered in facilitator.json)
```

## Security and privacy

| Threat                                                            | Mitigation                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Network activity the user did not ask for                         | no probe outside `live:connection-test` / `live:session-start`; import-time test; consent gate for remote kinds; the relay URL is a constant the user can read on screen                                                                            |
| Misleading disclosure                                             | one source of truth for the statements (`strings.ts`), copied verbatim into the guide; a unit test compares them                                                                                                                                    |
| Server key leakage                                                | `safeStorage` via `secrets/index.ts`; never in settings, `facilitator.json`, logs or IPC responses (`hasKey` only); password input; `redact()` for URLs in errors                                                                                   |
| Pointing the app at a hostile "server"                            | https required (http only for loopback/private hosts with an explicit tick); fingerprint pin with TOFU confirm and hard stop on change; CA-signed certificates validated by Node; end-to-end encryption means even a hostile server sees ciphertext |
| Downgrade to the relay by mistake                                 | the chooser never changes the kind on its own; `defaultConnectionKind` only pre-selects for a scenario that has no connection yet                                                                                                                   |
| Daily-limit confusion                                             | explicit message and next steps; Test surfaces it before STARTEX                                                                                                                                                                                    |
| Confusing a self-signed LAN fingerprint with a server fingerprint | each shown with its label and where it applies (players' phones vs the app's pin)                                                                                                                                                                   |
| Renderer tampering                                                | all decisions and probes are in main behind zod-validated channels; the renderer can only choose among the three kinds                                                                                                                              |

Data at rest: `facilitator.json.live.connection` (project folder; contains a server URL and
fingerprint, not secrets), `settings.json.live` (userData; URLs, names, fingerprints),
`secrets.json` (server keys, encrypted), `userData/live/sessions/` (#406).

## Testing

Unit:

- `src/shared/ipc/facilitator.test.ts`: old `facilitator.json` fixtures parse with `live`
  defaulted; each `LiveConnection` variant round-trips; invalid fingerprint refused.
- `src/main/live/connection.test.ts`: `resolveConnection` precedence (scenario > settings
  default); http URL rules (loopback/private + tick only); import-time no-network assertion.
- `src/main/live/test.test.ts`: LAN probe with a port already bound (`EADDRINUSE` →
  warn with the fallback message), with no addresses; relay probe with a mocked `fetch`
  (healthy, protocol mismatch, bundle mismatch → warn, `503 DAILY_LIMIT` → fail with next
  step, timeout); self-hosted probe against an in-process `relay/node` server with a
  self-signed certificate (untrusted → fingerprint + warn; pinned → pass; changed → fail;
  key accepted/refused).
- `src/main/ipc/handlers/live.test.ts`: `live:session-start` refuses a remote kind without
  consent; a failing test leaves no key file and no listener (`net` spy); `live:server-save`
  stores the key in `secrets` (mocked safeStorage) and never in settings; `live:servers-list`
  returns `hasKey` only.
- Renderer (happy-dom): `ConnectionChooser.test.tsx` — radio group semantics, the statement
  is linked by `aria-describedby`, Start disabled until valid and consented, test results
  announced; `ServerFields.test.tsx` — remembered servers, fingerprint confirm writes the pin,
  key field never echoes a stored value; `strings.test.ts` — statements equal the guide's
  fenced blocks (reads `docs/guides/live-play.md`).

E2E (Playwright, `e2e/live/connection.spec.ts`, `E2E=1`): choose each kind in turn; LAN Test
passes on `127.0.0.1` (`TTX_LIVE_BIND`); relay Test against `TTX_LIVE_RELAY_URL` pointing at a
local `wrangler dev` (#408) shows the checklist; self-hosted Test against a local `relay/node`
shows the fingerprint, Confirm pins it, consent, Start, Stop; the "certificate changed" path;
`e2e/a11y.spec.ts` gains the chooser, the test results and the settings section in both
themes at 200 % zoom. A network recorder (`e2e/net-recorder.cjs`, already used by the pack
tests) asserts the app made no request to the relay URL before Test was pressed.

Packaged smoke: unchanged.

## Tasks

1. **Schemas and settings.** `LiveConnection`, `Fingerprint`, `FacilitatorState.live` in
   `src/shared/ipc/facilitator.ts`; `LiveSettings` in `src/shared/schemas/settings.ts`;
   `RELAY_URL`, `RELAY_PLAYER_BUNDLE_SHA256`, `ConnectionTestResult`, `InviteView` and the
   channels in `src/shared/ipc/live.ts`; schema tests; `docs/05-DATA-MODEL.md` entries.
2. **Connection resolution and probes.** `src/main/live/connection.ts`, `test.ts`,
   `transport/index.ts` (factory over #407–#409 transports); `secrets` naming for server keys;
   tests including the import-time network assertion.
3. **Handlers.** `live:connection-test`, `live:kick`, `live:rotate-key`, `live:servers-*` in
   `src/main/ipc/handlers/live.ts`; `live:session-start` consent gate and cleanup-on-failure;
   handler tests.
4. **Chooser UI.** `ConnectionChooser.tsx`, `ServerFields.tsx`, `FingerprintView.tsx`,
   `TestResults.tsx`, `ConsentNotice.tsx`, `RemotePanel.tsx`, `ConnectionStatus.tsx`,
   `strings.ts`, CSS in `facilitate.css`; component tests; wiring into `LivePanel.tsx` (epic).
5. **Settings section.** `LivePlaySection.tsx` in `src/renderer/src/routes/settings/`,
   `SettingsPage.tsx` mount, tests.
6. **Guide and e2e.** `docs/guides/live-play.md` section "Choosing the connection" with the
   three statements as fenced blocks and screenshots; `e2e/live/connection.spec.ts`; a11y spec
   additions; `strings.test.ts` guide comparison.

## Open questions

1. **Default connection kind.** `lan` (recommended: the common case, no internet, no third
   party) vs asking every time. Recommendation: `lan` pre-selected, nothing started until
   Start.
2. **Consent scope.** Per scenario (as specified) vs once per app install. Recommendation:
   per scenario; it is one click, and a shared project folder then carries the record that
   this exercise used a remote connection.
3. **Remembered servers in settings vs project.** Settings (user-level, as specified) with the
   URL and fingerprint also copied into `facilitator.json` for the scenario. Recommendation: as
   specified; a project opened on another computer shows the URL and fingerprint but needs the
   server key entered there.
4. **Bundle-hash check severity for the relay.** `warn` (as specified) vs `fail`.
   Recommendation: `warn`; a newer relay deploy between app releases is normal, and the check
   is a tripwire, not a guarantee (#406).
5. **Showing the relay hostname before the custom domain exists.** Recommendation: show
   whatever `RELAY_URL` is, including a `workers.dev` host, rather than a prettier name the app
   does not use.

## As built (differences from this spec)

- `LiveConnection` stays in `src/shared/schemas/live.ts` (where #407 put it); `FacilitatorState.live` is optional rather than defaulted, so older files and fixtures parse untouched.
- The server key's secret name is `live-server-<sha256 of the address>` (secret names cannot contain `:`).
- Pinning is enforced by an agent that corks writes until the fingerprint is compared on `secureConnect`, because Node skips `checkServerIdentity` once chain validation fails ([ADR-0051](../adr/0051-live-connection-choice.md)).
- `live:connection-test` takes an optional `projectPath` (Settings re-tests a remembered server without a project). `live:consent` is a new channel that records consent in `facilitator.json`.
- `POST /v1/sessions/probe` is optional: a server that answers 404 gets a "checked when the session starts" line. The relay health check cannot return `DAILY_LIMIT`; that refusal is reported by the start call.
- `RELAY_PLAYER_BUNDLE_SHA256` is empty until the release build sets it; the bundle line then reports presence without judging the hash.
- Not built here: `live:kick`, `live:rotate-key` and the "New link issued" notice (the dashboard, #417), per-platform firewall text beyond the LAN guidance that exists, and the "certificate changed" end-to-end path (covered by unit and session tests).
