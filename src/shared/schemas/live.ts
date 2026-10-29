/**
 * Live play (#418): the persisted and IPC shapes of a session, as opposed to the wire format in
 * `src/shared/live/`. `LiveSession` is `scenarios/<id>/live/<sessionId>/session.json`;
 * `SessionLogEntry` is one line of `log.jsonl` (spec 0417 FR-2). The LAN shapes are spec 0407's.
 */
import { z } from 'zod'
import { SessionId } from '../live/schemas/envelope'
import { ExerciseTime, IsoDateTime, SafeId } from './common'

export { SessionId }

const Text = (max: number) => z.string().max(max)

/** Dotted IPv4; the only address form the LAN server offers in v1 (spec 0407). */
export const Ipv4 = z
  .string()
  .regex(/^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/)

/** SHA-256 fingerprint as the OS shows it: 32 hex pairs, colon-separated, upper case. */
export const Fingerprint = z.string().regex(/^([A-F0-9]{2}:){31}[A-F0-9]{2}$/)

export const LanTls = z.enum(['self-signed', 'none'])
export type LanTls = z.infer<typeof LanTls>

/** Which server carries a session (spec 0410). */
export const LiveConnection = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('lan'),
    address: Ipv4.optional(),
    tls: LanTls.default('self-signed'),
    port: z.number().int().min(1024).max(65535).optional(),
  }),
  z.object({ kind: z.literal('relay') }),
  z.object({
    kind: z.literal('self-hosted'),
    url: z.url({ protocol: /^https?$/ }).max(2048),
    /** The pinned certificate of a self-signed server, confirmed by the facilitator. */
    fingerprintSha256: Fingerprint.optional(),
    /** `http://` on a loopback or private host, ticked as "no TLS" (spec 0410 FR-3). */
    insecureHttp: z.boolean().default(false),
  }),
])
export type LiveConnection = z.infer<typeof LiveConnection>
export type LiveConnectionInput = z.input<typeof LiveConnection>

export const Attribution = z.enum(['role', 'named'])
export type Attribution = z.infer<typeof Attribution>

/** `session.json`: what the folder is, never a key or a token. */
export const LiveSession = z.object({
  id: SessionId,
  scenarioId: SafeId,
  name: Text(120),
  startedAt: IsoDateTime,
  endedAt: IsoDateTime.optional(),
  connection: LiveConnection,
  /** The join URL without its key fragment. */
  joinUrlPublic: Text(500),
  attribution: Attribution,
  protocolVersion: z.number().int().positive(),
  /** Last server arrival index the controller applied; resume continues from it. */
  lastIndex: z.number().int().min(0).default(0),
  /** Counts written when the session ends (spec 0417 FR-1). */
  summary: z.lazy(() => LiveSessionCounts).optional(),
})
export type LiveSession = z.infer<typeof LiveSession>

export const LOG_ENTRY_KINDS = [
  'session.start',
  'session.resume',
  'session.end',
  'client.join',
  'client.leave',
  'client.reseat',
  'client.kick',
  'key.rotate',
  'clock.state',
  'inject.release',
  'inject.receipt',
  'inject.retract',
  'inject.answered',
  'message',
  'message.handled',
  'message.star',
  'message.pinned',
  'vote.open',
  'vote.cast',
  'vote.rationale',
  'vote.close',
  'vote.reopen',
  'vote.recorded',
  'decision.open',
  'decision.close',
  'decision.override',
  'proposal.offer',
  'proposal.accept',
  'proposal.reject',
  'hotwash.open',
  'hotwash.close',
  'hotwash.item',
  'hotwash.plus',
  'hotwash.retract',
  'hotwash.update',
  'hotwash.promoted',
  'hotwash.unpromoted',
  'survey.open',
  'survey.response',
  'survey.close',
  'eval.assign',
  'eval.observation',
  'eval.watch',
  'eval.ask',
  'controller.notice',
  'anomaly',
  'stage.progress',
  'transport',
] as const
export const LogEntryKind = z.enum(LOG_ENTRY_KINDS)
export type LogEntryKind = z.infer<typeof LogEntryKind>

