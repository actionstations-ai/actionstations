import { z } from 'zod'
import { channel } from './define'
import { SessionId } from '../live/schemas/envelope'
import { SafeId } from '../schemas/common'
import {
  BoardView,
  DashboardView,
  LiveDevice,
  LiveSession,
  LiveSessionStatus,
  LiveSessionSummary,
  LogTailEntry,
  PartnerInviteView,
  PartnerStatus,
  RegionalRosterView,
  ReleaseSummary,
  SimcellHelpersView,
  StaffSeatsView,
} from '../schemas/live'

const S = z.object({ projectPath: z.string(), scenarioId: SafeId })
/** The slice of a running session the Facilitate tracker reads (spec 0428 task 7). */
export const TrackerFeedView = z.object({
  /** A session is running for this scenario. */
  live: z.boolean(),
  session: z.array(
    z.object({
      kind: z.enum(['inject.release', 'inject.receipt', 'message.send', 'vote.close']),
      at: z.number(),
      rowId: z.string().max(64).optional(),
      receipt: z.string().max(20).optional(),
      fromPlayer: z.boolean().optional(),
    }),
  ),
  messages: z.array(
    z.object({
      messageId: z.string().max(60),
      text: z.string().max(2000),
      rowId: z.string().max(64).optional(),
      at: z.number(),
    }),
  ),
})

const Session = S.extend({ sessionId: SessionId })

/** The Room dashboard and the session log (#417). */
export const liveRoomChannels = {
  /** The Room: the running session, else the newest one (or `sessionId`). `null` = no session. */
  'live:dashboard': channel(
    S.extend({ sessionId: SessionId.optional() }),
    DashboardView.nullable(),
  ),
  /** The Log view's window of entries, newest first. */
  'live:log-tail': channel(
    S.extend({
      sessionId: SessionId.optional(),
      before: z.number().int().positive().optional(),
      limit: z.number().int().min(1).max(500).optional(),
      kinds: z.array(z.string().max(40)).max(60).optional(),
      q: z.string().max(100).optional(),
    }),
    z.object({ entries: z.array(LogTailEntry), hasMore: z.boolean() }),
  ),
  /** Write the log to a path the facilitator chose in a save dialog. */
  'live:log-export': channel(
    Session.extend({
      format: z.enum(['json', 'csv']),
      outPath: z.string().min(1).max(1000),
      includeNames: z.boolean().default(false),
    }),
    z.object({ path: z.string(), entries: z.number().int().min(0) }),
  ),
  /** Past and interrupted sessions of the scenario, interrupted first. */
  'live:sessions-list': channel(S, z.array(LiveSessionSummary)),
  /** Mark an interrupted session ended. */
  'live:session-close': channel(Session, LiveSession),
  /** Remove a past session's folder: log, attachments and staged media. */
  'live:session-delete': channel(Session, z.void()),
  /** Receipts, answers and message text of the running session, for the tracker. */
  'live:tracker-feed': channel(S, TrackerFeedView),
  /** Continue an interrupted session from the keys stored on this computer. */
  'live:session-resume': channel(Session, LiveSessionStatus),
  /** Devices seated in the running session. */
  'live:devices': channel(S, z.array(LiveDevice)),
  /** Remove one device: it is closed and everyone else moves to a new key. */
  'live:device-remove': channel(S.extend({ clientRef: z.string().max(40) }), z.void()),
  /** Replace the keys without removing anyone: the old invite links stop working. */
  'live:keys-replace': channel(S, z.object({ epoch: z.number().int().positive() })),
  /** Send a notice to evaluator devices only (a tracker flag, spec 0428 FR-17). */
  'live:staff-notice': channel(
    S.extend({
      text: z.string().trim().min(1).max(1000),
      level: z.enum(['info', 'warning', 'urgent']).default('info'),
      rowId: z.string().max(64).optional(),
    }),
    z.void(),
  ),
  /** How long an inject that expects a response may go unanswered before it is flagged. */
  'live:unanswered-window': channel(
    S.extend({ minutes: z.number().int().min(1).max(240) }),
    z.void(),
  ),
  /** The co-controller roster of a regional exercise and whether devices have it. */
  'live:regional-roster': channel(S, RegionalRosterView),
  /** Send the roster to devices again (after a partner's key was pinned). */
  'live:regional-roster-send': channel(S, RegionalRosterView),
  /** Mint a partner's invite for a roster organization (shown once, never stored). */
  'live:partner-invite': channel(S.extend({ orgId: SafeId }), PartnerInviteView),
  /** Partner side: this computer's seat in a host's session. */
  'live:partner-status': channel(S, PartnerStatus),
  /** Partner side: join a host's session with the invite text the host gave. */
  'live:partner-join': channel(S.extend({ invite: z.string().max(8192) }), PartnerStatus),
  /** Partner side: release one of this organization's rows to its own roles. */
  'live:partner-release': channel(S.extend({ rowId: SafeId }), ReleaseSummary),
  /** Partner side: leave the host's session. */
  'live:partner-leave': channel(S, z.void()),
  /** Staff seats closed by a partner invite, and the host's grant to open them again. */
  'live:staff-seats': channel(S, StaffSeatsView),
  'live:staff-seats-set': channel(S.extend({ granted: z.boolean() }), StaffSeatsView),
  /** SimCell helper devices in the running session (#518). */
  'live:simcell-helpers': channel(S, SimcellHelpersView),
  'live:simcell-helpers-set': channel(S.extend({ enabled: z.boolean() }), SimcellHelpersView),
  /** A past session's hot wash board, rebuilt from its log (read only). */
  'live:hotwash-past': channel(Session, BoardView),
  /** Mark a release answered; clears its "No response" flag. */
  'live:mark-answered': channel(
    S.extend({ releaseId: z.string().max(40), note: z.string().trim().max(500).optional() }),
    z.void(),
  ),
}
