# Spec 0411: Live play: player web page (join, role inbox and feed)

Issue: #411 · Milestone: 0.6.0 · Status: Draft · Depends on: #406, #407, 0417 tasks 1–2 · Related: #418, #410, #412, #413, #414, #415, #416, #422

## Summary

The page players open on a phone, tablet or laptop. They join by QR code or link, pick or receive a role, and see that role's inbox (what was addressed to them) and the feed (what everyone saw, the exercise clock, controller notices). It works in current mobile browsers without an install, meets WCAG 2.2 AA, reconnects after sleep, and is the one surface every other live feature plugs into. This spec also lands the session lifecycle and roster in main, since the page is useless without something to join.

## Requirements

### User stories

- As a player, I want to scan a code and be in the exercise within a few seconds, so that joining is not the first obstacle of the day.
- As a player, I want to see only what my role would see, with the whole-room items in a feed, so that I know what is mine to act on.
- As a player whose phone slept, I want the page to reconnect by itself and show what I missed, so that I never have to ask the facilitator "did I miss something?".
- As a facilitator, I want to hand out per-role cards so that people land in the right seat, and to see who is in which seat.
- As a player who uses a screen reader, I want every inject's exact text read to me, so that an image of a tweet is not a dead end.

### Functional requirements

- **FR-1** Join by the 0406 invite URL `<base>/s/<sessionId>#<fragment>[.<roleHint>]` (`buildInvite` / `parseInvite` in `src/shared/live/invite.ts`). The fragment carries the keys and never leaves the browser. `roleHint` is a role id, or the reserved hints `evaluator` and `observer`; when present the seat is preselected (per-role QR cards) and the controller still decides. The facilitator's app shows one QR for the room and can print per-role cards (`live:join-cards`, a PDF via `templates/export/`).
- **FR-2** The join screen asks for a seat (list of scenario roles with name, abbreviation and team, plus Evaluator and Observer when the session has those seats) and an optional display name. At attribution level `role` the screen says: "This exercise is non-attributional. Your name is shown to the room only while you are connected and is not recorded." At `named` it says names are recorded.
- **FR-3** A seat with a capacity shows "2 of 3 seats taken"; a full seat cannot be chosen; the facilitator can raise capacity live.
- **FR-4** After `welcome`, the page shows the **Inbox** (items addressed to `role:<mine>`, `team:<mine>` or `client:<me>`) and the **Feed** (items addressed to `all`, controller notices, clock changes, vote and hot wash announcements). Items are sorted by exercise time, newest on top, with unread markers. A new inbox item is announced in a live region and, when the player allowed it, with a short vibration (`navigator.vibrate`) and a sound (off by default).
- **FR-5** The header shows the exercise clock (from `clock.state`, ticking locally while running), the scenario title, the seat, and the connection state (connected, reconnecting, offline).
- **FR-6** Navigation: bottom tab bar on narrow screens, left rail on wide ones: Inbox · Feed · Messages (0413) · More. **More** holds Votes (0414), Hot wash (0415), Surveys (0422), Evaluate (0416, evaluators only), Settings (theme, sound, vibration, text size), About (bundle and protocol version, what is and is not recorded). A tab that has nothing yet is shown disabled with a one-line explanation, never hidden, so the layout does not jump when a feature opens.
- **FR-7** Reconnection: on `close`, `error`, `visibilitychange` to visible, `online`, and `pageshow`, the client reconnects with exponential backoff (0.5 s to 30 s, jittered), re-joins with `resume: true`, and sends `catchup.request { after: lastIndex }` to the server (0406); `catchup.batch` fills the gap through the same replay-guarded path as live frames. The UI shows "Reconnecting…" after 2 s offline and "You're back" for 3 s after.
- **FR-8** Late joiners get the full stored history (`catchup.request { after: 0 }`), and the page shows what is addressed to their seat or to all, so a player who arrives at 1:20 sees what their role already received.
- **FR-9** The controller may remove a client (0410's `live:kick`, which rotates the key with `session.rekey` and has the server close the connection with `4003`); its page shows "The facilitator removed this device from the exercise" and stops reconnecting. The controller may move a client to another seat (`live:roster-reseat`): the controller re-sends a signed `welcome` with the new role; the page shows the new seat and rebuilds its inbox from what it already holds.
- **FR-10** The hot wash and surveys happen before the facilitator ends the session. `session.end` (`reason: 'endex' | 'cancelled'`) shows an end screen with the facilitator's closing message; the page drops its decrypted media and keys and stops reconnecting.
- **FR-11** Version check: the server closes a client whose `v` it does not speak with code `4000` (or answers `relay.error VERSION`); the page shows "Reload this page to update" with a reload button. The join screen shows the bundle version and protocol version in small print.
- **FR-12** Theme follows the system by default; Settings offers Light / Dark / System and the choice persists in `localStorage`.
- **FR-13** Facilitate page: a **Live** tab with Start / End, the room QR and address, the attribution choice, seat capacities, **Show join code on the presentation screen**, and **Print role cards**; a roster list with seat, display name (if any), connection state and last-seen time.

### Non-functional requirements

- **NFR-1** Cost: nothing new costs money; the only new dependency is a QR encoder (recommendation: `qrcode`, MIT, no dependencies, used in main to produce SVG). (CONTRIBUTING, Project rules 1.)
- **NFR-2** Privacy: the page makes requests only to the origin that served it (CSP `default-src 'self'; connect-src 'self' wss:`-equivalent with the exact host); no fonts, scripts or analytics from anywhere else. `sessionStorage` holds the `clientId`, `seq` and `lastIndex` per session (0406); `localStorage` holds theme and preferences only; display name is held in memory. (Project rules 3.)
- **NFR-3** Accessibility: WCAG 2.2 AA. Touch targets at least 24 × 24 CSS px, 44 × 44 for primary actions; visible focus everywhere; the live region for new items is `aria-live="polite"`; reduced motion honored; works at 200 % zoom and 320 px wide without horizontal scroll; the join flow has no cognitive test (3.3.8) and does not ask twice for anything (3.3.7); every image inject has its exact text available (0412).
- **NFR-4** Performance: bundle at most 250 KB gzipped; first render of the join screen under 2 s on a mid-range Android phone over Wi-Fi; 500 feed items scroll smoothly (windowed list, ADR-0017's approach).
- **NFR-5** Browsers: iOS Safari 16+, Android Chrome current, desktop Chrome, Edge, Firefox, Safari current. No install, no service worker in this milestone (see open questions).
- **NFR-6** Offline tolerance: actions a player takes while offline (receipts in 0412, messages in 0413, observations in 0416) are queued in IndexedDB and sent on reconnect, idempotent by message id.

### Out of scope

- Push notifications, home-screen install, background operation.
- Player-to-player chat (players message the SimCell only; 0413).
- Localization (English only in 0.6.0; strings are in one module so it is cheap later).

## Design

### Architecture

```
src/player/
  index.html                strict CSP meta, viewport, theme-color
  main.tsx                  mounts <App/>; parseInvite(location.href) from src/shared/live/invite.ts
  app/
    App.tsx                 router (hash-free: screen state machine join → room → ended)
    session.ts              wraps 0406's LiveClient with a browser WebSocket Transport (and the fetch
                            fallback from 0407): connect, join, reconnect, catch-up; exposes a store
    store.ts                tiny observable store (no Zustand: keep the bundle small)
    queue.ts                IndexedDB outbox for offline actions
    a11y.ts                 live region, focus management, reduced-motion flag
    theme.ts                light / dark / system
  screens/
    JoinScreen.tsx  RoomShell.tsx  InboxScreen.tsx  FeedScreen.tsx  MoreScreen.tsx
    SettingsScreen.tsx  AboutScreen.tsx  EndedScreen.tsx  RemovedScreen.tsx
  features/                 one folder per sub-spec: injects/ (0412), messages/ (0413), votes/ (0414),
                            hotwash/ (0415), surveys/ (0422), evaluate/ (0416)
  components/               Button, Card, TabBar, Sheet, Badge, Clock, ConnectionDot, EmptyState
  styles/
    player.css              @import '../../renderer/src/styles/tokens.css'; layout, components
vite.player.config.ts       second Vite config; outDir out/player; base './'
```

The bundle uses React (stack rule 6) with no router, no TanStack Query, no Radix: the screen state machine and the store are a few hundred lines. The protocol and crypto come from `src/shared/live/` so the player runs the same code the controller does.

### Served paths

Paths are 0406's and 0407's: the bundle at `/s/<sessionId>` (`index.html`; the fragment is read by the page), static files under `/assets/`, the WebSocket at `/v1/sessions/:id/ws?j=<joinToken>`, and blobs through `relay.blob.get` frames or the LAN and self-hosted `GET /v1/sessions/:id/blobs/:blobId` fallback (0412 uses them through `LiveClient.getBlob`).

### Protocol use (0406 schemas; what this spec puts in them)

| Type                | Direction                  | How this spec uses the payload                                                                                                                                                                                                                                                                                 |
| ------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `join`              | client → controller        | `name` (display name, may be empty), `kind: 'player' \| 'evaluator' \| 'observer'`, `requestedRole` (from the role hint or the seat list), `resume` on reconnect, `ua`                                                                                                                                         |
| `welcome`           | controller → `client:<id>` | `role` (id, name, abbreviation, teamId, teamName), `sessionName`, `scenarioTitle`, `clock`, `roster` (names only while connected; observers listed only to the controller), `features` from the session, or `rejected: { reason: 'full' \| 'role_taken' \| 'not_allowed' }` for a full seat or an unknown role |
| `presence`          | server → all               | `{ client, state, at }`; the page shows a connected count, the controller maps clients to seats                                                                                                                                                                                                                |
| `catchup.request`   | client → server            | `{ after: lastIndex }` on reconnect, `{ after: 0 }` on first join                                                                                                                                                                                                                                              |
| `catchup.batch`     | server → `client:<id>`     | stored envelopes, applied through `LiveClient.open()`                                                                                                                                                                                                                                                          |
| `clock.state`       | controller → all           | `ClockState` from `facilitator.json` (`rate` once 0428 lands)                                                                                                                                                                                                                                                  |
| `controller.notice` | controller → targets       | `level`, `text`, `dismissible` for the Live tab's **Send notice**; `kind` (see requirements below) for retract, reseat and hot wash open/close                                                                                                                                                                 |
| `session.end`       | controller → all           | `reason`, `at`, `message`                                                                                                                                                                                                                                                                                      |
| `session.rekey`     | controller → `client:<id>` | sent by 0410's kick and new-link actions; the page keeps every epoch key for catch-up history                                                                                                                                                                                                                  |

Requirements for 0406 from this spec: `controller.notice` gains an optional `kind: 'text' | 'retract' | 'reseat' | 'hotwash.open' | 'hotwash.close'` and `ref?: Base64Url22 | SafeId` (defaults to `text`), so the sub-specs need no new message types; `welcome` gains `attribution: 'role' | 'named'` and `features.eval` is the evaluator form flag.

### Main process

`src/main/live/session.ts`:

```ts
startSession(root, scenarioId, opts: { transport, attribution, seats, unansweredAfterMin }): Promise<LiveSession>
resumeSession(root, scenarioId, sessionId): Promise<LiveSession>   // replays log.jsonl (0417)
endSession(reason?: string): Promise<void>
current(): SessionState | undefined
send(to: Destination, type: MessageType, payload: PayloadByType[type]): Promise<void>  // logs, then LiveClient.send
on(type, handler)                                                        // feature modules register by type (LiveClient.on)
```

`session.ts` owns the controller `LiveClient` (0406) over 0410's `transport-ws.ts`; features never touch either. `src/main/live/roster.ts` keeps `Map<ClientId, Client>` with kind, roleId, name, `clientRef`, connected, lastSeen, ua; `reseat` (re-sends `welcome`), `setCapacity`; consumes server `presence`; emits `live:changed { what: 'roster' }` (debounced 300 ms). Kick and key rotation are 0410's `live:kick` / `live:rotate-key`; the roster marks the kicked client `removed`.

Clock: `facilitator:state-save` (existing) calls `session.ts` `onClockChanged(state)` when a session is active, which sends `clock.state`. Players' clocks tick locally from `runningSince`; `serverTime` in `welcome` corrects device clock skew.

### IPC (`src/shared/ipc/live.ts`, this spec's part)

```
live:session-start   { projectPath, scenarioId, transport, attribution, seats, unansweredAfterMin? } → LiveSession
live:session-end     { projectPath, scenarioId }                       → LiveSession
live:session-status  { projectPath, scenarioId }                       → { session?: LiveSession, joinUrl?, qrSvg?, roster: RosterClient[], transportState }
live:sessions-list   { projectPath, scenarioId }                       → LiveSessionSummary[]   (past sessions, 0417)
live:roster-reseat   { projectPath, scenarioId, clientRef, seat }      → void          (kick and new link: 0410's live:kick / live:rotate-key)
live:seat-capacity   { projectPath, scenarioId, seat, capacity? }      → LiveSession
live:join-cards      { projectPath, scenarioId, outPath }              → { path }   (PDF, one card per seat with QR)
live:notice          { projectPath, scenarioId, to, text }             → void
event live:changed   { sessionId, what: 'session' | 'roster' | 'receipts' | 'messages' | 'votes' | 'hotwash' | 'eval' | 'log' }
```

`joinUrl` contains the key; it is returned to the renderer for the QR and the copy button and is never written to disk or logged.

### Renderer (Facilitate)

`src/renderer/src/routes/facilitate/live/LivePanel.tsx`: the Live tab. `useLiveSession(projectPath, scenarioId)` wraps `live:session-status` and refetches on `live:changed`. `RosterList.tsx` with kick / reseat actions (confirm dialog for kick). The join QR view for the presentation window: `src/renderer/src/routes/present/PresentJoin.tsx` shows the QR, the short address and "Scan to join · pick your role", in the presentation theme.

### Wireframes

Join (phone):

```
┌──────────────────────────────┐
│ Action Stations        ◐ ⚙   │
│ Flight to Nowhere            │
│ Live exercise · Session A7Q  │
├──────────────────────────────┤
│ Pick your seat               │
│ ┌──────────────────────────┐ │
│ │ ● Ops Director (IC)      │ │
│ │   Operations · 1 of 1    │ │
│ ├──────────────────────────┤ │
│ │ ○ IT Director (IT)       │ │
│ │   IT/Cybersecurity       │ │
│ ├──────────────────────────┤ │
│ │ ○ Public Information (PIO)│ │
│ ├──────────────────────────┤ │
│ │ ○ Evaluator              │ │
│ │ ○ Observer               │ │
│ └──────────────────────────┘ │
│ Display name (optional)      │
│ [__________________________] │
│ This exercise is non-        │
│ attributional. Your name is  │
│ shown only while connected   │
│ and is not recorded.         │
│ [        Join exercise     ] │
└──────────────────────────────┘
```

Room shell with Inbox (phone):

```
┌──────────────────────────────┐
│ ● 1:15   Flight to Nowhere   │
│   Ops Director (IC)          │
├──────────────────────────────┤
│ Inbox                    2 new│
│ ┌──────────────────────────┐ │
│ │ 1:15  I-06  ● FIDS board │ │
│ │ [thumbnail            ]  │ │
│ │ Gate B4 shows Miami…     │ │
│ │ From: Gate agent  To: Ops│ │
│ ├──────────────────────────┤ │
│ │ 1:05  I-04  ● Memo       │ │
│ │ Vendor maintenance window│ │
│ ├──────────────────────────┤ │
│ │ 0:45  I-02    Phone call │ │
│ │ ▶ 0:42  Read             │ │
│ └──────────────────────────┘ │
│                              │
├──────────────────────────────┤
│ [Inbox]  Feed  Messages  More│
└──────────────────────────────┘
```

Feed (same shell): clock changes ("Time jump to 2:00"), items to all, notices ("Hot wash is open"), vote and survey announcements with a button to the tab. Wide screens put the tab bar as a left rail and show the inbox list beside the open item.

Facilitate Live tab:

```
┌ Live ─────────────────────────────────────────┐
│ Connection: This computer  ▸ change (0410)    │
│ Attribution: (•) Role only  ( ) Named         │
│ Seats: Ops 1 · IT 1 · PIO 2 · ASC 1 · AL 1    │
│        Evaluators 2 · Observers any   [edit]  │
│ [ Start session ]                             │
├───────────────────────────────────────────────┤
│ (running)  Session A7Q · 00:42:10             │
│ ┌────────┐  https://192.168.4.12:8443/p/A7Q  │
│ │ QR     │  [Copy link] [Show on screen]     │
│ │        │  [Print role cards]               │
│ └────────┘                                    │
│ Room  7 connected · 1 away                    │
│  Ops Director   ● Dana        2 s ago  [⋯]    │
│  IT Director    ● (no name)   5 s ago  [⋯]    │
│  PIO            ● Sam  ● Lee                  │
│  ASC            ○ —   (seat empty)            │
│  Evaluator      ● J. Ortiz                    │
│ [ End session ]                               │
└───────────────────────────────────────────────┘
```

### Data model additions

`src/shared/schemas/live.ts`: `LiveSession` (0418), `Seat`, `RosterClient { clientRef, kind, roleId?, displayName?, connected, lastSeen, ua?, removed? }`. No scenario or project schema changes. `facilitator.json` is untouched.

### Migrations

None. Projects without `scenarios/<id>/live/` behave as before.

## Security and privacy

- The keys in the URL fragment are never sent in HTTP requests; the page reads `location.hash` once and keeps the URL as-is so a reload still works (0406). Browsers do not log fragments to servers; the join screen tells players not to share the link.
- CSP in `index.html` allows only `'self'` for scripts, styles (hashed inline for the theme bootstrap), images (`'self' blob:`), media and connections. No `unsafe-inline` scripts, no `eval`.
- All text from the controller is rendered as text, never as HTML; inject renditions are images, audio and video served from the same origin.
- `clientId` identifies a browser, not a person. At attribution `role` the controller hashes it with a session salt into `clientRef` and discards the salt at session end.
- A removed client cannot read anything after the rotation (`session.rekey` excludes it) and its join token is refused by the server; a fresh browser on the same device can rejoin with the new link (there is no device fingerprinting), which is the intended behaviour: the facilitator removes a seat occupant, not a human.
- Display names are limited to 40 characters and filtered for control characters; they are shown with `aria-label` text, never interpreted.
- What leaves the computer: encrypted session traffic to joined devices only, after the facilitator presses Start.

## Testing

- **Unit:** `session.ts` start/end/authorization; `roster.ts` capacities, kick, reseat, presence debounce; player `session.ts` reconnect backoff and catch-up (fake WebSocket), `queue.ts` outbox persistence (fake IndexedDB), `store.ts`; `theme.ts`. Renderer `LivePanel.test.tsx` (happy-dom) for start/stop states and the roster list.
- **Integration:** fake transport + three protocol clients joining, one in a full seat (refused), one late (catch-up), one kicked.
- **e2e `e2e/live/player-join.spec.ts`:** start a session on the Scenario 3 example; open five player contexts (two Pixel 7, two iPhone 14, one desktop); join as Ops, IT, PIO, Evaluator, Observer; assert the roster in Facilitate; send a notice and see it in every feed; put one player offline (`context.setOffline(true)`) for 20 s while releasing a notice, bring it back, assert catch-up; reseat one client and assert the header changes; kick one and assert the removed screen; end the session and assert the end screen. Screenshots in light and dark to `.tmp/live/`. Asserts the app listened on loopback only.
- **a11y:** the join, inbox, feed, more and settings screens in `e2e/a11y.spec.ts` at 100 % and 200 % zoom, light and dark, with axe-core and the keyboard walkthrough (join by keyboard only).
- **Packaged smoke:** `app-resources/player/index.html` present and served.

## Tasks

1. **Schemas and IPC domain.** `src/shared/schemas/live.ts` (`LiveSession`, `Seat`, `RosterClient`), `src/shared/ipc/live.ts` (channels above, `LiveChangedEvent`), register in `src/shared/ipc/index.ts` (channels and the `live:changed` event), `src/main/ipc/handlers/live.ts` stub returning `NOT_FOUND` for an inactive session. Tests: `src/shared/schemas/schemas.test.ts` additions.
2. **Session lifecycle and roster.** `src/main/live/session.ts` (controller `LiveClient` over 0410's transport), `src/main/live/roster.ts`, `src/shared/live/transport-memory.ts` (in-process server stub for tests, if 0406 has not provided one), authorization table (which seat may send which type), `session.json` writes, `clock.state` hook in `src/main/ipc/handlers/facilitator.ts`. Tests: `session.test.ts`, `roster.test.ts`.
3. **Player bundle scaffold.** `vite.player.config.ts`, `src/player/index.html`, `main.tsx`, `app/{App,store,session,queue,a11y,theme}.ts(x)`, `styles/player.css` importing the renderer tokens, `components/`; `package.json` scripts `build:player`, `dev:player`; `electron-builder.yml` `extraResources` `out/player → app-resources/player`; `scripts/local-ci.sh` builds it and checks the gzipped size budget. Tests: `src/player/app/*.test.ts`.
4. **Join and room shell.** `screens/JoinScreen.tsx`, `RoomShell.tsx`, `InboxScreen.tsx`, `FeedScreen.tsx`, `MoreScreen.tsx`, `SettingsScreen.tsx`, `AboutScreen.tsx`, `EndedScreen.tsx`, `RemovedScreen.tsx`; windowed list for inbox and feed; live region; vibration and sound preferences. Tests: screen tests with happy-dom.
5. **Facilitate Live tab.** `src/renderer/src/routes/facilitate/live/{LivePanel,RosterList,use-live-session}.tsx`, tab in `FacilitateParts.tsx` `SidePanel`, QR generation in main (`src/main/live/qr.ts` with `qrcode` → SVG), `live:join-cards` PDF through `src/main/export/page.ts` and a new `templates/export/join-cards.html`. Tests: `LivePanel.test.tsx`, `qr.test.ts`, `join-cards.test.ts`.
6. **Presentation join view.** `src/renderer/src/routes/present/PresentJoin.tsx` and the `join` route from 0418 task 2; "Show on screen" in the Live tab. Test: `PresentPage.test.tsx` addition.
7. **e2e and docs.** `e2e/live/player-join.spec.ts`, a11y additions, `docs/guides/live-play.md` (joining, seats, role cards, what players see), `docs/02-ARCHITECTURE.md` player bundle paragraph.

## Open questions

1. **Service worker for a true offline shell?** Recommendation: not in 0.6.0. The page is served by the same host the socket needs; a service worker adds cache-invalidation risk with the relay's versioned bundles. Revisit with install prompts in 0.8.0.
2. **Should players be able to change their own seat after joining?** Recommendation: no; only the controller reseats. It prevents accidental hopping during play and keeps the roster trustworthy for the log.
3. **Observer seat visible to players?** Recommendation: observers appear in presence to the controller only; players see player seats and evaluators. Observers are usually senior visitors and their presence changes behaviour.
4. **Sound on new inbox item: default on or off?** Recommendation: off; rooms are loud enough and iOS requires a gesture before audio anyway. Vibration default on where supported.