export const LogActor = z.object({
  kind: z.enum(['controller', 'client', 'server', 'system']),
  /** First 8 hex characters of SHA-256(clientId, per-session salt); unlinkable after the session. */
  clientRef: z
    .string()
    .regex(/^[a-f0-9]{8}$/)
    .optional(),
  seat: z
    .object({
      kind: z.enum(['player', 'evaluator', 'observer', 'simcell', 'controller']),
      roleId: SafeId.optional(),
      teamId: SafeId.optional(),
    })
    .optional(),
  evaluator: Text(40).optional(),
  /** Named sessions only; the writer strips it at level `role`. */
  displayName: Text(60).optional(),
  persona: Text(80).optional(),
})
export type LogActor = z.infer<typeof LogActor>

/**
 * An id in a log reference: an app id, or a protocol id (22-character base64url, which may
 * start with "-" or "_"). Message, release, vote, item and survey ids come off the wire.
 */
const LogId = z.union([SafeId, z.string().regex(/^[A-Za-z0-9_-]{22}$/)])

export const LogRef = z.object({
  rowId: LogId.optional(),
  releaseId: LogId.optional(),
  injectId: LogId.optional(),
  channel: Text(140).optional(),
  messageId: LogId.optional(),
  voteId: LogId.optional(),
  itemId: LogId.optional(),
  groupId: LogId.optional(),
  surveyId: LogId.optional(),
  observationId: LogId.optional(),
  taskId: LogId.optional(),
  noticeId: LogId.optional(),
})

/** One line of `log.jsonl` (spec 0417 FR-2). */
export const SessionLogEntry = z.object({
  i: z.number().int().positive(),
  at: IsoDateTime,
  ex: ExerciseTime.optional(),
  kind: LogEntryKind,
  actor: LogActor,
  ref: LogRef.optional(),
  data: z.record(z.string(), z.unknown()),
  env: z
    .object({
      from: z.string().max(40),
      seq: z.number().int().min(0),
      index: z.number().int().min(0).optional(),
    })
    .optional(),
})
export type SessionLogEntry = z.infer<typeof SessionLogEntry>
export type SessionLogInput = Omit<SessionLogEntry, 'i' | 'at'>

/** Largest log line; attachments and media are never inline. */
export const LOG_LINE_MAX_BYTES = 64 * 1024

export const LanAddressKind = z.enum(['wifi', 'ethernet', 'virtual', 'other'])
export type LanAddressKind = z.infer<typeof LanAddressKind>

export const LanAddress = z.object({
  address: Ipv4,
  interface: Text(80),
  kind: LanAddressKind,
  /** RFC 1918 or 100.64/10. */
  private: z.boolean(),
  /** 169.254/16: the computer got no address from the network. */
  linkLocal: z.boolean(),
  /** First private, non-virtual address, preferring Wi-Fi. */
  recommended: z.boolean(),
})
export type LanAddress = z.infer<typeof LanAddress>

export const LanServerStatus = z.object({
  /** `https://192.168.4.20:8485/s/<sessionId>`; no key. */
  url: Text(500),
  address: Ipv4,
  port: z.number().int().min(1).max(65535),
  tls: LanTls,
  fingerprintSha256: Fingerprint.optional(),
  connected: z.number().int().min(0),
  startedAt: IsoDateTime,
})
export type LanServerStatus = z.infer<typeof LanServerStatus>

/** A QR code as a module matrix: `rows[y][x] === '1'` is a dark module. */
export const QrMatrix = z.object({
  size: z.number().int().min(21).max(177),
  rows: z.array(z.string().regex(/^[01]+$/)).max(177),
})
export type QrMatrix = z.infer<typeof QrMatrix>

/** A join link for one key: the URL with its key fragment and its QR code. Never logged. */
export const InviteView = z.object({
  kind: z.enum(['players', 'staff']),
  url: Text(1000),
  epoch: z.number().int().positive(),
  issuedAt: IsoDateTime,
  qr: QrMatrix,
})
export type InviteView = z.infer<typeof InviteView>

