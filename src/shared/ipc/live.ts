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
  LiveSessionStatus,
  ReleaseSummary,
  StageStatus,
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
}

export { LiveChangedEvent }
