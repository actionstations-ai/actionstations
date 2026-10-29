import {
  closeSession,
  dashboard,
  deleteSession,
  exportLog,
  logTail,
  sessionsList,
  trackerFeedFor,
} from '../../live/room'
import {
  liveDevices,
  markAnswered,
  removeDevice,
  replaceKeys,
  resumeSession,
  sendEvaluatorNotice,
} from '../../live/session'
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

  'live:tracker-feed': async ({ projectPath, scenarioId }) =>
    trackerFeedFor(await requireProject(projectPath), scenarioId),

  'live:session-resume': ({ projectPath, scenarioId, sessionId }) =>
    resumeSession(projectPath, scenarioId, sessionId),

  'live:devices': async ({ projectPath, scenarioId }) =>
    liveDevices(await requireProject(projectPath), scenarioId),

  'live:device-remove': async ({ projectPath, scenarioId, clientRef }) =>
    removeDevice(await requireProject(projectPath), scenarioId, clientRef),

  'live:keys-replace': async ({ projectPath, scenarioId }) => ({
    epoch: await replaceKeys(await requireProject(projectPath), scenarioId),
  }),

  'live:staff-notice': async ({ projectPath, scenarioId, text, level, rowId }) =>
    sendEvaluatorNotice(await requireProject(projectPath), scenarioId, { text, level, rowId }),

  'live:mark-answered': async ({ projectPath, scenarioId, releaseId, note }) =>
    markAnswered(await requireProject(projectPath), scenarioId, releaseId, note),
})