/** Where a relay or self-hosted session runs (spec 0410 FR-6). */
export const RemoteStatus = z.object({
  kind: z.enum(['relay', 'self-hosted']),
  host: Text(300),
  security: z.enum(['https', 'self-signed', 'http']),
})
export type RemoteStatus = z.infer<typeof RemoteStatus>

/** One line of a connection test: pass, warn or fail with the next step (spec 0410 FR-4). */
export const ConnectionCheck = z.object({
  id: Text(40),
  label: Text(200),
  status: z.enum(['pass', 'warn', 'fail']),
  detail: Text(500).optional(),
  nextStep: Text(500).optional(),
})
export type ConnectionCheck = z.infer<typeof ConnectionCheck>

export const ConnectionTestResult = z.object({
  ok: z.boolean(),
  checks: z.array(ConnectionCheck).max(20),
  server: z
    .object({
      kind: z.enum(['lan', 'relay', 'self-hosted']),
      version: Text(40).optional(),
      protocol: z.array(z.number().int()).max(10).optional(),
      fingerprintSha256: Fingerprint.optional(),
      /** The certificate is self-signed and not pinned yet: the facilitator may confirm it. */
      untrusted: z.boolean().optional(),
      playerBundleMatches: z.boolean().optional(),
      host: Text(300).optional(),
    })
    .optional(),
})
export type ConnectionTestResult = z.infer<typeof ConnectionTestResult>

export const LiveSessionStatus = z.object({
  session: LiveSession.optional(),
  lan: LanServerStatus.optional(),
  remote: RemoteStatus.optional(),
  invites: z.object({ players: InviteView, staff: InviteView }).optional(),
  connected: z.number().int().min(0),
  /** Milliseconds since start with no device ever connected; absent once one has (spec 0407 FR-8). */
  noConnectionsForMs: z.number().int().min(0).optional(),
})
export type LiveSessionStatus = z.infer<typeof LiveSessionStatus>

export const FirewallGuidance = z.object({
  platform: z.enum(['darwin', 'win32', 'linux']),
  /** What the OS is about to ask on the first start. */
  beforeStart: Text(600),
  /** How to recover when the prompt was denied. */
  ifDenied: Text(800),
  /** Shown after 60 s with no device connected. */
  noConnections: Text(800),
})
export type FirewallGuidance = z.infer<typeof FirewallGuidance>

export const LiveChangedEvent = z.object({
  reason: z.enum([
    'started',
    'stopped',
    'presence',
    'error',
    'receipts',
    'staging',
    'messages',
    'votes',
    'evaluation',
    'hotwash',
  ]),
  sessionId: SessionId.optional(),
  /** With `messages`: the thread that changed, so the panel fetches only that one. */
  threadId: Text(60).optional(),
  connected: z.number().int().min(0),
  message: Text(300).optional(),
})
export type LiveChangedEvent = z.infer<typeof LiveChangedEvent>

/** One device's receipts for a release (spec 0412 FR-10); times are epoch ms. */
export const ReceiptRow = z.object({
  clientRef: z.string().regex(/^[a-f0-9]{8}$/),
  seat: Text(120),
  displayName: Text(60).optional(),
  delivered: z.number().optional(),
  read: z.number().optional(),
  actioned: z.number().optional(),
})
export type ReceiptRow = z.infer<typeof ReceiptRow>

export const ReceiptCounts = z.object({
  to: z.number().int().min(0),
  delivered: z.number().int().min(0),
  read: z.number().int().min(0),
  actioned: z.number().int().min(0),
})
export type ReceiptCounts = z.infer<typeof ReceiptCounts>

/** What the Facilitate page shows about one released MSEL row. */
export const ReleaseSummary = z.object({
  releaseId: z.string(),
  rowId: SafeId,
  targets: z.array(z.string()),
  withdrawn: z.boolean(),
  perClient: z.array(ReceiptRow),
  counts: ReceiptCounts,
})
export type ReleaseSummary = z.infer<typeof ReleaseSummary>

export const StageStatus = z.object({
  staged: z.number().int().min(0),
  total: z.number().int().min(0),
  running: z.boolean(),
  failed: z.array(z.object({ injectId: SafeId, reason: Text(300) })),
})
export type StageStatus = z.infer<typeof StageStatus>

