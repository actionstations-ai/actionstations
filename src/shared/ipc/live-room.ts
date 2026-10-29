import { z } from 'zod'
import { channel } from './define'
import { SessionId } from '../live/schemas/envelope'
import { SafeId } from '../schemas/common'
import { DashboardView, LiveSession, LiveSessionSummary, LogTailEntry } from '../schemas/live'

const S = z.object({ projectPath: z.string(), scenarioId: SafeId })
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
  /** Mark a release answered; clears its "No response" flag. */
  'live:mark-answered': channel(
    S.extend({ releaseId: z.string().max(40), note: z.string().trim().max(500).optional() }),
    z.void(),
  ),
}
