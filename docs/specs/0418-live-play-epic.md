# Spec 0418: Live play (epic)

Issue: #418 · Milestone: 0.6.0 · Status: Draft · Depends on: #406, #407 · Related: #408, #409, #410, #411, #412, #413, #414, #415, #416, #417, #419, #421, #422

## Summary

Players, evaluators and controllers join an exercise on their own devices. Injects arrive in each role's inbox as the rendered artifact, players message the SimCell, vote at decision points, add hot wash items and answer surveys, evaluators record observations against the EEG, and the facilitator watches a dashboard. Everything is timestamped into a session log that becomes the input for the AAR/IP draft (#419). Three connection types (this computer, the Action Stations relay, an organization's own server) carry one protocol (#406), and no server ever sees exercise content.

This spec fixes what the sub-specs share: module layout, identity and attribution, the session lifecycle, the session log, the IPC domain, the player bundle, and the order the pieces land in. Each sub-issue has its own spec (0411–0417); the protocol and transports are specified in 0406–0410 by another writer; surveys in 0422; EEGs in 0421.

## Requirements

### User stories

- As a facilitator, I want to start a live session from the Facilitate page, show a QR code, and have the room join in under a minute, so that the exercise does not start with a tech-support session.
- As a player, I want the injects addressed to my role on my phone, the way the real channel would show them, so that I act on what I would really see instead of squinting at a projector.
- As a SimCell controller, I want to answer players' messages in character, so that players act instead of only discussing.
- As an evaluator, I want to score critical tasks against the plan while play happens, so that the AAR is built from observations and not from memory.
- As an exercise director, I want the full record of the session exported, so that nothing said during play is lost and the AAR/IP writes itself from it.
- As a security reviewer, I want to know exactly what leaves the room, when, and in what form, so that I can approve live play on our network.

### Functional requirements

- **FR-1** A live session belongs to one scenario and runs inside Facilitate mode. Starting a session requires choosing a connection (#410); the default is **This computer** (#407).
- **FR-2** One protocol (#406) carries every feature over every connection. Features are implemented once against `src/main/live/session.ts` and never against a transport.
- **FR-3** The player page (#411) is one small web bundle served by every connection type, works in current mobile browsers without install, and hosts every player-facing feature: inbox and feed (#411), injects (#412), messages (#413), votes (#414), hot wash (#415), surveys (#422) and the evaluator form (#416).
- **FR-4** Every event of a session (join, release, receipt, message, vote, hot wash item, survey response, observation, controller notice, clock change) is appended to the session log (#417) in the project folder, in order, with wall-clock and exercise-clock timestamps.
- **FR-5** The controller dashboard (#417) shows the room at a glance: connected clients per role, delivery and read status per inject, unanswered injects, response times, votes and messages.
- **FR-6** The facilitator can end a session; devices show an end screen; the session folder is closed and appears under the scenario's past sessions, exportable as JSON and CSV.
- **FR-7** A session that was interrupted (app crash, laptop closed) is offered for resumption when Facilitate opens; the in-memory state is rebuilt by replaying the session log (#406's replay test).
- **FR-8** Discussion-based exercises are non-attributional (HSEEP). The default attribution level is **role**: the log and every export record a role and team, never a person's name. The facilitator may switch a session to **named** before it starts (for operations-based exercises and evaluator attribution); the choice is shown to players on the join screen.
- **FR-9** Without a live session everything in Facilitate works as today. Live play adds; it never gates.

### Non-functional requirements

- **NFR-1** Cost: nothing in the epic costs money (CONTRIBUTING, Project rules 1). The LAN server is free; the relay runs on Cloudflare's free plan and fails closed (#408); the self-hosted server is open source (#409). No GitHub Actions beyond the free release build.
- **NFR-2** Privacy (Project rules 3): no network listener exists until the facilitator starts a session; it stops when the session ends. Session content is end-to-end encrypted (#406); relays and servers see session id, sizes, timing and addresses only. The Facilitate page states, in plain words, what each connection sends where before the session starts (#410). No telemetry.
- **NFR-3** Accessibility: the player page and every new Facilitate panel meet WCAG 2.2 AA (`e2e/a11y.spec.ts` covers them with axe-core; target size 2.5.8, focus not obscured 2.4.11, dragging alternatives 2.5.7, redundant entry 3.3.7, accessible authentication 3.3.8).
- **NFR-4** Capacity: 60 connected clients per session on a laptop over Wi-Fi with inject release reaching every targeted device within 2 s on LAN and 5 s through the relay (measured in the `LIVE=1` test of 0407/0408). The relay's per-session caps (#408) are the lower bound the features must live within: an inject release message is small; assets are pre-staged (0412).
- **NFR-5** Resilience: devices reconnect after sleep, tab switch and Wi-Fi roaming without user action and receive what they missed (`catchup.request` / `catchup.batch`). The controller survives a renderer reload; main holds the session.
- **NFR-6** Platforms: controller on macOS, Windows, Linux (the existing matrix); players on iOS Safari 16+, Android Chrome (current), desktop Chrome, Edge, Firefox and Safari (current).
- **NFR-7** Bundle: the player bundle is at most 250 KB gzipped (JS + CSS) and loads to the join screen in under 2 s on a mid-range phone over Wi-Fi. It shares `src/renderer/src/styles/tokens.css` and nothing else from the renderer.

### Out of scope

- Audio or video calls between players and the SimCell.
- A native app or push notifications; the page is the app.
- Virtual desktops per player (Conducttr's model). Players get an inbox, not a simulated OS.
- Exercise authoring on the player page. Players never edit the scenario.
- Multi-session federation (two facilitators running one exercise from two laptops).
- The AAR/IP draft itself (#419): this epic produces its input.

## Design

### Module layout

```
src/shared/live/            protocol (0406): envelope, message type schemas, crypto      [other writer]
src/shared/ipc/live.ts      IPC channels `live:*` and the LiveChangedEvent (this epic; one domain file)
src/shared/schemas/live.ts  zod: LiveSession, SessionLogEntry, Seat, Receipt, Thread, Vote, HotWashItem,
                            Observation, DashboardView (the persisted and IPC shapes; not the wire format)
src/main/live/
  session.ts                lifecycle: start, resume, end; the in-memory SessionState; routes inbound
                            messages to feature handlers; outbound send(to, type, payload)
  roster.ts                 clients, seats, presence (0411)
  log.ts                    append-only JSONL session log, replay, export (0417)
  assets.ts                 device renditions and pre-staging of inject media (0412)
  deliver.ts                inject release and receipts (0412)
  messages.ts               threads between players and the SimCell (0413)
  votes.ts                  decision-point votes (0414)
  hotwash.ts                hot wash items, grouping, promotion (0415)
  evaluation.ts             evaluator observations (0416)
  dashboard.ts              derived view for the controller dashboard (0417)
  transport-ws.ts           the app's ws-based Transport for src/shared/live LiveClient (0410)  [other writer]
  server/                   the LAN server: static player bundle, WebSocket, blob GET (0407)   [other writer]
src/main/ipc/handlers/live.ts  one handler file for the `live:*` channels
src/player/                 the player web bundle (0411): index.html, main.tsx, app/, features/, styles/
src/renderer/src/routes/facilitate/live/   Facilitate panels: LivePanel (start/stop, QR), RoomPanel
                            (dashboard), MessagesPanel, VotePanel, HotWashBoard, EvaluationPanel
e2e/live/                   Playwright specs that drive the Electron app and several browser players
```

Each sub-spec adds to `src/shared/ipc/live.ts`, `src/shared/schemas/live.ts` and `src/main/ipc/handlers/live.ts` in build order; the pull requests are sequential, so the single-domain-file rule in `docs/09-CODE-CONVENTIONS.md` holds.

### Session lifecycle and state

```
Facilitate ──live:session-start──► session.ts ──► transport.listen()
                                      │  writes scenarios/<id>/live/<sessionId>/session.json
                                      │  appends log.jsonl: session.start
                                      │  pre-stages inject assets (0412) as a job
   players join ─► roster.ts ─► welcome, presence, catchup.batch
   deliver row ─► deliver.ts ─► inject.release ─► receipts
   …
Facilitate ──live:session-end────► session.end to all ─► transport.close() ─► session.json endedAt
```

`SessionState` (in memory, main process) is the authority: roster, released injects and receipts, threads, votes, hot wash board, observations, the last `seq`. Every mutation first appends to the log, then updates the state, then emits `live:changed` to the renderer. Resumption rebuilds `SessionState` by replaying `log.jsonl`.

```ts
// src/shared/schemas/live.ts (sketch; sub-specs fill the feature parts)
LiveSession {
  id: SessionId,                 // 0406's server-minted 128-bit base64url id; also the session folder name
  scenarioId, startedAt, endedAt?,
  transport: 'local' | 'relay' | 'server', joinUrlPublic: string,   // never the key fragment
  attribution: 'role' | 'named',
  seats: Seat[],                 // { kind: 'role', roleId, capacity? } | { kind: 'evaluator', capacity? }
                                 // | { kind: 'observer', capacity? }
  protocolVersion: number,
  unansweredAfterMin: number     // 0417, default 10
}
```

### Identity and attribution

- A client is a browser tab. On first load the page generates a `clientId` (0406 `ClientId`, 128 random bits) kept in `sessionStorage` under the session id so reloads and reconnects keep the same identity; it is the envelope's `from`.
- Each client holds one **seat**, which is 0406's `join.kind` plus a role: a scenario role (`kind: 'player'`, `role:<id>`), `evaluator`, `observer` (watches the feed, receives `all` injects, sends nothing), or `controller` (the facilitator's app; also the SimCell). 0406's `kind: 'simcell'` (a helper's device answering messages) is accepted by the roster but gets no features in 0.6.0 (0413 open questions).
- A **team** is the set of roles whose `Role.team` is equal; `team:<id>` uses a slug of the team name.
- Attribution level `role` (default): the log records `{ role, team }` and a per-session `clientRef`, which is the first 8 hex characters of SHA-256 of `clientId` with a per-session salt kept in memory only. It lets the dashboard count distinct devices and dedupe votes; after the session ends it cannot be mapped back to a device. Display names, if players typed one, stay in memory for presence and are never logged or exported.
- Attribution level `named`: the log also records `displayName`. Evaluators get a stable label per session ("Evaluator 2", the `evaluator` field of 0421's `Observation`) at level `role`, and their display name at level `named`.
- Votes are anonymous by default in both levels (0414).

### Session log

Defined in 0417: `scenarios/<scenarioId>/live/<sessionId>/log.jsonl`, one JSON object per line, append-only, plus `session.json`, `attachments/`, `staged/` and `blobs.json`. Facilitator notes stay in `facilitator.json`; promoted hot wash items (0415) and recorded decisions (0414) are appended to 0419's `FacilitatorState.hotwash` and `decisions` fields, so the facilitator-curated results live in one file and the AAR draft reads `facilitator.json`, `evaluation.json` (0421, which 0416 feeds) and the log.

### Player bundle

Defined in 0411: `src/player/` built by `vite.player.config.ts` into `out/player/`, shipped as `extraResources` `app-resources/player/`, served by the local server (0407) and the self-hosted server (0409), and deployed with the relay (0408). The bundle version and `PROTOCOL_VERSION` are shown on the join screen; a client whose `v` the server does not speak is closed with code `4000` (0406), and the page shows "Reload this page to update".

### Facilitate page

The side panel (`FacilitateParts.tsx` `SidePanel`) gains tabs **Live**, **Room**, **Messages**, **Votes** and **Hot wash board**; live evaluator observations go into 0421's **Evaluate** panel rather than a tab of their own; the existing **Inject**, **Hot wash** and **General notes** tabs stay. Timeline rows show delivery and read counts when a session is active (0412) and an unanswered badge (0417). The presentation window gains three views besides an inject: the join QR (0411), vote results (0414) and the promoted hot wash board (0415).

### Presentation window

`src/main/facilitator/present.ts` `PresentTarget` becomes a union: `{ kind: 'inject', injectId, assetId? } | { kind: 'join' } | { kind: 'vote', voteId } | { kind: 'hotwash' }`; `presentHash` maps them to `/present/<key>/<scenario>/<injectId>`, `/present/<key>/<scenario>/join`, `/present/<key>/<scenario>/vote/<voteId>`, `/present/<key>/<scenario>/hotwash`. The `facilitator:present` channel takes `view` (default `inject`, so existing callers are unchanged). Task 2 below lands the union with the `join` and `vote` kinds; 0415 adds `hotwash`.

### Build order

| Step | Spec | Lands                                                    | Needs                |
| ---- | ---- | -------------------------------------------------------- | -------------------- |
| 1    | 0406 | protocol, crypto, replay test                            | —                    |
| 2    | 0417 | tasks 1–2: session log store and `LiveSession` schema    | —                    |
| 3    | 0407 | local server over Wi-Fi                                  | 1                    |
| 4    | 0411 | session lifecycle, roster, player bundle, join, feed, QR | 1, 2, 3              |
| 5    | 0412 | inject delivery and receipts                             | 4                    |
| 6    | 0413 | messages                                                 | 4                    |
| 7    | 0414 | votes                                                    | 4, presentation view |
| 8    | 0415 | hot wash contributions                                   | 4                    |
| 9    | 0417 | tasks 3–7: dashboard, unanswered injects, export, resume | 5, 6, 7              |
| 10   | 0416 | evaluator form                                           | 4, 0421              |
| 11   | 0410 | connection chooser                                       | 4                    |
| 12   | 0408 | relay                                                    | 1, 11                |
| 13   | 0409 | self-hosted server                                       | 12                   |
| 14   | 0422 | surveys on the player page                               | 4                    |

Steps 5–8 are independent of each other and run in parallel after step 4; so do 12–14.

### Acceptance criteria for the epic

1. From a fresh install, a facilitator opens the Scenario 3 example, starts a session on **This computer**, and five phones in the room join by QR within one minute without an account or install.
2. Releasing I-06 (FIDS board) puts the rendered image in the Ops Director's inbox within 2 s; the dashboard shows 1 delivered, then 1 read; the PIO's device shows nothing for I-06.
3. The PIO messages the SimCell; the controller answers in character from the Messages tab; both lines are in the log with wall-clock and exercise-clock times and the role, not a name.
4. A decision-point vote opens, five devices vote, the projector shows the tally with no names, and the log holds the tally and five anonymous ballots.
5. During the hot wash, items arrive from devices, the facilitator groups three into one and promotes it; the promoted item appears in the Hot wash tab and in the exported log.
6. An evaluator rates critical tasks offline for two minutes (airplane mode), reconnects, and every observation arrives once.
7. The facilitator ends the session; the devices show the end screen; the session folder has `session.json`, `log.jsonl` and attachments; **Export log** writes JSON and CSV that open in a spreadsheet.
8. Killing the app mid-session and reopening Facilitate offers **Resume**; after resuming, the roster rebuilds as devices reconnect and the receipts and votes are as before.
9. The same session runs unchanged through the relay (0408) and a self-hosted server (0409); a packet capture at the relay shows ciphertext only.
10. `e2e/live/*.spec.ts` cover 1–8 with simulated players; `pnpm ci:local` is green; `A11Y_REPORT` is clean for the player page and the new panels.

## Security and privacy

Threat model and crypto are 0406's. What this epic adds:

- **Content never leaves the computer unencrypted.** Every feature sends through `session.ts`, which encrypts with the session key; no feature touches a transport or a socket.
- **No listener at rest.** Nothing binds a port until `live:session-start`; `live:session-end` and app quit close it. `scripts/local-ci.sh`'s loopback check (the one `e2e/packs.spec.ts` uses) is extended to the live e2e: the app may listen on `127.0.0.1` only in tests.
- **The join key is a capability.** Anyone with the link can join; the facilitator sees joins on the dashboard and can remove a client or replace a leaked link (0410's `live:kick` and `live:rotate-key`, which run 0406's `session.rekey` so a removed device cannot read anything that follows). Per-role QR cards (0411) make it visible which card someone used.
- **Controller authority.** Players' clients reject unsigned controller messages (0406); the controller ignores feature messages from seats that may not send them (an observer's `vote.cast`, a player's `vote.open`).
- **Attribution is a design decision, not a toggle buried in settings.** It is chosen at session start, shown to players, and recorded in `session.json`.
- **Attachments** (0413) are size-capped, image-only, re-encoded on the device (EXIF stripped) and stored under the session folder; they are never rendered as HTML.
- **Logs record events, not secrets.** The session key, display names at level `role`, and raw `clientId`s never reach `log.jsonl`, the transport logs, or any export.
- **What leaves the computer, when, with whose consent:** on **This computer**, encrypted session traffic to devices on the LAN; on the **relay**, the same ciphertext to Cloudflare; on **Your server**, the same ciphertext to the configured host. In every case only after the facilitator picks the connection and presses Start (0410 shows the statement).

## Testing

- **Unit (Vitest):** `session.ts` routing and authorization table; `roster.ts`; `log.ts` append, replay, export; each feature module against an in-memory `Transport` (0406's interface is four methods; `src/shared/live/transport-memory.ts` pairs a controller `LiveClient` with N participant clients through an in-process server stub that applies 0406's routing table).
- **Integration:** a session started in main with the fake transport and three fake clients built from `src/shared/live/` (so the clients run the real protocol code), driving release → receipt → message → vote → hot wash → end and asserting the log.
- **e2e (Playwright):** `e2e/live/helpers.ts` launches the Electron app (`TTX_LIVE_BIND=127.0.0.1`), starts a session through IPC, reads the join URL from `live:session-status`, and opens N `chromium` contexts with `devices['Pixel 7']` and `devices['iPhone 14']` on the player page. Each sub-spec has its own spec file; `e2e/live/epic.spec.ts` runs acceptance criteria 1–8 end to end with five players.
- **Packaged smoke:** `e2e/packaged.spec.ts` gains a check that `app-resources/player/index.html` exists and the local server serves it.
- **Live (`LIVE=1`):** 0407/0408's load test (60 clients) is reused with inject release and voting.
- **Accessibility:** `e2e/a11y.spec.ts` adds the player page states (join, inbox, inject open, messages, vote, hot wash, evaluator form) in light and dark and at 200 % zoom, plus the new Facilitate tabs.

## Tasks

The epic's own pull requests are the shared pieces; features are in their specs.

1. **ADR and docs skeleton.** `docs/adr/00NN-live-play.md` (next free number; 0027 is the protocol's; the decisions above: module layout, attribution levels, log as source of truth, player bundle as separate Vite entry), `docs/guides/live-play.md` stub, and rows for 0411–0418 in `docs/specs/README.md`. Files: `docs/adr/00NN-live-play.md`, `docs/guides/live-play.md`, `docs/specs/README.md`, `docs/02-ARCHITECTURE.md` (new `live/` paragraph and the `scenarios/<id>/live/` folder in the storage tree), `docs/05-DATA-MODEL.md` (LiveSession, log entry).
2. **Presentation target union.** `PresentTarget` as a union with `kind`, `presentHash` for `join` and `vote`, `facilitator:present` gains `view`. Files: `src/main/facilitator/present.ts`, `src/main/facilitator/present.test.ts`, `src/shared/ipc/facilitator.ts`, `src/main/ipc/handlers/facilitator.ts`, `src/renderer/src/routes/present/index.ts`, `src/renderer/src/routes/present/PresentPage.tsx` (routes only; the views come with 0411 and 0414).
3. **Live e2e harness.** `e2e/live/helpers.ts` (`startSession`, `openPlayers(n, device)`, `joinAs(page, roleId)`, `endSession`), the loopback-only assertion, and `e2e/live/epic.spec.ts` as a skipped scaffold that each sub-spec fills in. Files: `e2e/live/helpers.ts`, `e2e/live/epic.spec.ts`, `scripts/local-ci.sh` (run `e2e/live/*.spec.ts` under `E2E=1`).
4. **Epic close-out.** After every sub-issue ships: run acceptance criteria 1–10 on macOS and Windows with real phones, record the results in the issue, update `README.md` (feature list, "how to run a live session"), `docs/08-ROADMAP.md`, and close #418.

## Open questions

1. **Should Facilitate get a full-width "Room" route for a second monitor, or is a side-panel tab enough?** Recommendation: tab first (0417); add `…/facilitate/room` as a pop-out in 0.7.0 if facilitators ask. The dashboard is written as a component so both are cheap.
2. **Attribution default for operations-based exercises.** Recommendation: keep `role` as the default everywhere; the facilitator switches to `named` per session. A scenario-level default is not worth a schema change until someone asks.
3. **Protocol version skew between a deployed relay's player bundle and the desktop app.** Recommendation (for 0406/0408): the relay serves every bundle version it has deployed under `/v<protocolVersion>/`, and the join URL carries the version, so an older app keeps working after a relay deploy.
4. **Players in the same room but with no Wi-Fi they can share (guest networks that isolate clients).** Recommendation: document the limitation in `docs/guides/live-play.md` with the two workarounds (phone hotspot from the facilitator's laptop; the relay), and detect client isolation in 0407 by having the app try to reach itself from a second address.