/** Who wrote a message (spec 0413 FR-7); the log and the renderer never see a live client id. */
export const MessageFrom = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('client'),
    /** Role id, or `evaluators` / `observers`. */
    seat: SafeId,
    seatLabel: Text(120),
    clientRef: z.string().regex(/^[a-f0-9]{8}$/),
    displayName: Text(60).optional(),
  }),
  z.object({ kind: z.literal('controller'), persona: Text(80) }),
])
export type MessageFrom = z.infer<typeof MessageFrom>

/** An image a player sent, kept under the session folder (path is project-relative). */
export const MessageAttachment = z.object({
  blobId: z.string(),
  mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  bytes: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  path: Text(500),
})
export type MessageAttachment = z.infer<typeof MessageAttachment>

/** `channel` is `role:<id>`, `team:<slug>` or `client:<clientRef>` (spec 0413 FR-1). */
export const LiveMessage = z.object({
  messageId: z.string(),
  channel: Text(60),
  /** Epoch ms on the controller's clock. */
  at: z.number(),
  exerciseTime: ExerciseTime,
  from: MessageFrom,
  text: Text(2000),
  attachments: z.array(MessageAttachment).max(3),
  replyTo: z.string().optional(),
  /** Controller messages: show the "played by SimCell" caption on the device. */
  showPlayedBy: z.boolean().optional(),
  handledAt: z.number().optional(),
  starred: z.boolean(),
  pinned: z.boolean(),
})
export type LiveMessage = z.infer<typeof LiveMessage>

export const ThreadSummary = z.object({
  channel: Text(60),
  label: Text(160),
  messages: z.number().int().min(0),
  lastActivity: z.number(),
  lastText: Text(200),
  /** Player messages since the controller last opened the thread. */
  unread: z.number().int().min(0),
  /** When the oldest player message still waiting for an answer arrived (epoch ms). */
  waitingSince: z.number().optional(),
  /** The last persona the controller used here, preselected in the picker. */
  lastPersona: Text(80).optional(),
})
export type ThreadSummary = z.infer<typeof ThreadSummary>

/** Where the controller may start or continue a thread. */
export const MessageTarget = z.object({ channel: Text(60), label: Text(160) })
export type MessageTarget = z.infer<typeof MessageTarget>
/** Fewest devices a role needs in a by-role vote to be shown by name (spec 0414 FR-7). */
export const VOTE_MIN_K = 2
export const VOTE_DEFAULT_K = 3

/** What the facilitator fills in to open a vote (spec 0414 FR-1); option ids are assigned on open. */
export const VoteDefinition = z.object({
  question: z.string().trim().min(1).max(300),
  options: z.array(z.string().trim().min(1).max(80)).min(2).max(8),
  /** True (default): ballots are unlinkable to devices and roles. False: the by-role mode. */
  anonymous: z.boolean().default(true),
  /** Who may vote: `all`, or roles and teams. */
  targets: z.array(z.string()).min(1).max(64).default(['all']),
  allowChange: z.boolean().default(true),
  /** Countdown in seconds; the vote closes itself. */
  durationSec: z.number().int().min(10).max(3600).optional(),
  /** Players may add a short reason, anonymous like the ballot. */
  rationalePrompt: z.string().trim().min(1).max(200).optional(),
  /** Devices see the running tally while the vote is open. */
  liveResults: z.boolean().default(false),
  /** Ids for the options (a branch decision's own ids); `o1`, `o2`… when absent. */
  optionIds: z.array(SafeId).max(8).optional(),
  /** The branch decision this vote answers (spec 0430). */
  decisionId: SafeId.optional(),
  /** A role needs this many devices in scope to be shown by name; never below 2. */
  k: z.number().int().min(VOTE_MIN_K).max(10).default(VOTE_DEFAULT_K),
})
export type VoteDefinition = z.infer<typeof VoteDefinition>

export const VoteStatus = z.enum(['open', 'closed', 'interrupted'])
export type VoteStatus = z.infer<typeof VoteStatus>

