# Spec 0406: Live play: session protocol and end-to-end encryption

Issue: #406 · Milestone: 0.6.0 · Status: Implemented (client library; browser harness and the 40-client fixture open) · Depends on: — · Related: #418 (epic), #407, #408, #409, #410, #411–#417

## Summary

One versioned message protocol carries a live exercise between the facilitator's app and the
players' devices, whatever sits in the middle: the facilitator's own laptop on the room's
Wi-Fi (#407), the Action Stations relay on Cloudflare (#408) or an organization's own server
(#409). Every payload is encrypted on the device with one of two 256-bit session keys that
travel only in the invite link's `#fragment` / QR code: the **players key** every device holds,
and the **staff key** only controllers, evaluators and SimCell devices hold, which seals
expected actions, evaluator assignments and observations, controller notes and SimCell drafts.
Everything a device sends to the controller (its join, receipts, votes, answers, hot wash
items, observations) is sealed to the controller alone with a per-message ECDH key, so no other
device can read it even though every device holds the players key. Every controller
instruction is signed by the facilitator's app and refused by players' devices when it is not. A server, whoever runs it,
sees session ids, sizes, timing and addresses and nothing else. This spec fixes the wire
format, the zod schemas, the cryptography, the threat model and the client library the other
live-play specs build on.

## Requirements

### User stories

- As a facilitator, I want a feature such as voting or hot wash capture to behave the same in
  the room, through the relay and on an offline server, so that I learn one tool.
- As a security reviewer at an organization, I want to confirm from the protocol that no
  server operator (the project, Cloudflare, our own IT) can read exercise content, so that the
  exercise can include sensitive plans.
- As a player, I want to be sure an inject or notice shown as coming from the controller really
  came from the facilitator's app, so that a prankster in the session cannot inject content.
- As a facilitator, I want to cut off a leaked invite link or a misbehaving device without
  stopping the exercise.
- As a late joiner, I want to receive what was already released to my role when I connect.

### Functional requirements

- **FR-1** Envelope. Every message is one JSON text frame with exactly these fields: `v`
  (protocol version, integer), `session`, `seq`, `from`, `to`, `type`, `ts`, `payload`, and
  `sig` (present on controller-signed types). No other top-level fields; unknown fields are a
  validation error (forward compatibility is through `v`).
- **FR-2** Message types. `join`, `welcome`, `presence`, `catchup.request`, `catchup.batch`,
  `clock.state`, `inject.release`, `inject.receipt`, `message.send`, `vote.open`, `vote.cast`,
  `vote.close`, `hotwash.item`, `hotwash.update`, `survey.open`, `survey.response`,
  `survey.close`, `eval.observation`, `controller.notice`, `session.end`, plus the types this
  spec adds: `session.rekey` (key rotation, controller → one client) and the server-handled
  `relay.*` frames (`relay.hello`, `relay.error`, `relay.blob.put`, `relay.blob.get`,
  `relay.blob.chunk`, `relay.blob.done`). Each has a zod payload schema in
  `src/shared/live/schemas/`.
- **FR-3** Encryption. Client-originated payloads are AES-256-GCM ciphertext under one of two
  session keys, with the envelope header bound as additional authenticated data: the players
  key (`k: "s<epoch>"`), which every device holds, or the staff key (`k: "t<epoch>"`), which only
  controllers, evaluators and SimCell devices hold. Material meant for staff (`eval.assign`,
  `eval.observation`, an `inject.release` carrying `expectedAction`, controller notes, SimCell
  drafts, call scripts) is sealed with the staff key, so a player's device cannot decrypt it
  even if its page is edited. Every frame whose `to` is `controller` is sealed to the
  controller alone (`k: "c"`): a per-message key from ECDH between a fresh ephemeral key (`e`
  in the ciphertext) and the controller ECDH public key in the invite, so another device
  cannot read a player's answers whatever key it holds. The server never holds a key and
  cannot produce or alter a payload that a client accepts.
- **FR-4** Authority. The facilitator's app is the controller. The types listed in
  [Signed types](#signed-types) carry an ECDSA P-256 signature over header and ciphertext;
  clients drop them when the signature is missing or does not verify against the controller
  public key carried in the invite.
- **FR-5** Replay protection. `seq` is per sender and strictly increasing; a receiver drops a
  duplicate or lower `seq` from the same `from`. The session id is part of the authenticated
  header, so a frame recorded in one session is rejected in another.
- **FR-6** Catch-up. A server stores every non-ephemeral envelope in arrival order; a client
  asks for everything after an index and gets, in batches with each frame's arrival index, the
  stored frames addressed to it by `to` (`all`, `role:*`, `team:*`, its own `client:<id>`;
  `controller` frames only on a controller connection) and never its own; the controller can
  always
  re-emit its current state (clock, released injects, open votes) so a joiner after a key
  rotation is complete without old history.
- **FR-7** Key rotation and kicking. The controller can issue new session keys to every
  connected client except the ones it names (each client gets the root it is entitled to:
  staff root or players root), invalidate the old invite links at the server, and show new
  links. Kicked clients and holders of the old links cannot read anything sent after the
  rotation.
- **FR-8** Media. Rendered inject media (PNG, audio, video) and message attachments travel as
  encrypted blobs in chunks over the same connection, referenced from the payload by blob id
  and sha256. Caps per connection type are in [Blobs](#blobs).
- **FR-9** Isomorphic client library. `src/shared/live/` runs unchanged in the Electron main
  process (Node 22 WebCrypto), in Vitest under Electron's Node, and in the player page in
  current mobile browsers. It has no Node or DOM imports.
- **FR-10** Secure context fallback. Where `crypto.subtle` is unavailable (the player page over
  plain HTTP on a trusted LAN, #407), the same operations run on an audited pure-JavaScript
  implementation that passes the same test vectors.
- **FR-11** Retention. A server keeps stored envelopes and blobs only for catch-up and deletes
  them at `session.end` or 72 hours after the session was created, whichever is first.
- **FR-12** Everything a server needs to route or enforce is in the plaintext header or in a
  `relay.*` / `catchup.request` frame; it never needs to look inside a payload.
- **FR-13** Client identity. A client id is bound to the device that first connected with it:
  the device presents a random resume token on every connection, the server keeps only its
  SHA-256, and a connection with a known id and a different token is refused (`4005`). Servers
  tell participants nothing about other clients (`relay.hello.clients` and `presence` go to
  controller connections only).
- **FR-14** Staff proof. A device that joins as a staff kind (`evaluator`, `simcell`) proves it
  holds the current staff root with `join.staffProof`; the controller grants staff material
  (the staff root at a rotation, assignments) only to proven staff, never on the self-declared
  `kind`.

### Non-functional requirements

- **NFR-1** Cost: the protocol adds no service and no dependency with a fee. It is designed
  around the Cloudflare free plan's counters (incoming WebSocket messages count 20:1, outgoing
  are free, one stored envelope is one SQLite row write) so the relay in #408 stays at zero.
  (CONTRIBUTING, Project rules 1)
- **NFR-2** Privacy: the protocol itself opens no connection. Which server the app talks to,
  and when, is decided by #410 after the user turns live play on for a session. What any
  server can see is listed in [What each party sees](#what-each-party-sees). (Project rules 3)
- **NFR-3** Accessibility: not a UI spec. Payloads carry the exact text of every inject and
  attachment (`text`, `altText`) so player pages can meet WCAG 2.2 AA; media is never the only
  carrier of critical text (Project rules 5).
- **NFR-4** Offline and performance: works with no internet (#407, #409). Encrypting or
  verifying one envelope takes under 2 ms on a 2019 mid-range phone; a 60-client session's
  fan-out is bounded by the server, not by the protocol. Envelope JSON ≤ 64 KiB on the relay,
  ≤ 256 KiB on LAN and self-hosted servers.
- **NFR-5** Platforms: Node 22 (Electron 45), Chrome/Edge/Samsung Internet (last two years),
  Safari iOS 16+, Firefox (last two years). Only WebCrypto algorithms every one of these ships
  (AES-GCM, ECDSA P-256, ECDH P-256, HKDF-SHA-256, SHA-256).

### Out of scope

- Player-facing behaviour of each type (what an inbox shows, how a vote renders): #411–#417.
- Per-role confidentiality (a player cannot read another role's injects): v2, see
  [Open questions](#open-questions).
- Real-time audio or video calls and screen sharing. Turn-based voice calls (#429) are
  messages with audio blobs and are in scope (`call.*`).
- Federation between servers; a session lives on exactly one server.
- The servers themselves: #407, #408, #409. This spec defines what they must do with frames
  (the "server contract"), not how they are built.

## Design

### Module layout

```
src/shared/live/
  index.ts                 public surface: schemas, codec, crypto, LiveClient, invite
  protocol.ts              PROTOCOL_VERSION = 1, limits per connection kind, close codes
  schemas/
    envelope.ts            Envelope, Destination, ClientId, SessionId, Ciphertext
    payloads.ts            one zod schema per message type + PayloadByType map
    relay.ts               relay.* frames and catchup.request (plaintext)
    blob.ts                BlobRef, chunking constants
  crypto/
    provider.ts            CryptoProvider interface: aesGcm, ecdsa, ecdh, hkdf, sha256, random
    webcrypto.ts           implementation on globalThis.crypto.subtle
    noble.ts               fallback on @noble/ciphers, @noble/curves, @noble/hashes (lazy import)
    select.ts              pick webcrypto when subtle exists, else noble
    keys.ts                SessionKeys: epoch → players and staff AES keys, HKDF derivations, join token
  codec.ts                 seal(envelopeHeader, payload) / open(frame) with AAD + sig; ScopeState
  join.ts                  buildJoin (device: staff proof) / verifyJoin (controller)
  identity.ts              client id + resume token, kept per session in sessionStorage
  invite.ts                build / parse the invite URL fragment and QR text
  replay.ts                per-sender seq tracking (ReplayGuard)
  rekey.ts                 rotate() (controller) / applyRekey() (client)
  blob.ts                  sealBlob / openBlob, chunking, BlobAssembler, size caps
  transport-memory.ts      MemoryServer: the server contract in process, for tests
  fixtures/                one valid payload per type; test setup helpers
  client.ts                LiveClient: connection-agnostic session state machine
  transport.ts             Transport interface (send/close/onFrame) implemented by #407/#408/#409 clients
```

The server side shares the schemas and the limits but none of the crypto (it has no keys):
`relay/core/` (#408) imports `src/shared/live/schemas/*` and `protocol.ts` only.

### Envelope

```ts
// src/shared/live/schemas/envelope.ts
import { z } from 'zod'

export const PROTOCOL_VERSION = 1

/** 128 random bits, base64url, no padding. Session ids come from the server, client ids from the device. */
export const Base64Url22 = z.string().regex(/^[A-Za-z0-9_-]{22}$/)
export const SessionId = Base64Url22
export const ClientId = z.union([Base64Url22, z.literal('server')])

export const Destination = z
  .string()
  .regex(
    /^(all|controller|role:[A-Za-z0-9][A-Za-z0-9_-]{0,127}|team:[A-Za-z0-9][A-Za-z0-9_-]{0,127}|client:[A-Za-z0-9_-]{22})$/,
  )
/** Reserved role ids (#412): every evaluator seat filters on `role:evaluators`, every observer on `role:observers`. */
export const RESERVED_ROLE_IDS = ['evaluators', 'observers'] as const

export const MessageType = z.enum([
  'join',
  'welcome',
  'presence',
  'catchup.request',
  'catchup.batch',
  'clock.state',
  'inject.release',
  'inject.receipt',
  'inject.recall',
  'message.send',
  'vote.open',
  'vote.cast',
  'vote.close',
  'hotwash.item',
  'hotwash.update',
  'survey.open',
  'survey.response',
  'survey.close',
  'eval.assign',
  'eval.observation',
  'call.ring',
  'call.answer',
  'call.end',
  'controller.notice',
  'controller.roster',
  'partner.receipt',
  'simcell.draft',
  'simcell.action',
  'session.end',
  'session.rekey',
  'relay.hello',
  'relay.error',
  'relay.blob.put',
  'relay.blob.get',
  'relay.blob.chunk',
  'relay.blob.done',
])

/**
 * AES-256-GCM output. `k` names the key: "s<epoch>" the players key, "t<epoch>" the staff key
 * of that epoch, "c" a per-message key to the controller (then `e` is the sender's ephemeral
 * ECDH public key; `e` is present exactly when `k` is "c").
 */
export const Ciphertext = z
  .strictObject({
    k: z.union([z.string().regex(/^[st][1-9]\d{0,3}$/), z.literal('c')]),
    n: z.string().regex(/^[A-Za-z0-9_-]{16}$/), // 96-bit nonce
    c: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .max(350_000), // ciphertext || 128-bit tag
    e: Base64UrlBytes(65).optional(),
  })
  .refine((c) => (c.k === 'c') === (c.e !== undefined))

export const Envelope = z.strictObject({
  v: z.literal(PROTOCOL_VERSION),
  session: SessionId,
  seq: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  from: ClientId,
  to: Destination,
  type: MessageType,
  ts: z.number().int().positive(), // sender's wall clock, epoch ms; informational
  payload: z.union([Ciphertext, z.record(z.string(), z.unknown())]), // plaintext only for PLAINTEXT_TYPES
  sig: z
    .string()
    .regex(/^[A-Za-z0-9_-]{86}$/)
    .optional(), // ECDSA P-256 raw r||s (64 bytes)
})
export type Envelope = z.infer<typeof Envelope>

/** Payload is a plain object (the server must read or write it); everything else is Ciphertext. */
export const PLAINTEXT_TYPES = new Set<z.infer<typeof MessageType>>([
  'presence',
  'catchup.request',
  'catchup.batch',
  'relay.hello',
  'relay.error',
  'relay.blob.put',
  'relay.blob.get',
  'relay.blob.chunk',
  'relay.blob.done',
])
```

Rules:

- `seq` starts at 1 per sender and increases by one per frame sent. Server frames (`from:
"server"`) carry `seq: 0`; their order is the arrival index inside `catchup.batch`, and they
  are never stored.
- `ts` is never used for ordering or acceptance; it is shown in logs and dashboards.
- The envelope is parsed with `Envelope.safeParse` before anything else, on servers and
  clients. A frame over the connection kind's size cap is dropped before parsing.
- `catchup.request` and `relay.blob.get` are sent by a client to the server; `presence`,
  `catchup.batch`, `relay.hello`, `relay.error`, `relay.blob.chunk`, `relay.blob.done` are sent
  by the server; `relay.blob.put` is sent by any client that may upload (controller always;
  players for message attachments). Their payloads are plain objects: either the server must
  read them or the server wrote them, and none carries exercise content.
- `presence` is server-originated because the server already knows which connections exist;
  it tells clients `{ client, state: 'online' | 'offline', at }`. Roles are not in it: the
  controller maps client ids to roles inside encrypted `welcome` frames.

### Payload schemas

Common pieces (`src/shared/live/schemas/payloads.ts`):

```ts
const Text = (max: number) => z.string().max(max)
const RoleId = SafeId // from src/shared/schemas/common
const TargetList = z.array(Destination).min(1).max(64)
const ExerciseTime = ExerciseTimeSchema // "H:MM", src/shared/schemas/common
const EpochMs = z.number().int().positive()

export const BlobRef = z.object({
  blobId: Base64Url22,
  kind: z.enum(['image', 'video', 'audio', 'pdf', 'file']),
  mime: z
    .string()
    .regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/)
    .max(100),
  bytes: z.number().int().positive(), // plaintext size
  sha256: z.string().regex(/^[a-f0-9]{64}$/), // of the plaintext
  k: KeyName, // key (players or staff) and epoch the blob is sealed under
  n: z.string().regex(/^[A-Za-z0-9_-]{16}$/), // blob nonce (one AES-GCM message, chunked for transport)
  name: Text(120).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationSec: z.number().positive().optional(),
})

export const ClockState = z.object({
  elapsedMin: z.number().nonnegative(),
  runningSince: EpochMs.optional(), // absent when paused
  rate: z.number().min(0.25).max(60).default(1), // #428: minutes = elapsedMin + rate × wall minutes since runningSince
  reason: z.enum(['start', 'pause', 'set', 'nudge', 'rate', 'reset', 'jump']).optional(), // #428 clock log
  startWallClock: WallClock.optional(), // scenario narrative start, "09:00"
  phaseId: SafeId.optional(),
})

/** Payload schemas are named <Type>Payload in PascalCase: InjectReleasePayload, VoteClosePayload, … */
```

One schema per type. Sizes are hard caps; the UI specs may choose smaller ones.

| Type                | Direction                                                                | Payload                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `join`              | client → controller (sealed to the controller)                           | `{ name: Text(60), kind: 'player'\|'evaluator'\|'observer'\|'simcell', requestedRole?: RoleId, ecdhPub: Base64UrlBytes(65), staffProof?: Base64UrlBytes(32) /* staff kinds: HKDF(K_t, clientId, ecdhPub); the controller recomputes it */, resume?: boolean, ua?: Text(100) }`                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `welcome`           | controller → `client:<id>` (signed)                                      | `{ client: ClientId, kind, attribution: 'role'\|'named', role?: { id: RoleId, name: Text(80), abbreviation?: Text(12), teamId?: SafeId, teamName?: Text(80) }, sessionName: Text(120), scenarioTitle: Text(200), clock: ClockState, roster: Array<{ client: ClientId, name: Text(60), roleId?: RoleId, kind }>.max(200), features: { messages: boolean, votes: boolean, hotwash: boolean, surveys: boolean, eval: boolean }, hotwash?: { method: Text(60), methodDescription?: Text(500), questions: Array<{ id: SafeId, topic?: Text(80), text: Text(500) }>.max(10) }, rejected?: { reason: 'full'\|'role_taken'\|'not_allowed', message: Text(200) } }`                                                                             |
| `presence`          | server → all (plaintext)                                                 | `{ client: ClientId, state: 'online'\|'offline', at: EpochMs }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `catchup.request`   | client → server (plaintext)                                              | `{ after: z.number().int().min(0), limit?: z.number().int().min(1).max(200) }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `catchup.batch`     | server → `client:<id>` (plaintext container)                             | `{ from: int, to: int, entries: Array<{ i: int /* arrival index */, e: Envelope }>.max(200), done: boolean }` — the stored envelopes in the index range `from`..`to` that are addressed to this client, each still sealed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `clock.state`       | controller → all (signed)                                                | `ClockState` — sent on every clock change (start, pause, set, nudge, rate, reset, time jump; #428); devices compute the time locally from `elapsedMin`, `runningSince` and `rate`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `inject.release`    | controller → target (signed)                                             | `{ releaseId: Base64Url22, mselRowId: SafeId, injectId?: SafeId, title: Text(200), injectType: Text(60), deliveryMode: 'hand_to_role'\|'display_main_screen'\|'play_audio'\|'read_aloud', sender?: Text(120) /* persona, "Reporter, Channel 5" */, text: { headline?: Text(300), body: Text(20_000), altText: Text(2_000) }, captionsVtt?: Text(20_000) /* WebVTT for audio/video, #412 */, expectedAction?: Text(2_000) /* staff copy only: a frame carrying it is sealed with the staff key, #412/#416 */, exerciseTime: ExerciseTime, targets: TargetList /* the resolved recipients, one role: per role, #428 */, media: BlobRef[].max(6) /* name ∈ device, original, poster, audio by convention */, expectsResponse?: boolean }` |
| `inject.receipt`    | client → controller                                                      | `{ releaseId: Base64Url22, status: 'delivered'\|'read'\|'actioned', at: EpochMs }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `inject.recall`     | controller → target (signed)                                             | `{ releaseId?: Base64Url22, mselRowId: SafeId, reason: 'rewind'\|'withdrawn', text?: Text(300), targets: TargetList }` — devices hide the item and show the reason; used by #428's rewind and by #412's withdraw (not a `controller.notice`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `message.send`      | client ↔ controller; controller → target                                 | `{ messageId: Base64Url22, channel: Destination /* role:, team: or client: the thread belongs to */, text: Text(4_000), persona?: Text(120), replyTo?: Base64Url22 /* a messageId or a releaseId */, attachments: BlobRef[].max(3), echoOf?: Base64Url22 /* controller echo of a player's message to its seat, #413 */, fromRole?: RoleId /* on echoes */, showPlayedBy?: boolean /* "played by SimCell" label, #413 */ }`                                                                                                                                                                                                                                                                                                             |
| `vote.open`         | controller → target (signed)                                             | `{ voteId: Base64Url22, question: Text(500), options: Array<{ id: SafeId, label: Text(200) }>.min(2).max(10), anonymous: boolean, allowChange: boolean, closesAt?: EpochMs, targets: TargetList, rationalePrompt?: Text(200), mselRowId?: SafeId, tally?: Array<{ optionId: SafeId, count: int }> /* live results; a repeated voteId is an update, ≤ 4/s */ }`                                                                                                                                                                                                                                                                                                                                                                         |
| `vote.cast`         | client → controller                                                      | `{ voteId: Base64Url22, optionId: SafeId, rationale?: Text(280) }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `vote.close`        | controller → target (signed)                                             | `{ voteId: Base64Url22, status: 'closed'\|'interrupted', results: Array<{ optionId: SafeId, count: int }>, voted: int, eligible: int, byRole?: Array<{ roleId: RoleId \| 'other', optionId: SafeId, count: int }> /* aggregated after k-folding, never one entry per ballot, #414 */, reveal: boolean }`                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `hotwash.item`      | client → controller                                                      | `{ itemId: Base64Url22, kind: 'strength'\|'improvement'\|'other', text: Text(2_000) /* may be empty only when plusOneOf or retractOf is set */, anonymous: boolean, objectiveId?: SafeId, questionId?: SafeId, mselRowId?: SafeId, plusOneOf?: Base64Url22, retractOf?: Base64Url22 }`                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `hotwash.update`    | controller → all (signed)                                                | `{ itemId: Base64Url22, action: 'accept'\|'group'\|'ungroup'\|'promote'\|'unpromote'\|'hide'\|'restore'\|'edit'\|'tag', groupId?: Base64Url22, groupLabel?: Text(120), text?: Text(2_000), kind?: 'strength'\|'improvement'\|'other', roleId?: RoleId, plus?: int, objectiveId?: SafeId, capability?: SafeId, mselRowId?: SafeId }`                                                                                                                                                                                                                                                                                                                                                                                                    |
| `survey.open`       | controller → target (signed)                                             | `{ surveyId: Base64Url22, title: Text(200), intro?: Text(2_000), questions: Array<{ id: SafeId, kind: 'scale'\|'single'\|'multi'\|'text', text: Text(500), options?: Array<{ id: SafeId, label: Text(200) }>.max(12), min?: int, max?: int, required: boolean }>.max(30), anonymous: boolean, targets: TargetList, closesAt?: EpochMs }`                                                                                                                                                                                                                                                                                                                                                                                               |
| `survey.response`   | client → controller                                                      | `{ surveyId: Base64Url22, answers: Array<{ questionId: SafeId, value: number \| Text(4_000) \| SafeId[] }>.max(30) }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `survey.close`      | controller → target (signed)                                             | `{ surveyId: Base64Url22 }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `eval.assign`       | controller → `client:<id>` (signed, stored)                              | `{ assignmentId: Base64Url22, revision: int ≥ 1, label: Text(120), watch: { roleIds: RoleId[].max(64), capabilities: SafeId[].max(32) }, showExpected: boolean, tasks: Array<{ id: SafeId, capability: SafeId, task: Text(500), citation: { documentTitle: Text(200), headingPath: Text(300), page?: int }, expectedBy?: RoleId, timing?: Text(120), rowIds: SafeId[].max(32), criterionId?: Text(140) }>.max(120) }` — the controller truncates citations so the frame fits the relay's 64 KiB cap; a higher `revision` replaces the assignment (#416)                                                                                                                                                                                |
| `eval.observation`  | evaluator → controller                                                   | `{ observationId: Base64Url22, revision: int ≥ 1, kind: 'task'\|'note' (default 'task'), taskId?: SafeId /* required when kind is task */, criterionId?: Text(140) /* #421 "<rowId>:expected" criteria */, capability?: SafeId, rating?: 'met'\|'partial'\|'not_met'\|'not_observed' /* required when kind is task */, notes: Text(4_000), exerciseTime: ExerciseTime, observedAt: EpochMs, injectId?: SafeId, mselRowId?: SafeId }`                                                                                                                                                                                                                                                                                                   |
| `call.ring`         | controller → target (signed)                                             | `{ callId: Base64Url22, turn: int ≥ 1, persona: { name: Text(120), organization?: Text(120) }, transcript: Text(4_000) /* exact text of the spoken line */, audio?: BlobRef /* kind 'audio' */, canSpeak: boolean, expectedWaitSec?: int, injectId?: SafeId, mselRowId?: SafeId, targets: TargetList }` — one persona turn of a turn-based call (#429)                                                                                                                                                                                                                                                                                                                                                                                 |
| `call.answer`       | player → controller                                                      | `{ callId: Base64Url22, turn: int ≥ 1, text?: Text(4_000), audio?: BlobRef /* kind 'audio', ≤ 1 MiB and ≤ 60 s, uploaded with relay.blob.put */ }` — `text` or `audio` is required; there is no separate `call.audio` type                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `call.end`          | either → the other (signed when from the controller)                     | `{ callId: Base64Url22, turn: int ≥ 1, reason: 'completed'\|'hangup'\|'no_answer', by: 'controller'\|'player' }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `controller.notice` | controller → target (signed)                                             | `{ noticeId: Base64Url22, kind: 'text'\|'reseat'\|'hotwash.open'\|'hotwash.close' (default 'text'), ref?: Base64Url22 \| SafeId, level: 'info'\|'warning'\|'urgent', text: Text(1_000), targets: TargetList, dismissible: boolean }` — a `client:<id>` target carries a notice to one device (#416 "Ask to watch")                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `controller.roster` | host controller → all (signed by the host key, stored)                   | `{ revision: int ≥ 1, controllers: Array<{ id: SafeId /* organization id */, name: Text(120), publicKey: Base64UrlBytes(65), scope: { all?: boolean, rowPrefixes: SafeId[].max(32), roleIds: RoleId[].max(64) } }>.max(32) }` — co-controllers for joint exercises (#440); see [Signed types](#signed-types)                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `partner.receipt`   | host → `client:<partner connection>` (signed by the host key, host-only) | `{ releaseId: Base64Url22, mselRowId: SafeId, roleId?: RoleId, status: 'delivered'\|'read'\|'actioned', at: EpochMs }` — staff key. The host forwards a receipt for a release a roster key signed; role only, never a device or name (#517)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `simcell.draft`     | host → `client:<helper seat>` (signed by the host key, host-only)        | `{ draftId: Base64Url22 /* random per offer */, revision: int ≥ 1, status: 'queued'\|'withdrawn' (default 'queued'), persona: Text(120), threadLabel: Text(120), playerMessage?: Text(4_000), text: Text(4_000), flags: Array<{ code: SafeId, message: Text(200) }>.max(10) }` — staff key. A higher `revision` replaces; `withdrawn` removes (#518)                                                                                                                                                                                                                                                                                                                                                                                   |
| `simcell.action`    | helper device → controller (sealed to the controller)                    | `{ draftId: Base64Url22, revision: int ≥ 1, action: 'approve'\|'edit'\|'discard', text?: Text(4_000) /* required and non-blank for edit, forbidden otherwise */ }` (#518)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `session.end`       | controller → all (signed)                                                | `{ reason: 'endex'\|'cancelled', at: EpochMs, message?: Text(500) }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `session.rekey`     | controller → `client:<id>` (signed)                                      | `{ epoch: int ≥ 2, key: 'players'\|'staff' /* which root is wrapped: staff for evaluator and SimCell devices, players for the rest */, controllerEcdhPub: Base64UrlBytes(65), wrapped: { n: Nonce, c: Base64Url } /* AES-GCM(KEK, root) */ }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `relay.hello`       | server → `client:<id>` (plaintext)                                       | `{ index: int /* last stored index */, yourLastSeq: int, clients?: Array<{ client: ClientId, since: EpochMs }> /* controller connections only */, server: { kind: 'lan'\|'relay'\|'self-hosted', version: Text(40), protocol: int[] }, caps: Limits }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `relay.error`       | server → `client:<id>` (plaintext)                                       | `{ code: 'VERSION'\|'BAD_JOIN_TOKEN'\|'BAD_RESUME_TOKEN'\|'SESSION_ENDED'\|'SESSION_FULL'\|'RATE_LIMITED'\|'TOO_LARGE'\|'STORE_FULL'\|'BLOB_TOO_LARGE'\|'BLOB_QUOTA'\|'NOT_CONTROLLER'\|'DAILY_LIMIT'\|'INVALID', message: Text(300), retryAfterMs?: int }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `relay.blob.put`    | uploader → server (plaintext header, sealed bytes)                       | `{ blobId: Base64Url22, index: int ≥ 0, count: int ≥ 1, bytes: Base64Url /* ≤ CHUNK_BYTES of sealed data */ }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `relay.blob.get`    | client → server (plaintext)                                              | `{ blobId: Base64Url22 }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `relay.blob.chunk`  | server → `client:<id>` (plaintext header, sealed bytes)                  | `{ blobId, index, count, bytes }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `relay.blob.done`   | server → uploader (plaintext)                                            | `{ blobId, stored: boolean, totalBytes: int }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

`PayloadByType` maps each type to its schema; `openEnvelope()` returns a discriminated union
`{ type, payload }` so callers never cast.

### Signed types

`welcome`, `clock.state`, `inject.release`, `inject.recall`, `vote.open`, `vote.close`,
`hotwash.update`, `survey.open`, `survey.close`, `eval.assign`, `call.ring`,
`controller.notice`, `controller.roster`, `session.end`, `session.rekey`; and `call.end` when
`by` is `controller`.

`SIGNED_TYPES` is exported from `protocol.ts`. `open()` refuses one of these without a valid
`sig`, with code `UNSIGNED_CONTROLLER_MESSAGE`; it also refuses any _other_ type that carries a
`sig` which does not verify (a signed `message.send` from the controller is allowed and marks
the message "from controller" in the UI; a bad signature is always fatal for the frame).

The controller signing key is per session. Clients get the public key from the invite, not
from any server, so a server cannot substitute a controller.

**Several controllers (#440).** The key in the invite is the _host_ key. The host may publish a
`controller.roster` (signed by the host key; a higher `revision` replaces it) listing
co-controller public keys with scopes. A frame signed by a roster key is accepted when its type
and content are inside that scope: `inject.release` / `inject.recall` whose `mselRowId` starts
with one of `scope.rowPrefixes` and whose `targets` are all in `scope.roleIds`; `message.send`,
`call.*`, `vote.open` / `vote.close`, `survey.open` / `survey.close`, `controller.notice` whose
`channel` or `targets` are all in `scope.roleIds`; `hotwash.update` only with `scope.all`.
`welcome`, `clock.state`, `eval.assign`, `controller.roster`, `partner.receipt`, `simcell.draft`,
`session.end` and `session.rekey` are always host-only. Out-of-scope frames are dropped with `OUT_OF_SCOPE`. Before a roster
arrives, only the host key verifies. **Permissions (#517).** Each roster entry's `scope.permissions` lists the families it may send:
`inject` (`inject.release`, `inject.recall`), `message`, `vote`, `survey`, `call`, `notice`. Absent
means `['inject']`; a frame in a family the entry does not list is `OUT_OF_SCOPE` even with
`scope.all`. Regional partners are granted `inject`, `message`, `vote`. Rows and roles are
checked as above. The servers enforce what they can without keys: a co-controller's connection
(a token that is not the session's first) may send scoped controller types but is refused the
host-only types (`NOT_CONTROLLER`), is sent neither the connected-device list nor frames
addressed to `controller`, and cannot call `end`, `kick`, `join-token` or `controllers`
(`403`). A device connection is refused `simcell.action`'s inverse: a controller connection
sending `simcell.action` gets `INVALID`. `partner.receipt` and `simcell.draft` are sealed with
the staff key and addressed to one `client:<id>` only (anything else is dropped).
**Receipts.** Receipts are sealed to the host, so the host forwards one `partner.receipt`
per receipt on a release a roster key signed (the receiver remembers `releaseId → signer,
connection` from the signed release).
**SimCell helper (#518).** With helper devices on, the host sends each queued draft that has a
thread and is not a call turn to every online SimCell seat that proved the staff key, one
`simcell.draft` each. The helper answers with `simcell.action`; the host applies it only when the
sender is a proven SimCell seat, helper devices are on, the draft was offered to that device and
the revision matches, then resolves it exactly as the facilitator's own button would. Anything
else is logged as an anomaly and ignored. A draft the facilitator settled first is withdrawn
(revision + 1). The seat is `simcell` (reserved role id), shown only to devices that proved the
staff key. Co-controller apps connect as controllers with their own
controller token (lifecycle below); the server treats them all as "the controller".

### Cryptography

| Purpose              | Algorithm                                                                                                                                                | Notes                                                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Staff root `K_t`     | 256 random bits (`crypto.getRandomValues`)                                                                                                               | Generated by the facilitator's app at session start; one per epoch                                                                |
| Players root `K_p`   | `HKDF-SHA-256(K_t, salt = "", info = "as-live/v1/players/" + sessionId)`, 32 bytes                                                                       | A staff link derives it; a players link carries it and cannot go the other way                                                    |
| Payload encryption   | AES-256-GCM, 96-bit random nonce, 128-bit tag                                                                                                            | Key = `HKDF-SHA-256(root, salt = "", info = "as-live/v1/enc/<players\|staff>/" + sessionId)`                                      |
| AAD                  | `JSON.stringify([v, session, seq, from, to, type, ts])`                                                                                                  | Deterministic: fixed order, primitives only                                                                                       |
| Controller signature | ECDSA P-256, SHA-256, raw `r‖s` (64 bytes)                                                                                                               | Over UTF-8 of `aad + "." + payload.k + "." + payload.n + "." + payload.c`                                                         |
| Join token           | `HKDF-SHA-256(K_p, info = "as-live/v1/join/" + sessionId)` first 16 bytes                                                                                | Presented by clients on connect; the server stores only `SHA-256(joinToken)`                                                      |
| To-controller key    | ECDH P-256 (sender ephemeral `e`, controller key from the invite) → `HKDF-SHA-256(shared, info = "as-live/v1/to-controller/" + sessionId)` → AES-256-GCM | Every frame with `to: controller`; `Ciphertext.k = "c"`; only the controller holds the private key                                |
| Staff proof          | `HKDF-SHA-256(K_t, info = "as-live/v1/staff-proof/" + sessionId + "/" + clientId + "/" + ecdhPub)`, 32 bytes                                             | `join.staffProof`; bound to the client and its ECDH key; the current epoch only                                                   |
| Resume token         | 128 random bits per device per session                                                                                                                   | Presented on connect; the server stores only `SHA-256(resumeToken)` per client id                                                 |
| Rekey wrap           | ECDH P-256 → `HKDF-SHA-256(shared, info = "as-live/v1/kek/" + clientId + "/" + epoch)` → AES-256-GCM, AAD `"as-live/v1/rekey/" + clientId + "/" + epoch` | Controller ephemeral key per rotation; client static key from `join.ecdhPub`; wraps `K_t'` for staff devices, `K_p'` for the rest |
| Blob encryption      | AES-256-GCM as one message under `HKDF-SHA-256(root, info = "as-live/v1/blob/" + blobId)`, AAD = the same label                                          | Chunked for transport only; the receiver reassembles and decrypts once                                                            |
| Hashes               | SHA-256                                                                                                                                                  | Blob integrity, join-token hash, fingerprints                                                                                     |

Why these: every algorithm is in WebCrypto on every supported browser and in Node 22. Ed25519
(smaller keys, faster) is not yet reliable on older Android WebViews and Samsung Internet;
moving to it is a `v: 2` change. Random nonces are safe here: a session sends far fewer than
2^32 messages per key.

Nonce reuse is prevented by randomness, not by `seq`, so a device that loses its `seq` counter
cannot break confidentiality; it only has to learn its last `seq` from `relay.hello.yourLastSeq`
before sending.

`CryptoProvider` (`crypto/provider.ts`) is the only interface the codec uses:

```ts
export interface CryptoProvider {
  readonly name: 'webcrypto' | 'noble'
  random(bytes: number): Uint8Array
  sha256(data: Uint8Array): Promise<Uint8Array>
  hkdf(
    ikm: Uint8Array,
    info: string | Uint8Array,
    length: number,
    salt?: Uint8Array,
  ): Promise<Uint8Array>
  aesGcmSeal(
    key: Uint8Array,
    nonce: Uint8Array,
    aad: Uint8Array,
    plaintext: Uint8Array,
  ): Promise<Uint8Array>
  aesGcmOpen(
    key: Uint8Array,
    nonce: Uint8Array,
    aad: Uint8Array,
    sealed: Uint8Array,
  ): Promise<Uint8Array>
  ecdsaGenerate(): Promise<KeyPair>
  ecdsaSign(privateKey: PrivateKey, data: Uint8Array): Promise<Uint8Array>
  ecdsaVerify(publicKey: Uint8Array, data: Uint8Array, sig: Uint8Array): Promise<boolean>
  ecdsaExport(privateKey: PrivateKey): Promise<EcPrivateJwk> // for safeStorage; both providers import it
  ecdsaImport(jwk: EcPrivateJwk): Promise<KeyPair>
  ecdhGenerate(): Promise<KeyPair>
  ecdhDerive(privateKey: PrivateKey, peerPublic: Uint8Array): Promise<Uint8Array>
  ecdhExport(privateKey: PrivateKey): Promise<EcPrivateJwk>
  ecdhImport(jwk: EcPrivateJwk): Promise<KeyPair>
}
```

`webcrypto.ts` implements it on `globalThis.crypto.subtle`; `noble.ts` on `@noble/ciphers`
(`gcm`), `@noble/curves` (`p256`), `@noble/hashes` (`sha256`, `hkdf`) and is imported lazily
only when `select.ts` finds no `subtle` (insecure context). Both run the same vector file
(`crypto/__fixtures__/vectors.json`: NIST AES-GCM cases 13, 14 and 16, RFC 5869 HKDF case 1, SHA-256,
and recorded P-256 signature and ECDH cases) in tests, plus cross-opening (sealed by one,
opened by the other). WebCrypto may emit high-S ECDSA signatures, so the noble verifier runs
with `lowS: false`.

Private keys never leave the facilitator's app. The app keeps `K_t` (every epoch), the ECDSA
private key (exported as JWK through `ecdsaExport`) and the controller token in `userData/live/sessions/<sessionId>.json`,
encrypted with `safeStorage` exactly as `src/main/secrets/index.ts` encrypts API keys, so an
app crash does not end the exercise; the file is deleted at `session.end`. Nothing of this
goes in the project folder (project folders are shared and git-friendly).

### Invite link and QR code

```
<base>/s/<sessionId>#<fragment>
fragment  = base64url( layout:u8 ‖ epoch:u16be ‖ root:32 ‖ controllerSigPub:65 ‖ controllerEcdhPub:65 ) [ "." roleHint ]
layout    = 0x01 players link (root = K_p)  |  0x02 staff link (root = K_t)
roleHint  = SafeId | "evaluator" | "observer" | "simcell"
            (optional: a per-role QR pre-selects the seat; the controller still decides, #411)
```

Two links per session: the **players link** goes on the projector and the role cards; the
**staff link** (evaluators, SimCell helpers) is handed out separately and never shown on the
main screen. A staff device derives the players key from `K_t`; a players device holds only
`K_p`. The controller ECDH public key is what every device seals its frames to the controller
with; it travels in the link so no server can substitute it. 165 bytes → 220 characters plus
the optional role; the full URL stays under 300 characters (QR version 11–12 at medium error
correction, readable from a projector). The fragment is never
sent to a server: browsers do not include it in requests, and the player page reads
`location.hash` once, keeps the keys in memory, and keeps the URL as-is so a reload still works.
`invite.ts` exports `buildInvite({ base, sessionId, epoch, key: { kind, root }, controllerPub, controllerEcdhPub, roleHint? })`
and `parseInvite(url)`; parsing refuses an unknown leading byte (`0x01` and `0x02` are the
version-1 layouts) with a message telling the player to ask for a new link.

The join token (derived from `K_p`) goes on the WebSocket URL as `?j=<base64url 22>`, with the
client id `&c=<clientId>` and the device's resume token `&r=<base64url 22>` (or the
`Sec-WebSocket-Protocol` subprotocol `as-live.v1.<token>.<clientId>.<resumeToken>` where a URL
is logged). The server compares `SHA-256(token)` with what the controller registered. This stops
anyone who learns only the session id (a server log, a shoulder) from connecting and consuming
the session's caps; it does not give them the key, which is why it is derived from `K_p` with
its own HKDF label. The resume token binds the client id to the device: the first connection
with an id registers `SHA-256(resumeToken)`, and a later connection with that id and another
token is closed with `4005` (`relay.error BAD_RESUME_TOKEN`), so knowing an id, which the
controller and `to` destinations reveal, gives nobody the right to speak as it.

### Session lifecycle

```
Controller app                              Server                              Player page
──────────────                              ──────                              ───────────
POST /v1/sessions {v, joinTokenHash, name?}  ─────▶  create, caps, 72 h alarm
◀── {sessionId, controllerToken, caps, expiresAt}
WS /v1/sessions/:id/ws (Bearer controllerToken)
◀── relay.hello                                                    open <base>/s/:id#frag
                                                                   parse fragment, derive keys
                                                       ◀────────── WS …/ws?j=<joinToken>&c=<clientId>&r=<resumeToken>
                                                       relay.hello ──────────▶
◀── join (sealed to the controller, staffProof) ◀───────────────────  join
welcome (sealed+signed, to: client:X) ───────────────▶ store, route ──────────▶ welcome
                                                       ◀──────────  catchup.request {after: 0}
                                                       catchup.batch* ─────────▶ (replay guard, decrypt, apply)
clock.state / inject.release / … ───────────────────▶ store, fan-out ─────────▶
◀── inject.receipt / vote.cast / … ◀───────────────── route to controller ◀───
session.end (signed) ───────────────────────────────▶ fan-out, delete store, tombstone 1 h
```

- **Create.** Only the controller creates sessions. The server mints `sessionId` (128 random
  bits) and `controllerToken` (256 random bits, shown to the server on every controller
  connection, never to players). The controller sends `joinTokenHash` at creation and may update
  it (`POST /v1/sessions/:id/join-token`) after a rotation. For a joint exercise (#440) the host
  mints one more controller token per co-controller (`POST /v1/sessions/:id/controllers`, Bearer
  host token → `{ controllerToken }`), hands it over inside the signed exercise frame, and
  publishes the `controller.roster`; every connection presenting a controller token is a
  controller connection to the server.
- **Connect.** A client with a bad or missing join token is closed with `4001`. A client whose
  `v` does not match is closed with `4000`. A client id already bound to another resume token
  (or a participant claiming a controller's id, or no resume token at all) is closed with
  `4005`. The server's first frame is `relay.hello`; for participants it carries no roster.
- **Join.** The device sends `join`, sealed to the controller, with its ECDH public key and,
  for a staff kind, `staffProof`. The controller runs `verifyJoin`: a staff claim without a
  valid proof is refused (`welcome.rejected: not_allowed`) or seated as a player and is never
  counted as staff. The controller decides the role (pre-assigned by the role hint, chosen by
  the player, or assigned by the facilitator in the dashboard, #417) and answers `welcome` to
  `client:<id>`. A `welcome` with `rejected` tells the page why and the page stops.
- **Catch-up.** After `welcome`, the client sends `catchup.request { after: 0 }` (or its last
  index on reconnect). The server answers batches of stored envelopes with `done: true` on the
  last. Clients apply catch-up through the same `open()` path (replay guard included), so a
  stored frame that was tampered with on the server fails exactly like a live one.
- **Reconnect.** Same client id and resume token (`identity.ts`, kept in `sessionStorage`
  under the session id), `resume: true` in `join`, `catchup.request { after: lastIndex }`. The controller re-sends `welcome` so the
  page has its role without local state.
- **Presence.** The server emits `presence` to controller connections on connect and clean or
  timed-out disconnect (ping interval 25 s, timeout 60 s). Participants never receive it (they
  learn the roster from `welcome`), so a player page cannot enumerate client ids.
- **End.** `session.end` (signed) fans out; the server deletes stored envelopes and blobs,
  keeps a content-free tombstone for one hour so a late reconnect gets `relay.error
SESSION_ENDED` instead of "unknown session", and releases the session's resources.

### Routing (server contract)

The server reads only `v`, `session`, `seq`, `from`, `to`, `type` and the frame size.

| `to`                     | Server action                                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `all`                    | fan out to every connection except the sender                                                                                            |
| `role:<id>`, `team:<id>` | fan out to every connection except the sender; **clients filter** by their own role from `welcome`. The server does not learn the roster |
| `client:<id>`            | deliver to that connection only (plus store)                                                                                             |
| `controller`             | deliver to the controller connection(s) only                                                                                             |

On connect: join token hash → client id bound to the presented resume token (first use
registers it; a controller connection owns its id by the controller token) → client cap.
Server-side checks per frame, in order: size cap → `Envelope.safeParse` → `from` equals the
connection's client id (`server` is refused from any connection) → `seq` greater than the last
seen from that client id (kept across reconnects) (else drop silently; the client is confused or replaying) → type is allowed from this
connection (`welcome`, `clock.state`, `inject.release`, `inject.recall`, `vote.open`,
`vote.close`, `hotwash.update`, `survey.*` opens and closes, `eval.assign`, `call.ring`,
`controller.notice`, `controller.roster`, `session.end`, `session.rekey` are accepted only from
a controller connection; the server cannot verify
signatures but it can refuse the obvious impersonation and keep the stored log clean) → rate
limit → store (unless ephemeral) → route.

Ephemeral (never stored): `presence`, `catchup.*`, `relay.*`. Everything else is stored with an
arrival index, including receipts, so a controller that drops for a minute misses nothing.
Catch-up applies the routing table to the store: a connection gets the stored frames whose `to`
it would have received live (`all`, `role:*`, `team:*`, its own `client:<id>`; `controller`
only on a controller connection), never its own frames, each with its arrival index. Frames to
the controller are sealed to it in any case, so a server that ignores this rule leaks nothing
readable.

### Replay guard and ordering

`ReplayGuard` keeps `Map<clientId, lastSeq>` per session. A frame with `seq <= lastSeq[from]`
is dropped and counted. Catch-up delivers frames in arrival order, which is also non-decreasing
per sender, so the guard needs no special case. A controller that restarts from its encrypted
session file continues from its persisted `seq`; a player page that lost `sessionStorage`
starts a new client id (and the controller sees a new joiner), which is the safe failure.

While a catch-up is in flight (`catchup.request` sent, last batch with `done: true` not yet
applied) `LiveClient` holds live sealed frames back and applies them after the batches, so a
newer live frame from a sender never makes the guard drop that sender's stored frames as
replays. Receivers must tolerate out-of-order delivery _between_ senders (two players' messages
may arrive in either order). Anything that needs a total order (the session log, #417) uses the
server's arrival index from `catchup.batch` and the controller's own receive order live.

### Key rotation and kicking

Trigger: the facilitator presses "Kick" on a client or "New link" (a leaked invite) in the
dashboard (#417 UI; `live:kick` / `live:rotate-key` IPC in #410).

1. Controller generates `K_t'` (epoch + 1), derives `K_p'`, and makes a fresh ECDH key pair.
2. For every connected client except the kicked ones, it sends `session.rekey` to
   `client:<id>`, sealed under the _current_ players key, with the root that client is entitled
   to (`K_t'` for devices whose `join.staffProof` verified, `K_p'` for everyone else; the
   self-declared `join.kind` never decides) wrapped under the pairwise KEK from that client's
   `join.ecdhPub`. A
   kicked client sees the outer frame and cannot unwrap; neither can a staff device unwrap a
   message meant for another client. `rotate()` in `rekey.ts` does steps 1–2;
   `LiveClient.rotate(clients, kicked)` sends the frames.
3. Controller `POST /v1/sessions/:id/join-token` with the new hash and `POST
/v1/sessions/:id/kick { client }` for each kicked client; the server closes them with `4003`
   and refuses their old join token.
4. Controller re-emits its state under the new epoch: `clock.state`, `inject.release` for every
   released inject, `vote.open` for open votes, `survey.open` for open surveys. These messages
   are idempotent by id (`releaseId`, `voteId`, `surveyId`), so current clients apply them
   as no-ops.
5. The app shows the new invite link / QR (epoch + 1). Old links fail at the server (join
   token) _and_ at the client (epoch mismatch when decrypting).

`Ciphertext.k` names the epoch, so a client that holds several epochs opens each frame with
the right key; a frame under an epoch it lacks is dropped as `UNKNOWN_EPOCH`, and a staff
frame on a device without any staff key as `STAFF_ONLY` (expected, not an error).

Clients keep every epoch key they were given so catch-up history stays readable; a joiner
with an epoch-2 link cannot read epoch-1 history and gets the re-emitted state instead (step 4
runs again whenever a client joins after a rotation; `LiveClient.onJoin` on the controller).
Blobs released before the rotation stay sealed under their epoch; the re-emitted
`inject.release` reuses the same `BlobRef`, which old clients already have and new clients
cannot open — the controller re-seals and re-uploads blobs for releases it re-emits when any
connected client lacks the epoch (bounded by the per-session blob cap; the dashboard warns when
a rotation would exceed it).

### Blobs

A blob is one AES-GCM message (`BlobRef.n`, key of `BlobRef.k`, AAD = `"as-live/v1/blob/" +
blobId`), sealed once by the sender, split into `CHUNK_BYTES` pieces for transport and
reassembled by the receiver (`BlobAssembler`, bounded by the reference's `bytes + 16` and the
connection's `CHUNK_BYTES`: more chunks or bytes than that, or a conflicting duplicate chunk,
end the download), which verifies the tag, then `sha256`.

|                                          | This computer (LAN)                                  | Action Stations relay                                             | Your server (default; configurable) |
| ---------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------- |
| Envelope JSON                            | 256 KiB                                              | 64 KiB                                                            | 256 KiB                             |
| `CHUNK_BYTES` (sealed, before base64url) | 180 KiB                                              | 45 KiB                                                            | 180 KiB                             |
| Blob size                                | 256 MiB                                              | 8 MiB                                                             | 64 MiB                              |
| Blobs per session (total)                | 2 GiB                                                | 64 MiB                                                            | 1 GiB                               |
| Who may upload                           | controller; players ≤ 2 MiB per blob for attachments | controller; players ≤ 1 MiB                                       | controller; players ≤ 4 MiB         |
| Video                                    | yes                                                  | only if ≤ 8 MiB; otherwise the app says "show on the main screen" | yes within cap                      |

`CHUNK_BYTES` is sized so a chunk frame (4/3 of it in base64url plus the header) stays under
the connection's envelope cap: one size rule covers every frame, blob chunks included. On the
relay an 8 MiB blob is 182 chunks, 9.1 counted requests at 20:1.

Transport is the same everywhere: `relay.blob.put` chunks over the uploader's connection,
`relay.blob.done` when all `count` chunks arrived (the server stores chunks; it never
reassembles). A client needing a blob sends `relay.blob.get`; the server answers
`relay.blob.chunk` frames. On Cloudflare that costs nothing for delivery (outgoing messages are
free) and 1/20 request per uploaded chunk, which is why the relay prefers this to HTTP GETs that
would each count as a request (#408). LAN and self-hosted servers additionally serve `GET
/v1/sessions/:id/blobs/:blobId` (sealed bytes, `Content-Type: application/octet-stream`) for the
fetch-based fallback transport (#407).

The sender announces a blob only after `relay.blob.done { stored: true }`, so a `BlobRef` in an
`inject.release` is always fetchable. Clients fetch blobs lazily (only their own role's
releases, on display), cache decrypted blobs in memory as object URLs, and drop them at
`session.end`.

Limits live in `protocol.ts` as `LIMITS: Record<'lan' | 'relay' | 'self-hosted', Limits>` and
the server tells the client its effective values in `relay.hello.caps`.

### Client library

`LiveClient` (`client.ts`) is the state machine both the controller (in the Electron main
process, driven by `src/main/live/`) and the player page use:

```ts
export interface Transport {
  send(frame: string): void
  close(code?: number, reason?: string): void
  onFrame(cb: (frame: string) => void): void
  onClose(cb: (code: number, reason: string) => void): void
}

export class LiveClient {
  constructor(opts: {
    transport: Transport
    keys: SessionKeys // epochs → derived keys; controller also has signing key
    clientId: ClientId
    role: 'controller' | 'participant'
    crypto?: CryptoProvider // default: select()
    storage?: KeyValue // sessionStorage-like, for seq and lastIndex
  })
  send<T extends MessageType>(type: T, to: Destination, payload: PayloadByType[T]): Promise<void>
  on<T extends MessageType>(type: T, cb: (msg: Opened<T>) => void): () => void
  onDropped(cb: (reason: DropReason, raw: string) => void): () => void // counts for the dashboard
  requestCatchup(after?: number): void
  putBlob(ref: Omit<BlobRef, 'n' | 'k'>, plaintext: Uint8Array): Promise<BlobRef>
  getBlob(ref: BlobRef): Promise<Uint8Array>
  state: 'connecting' | 'hello' | 'joined' | 'ended' | 'closed'
}
```

`Opened<T>` carries `{ type, from, to, seq, ts, index?, payload, key?: 'players' | 'staff' | 'controller', signedBy?: 'host' | <organization id> }`
(`signedBy` is set only when a controller signature verified; `key` says which key opened a
sealed frame). Drop reasons: `PARSE`, `SIZE`, `REPLAY`, `BAD_TAG`,
`UNSIGNED_CONTROLLER_MESSAGE`, `BAD_SIG`, `OUT_OF_SCOPE`, `UNKNOWN_EPOCH`, `STAFF_ONLY` (a
staff frame on a device with no staff key), `CONTROLLER_ONLY` (a frame sealed to the controller
on any other device), `WRONG_KEY` (a type, destination or content under the wrong key, for
example a players-key ciphertext addressed to the controller), `NOT_FOR_ME` (role filter).
`NOT_FOR_ME`, `STAFF_ONLY` and `CONTROLLER_ONLY` are not reported as errors. `send()` picks the
key from the type's rule (`KEY_BY_TYPE` in `protocol.ts`), the destination and the content:
anything to `controller` is sealed to the controller, `role:evaluators` takes the staff key, an
`inject.release` with `expectedAction` the staff key; a mixed type (`message.send`,
`controller.notice`, `call.end`) to any other destination needs an explicit `key`, and an
explicit key the rule forbids is a `SealError`. The hello's caps are clamped to `LIMITS[kind]`
and `yourLastSeq` is accepted only when it is a plausible integer (≤ 2^48) above the local
counter. `estimateFrameBytes(payload)` tells a sender whether a payload will fit
the connection's cap before it seals.

The transports are not in this spec: the Electron app has `ws`-based ones
(`src/main/live/transport/relay-client.ts` and `self-hosted-client.ts`, #408/#409, chosen by
#410) and the player page has a browser WebSocket one plus the fetch fallback (#411, #407).

### What each party sees

| Party                                                  | Sees                                                                                                                                                                                                   | Does not see                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server operator (project, Cloudflare, organization IT) | session id, creation time, client ids, connection times and IP addresses, frame types, sizes and timing, `to` destinations (`role:<ULID>`), blob ids and sizes, controller token hash, join-token hash | any payload content, role names, player names, inject text or media, votes, notes, keys                                                                                                                                                                                                                                                                    |
| Cloudflare specifically                                | the above plus TLS termination for `relay.actionstations.ai` and ordinary edge logs                                                                                                                    | same                                                                                                                                                                                                                                                                                                                                                       |
| Network observers on the room's Wi-Fi (LAN)            | the TLS or plain-HTTP traffic between devices and the laptop; with plain HTTP, the player page code and the sealed frames                                                                              | plaintext payloads (sealed in both cases); the key (fragment never leaves the browser)                                                                                                                                                                                                                                                                     |
| Players (anyone holding the players link)              | everything sealed with the players key that reaches their device, including frames addressed to other roles in v1 (see Open questions)                                                                 | staff material (expected actions, evaluator assignments, controller notes, SimCell drafts: sealed with the staff key); anything any device sent to the controller (joins, receipts, votes, answers, hot wash items, observations: sealed to the controller); other clients' ids; the controller private keys; anything after a rotation that excluded them |
| Staff (evaluators, SimCell; holders of the staff link) | everything players see, plus the staff-sealed frames                                                                                                                                                   | anything sent to the controller by other devices; the controller private keys; anything after a rotation that excluded them                                                                                                                                                                                                                                |
| Facilitator's app                                      | everything                                                                                                                                                                                             | —                                                                                                                                                                                                                                                                                                                                                          |

### Message catalogue

Every wire type, with its direction, whether a controller signature is required, whether the
payload is sealed or plain, the schema name in `src/shared/live/schemas/payloads.ts` (or
`relay.ts`), whether servers store it for catch-up, and the spec that defines its behaviour.

| Type                | Direction                              | Signed            | Payload | Key                                                                       | Schema                    | Stored | Used by                |
| ------------------- | -------------------------------------- | ----------------- | ------- | ------------------------------------------------------------------------- | ------------------------- | ------ | ---------------------- |
| `join`              | client → controller                    | no                | sealed  | controller                                                                | `JoinPayload`             | yes    | 0411, 0418             |
| `welcome`           | controller → `client:<id>`             | yes               | sealed  | players                                                                   | `WelcomePayload`          | yes    | 0411, 0415, 0418       |
| `presence`          | server → all                           | no (server)       | plain   | —                                                                         | `PresencePayload`         | no     | 0411, 0417             |
| `catchup.request`   | client → server                        | no                | plain   | —                                                                         | `CatchupRequestPayload`   | no     | 0411                   |
| `catchup.batch`     | server → `client:<id>`                 | no (server)       | plain   | —                                                                         | `CatchupBatchPayload`     | no     | 0411, 0417             |
| `clock.state`       | controller → all                       | yes               | sealed  | players                                                                   | `ClockStatePayload`       | yes    | 0411, 0428             |
| `inject.release`    | controller → targets                   | yes (scoped)      | sealed  | players; staff with `expectedAction`                                      | `InjectReleasePayload`    | yes    | 0412, 0416, 0428       |
| `inject.receipt`    | client → controller                    | no                | sealed  | controller                                                                | `InjectReceiptPayload`    | yes    | 0412, 0417             |
| `inject.recall`     | controller → targets                   | yes (scoped)      | sealed  | players                                                                   | `InjectRecallPayload`     | yes    | 0412, 0428             |
| `message.send`      | client ↔ controller; controller → chan | optional (scoped) | sealed  | controller from a device; players or staff (explicit) from the controller | `MessageSendPayload`      | yes    | 0413, 0429             |
| `vote.open`         | controller → targets                   | yes (scoped)      | sealed  | players                                                                   | `VoteOpenPayload`         | yes    | 0414                   |
| `vote.cast`         | client → controller                    | no                | sealed  | controller                                                                | `VoteCastPayload`         | yes    | 0414                   |
| `vote.close`        | controller → targets                   | yes (scoped)      | sealed  | players                                                                   | `VoteClosePayload`        | yes    | 0414                   |
| `hotwash.item`      | client → controller                    | no                | sealed  | controller                                                                | `HotwashItemPayload`      | yes    | 0415                   |
| `hotwash.update`    | controller → all                       | yes (`scope.all`) | sealed  | players                                                                   | `HotwashUpdatePayload`    | yes    | 0415                   |
| `survey.open`       | controller → targets                   | yes (scoped)      | sealed  | players                                                                   | `SurveyOpenPayload`       | yes    | 0422                   |
| `survey.response`   | client → controller                    | no                | sealed  | controller                                                                | `SurveyResponsePayload`   | yes    | 0422                   |
| `survey.close`      | controller → targets                   | yes (scoped)      | sealed  | players                                                                   | `SurveyClosePayload`      | yes    | 0422                   |
| `eval.assign`       | controller → `client:<id>`             | yes (host)        | sealed  | staff                                                                     | `EvalAssignPayload`       | yes    | 0416, 0421             |
| `eval.observation`  | evaluator → controller                 | no                | sealed  | controller                                                                | `EvalObservationPayload`  | yes    | 0416, 0419             |
| `call.ring`         | controller → targets                   | yes (scoped)      | sealed  | players                                                                   | `CallRingPayload`         | yes    | 0429                   |
| `call.answer`       | player → controller                    | no                | sealed  | controller                                                                | `CallAnswerPayload`       | yes    | 0429                   |
| `call.end`          | either direction                       | when controller   | sealed  | controller from a device; players (explicit) from the controller          | `CallEndPayload`          | yes    | 0429                   |
| `controller.notice` | controller → targets                   | yes (scoped)      | sealed  | players or staff (explicit)                                               | `ControllerNoticePayload` | yes    | 0411, 0412, 0415, 0416 |
| `controller.roster` | host → all                             | yes (host)        | sealed  | players                                                                   | `ControllerRosterPayload` | yes    | 0440                   |
| `session.end`       | controller → all                       | yes (host)        | sealed  | players                                                                   | `SessionEndPayload`       | yes    | 0411, 0417, 0418       |
| `session.rekey`     | controller → `client:<id>`             | yes (host)        | sealed  | players                                                                   | `SessionRekeyPayload`     | yes    | 0410, 0411             |
| `relay.hello`       | server → `client:<id>`                 | no (server)       | plain   | —                                                                         | `RelayHello`              | no     | 0407–0411              |
| `relay.error`       | server → `client:<id>`                 | no (server)       | plain   | —                                                                         | `RelayError`              | no     | 0407–0411              |
| `relay.blob.put`    | uploader → server                      | no                | plain¹  | —¹                                                                        | `RelayBlobPut`            | chunks | 0412, 0413, 0429       |
| `relay.blob.get`    | client → server                        | no                | plain   | —                                                                         | `RelayBlobGet`            | no     | 0412, 0413, 0429       |
| `relay.blob.chunk`  | server → `client:<id>`                 | no (server)       | plain¹  | —¹                                                                        | `RelayBlobChunk`          | no     | 0412, 0413, 0429       |
| `relay.blob.done`   | server → uploader                      | no (server)       | plain   | —                                                                         | `RelayBlobDone`           | no     | 0412, 0413, 0429       |

¹ The frame's header is plain; `bytes` is a chunk of a blob sealed under the key named in its
`BlobRef.k` (players or staff). "Key" is which key seals the payload: every device holds the
players key; only controllers, evaluators and SimCell devices hold the staff key; `controller`
means a per-message ECDH key only the controller can open (every frame with `to: controller`).
"Scoped" means a co-controller's signature is accepted inside its roster scope (#440); "host"
means only the key in the invite verifies.

Not wire types: the session-log entry kinds of #417 that have no message of their own are
derived by the controller from frames it sent or received and from facilitator actions:
`session.start`, `session.resume`, `client.join` / `client.leave` / `client.reseat` /
`client.kick`, `key.rotate`, `inject.answered`, `message.handled` / `message.star` /
`message.pinned`, `vote.rationale` (from `vote.cast.rationale`), `vote.reopen` (a new
`vote.open` with the same `voteId`), `vote.recorded`, `hotwash.open` / `hotwash.close` (from
`controller.notice.kind`), `hotwash.plus` / `hotwash.retract` (from `hotwash.item`),
`hotwash.promoted` / `hotwash.unpromoted` (from `hotwash.update`), `eval.watch` / `eval.ask`
(from `eval.assign` and `controller.notice`), `anomaly`, `stage.progress`. The log names follow
the wire type where one exists; the wire never carries a log entry.

### Changes after cross-spec review

Made after reading 0411–0418, 0419, 0422, 0428, 0429 and 0440 so this spec stays the single
source of truth for the wire format:

- New signed types `inject.recall` (#428 rewind, #412 withdraw; replaces the proposed
  `controller.notice.kind: 'retract'`), `eval.assign` (#416), `call.ring` (#429),
  `controller.roster` (#440); new unsigned `call.answer`, `call.end` (#429). No `call.audio`:
  spoken replies are blobs referenced from `call.answer`.
- `controller.notice` gains `kind` (`text`, `reseat`, `hotwash.open`, `hotwash.close`) and
  `ref` (#411, #415); `welcome` gains `attribution` and `hotwash` (#411, #415, #418).
- `inject.receipt.status` gains `actioned`; `inject.release` gains `captionsVtt`,
  `expectedAction` and the `media[].name` convention (#412); recipients from #428 are the
  `targets` list, not a new field. Reserved role ids `evaluators` and `observers` and the
  `evaluator` / `observer` role hints (#411, #412).
- `message.send` gains `echoOf`, `fromRole`, `showPlayedBy` (#413); `message.pinned`,
  `message.star`, `message.handled` are session-log entries only.
- `vote.open` gains `rationalePrompt`, `mselRowId`, `tally`; `vote.cast` gains `rationale`;
  `vote.close` gains `status`, `voted`, `eligible`, and `byRole` becomes aggregated counts
  (#414).
- `hotwash.item` and `hotwash.update` gain the fields and actions #415 lists; `eval.observation`
  gains `kind`, `criterionId`, `capability` with `taskId` / `rating` optional for notes (#416).
- `ClockState` gains `rate` and `reason` (#428). Survey question kinds stay `scale`, `single`,
  `multi`, `text`; #422 maps its own kinds onto them.
- Several controllers: host key in the invite, `controller.roster` with scopes, `OUT_OF_SCOPE`
  drop reason, `POST /v1/sessions/:id/controllers` (#440; a one-line route addition in 0408).
- Protocol version skew (#418 open question 3): v1 join URLs stay `/s/<sessionId>`; when a
  `v: 2` relay ships it serves the v1 bundle at `/v1/s/<sessionId>` and v2 invites carry `/v2/`,
  so an older app keeps working after a relay deploy. Nothing changes for v1.
- The protocol ADR is `docs/adr/0027-live-play-protocol.md` (the next free number when it
  landed; the epic's and the relay's ADRs take the next free numbers when they land).
- **Two keys from the start (owner decision, replaces the single session key).** A staff root
  `K_t` and a players root `K_p = HKDF(K_t)`; `Ciphertext.k` and `BlobRef.k` are `s<epoch>`
  (players) or `t<epoch>` (staff); invite layout byte `0x01` players link, `0x02` staff link;
  `session.rekey` gains `key` and wraps the root the client is entitled to by its `join.kind`;
  `KEY_BY_TYPE` fixes the key per type and the catalogue gains a "Key" column; new drop
  reasons `STAFF_ONLY` and `WRONG_KEY`. Per-role keys stay v2 (open question 1).
- `CHUNK_BYTES` is 45 KiB on the relay and 180 KiB elsewhere, not 192 KiB everywhere: a
  192 KiB chunk cannot travel in a 64 KiB relay frame, and one size rule for every frame is
  simpler than a per-type exception.
- `CryptoProvider` gains `name`, JWK export/import for both key types (the controller stores
  its signing key through `ecdsaExport`), and `hkdf` takes a salt and byte `info` so the RFC
  5869 vectors run unchanged.
- An `eval.assign` of 120 tasks fits the relay cap at about 100-character tasks and
  60-character heading paths (measured, `schemas.test.ts`); #416 trims with
  `estimateFrameBytes` or splits an assignment, rather than relying on 300-character
  citations fitting.
- `transport-memory.ts` (the `MemoryServer`) lands here rather than with #411, so every
  later spec tests against the server contract from day one.
- **After the security review of the first pull request** (each with a regression test in
  `client.test.ts`, `codec.test.ts`, `rekey.test.ts`, `blob.test.ts`):
  - C1: a players-link device could join as `evaluator` and receive the staff root at the
    next rotation. Now `join.staffProof` (HKDF of the current staff root bound to the client id
    and ECDH key) is how a device proves staff; `verifyJoin` checks it and `rotate()` takes the
    proven flag, never `join.kind` (FR-14).
  - H1: catch-up handed every stored frame to every client, and every client holds the players
    key, so a player could read others' votes, answers and hot wash items. Now every frame to
    the controller is sealed to the controller (`k: "c"`, per-message ECDH with the controller
    key carried in the invite), and the server also filters catch-up by `to` and never
    returns a client's own frames (FR-3, FR-6).
  - H2: anyone with the join token could connect as an existing client id and inherit its
    `seq`. Now a resume token binds the id to the device (`4005`, FR-13), and participants no
    longer see other client ids (`relay.hello.clients` and `presence` reach controllers only).
  - M1: mixed-key types defaulted to the players key; now they need an explicit key unless the
    destination decides. M2: hello caps are clamped and `yourLastSeq` bounded. M3:
    `BlobAssembler` is bounded by the reference's size and the chunk size and refuses
    conflicting duplicates.
  - L1: a co-controller may close only a vote, survey or call it opened (`ScopeState`), and row
    prefixes match whole segments (`T-1` does not match `T-10`). L2: a server frame or nested
    batch inside `catchup.batch` is dropped, and live frames wait for an in-flight catch-up.
    L4: an invite epoch above `MAX_EPOCH` is an `InviteError`. L3 is in the threat model
    (leaked players link).
  - The fragment now also carries the controller ECDH public key (165 bytes, 220 characters).
- **After the independent re-review of that pull request (#452, all Low; regression tests in
  `codec.test.ts` and `client.test.ts`):** the per-message key for frames sealed to the
  controller is `HKDF(ECDH shared secret, salt = the epoch's players encryption key, info =
as-live/v1/to-controller/<session>)`, so the controller's public key alone cannot produce an
  acceptable `vote.cast` or `survey.response`; since `k: "c"` names no epoch the controller tries
  each epoch it holds, newest first. `LiveClient` clamps `relay.hello.caps` to the protocol limits
  of the connection kind the client chose (`kind` option, else its `limits`, else the relay's),
  never to the kind the server announces. The live frames held back during a catch-up are
  bounded (`HELD_BACK`: 500 frames, 8 MiB, 15 s) and applied when a bound is reached even if the
  server never sent `done: true`.

## Security and privacy

Trust boundaries: player device ↔ server ↔ facilitator's app. Keys cross only the first and
last, inside the invite, by QR or link.

| Threat (STRIDE)                              | Actor                                                                                      | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Information disclosure of exercise content   | relay operator, Cloudflare, organization IT, anyone with server access or backups          | AES-256-GCM on device; servers hold ciphertext only; `to` uses opaque role ULIDs; 72-hour deletion and deletion at end (#408 alarms, #409 sweeper, #407 memory)                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Tampering with a frame in transit or at rest | server operator, Wi-Fi attacker                                                            | GCM tag over payload with header as AAD; a changed header or byte fails to open and is counted as `BAD_TAG`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Spoofing the controller                      | a player, a server                                                                         | ECDSA signature required on every controller type; public key from the invite, never from a server; the server also refuses controller-only types from non-controller connections                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Spoofing another player                      | a player                                                                                   | `from` must equal the connection's client id (server-enforced); the controller shows names from `join` as claims, not identities (documented in #417)                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Replay                                       | anyone who recorded frames                                                                 | per-sender `seq` with `ReplayGuard`; session id in AAD; join token per epoch                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Leaked invite link                           | ex-participant, forwarded message                                                          | rotation to a new epoch with pairwise ECDH wrapping; server-side join-token change and kick; the old link fails at both layers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Leaked players link, before anyone notices   | whoever holds it (a photo of the projector, a forwarded message)                           | Accepted for v1 and said plainly in the guide and on the connection screen (#410): the holder can join as a player and read what the players key seals (injects to every role, votes and their results, notices, hot wash board updates) until the facilitator rotates. The holder cannot read staff material (staff key), anything other devices send to the controller (sealed to the controller), or claim a staff seat (no staff proof), cannot take over another device's client id (resume token), and shows up on the dashboard as a join the facilitator did not expect. The staff link is never shown on the main screen |
| Player claims a staff seat                   | a player who edits the join form                                                           | `join.staffProof` is an HKDF of the current staff root bound to the client id and ECDH key; without it `verifyJoin` reports `staff: false`, the seat is refused or treated as a player, and a rotation gives that device the players root only                                                                                                                                                                                                                                                                                                                                                                                    |
| Player reads other players' answers          | a player's page, via catch-up or a hostile server                                          | every frame to the controller is sealed to the controller's ECDH key with a per-message ephemeral key; other devices drop it as `CONTROLLER_ONLY`. The server also filters catch-up by `to`, but nothing depends on that                                                                                                                                                                                                                                                                                                                                                                                                          |
| Takeover of a client id                      | anyone with the join token who learns an id                                                | a resume token presented on every connection, hashed at the server, binds the id to the first device; a mismatch is `4005`. Participants are told no other ids                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Hostile server frames                        | the server operator                                                                        | caps in `relay.hello` are clamped to the protocol's; `yourLastSeq` is bounded; `BlobAssembler` buffers at most the announced size; server frames and nested batches inside a catch-up batch are dropped                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Late joiner reads history they should not    | new participant after a rotation                                                           | history sealed under earlier epochs is unreadable; controller re-emits current state only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Denial of service on a session               | anyone with the session id                                                                 | join token required to connect; per-connection and per-session rate limits and size caps in the server contract (#408 numbers); `4008` close with `retryAfterMs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Exhausting the shared free allowance         | one busy or hostile session                                                                | per-session caps on clients, stored envelopes, blobs and messages per minute; a daily session count cap in the relay (#408); Cloudflare fails closed and never bills                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Malicious player page code                   | a compromised or hostile _relay_ could serve altered JavaScript that reads `location.hash` | Stated plainly in the guide: encryption protects against a passive or storage-level breach, not against a server that rewrites the page. The player bundle is built in this repository with pinned dependencies; the relay deploy is reproducible from the public source and its bundle hash is published in each release; LAN and self-hosted serve the bundle from a machine the organization controls. A per-release bundle hash check from the app against `GET /v1/health` is a tripwire, not a guarantee, and is labelled so                                                                                                |
| Key in browser history / URL bar             | shared or lost device                                                                      | the invite is single-session; `session.end` makes it worthless; the guide tells players to close the tab; the page offers "Forget this session" which clears `sessionStorage` and replaces the URL (`history.replaceState`) with the fragment removed                                                                                                                                                                                                                                                                                                                                                                             |
| Downgrade to the pure-JS crypto              | an attacker who forces plain HTTP                                                          | only the LAN HTTP mode (an explicit facilitator choice, #407) uses it; the relay and self-hosted servers are TLS-only; the fallback passes the same vectors and is constant-time where the libraries are                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Timing and traffic analysis                  | server operator                                                                            | accepted: frame sizes and timing are visible; payloads are not padded in v1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Elevation of privilege via the IPC           | renderer code                                                                              | all live state and keys are in main; the renderer only calls `live:*` channels (#410) validated by zod like every other channel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

Privacy: this spec opens no connection by itself. #410 is where the user chooses a server and
is told what it will see; #407–#409 list what their servers log. Keys and controller tokens are
`safeStorage`-encrypted in `userData/live/sessions/` and deleted at session end; the plaintext
session log the facilitator keeps (#417) is exercise content the project folder already holds.

## Testing

Unit (Vitest, under Electron's Node; `src/shared/live/**/*.test.ts`):

- Schemas: every payload schema accepts its fixture and rejects an oversize field, an unknown
  top-level envelope field, a `to` outside the grammar, a `sig` of the wrong length.
- Codec round trip for every type: seal → `Envelope.safeParse` → open equals the input; 10 000
  seals use 10 000 distinct nonces; the noble provider runs the full codec and rotation paths
  and interoperates with WebCrypto in both directions.
- Attacks from the security review fail: a players-link device claiming evaluator gets no
  staff root and cannot read `eval.assign` (C1, including a forged or replayed proof and a
  proof from a previous epoch); catch-up never hands a player another player's frames to the
  controller and the stored frames are `CONTROLLER_ONLY` on any other device (H1); a join-token
  holder cannot take over a client id, nor a participant the controller's id, and the owner
  reconnects with its token (H2); a mixed-key type without a key is refused (M1); hello caps are
  clamped and an absurd `yourLastSeq` ignored (M2); the assembler refuses too many chunks, too
  many bytes, conflicting duplicates and a short blob (M3); a co-controller cannot close a host
  vote and `T-1` does not match `T-10` (L1); a nested batch is dropped and a live frame during
  catch-up is not lost nor the stored one dropped as a replay (L2); an epoch over `MAX_EPOCH` in
  a link is an `InviteError` (L4).
- Tamper matrix: flip one bit in each of `v`, `session`, `seq`, `from`, `to`, `type`, `ts`,
  `n`, `c`, `sig` → `BAD_TAG` or `BAD_SIG`; a signed type with `sig` removed →
  `UNSIGNED_CONTROLLER_MESSAGE`; a frame signed with another session's key → `BAD_SIG`.
- Replay: the same frame twice → second dropped as `REPLAY`; lower `seq` → dropped; two
  senders interleaved → both accepted.
- Rotation: three clients (two players, one evaluator), kick one, rotate; the two remaining
  open a post-rotation frame, the kicked one gets `UNKNOWN_EPOCH`; the evaluator keeps the
  staff key after the rotation; a kicked client cannot unwrap another client's rekey; a client
  joining with the new invite reads re-emitted state but not epoch-1 history; join tokens
  differ per epoch.
- Two keys: a player device cannot open `eval.assign`, `eval.observation` or a staff
  `inject.release` (`STAFF_ONLY`); staff and the controller can; sealing a staff type under the
  players key or a players type under the staff key is refused; an `inject.release` with
  `expectedAction` picks the staff key by itself; a forged staff type under the players key is
  `WRONG_KEY`; a players link cannot derive the staff key; a staff blob opens for staff only.
- Invite: build/parse round trip, role hint, refusal of an unknown layout byte, URL length under
  220 characters.
- Blobs: seal, chunk, shuffle chunk order, reassemble, verify sha256; a missing chunk fails; a
  blob over the connection's cap is refused by `putBlob` before upload.
- Crypto providers: WebCrypto and noble both pass `__fixtures__/vectors.json`; cross-open (sealed by one,
  opened by the other) for AES-GCM, signatures and ECDH.
- End to end through `MemoryServer`: hello → join → welcome, bad join token refused (4001),
  fan-out with role filtering, staff material unreadable on a player device, controller types
  from a player connection refused, replay dropped at the server and the client, late-joiner
  catch-up with arrival indexes, a stored frame tampered with at rest failing at that frame
  only, rotation with a kick and a new-link joiner, blobs in chunks both ways, oversize blobs
  refused at the client and the server, `session.end`, presence, `seq` across a reconnect.
- Session log replay (open): `fixtures/session-40.jsonl` (a recorded 40-client session) replayed into
  a `LiveClient` per participant produces the expected end state (released injects per role,
  vote totals, hot wash items, observation count); the same fixture with one frame altered
  fails at that frame.
- Roster scopes (#440): a co-controller's `inject.release` inside its row prefix and roles is
  accepted; outside either → `OUT_OF_SCOPE`; a co-controller `clock.state` → `OUT_OF_SCOPE`;
  a roster signed by a co-controller key → `BAD_SIG`; a lower `revision` is ignored.
- Payload refinements: an `eval.assign` with 120 tasks fits the relay cap at 100-character
  tasks and 60-character headings and `estimateFrameBytes` flags one that does not; `hotwash.item` with empty `text` is valid only with `plusOneOf` / `retractOf`;
  `eval.observation` of kind `note` without `taskId`; `call.answer` with neither `text` nor
  `audio` is refused; `vote.close.byRole` with a per-ballot shape is refused.
- Server contract tests live with the core (#408) and run against the same fixtures.

Browser: a Playwright spec (`e2e/live-protocol-browser.spec.ts`) loads a tiny harness page from
the player bundle, runs the codec round trip and the vectors in Chromium (secure and insecure
context, so both providers run in a real browser), and in WebKit where the CI machine has it.

Packaged smoke: unchanged for this spec (no UI). `pnpm ci:local` runs everything above except
the browser spec, which is part of `E2E=1`.

## Tasks

Tasks 1–5 and 7 shipped in the first pull request (`src/shared/live/`, 164 unit tests). Task 6
(browser harness) and the `session-40.jsonl` fixture of task 5 are follow-ups.

1. **Scaffold and schemas.** `src/shared/live/protocol.ts` (version, `LIMITS`, close codes,
   `SIGNED_TYPES`, `PLAINTEXT_TYPES`), `schemas/envelope.ts`, `schemas/payloads.ts`,
   `schemas/relay.ts`, `schemas/blob.ts`, `index.ts`; tests `schemas/*.test.ts`. Add
   `@noble/ciphers`, `@noble/curves`, `@noble/hashes` to `package.json` (used by task 2).
2. **Crypto providers.** `crypto/provider.ts`, `crypto/webcrypto.ts`, `crypto/noble.ts`,
   `crypto/select.ts`, `crypto/keys.ts` (HKDF labels, `SessionKeys`, join token),
   `crypto/__fixtures__/vectors.json`, tests including cross-open.
3. **Codec, replay guard, invite.** `codec.ts` (`seal`, `open`, AAD, signatures),
   `replay.ts`, `invite.ts`; tamper matrix, replay and invite tests.
4. **Blobs.** `blob.ts` chunking and reassembly, `putBlob`/`getBlob` logic against a fake
   transport; tests for order, loss and caps.
5. **LiveClient.** `transport.ts`, `client.ts` (hello → join → welcome → catch-up → steady
   state → rekey → end), controller-side rotation helper (`rotate(keys, roster, kicked)`), drop
   reporting; tests with an in-memory loopback transport and `fixtures/session-40.jsonl`.
6. **Browser harness and e2e.** `src/player/harness/` entry (served by #407's dev server or a
   static Playwright fixture), `e2e/live-protocol-browser.spec.ts`; add to `E2E=1`.
7. **ADR and docs.** `docs/adr/0027-live-play-protocol.md` (protocol, threat model, what each
   server sees, v1 limits, the message catalogue), a "Live play protocol" section in
   `docs/02-ARCHITECTURE.md` and the `userData/live/sessions/` entry in
   `docs/05-DATA-MODEL.md`; update this spec's status.

## Open questions

1. **Per-role confidentiality.** Decided for v1: two keys. Staff material is sealed with the
   staff key, which a player's device never holds, so the boundary that matters for evaluation
   (expected actions, observations, controller notes) is a key boundary, not a UI one. Between
   player roles everyone still shares the players key, so a player who edits their page can
   read frames addressed to other roles; the guide and the connection screen (#410) say so.
   Per-role keys stay a follow-up (controller-generated `K_role`, wrapped per client over the
   ECDH keys already in `join`; `Ciphertext.k = "r:<roleId>:<epoch>"` is reserved for it).
2. **ECDSA P-256 vs Ed25519.** Recommendation: P-256 now for universal WebCrypto support;
   Ed25519 at `v: 2` once Samsung Internet and Android WebView coverage is complete.
3. **Session key storage on the facilitator's computer.** Keep keys only in memory (a crash
   ends the exercise) or `safeStorage`-encrypted in `userData/live/sessions/` (recommended, as
   specified; mirrors how API keys are stored and lets the app resume a session after a crash).
   On Linux without a keyring `encryptionAvailable()` is false; recommendation: fall back to
   memory only and say so in the connection screen.
4. **`session.rekey` and `relay.*` are additions** to the shared type list. Recommendation:
   accept them; the other live-play specs do not need to handle them (the client library does),
   and server frames need plaintext payloads the fixed list did not provide for.
5. **Padding against traffic analysis.** Recommendation: none in v1; frame sizes already
   reveal little about a tabletop, and padding costs relay allowance.
6. **Co-controllers and frames sealed to the controller.** Frames to `controller` are sealed to
   the host's ECDH key, so a co-controller (#440) cannot read players' answers unless the host
   shares that private key inside the signed exercise frame or the roster carries a second
   ECDH key and devices seal to both. Recommendation: decide in #440; the roster schema has
   room for a `ecdhPublicKey` per controller.
7. **Co-controller scopes in v1 or v2.** `controller.roster` is needed only by #440 (0.9.0),
   but adding a signed type later would be a `v: 2` change for every client. Recommendation:
   ship the schema and the client-side scope check in v1 (cheap, tested with fixtures); the
   host-side UI waits for #440.
