import { z } from 'zod'
import { channel } from './define'
import { Destination } from '../live/schemas/envelope'
import { HttpUrl, SafeId } from '../schemas/common'
import { LiveServerEntry } from '../schemas/settings'
import {
  Attribution,
  ConnectionTestResult,
  Fingerprint,
  CoverageView,
  EvaluatorWatch,
  BoardView,
  FirewallGuidance,
  HotWashAction,
  PromotedEntry,
  Ipv4,
  LanAddress,
  LanServerStatus,
  LiveChangedEvent,
  LiveConnection,
  LiveSession,
  LiveMessage,
  LiveSessionStatus,
  MessageTarget,
  ReleaseSummary,
  StageStatus,
  ThreadSummary,
  VoteDefinition,
  VoteScope,
  VoteView,
} from '../schemas/live'

const S = z.object({ projectPath: z.string(), scenarioId: SafeId })
const ClientRef = z.string().regex(/^[a-f0-9]{8}$/)

/**
 * Live play (#418). One domain file for every `live:*` channel; the sub-specs add theirs here in
 * build order. #407 lands the session lifecycle and the LAN server's fields.
 */
export const liveChannels = {
  /** Start a session for a scenario. Opens the listener (LAN) and returns the invites. */
  'live:session-start': channel(
    S.extend({
      connection: LiveConnection,
      attribution: Attribution.default('role'),
      name: z.string().max(120).optional(),
      /** Confirmed in the UI: bind to a public (non-private) address. */
      allowPublicAddress: z.boolean().default(false),
      /** A session for surveys only: devices join as participants and see surveys (spec 0422). */
      surveyOnly: z.boolean().default(false),
    }),
    LiveSessionStatus,
  ),
  /** The running session, if it is this scenario's; `connected` is 0 otherwise. */
  'live:session-status': channel(S, LiveSessionStatus),
  /** `session.end` to every device, close the listener, write `endedAt`. */
  'live:session-end': channel(S, LiveSession),
  /** The computer's IPv4 addresses, recommended first (spec 0407 FR-2). */
  'live:lan-addresses': channel(z.void(), z.array(LanAddress)),
  /** Restart the LAN listener on another address with a new certificate; the invites change. */
  'live:lan-switch-address': channel(z.object({ address: Ipv4 }), LanServerStatus),
  /** The firewall prompt this OS shows and how to recover from a denial (spec 0407 FR-8). */
  'live:firewall-guidance': channel(z.void(), FirewallGuidance),
  /** Probe a connection without starting a session (spec 0410 FR-4). The only call besides start that touches a server. */
  'live:connection-test': channel(
    z.object({
      /** Not needed to test; the Facilitate page sends it, Settings does not. */
      projectPath: z.string().optional(),
      connection: LiveConnection,
      /** A key typed but not saved yet; otherwise the stored key for the URL is used. */
      serverKey: z.string().max(200).optional(),
    }),
    ConnectionTestResult,
  ),
  /** The remote kind the facilitator confirmed for this scenario (spec 0410 FR-7). */
  'live:consent': channel(S.extend({ kind: z.enum(['relay', 'self-hosted']) }), z.void()),
  'live:servers-list': channel(z.void(), z.array(LiveServerEntry.extend({ hasKey: z.boolean() }))),
  /** Remember a server, its pinned fingerprint and (encrypted) its key. */
  'live:server-save': channel(
    z.object({
      url: HttpUrl,
      name: z.string().trim().max(80).optional(),
      fingerprintSha256: Fingerprint.optional(),
      serverKey: z.string().trim().min(1).max(200).optional(),
    }),
    LiveServerEntry.extend({ hasKey: z.boolean() }),
  ),
  'live:server-forget': channel(z.object({ url: HttpUrl }), z.void()),
  /** Release an MSEL row to devices (#412). Targets default from the row; `showExpected` adds the expected action to evaluators' copies. */
  'live:release-inject': channel(
    S.extend({
      rowId: SafeId,
      targets: z.array(Destination).min(1).max(64).optional(),
      showExpected: z.boolean().default(false),
    }),
    ReleaseSummary,
  ),
  /** Send the same release to more targets (devices keep one copy). */
  'live:resend-inject': channel(
    S.extend({ releaseId: z.string(), targets: z.array(Destination).min(1).max(64) }),
    ReleaseSummary,
  ),
  /** Withdraw a release from devices (`inject.recall`). */
  'live:retract-inject': channel(S.extend({ releaseId: z.string() }), z.void()),
  /** Every release of the running session with its receipts. */
  'live:receipts': channel(S, z.array(ReleaseSummary)),
  /** Progress of the media staging that starts with the session. */
  'live:stage-status': channel(S, StageStatus),
  /** Threads with the players and the SimCell, newest activity first (#413). */
  'live:threads': channel(S, z.array(ThreadSummary)),
  /** One thread's messages (the panel fetches only the thread named by `live:changed`). */
  'live:thread': channel(S.extend({ channel: z.string().max(60) }), z.array(LiveMessage)),
  /** Seats and teams the controller can start a thread with, and connected devices. */
  'live:message-targets': channel(S, z.array(MessageTarget)),
  /** Answer in a thread as a persona, or start one (`live:thread-open` first is optional). */
  'live:message-send': channel(
    S.extend({
      channel: z.string().max(60),
      text: z.string().trim().min(1).max(2000),
      persona: z.string().trim().min(1).max(80),
      showPlayedBy: z.boolean().default(true),
      replyTo: z.string().max(40).optional(),
    }),
    LiveMessage,
  ),
  'live:message-handled': channel(S.extend({ messageId: z.string().max(40) }), z.void()),
  'live:message-star': channel(
    S.extend({ messageId: z.string().max(40), on: z.boolean() }),
    z.void(),
  ),
  /** Pin a message to the hot wash: a `message.pinned` log entry the AAR reads. */
  'live:message-pin': channel(S.extend({ messageId: z.string().max(40) }), z.void()),
  /** Open an empty thread to a role, team or device (the first message follows). */
  'live:thread-open': channel(S.extend({ channel: z.string().max(60) }), ThreadSummary),
  /** Open a vote on devices (#414). `rowId` ties it to the MSEL decision point it came from. */
  'live:vote-open': channel(
    S.extend({ definition: VoteDefinition, rowId: SafeId.optional() }),
    VoteView,
  ),
  /** Close the open vote and send the result to devices. */
  'live:vote-close': channel(S.extend({ voteId: z.string() }), VoteView),
  /** Open a vote again within two minutes of closing it. */
  'live:vote-reopen': channel(S.extend({ voteId: z.string() }), VoteView),
  /** Every vote of the running session, newest first. */
  'live:votes': channel(S, z.array(VoteView)),
  /** Devices in scope and the roles under `k`, for the warning before a by-role vote. */
  'live:vote-scope': channel(
    S.extend({ targets: z.array(z.string()).min(1).max(64), k: z.number().int().min(2).max(10) }),
    VoteScope,
  ),
  /** Mark a closed vote as recorded; returns the decision entry to add to the decision log. */
  'live:vote-record': channel(
    S.extend({ voteId: z.string() }),
    z.object({
      id: SafeId,
      at: z.string(),
      exerciseTime: z.string(),
      rowId: SafeId.optional(),
      text: z.string(),
    }),
  ),
  /** Show a vote's tally in the presentation window. */
  'live:vote-present': channel(
    S.extend({ voteId: z.string(), displayId: z.number().optional() }),
    z.void(),
  ),
  /** Who has rated which critical task in the running session (#416). */
  'live:eval-coverage': channel(S, CoverageView),
  /** Set the roles and capabilities one evaluator watches; the assignment is re-sent. */
  'live:eval-watch': channel(S.extend({ clientRef: ClientRef, watch: EvaluatorWatch }), z.void()),
  /** "Please watch for T-04": a notice to one evaluator's device. */
  'live:eval-ask': channel(
    S.extend({ clientRef: ClientRef, text: z.string().trim().min(1).max(500) }),
    z.void(),
  ),
  /** Show the plan's expected actions to evaluators (re-sends every assignment). */
  'live:eval-show-expected': channel(S.extend({ on: z.boolean() }), z.void()),
  /** Open the hot wash on devices; `review` holds new items until accepted (#415). */
  'live:hotwash-open': channel(
    S.extend({ review: z.boolean().default(false), text: z.string().max(500).optional() }),
    BoardView,
  ),
  'live:hotwash-close': channel(S, BoardView),
  /** The board; also what the Hot wash tab and the projector view read. */
  'live:hotwash-board': channel(S, BoardView),
  /** Switch between showing items at once and holding them for review. */
  'live:hotwash-review': channel(S.extend({ review: z.boolean() }), BoardView),
  'live:hotwash-update': channel(
    S.extend({
      action: HotWashAction,
      itemIds: z.array(z.string().max(40)).min(1).max(200),
      label: z.string().max(120).optional(),
      text: z.string().max(2000).optional(),
      tags: z
        .object({
          objectiveId: SafeId.nullable().optional(),
          capability: SafeId.nullable().optional(),
          mselRowId: SafeId.nullable().optional(),
        })
        .optional(),
    }),
    BoardView,
  ),
  /**
   * Promote an item or group. Returns the entry for `FacilitatorState.hotwash`, which the
   * Facilitate page adds to its own copy: it owns that file while the page is open.
   */
  'live:hotwash-promote': channel(
    S.extend({ id: z.string().max(40) }),
    z.object({ entry: PromotedEntry, board: BoardView }),
  ),
  'live:hotwash-unpromote': channel(
    S.extend({ id: z.string().max(40) }),
    z.object({ entryId: SafeId, board: BoardView }),
  ),
  /** Show the promoted board in the presentation window. */
  'live:hotwash-present': channel(S.extend({ displayId: z.number().optional() }), z.void()),
}

export { LiveChangedEvent }