/** One option's line in a tally. */
export const VoteOptionView = z.object({
  id: SafeId,
  label: Text(80),
  count: z.number().int().min(0),
})
export type VoteOptionView = z.infer<typeof VoteOptionView>

/** A vote as the Facilitate page and the presentation window show it. Never carries a device. */
export const VoteView = z.object({
  voteId: z.string(),
  rowId: SafeId.optional(),
  decisionId: SafeId.optional(),
  question: Text(300),
  options: z.array(VoteOptionView),
  anonymous: z.boolean(),
  status: VoteStatus,
  openedAt: z.number(),
  closedAt: z.number().optional(),
  /** Exercise clock ("H:MM") when it closed. */
  closedClock: Text(8).optional(),
  closesAt: z.number().optional(),
  voted: z.number().int().min(0),
  eligible: z.number().int().min(0),
  /** Counts per role and option after k-folding; by-role votes only. */
  byRole: z
    .array(
      z.object({
        roleId: z.string(),
        label: Text(80),
        optionId: SafeId,
        count: z.number().int().min(0),
      }),
    )
    .optional(),
  /** Reasons by option, shown after close; never attributed. */
  rationales: z.array(z.object({ optionId: SafeId, text: Text(280) })).optional(),
  liveResults: z.boolean(),
  recorded: z.boolean(),
  canReopen: z.boolean(),
  /** The text recording this result as a decision would write. */
  decisionText: Text(400).optional(),
})
export type VoteView = z.infer<typeof VoteView>

/** Roles in scope with fewer devices than `k`: the warning before a by-role vote. */
export const VoteScope = z.object({
  eligible: z.number().int().min(0),
  smallRoles: z.array(z.object({ roleId: SafeId, label: Text(80), devices: z.number().int() })),
})
export type VoteScope = z.infer<typeof VoteScope>

// ---------------------------------------------------------------------------------------------
// Session log API and the Room dashboard (spec 0417)

export const LiveSessionCounts = z.object({
  clients: z.number().int().min(0),
  releases: z.number().int().min(0),
  receipts: z.number().int().min(0),
  messages: z.number().int().min(0),
  votes: z.number().int().min(0),
  hotwashItems: z.number().int().min(0),
  observations: z.number().int().min(0),
  surveys: z.number().int().min(0),
})
export type LiveSessionCounts = z.infer<typeof LiveSessionCounts>

/** One row of the Live tab's sessions list, read from `session.json` (FR-6). */
export const LiveSessionSummary = z.object({
  id: SessionId,
  name: Text(120),
  startedAt: IsoDateTime,
  endedAt: IsoDateTime.optional(),
  /** No `endedAt`, and no session of this id is running: the app stopped mid-session. */
  interrupted: z.boolean(),
  attribution: Attribution,
  counts: LiveSessionCounts,
})
export type LiveSessionSummary = z.infer<typeof LiveSessionSummary>

/**
 * What `readSlice` returns (FR-11): the fields other features read, so none of them parses the
 * file. `displayName` and `clientRef` are never included; `data` is the entry's payload.
 */
export const LogSliceRow = z.object({
  i: z.number().int().positive(),
  kind: z.string(),
  at: IsoDateTime,
  ex: ExerciseTime.optional(),
  rowId: z.string().optional(),
  releaseId: z.string().optional(),
  inReplyTo: z.string().optional(),
  fromRoleId: z.string().optional(),
  text: z.string().optional(),
  actor: z.object({
    kind: z.enum(['controller', 'client', 'server', 'system']),
    seat: LogActor.shape.seat,
    evaluator: z.string().optional(),
    persona: z.string().optional(),
  }),
  ref: LogRef.optional(),
  data: z.record(z.string(), z.unknown()),
})
export type LogSliceRow = z.infer<typeof LogSliceRow>

/** One entry as the Log view shows it. */
export const LogTailEntry = z.object({
  i: z.number().int().positive(),
  at: IsoDateTime,
  ex: ExerciseTime.optional(),
  kind: z.string(),
  actor: z.string(),
  summary: z.string(),
  messageId: z.string().optional(),
  starred: z.boolean().optional(),
})
export type LogTailEntry = z.infer<typeof LogTailEntry>

