import { z } from 'zod'
import { channel } from './define'
import { Destination } from '../live/schemas/envelope'
import { SafeId } from '../schemas/common'
import {
  Attribution,
  FirewallGuidance,
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
} from '../schemas/live'

const S = z.object({ projectPath: z.string(), scenarioId: SafeId })

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
}

export { LiveChangedEvent }
