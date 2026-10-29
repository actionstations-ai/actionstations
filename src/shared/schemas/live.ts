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

/** Which server carries a session (spec 0410). Only `lan` is implemented so far (#407). */
export const LiveConnection = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('lan'),
    address: Ipv4.optional(),
    tls: LanTls.default('self-signed'),
    port: z.number().int().min(1024).max(65535).optional(),
  }),
  z.object({ kind: z.literal('relay') }),
  z.object({ kind: z.literal('self-hosted'), url: z.url({ protocol: /^https?$/ }) }),
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

export const LogRef = z.object({
  rowId: SafeId.optional(),
  releaseId: SafeId.optional(),
  injectId: SafeId.optional(),
  channel: Text(40).optional(),
  messageId: SafeId.optional(),
  voteId: SafeId.optional(),
  itemId: SafeId.optional(),
  groupId: SafeId.optional(),
  surveyId: SafeId.optional(),
  observationId: SafeId.optional(),
  taskId: SafeId.optional(),
  noticeId: SafeId.optional(),
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

export const LiveSessionStatus = z.object({
  session: LiveSession.optional(),
  lan: LanServerStatus.optional(),
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
  reason: z.enum(['started', 'stopped', 'presence', 'error', 'receipts', 'staging']),
  sessionId: SessionId.optional(),
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