export const RosterRow = z.object({
  seat: z.string(),
  label: z.string(),
  kind: z.enum(['player', 'evaluator', 'observer']),
  connected: z.number().int().min(0),
  removed: z.number().int().min(0),
  /** Display names of connected devices; only in a `named` session. */
  names: z.array(z.string()),
  /** A player seat nobody is in. */
  empty: z.boolean(),
})
export type RosterRow = z.infer<typeof RosterRow>

export const InjectRow = z.object({
  releaseId: z.string(),
  rowId: z.string(),
  targets: z.array(z.string()),
  releasedAt: IsoDateTime,
  withdrawn: z.boolean(),
  expected: z.number().int().min(0),
  delivered: z.number().int().min(0),
  read: z.number().int().min(0),
  actioned: z.number().int().min(0),
  /** Median seconds from release to first read across devices. */
  firstReadSec: z.number().min(0).optional(),
  expectsResponse: z.boolean(),
  answered: z.enum(['actioned', 'message', 'marked']).optional(),
  /** Seconds from release to the first answer. */
  responseSec: z.number().min(0).optional(),
  ageMin: z.number().min(0),
})
export type InjectRow = z.infer<typeof InjectRow>

export const UnansweredRow = z.object({
  releaseId: z.string(),
  rowId: z.string(),
  ageMin: z.number().min(0),
  windowMin: z.number().min(0),
})
export type UnansweredRow = z.infer<typeof UnansweredRow>

export const DashboardView = z.object({
  sessionId: SessionId.optional(),
  /** The session is running now (not a past one being viewed). */
  live: z.boolean(),
  unansweredAfterMin: z.number().min(1),
  connected: z.number().int().min(0),
  roster: z.array(RosterRow),
  injects: z.array(InjectRow),
  unanswered: z.array(UnansweredRow),
  messages: z.object({
    threads: z.number().int().min(0),
    waiting: z.array(z.object({ channel: z.string(), waitingMin: z.number().min(0) })),
    medianReplySec: z.number().min(0).optional(),
    perRole: z.array(z.object({ role: z.string(), count: z.number().int().min(0) })),
  }),
  votes: z.object({
    open: z
      .object({
        voteId: z.string(),
        question: z.string(),
        tally: z.array(z.object({ label: z.string(), count: z.number().int().min(0) })),
      })
      .optional(),
    lastClosed: z
      .object({
        voteId: z.string(),
        question: z.string(),
        tally: z.array(z.object({ label: z.string(), count: z.number().int().min(0) })),
      })
      .optional(),
  }),
  /** Filled by the hot wash feature's entries (#415); zeros until the board is used. */
  hotwash: z.object({
    open: z.boolean(),
    items: z.number().int().min(0),
    plusOnes: z.number().int().min(0),
    promoted: z.number().int().min(0),
  }),
  evaluation: z.object({
    observations: z.number().int().min(0),
    evaluatorsConnected: z.number().int().min(0),
  }),
  health: z.object({
    dropped: z.array(z.object({ reason: z.string(), count: z.number().int().min(0) })),
    rejected: z.number().int().min(0),
    protocolVersion: z.number().int().positive().optional(),
    lastIndex: z.number().int().min(0),
    logBytes: z.number().int().min(0),
  }),
})
export type DashboardView = z.infer<typeof DashboardView>

// ---- evaluator observations (#416) ----

/** The roles and capabilities an evaluator watches; empty lists mean "everything". */
export const EvaluatorWatch = z.object({
  roleIds: z.array(SafeId).max(64),
  capabilities: z.array(SafeId).max(32),
})
export type EvaluatorWatch = z.infer<typeof EvaluatorWatch>

const CoverageRating = z.enum(['met', 'partial', 'not_met', 'not_observed'])
const ClientRef = z.string().regex(/^[a-f0-9]{8}$/)

export const CoverageEvaluator = z.object({
  clientRef: ClientRef,
  /** "Evaluator 1": assigned in join order, never a person's name. */
  label: Text(60),
  displayName: Text(60).optional(),
  online: z.boolean(),
  watch: EvaluatorWatch,
  observations: z.number().int().min(0),
})
export type CoverageEvaluator = z.infer<typeof CoverageEvaluator>

