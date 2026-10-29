# Spec 0413: Live play: messages between players and the SimCell

Issue: #413 · Milestone: 0.6.0 · Status: Implemented (#413) · Depends on: #406, #407, #411 · Related: #418, #412, #417, #419

## Implementation notes (as built)

- **Pin is log-only.** `FacilitatorState.hotwash` has no free-item shape yet, so **Pin to hot wash** writes a `message.pinned` log entry (who, text, exercise time) that the Hot wash tab and the AAR read once 0419 lands (ADR-0045).
- **Photos do not queue offline.** Text queues in the outbox; a message with a photo needs a connection to upload and shows "Not sent" with **Try again**. Photos are saved as JPEG.
- **No `live:attachment-url`.** `LiveMessage.attachments[].path` is project-relative, so the renderer uses `mediaUrl` directly. `live:message-targets` was added (roles, teams, connected devices as `client:<ref>`) and `live:message-pin` returns nothing.
- **Channels.** A player may write to its own role; team and device channels only after the controller opened them. Evaluators and observers have no Messages tab. Messages are accepted before STARTEX and flagged `preExercise` in the log.
- `LogRef.channel` allows 140 characters (a team slug can be 60). `live:changed` gained `reason: 'messages'` with `threadId`.
- The Facilitate **Messages** tab sits beside **Live** in the side panel; the e2e runs over the harness (`e2e/live/messages.spec.ts`), with the panel covered by component tests.

## Summary

Players send messages (text, optionally a photo) to the SimCell or controller, who answers in character as the outside party: the reporter, the regulator, the vendor, the caller. Each role (or team) has its own thread with the SimCell; the controller may also open a thread to a role, which is how an "outside caller" reaches a player's device. Every message is timestamped into the session log with the role that sent it, so the AAR records who acted, when.

## Requirements

### User stories

- As a player, I want to call the vendor, answer the reporter or ask the FBI for the PCAP from my phone, so that I act instead of describing what I would do.
- As a SimCell controller, I want every role's conversation in one place with the scenario's SimCell scripts beside it, so that I can answer three roles in character without losing the thread.
- As an exercise director, I want the log to show that the PIO answered the reporter at 1:42, eight minutes after the deadline inject, so that the AAR is specific.
- As a player, I want to attach a photo of our whiteboard ICS-201 or a hand-drawn diagram, so that the controller sees what the room produced.

### Functional requirements

