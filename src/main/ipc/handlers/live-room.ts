import {
  closeSession,
  dashboard,
  deleteSession,
  exportLog,
  logTail,
  sessionsList,
} from '../../live/room'
import { markAnswered } from '../../live/session'
import { requireProject } from '../../project/guard'
import { defineHandlers } from '../registry'

export default defineHandlers({
  'live:dashboard': async ({ projectPath, scenarioId, sessionId }) =>
    dashboard(await requireProject(projectPath), scenarioId, sessionId),

  'live:log-tail': async ({ projectPath, scenarioId, ...opts }) =>
    logTail(await requireProject(projectPath), scenarioId, {
      ...(opts.sessionId ? { sessionId: opts.sessionId } : {}),
      ...(opts.before ? { before: opts.before } : {}),
      ...(opts.limit ? { limit: opts.limit } : {}),
      ...(opts.kinds ? { kinds: opts.kinds } : {}),
      ...(opts.q ? { q: opts.q } : {}),
    }),

  'live:log-export': async ({
    projectPath,
    scenarioId,
    sessionId,
    format,
    outPath,
    includeNames,
  }) =>
    exportLog(
      await requireProject(projectPath),
      scenarioId,
      sessionId,
      format,
      outPath,
      includeNames,
    ),

  'live:sessions-list': async ({ projectPath, scenarioId }) =>
    sessionsList(await requireProject(projectPath), scenarioId),

  'live:session-close': async ({ projectPath, scenarioId, sessionId }) =>
    closeSession(await requireProject(projectPath), scenarioId, sessionId),

  'live:session-delete': async ({ projectPath, scenarioId, sessionId }) =>
    deleteSession(await requireProject(projectPath), scenarioId, sessionId),

  'live:mark-answered': async ({ projectPath, scenarioId, releaseId, note }) =>
    markAnswered(await requireProject(projectPath), scenarioId, releaseId, note),
})