export const CoverageTask = z.object({ id: SafeId, capability: SafeId, text: Text(500) })

export const CoverageCell = z.object({
  taskId: SafeId,
  clientRef: ClientRef,
  rating: CoverageRating,
})

export const CoverageLatest = z.object({
  observationId: SafeId,
  clientRef: ClientRef,
  label: Text(60),
  taskId: SafeId.optional(),
  capability: SafeId.optional(),
  rating: CoverageRating.optional(),
  note: Text(4000),
  exerciseTime: ExerciseTime,
  at: z.number(),
})

/** The controller's view of live observations: who has rated what (task by evaluator). */
export const CoverageView = z.object({
  showExpected: z.boolean(),
  evaluators: z.array(CoverageEvaluator).max(60),
  tasks: z.array(CoverageTask).max(200),
  cells: z.array(CoverageCell).max(12_000),
  latest: z.array(CoverageLatest).max(50),
  /** Tasks with a rating other than "not observed" from any evaluator. */
  covered: z.number().int().min(0),
  observations: z.number().int().min(0),
})
export type CoverageView = z.infer<typeof CoverageView>
/** The hot wash action the facilitator takes on one or more board items (spec 0415 FR-6). */
export const HotWashAction = z.enum([
  'accept',
  'hide',
  'restore',
  'edit',
  'group',
  'ungroup',
  'label',
  'tag',
])
export type HotWashAction = z.infer<typeof HotWashAction>

/**
 * One contribution on the board, as the facilitator sees it. The device that sent it is never
 * here: an anonymous item has no role, and `clientRef` stays in the main process.
 */
export const HotWashItem = z.object({
  itemId: z.string().max(40),
  kind: z.enum(['strength', 'improvement', 'other']),
  text: Text(2000),
  /** The text as first posted, when the facilitator edited it. */
  originalText: Text(2000).optional(),
  anonymous: z.boolean(),
  /** The sender's role, unless they posted without it. */
  roleLabel: Text(160).optional(),
  /** Named sessions only, and only when the sender did not post anonymously. */
  displayName: Text(60).optional(),
  questionId: SafeId.optional(),
  mselRowId: SafeId.optional(),
  objectiveId: SafeId.optional(),
  capability: SafeId.optional(),
  at: z.number(),
  exerciseTime: Text(8),
  accepted: z.boolean(),
  hidden: z.boolean(),
  groupId: z.string().max(40).optional(),
  plus: z.number().int().min(0),
  promoted: z.boolean(),
})
export type HotWashItem = z.infer<typeof HotWashItem>

export const HotWashGroup = z.object({
  groupId: z.string().max(40),
  label: Text(120).optional(),
  itemIds: z.array(z.string().max(40)),
  promoted: z.boolean(),
})
export type HotWashGroup = z.infer<typeof HotWashGroup>

/** The whole board for the Facilitate tab and the projector view. */
export const BoardView = z.object({
  open: z.boolean(),
  /** True: new items wait in the inbox until the facilitator accepts them. */
  review: z.boolean(),
  items: z.array(HotWashItem),
  groups: z.array(HotWashGroup),
  /** Prompts the devices show, from the scenario. */
  questions: z.array(z.object({ id: SafeId, topic: Text(80).optional(), text: Text(500) })),
})
export type BoardView = z.infer<typeof BoardView>

/** An entry for `FacilitatorState.hotwash` made by promoting an item or group (spec 0415 FR-7). */
export const PromotedEntry = z.object({
  id: SafeId,
  kind: z.enum(['strength', 'improvement', 'other']),
  text: Text(4000),
  objectiveRef: Text(128).optional(),
  rowId: Text(64).optional(),
  at: IsoDateTime,
})
export type PromotedEntry = z.infer<typeof PromotedEntry>

/** Hot wash entries written from devices carry this id prefix, so the Hot wash tab can group them. */
export const DEVICE_HOTWASH_PREFIX = 'dev-'