- **FR-1** Threads. A thread is identified by its 0406 `channel` (a `Destination`): every player seat has a thread with the SimCell, `role:<roleId>`. When a team has more than one role the controller may open `team:<slug>` to address the team as one. The controller may open a thread to a specific client (`client:<id>`) when two people share a role and only one should get the call. Threads are created on first message.
- **FR-2** Players see their role thread (and team and client threads addressed to them) in the **Messages** tab; unread counts on the tab. Players never see other roles' threads.
- **FR-3** A player message has text (1–2000 characters) and up to three image attachments (0406's `attachments.max(3)`; JPEG, PNG or WebP), each re-encoded on the device to fit the connection kind's player blob cap from `relay.hello.caps` (2 MiB on LAN, 1 MiB on the relay, 4 MiB self-hosted). A message may quote an inject (`replyTo` set to the `releaseId`) when started from **Reply to SimCell** on an inject (0412), which shows the inject's title and row id above the composer and in the thread; `replyTo` may also name an earlier `messageId`.
- **FR-4** The controller answers **as a persona**. The persona picker lists the scenario's `simcellScripts[].rolePlayed`, the distinct `MselRow.from` values, "SimCell" and "Controller", plus free text; the last persona used in a thread is preselected. The persona is shown on the player's device as the sender ("Channel 5 newsroom"), with a small "played by SimCell" caption that the facilitator can turn off per session for realism.
- **FR-5** Canned replies. Beside the composer the controller sees the SimCell script whose `rolePlayed` matches the persona: `hardQuestions` and `concessions` as one-tap inserts into the composer (not auto-sent).
- **FR-6** The controller can start a thread: **Message a role / team / client**, which sends the first message and opens the thread on the device with a notification and a vibration (if allowed). This is how a phone-call inject reaches one player when the facilitator wants a dialogue rather than an audio file.
- **FR-7** Every message (both directions) is logged with wall clock, exercise clock, channel, sender (`{ kind: 'client', seat, clientRef }` or `{ kind: 'controller', persona }`), text, blob ids, and `replyTo`. At attribution `named`, the display name as well.
- **FR-8** Delivery states on the device: sending, sent (the controller echoes the message to the channel, which also lets a second device in the same role see it), failed (retry). Player messages are queued offline and sent on reconnect; the controller dedupes by `messageId`.
- **FR-9** No read markers in either direction in 0.6.0: the controller sees "waiting" ages (FR-10) and players see nothing about the controller reading, which keeps the SimCell's timing free (open questions).
- **FR-10** The Facilitate **Messages** tab: thread list sorted by last activity with unread badges and the oldest unanswered player message's age ("waiting 4 min"); conversation view; persona picker; canned replies; composer with Enter to send and Shift+Enter for a new line; **Mark handled** for a message that needs no reply (clears the waiting timer and logs `message.handled`).
- **FR-11** A message can be **pinned to the hot wash** by the controller (`pinToHotwash`), which appends an item to `FacilitatorState.hotwash` (0419's addition: `{ id, kind: 'other', text, rowId?, at }`, with the role and exercise time prefixed to the text) so the Hot wash tab and the AAR see it without reading the log. The log records the pin.
- **FR-12** A message can be **starred** by the controller (`message.star` log entry, toggle). 0419's AAR draft includes starred messages in full and summarizes the rest as counts per role; the Messages tab shows a star filter.
- **FR-13** The dashboard (0417) reads: open threads, messages waiting, median controller response time, messages per role.

### Non-functional requirements

- **NFR-1** Cost: none. (CONTRIBUTING, Project rules 1.)
- **NFR-2** Privacy: message text and attachments are end-to-end encrypted (0406); attachments are re-encoded on the device (canvas → JPEG or PNG, which drops EXIF including GPS) before encryption and upload; the controller stores them under the session folder; nothing is shared with other players. (Project rules 3.)
- **NFR-3** Accessibility: the thread is a `role="log"` region with `aria-live="polite"` for new messages; the composer has a visible label, a 44 px send button and keyboard submission; attachments have an alt field (optional, prefilled "Photo from <seat>"); persona and sender are text, not color alone.
- **NFR-4** Performance: a message reaches the device within 1 s on LAN; threads with 300 messages scroll smoothly; the controller view updates without refetching whole threads (`live:changed { what: 'messages', threadId }` carries the thread id so the panel fetches only that thread).
- **NFR-5** Offline: player messages queue in IndexedDB (0411 `queue.ts`); the composer says "Will send when back online".

### Out of scope

- Player-to-player messaging; group chat among players.
- Voice notes, video attachments, files other than images.
- Automated SimCell replies from a model. The controller answers; a draft-reply assistant is a candidate for 0.8.0 (open questions).

## Design

### Flow

```
player composer ─► attachments: device re-encodes, LiveClient.putBlob (sealed; relay.blob.put chunks), waits for
                   relay.blob.done, then message.send {messageId, channel, text, attachments: BlobRef[], replyTo?}
                   to: controller
controller ◄── messages.ts: validate the seat owns the channel; LiveClient.getBlob for each attachment, store
               plaintext under live/<sessionId>/attachments/<blobId>.<ext>; log `message`; state; echo to the
               channel; emit live:changed {what:'messages', channel}
Facilitate Messages tab ─► live:message-send {channel, text, persona}
                            └► messages.ts: log, LiveClient.send('message.send', channel, …)  (signed: from controller)
```

### Channels and threads

A thread is its 0406 `channel`: `role:<roleId>`, `team:<slug>` or `client:<id>`. The renderer and the log see `client:` threads by `clientRef`, never by the live `clientId`; the controller maps between them in memory. Controller messages go `to: channel`; player messages go `to: 'controller'` with the channel inside the payload, and the controller echoes them to the channel so every device in that seat has the thread.

### Main process

`src/main/live/messages.ts`

```ts
channelsFor(seat): Destination[]                   // what a seat may read and write
onPlayerMessage(state, env)                        // validates channel ownership, size, attachment count; fetches blobs; logs; echoes
sendControllerMessage(state, { channel, text, persona })
markHandled(state, messageId)
star(state, messageId, on: boolean)
pinToHotwash(root, scenarioId, state, messageId)   // appends to FacilitatorState.hotwash through writeFacilitatorState
storeAttachment(sessionDir, blobId, bytes, mime)   // magic-byte check, size cap, path under attachments/
```

`SessionState.threads: Map<Destination, { messages: Message[], lastActivity, unansweredSince? }>`.

### Protocol use (0406 schemas; what this spec puts in them)

| Type           | Direction                   | How this spec uses the payload                                                                                                                                       |
| -------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `message.send` | client → controller         | `messageId`, `channel` (the seat's own `role:`/`team:`/`client:`), `text`, `attachments: BlobRef[]` (≤ 3, `kind: 'image'`), `replyTo` (a `releaseId` or `messageId`) |
| `message.send` | controller → channel        | `messageId`, `channel`, `text`, `persona`, `replyTo?`; signed, so the page labels it "from the SimCell" (`signedByController`)                                       |
| `message.send` | controller → channel (echo) | the player's own message re-sent by the controller with `echoOf` (requirement below) so sibling devices in the seat see it and the sender gets its "sent" tick       |

Requirements for 0406 from this spec: `message.send` gains optional `echoOf: Base64Url22` (the original `messageId`; an echoed message keeps the player's text and no `persona`), optional `fromRole: RoleId` on echoes (so a sibling device can attribute it to the seat), and optional `showPlayedBy: boolean` on controller messages (FR-4). Player blob uploads are already covered by 0406's per-kind caps and the join token; no upload endpoint beyond `relay.blob.put` is needed.

### IPC (`src/shared/ipc/live.ts`, this spec's part)

```
live:threads         { projectPath, scenarioId }                                   → ThreadSummary[]
live:thread          { projectPath, scenarioId, channel }                          → Message[]
live:message-send    { projectPath, scenarioId, channel, text, persona, showPlayedBy?, replyTo? } → Message
live:message-handled { projectPath, scenarioId, messageId }                        → void
live:message-star    { projectPath, scenarioId, messageId, on: boolean }           → void
live:message-pin     { projectPath, scenarioId, messageId }                        → FacilitatorState
live:thread-open     { projectPath, scenarioId, channel: Destination }             → ThreadSummary   (controller-initiated)
live:attachment-url  { projectPath, scenarioId, blobId }                           → { url }         (ttx-media:// for the renderer)
```

### Renderer

`src/renderer/src/routes/facilitate/live/MessagesPanel.tsx` (thread list + conversation), `PersonaPicker.tsx`, `CannedReplies.tsx`, `Composer.tsx`; the **Messages** tab in `SidePanel` shows an unread badge. Attachments display through `mediaUrl(projectPath, rel)` with `live:attachment-url` resolving the project-relative path.

`src/player/features/messages/`: `ThreadList.tsx`, `Thread.tsx`, `Composer.tsx`, `attach.ts` (file picker, canvas re-encode to at most 1600 px, EXIF dropped by construction), `outbox.ts`.

### Wireframes

Player thread (phone):

```
┌──────────────────────────────┐
│ ‹ Messages      SimCell      │
│ Public Information Officer   │
├──────────────────────────────┤
│  ┌─ Channel 5 newsroom ────┐ │
│  │ We're going live at 6.  │ │
│  │ Is the airport hacked?  │ │
│  │ 1:34   played by SimCell│ │
│  └─────────────────────────┘ │
│        ┌─ You (PIO) ───────┐ │
│        │ We are investiga- │ │
│        │ ting a systems    │ │
│        │ issue. Statement  │ │
│        │ at 1800.    1:42 ✓│ │
│        └───────────────────┘ │
│  ┌─ Channel 5 newsroom ────┐ │
│  │ Can you confirm ransom- │ │
│  │ ware? Sources say yes.  │ │
│  └─────────────────────────┘ │
├──────────────────────────────┤
│ [📎] [Message the SimCell…] [Send]│
└──────────────────────────────┘
```

Facilitate Messages tab:

```
┌ Messages ──────────────────────────────────────────────────────────────┐
│ Threads                │ PIO ↔ SimCell                 persona: [Channel 5 newsroom ▾] │
│ ● PIO   waiting 4 min  │ 1:34  Channel 5: We're going live at 6…                    │
│   Ops   1:20           │ 1:42  PIO (Sam): We are investigating… statement at 1800.   │
│   IT    0:58  seen     │ 1:43  Channel 5: Can you confirm ransomware?                │
│   Tenants (team)       │                                                             │
│ [Message a role ▾]     │ Script: Channel 5 reporter                                  │
│                        │  ▸ "Sources say ransomware. Confirm or deny?"   [insert]    │
│                        │  ▸ concession: "We'll hold the hack angle 30 min" [insert]  │
│                        │ [Reply as Channel 5 newsroom…               ] [Send]        │
│                        │ [Mark handled] [Pin to hot wash]                             │
└────────────────────────┴─────────────────────────────────────────────────────────────┘
```

### Data model

`src/shared/schemas/live.ts`: `Message { messageId, channel, at, exerciseTime, from: { kind: 'client', seat, clientRef, displayName? } | { kind: 'controller', persona }, text, attachments: Attachment[], replyTo?, handledAt?, starred }`, `Attachment { blobId, mime, bytes, sha256, width, height, path }`, `ThreadSummary`. Log entries (0417): `message` (0406's `message.send` fields plus sender and exercise time), `message.handled`, `message.star`, `message.pinned`.

### Migrations

None.

## Security and privacy

- Channel ownership is enforced in main: a client may write only to channels of its own seat; a message to another role's channel is dropped and counted as an anomaly.
- Attachments: magic bytes must match an allowed image type (the `BlobRef.mime` is a claim; the bytes decide); size and count caps; stored with a controller-chosen extension under `attachments/`, never with a client-supplied filename; served to the renderer through `ttx-media://` and to sibling devices through the blob store; never rendered as HTML or SVG (SVG is not an allowed type).
- Text is rendered as text on both ends; links are not auto-linked on the player page (a scenario tweet may contain a deliberately fake URL and players should not tap it).
- Personas are presentation only; the log always says the controller sent it.
- Uploads are authorized by the join token and capped per connection kind (0406), so an unjoined browser cannot fill the store.
- What leaves the computer: encrypted messages and attachments between the facilitator's app and joined devices, after Start.

## Testing

- **Unit:** `channelsFor`, channel ownership, size caps, attachment magic-byte check, persona picker list (scripts + MSEL sources, de-duplicated), unanswered timer, star toggle, pin-to-hot-wash writes into `FacilitatorState.hotwash`.
- **Integration:** fake transport; PIO sends a message with an attachment; controller answers as "Channel 5"; a second device in the PIO seat sees both through the echo; Ops cannot read PIO's thread; offline PIO message arrives once after reconnect.
- **e2e `e2e/live/messages.spec.ts`:** three players (Ops, PIO, Evaluator). PIO taps **Reply to SimCell** on a delivered inject, attaches a 2 MB PNG (fixture), sends; Facilitate shows "waiting"; the controller inserts a hard question from the script, answers as the reporter; PIO's device shows it with "played by SimCell"; the controller opens a thread to Ops ("vendor calling") and Ops gets a notification; **Pin to hot wash** adds a note visible in the Hot wash tab; the log has both messages with roles and exercise times and no display name at attribution `role`. Screenshots light and dark.
- **a11y:** thread and composer screens (log region, labels, focus after send) in `e2e/a11y.spec.ts`.

## Tasks

1. **Threads and messages in main.** `src/main/live/messages.ts`, state, log entries, attachment store with magic-byte check, handlers for the channels above. Tests: `messages.test.ts`, integration with the fake transport.
2. **Player messages feature.** `src/player/features/messages/*`, attachment re-encoding, outbox, unread badges on the tab, **Reply to SimCell** hook from 0412's detail. Tests: component tests, `attach.test.ts` (dimension cap, EXIF-free output).
3. **Facilitate Messages tab.** `MessagesPanel.tsx`, `PersonaPicker.tsx`, `CannedReplies.tsx`, `Composer.tsx`, tab badge, **Message a role**, **Mark handled**, **Star**, **Pin to hot wash**. Tests: `MessagesPanel.test.tsx`.
4. **e2e and docs.** `e2e/live/messages.spec.ts`, a11y additions, `docs/guides/live-play.md` (answering in character, personas, scripts, attachments), `docs/05-DATA-MODEL.md` log entries.

## Open questions

1. **Draft replies from a model (the SimCell script plus the thread as context)?** Recommendation: not in 0.6.0; log the need as an issue for 0.8.0 behind the existing provider routing so it stays local-first.
2. **Should "played by SimCell" default on or off?** Recommendation: on. Players new to tabletops need the frame; experienced groups turn it off per session.
3. **Should messages be allowed before STARTEX (clock at 0:00, not running)?** Recommendation: yes, as "pre-exercise" messages flagged in the log; players often test the channel and facilitators want to see it works.
4. **A second SimCell device.** 0406's `join.kind: 'simcell'` lets a helper join from a laptop. Recommendation: accept the seat in 0.6.0 (roster shows it) but give it no features; in 0.7.0 let it read every thread and answer, with its messages relayed through the controller so they are signed. Two people answering as the same reporter needs claim-a-thread, which is more design than this milestone has room for.
5. **Read markers.** Recommendation: none in v1. If facilitators ask, request a `message.seen` ephemeral type from 0406 rather than overloading `message.send`.
