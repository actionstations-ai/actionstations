import { AppError } from '../../lib/errors'
import { listLanAddresses } from '../../live/transport/lan/addresses'
import { firewallGuidance } from '../../live/transport/lan/firewall'
import {
  activeLanPort,
  activeSession,
  endSession,
  markMessageHandled,
  messageTargets,
  messageThread,
  messageThreads,
  openMessageThread,
  pinMessage,
  releaseInject,
  releaseSummaries,
  resendInject,
  retractInject,
  sendMessage,
  starMessage,
  stageProgress,
  startSession,
  status,
  switchAddress,
} from '../../live/session'
import { requireProject } from '../../project/guard'
import { refreshProgramOfProject } from '../../program/snapshot'
import { defineHandlers } from '../registry'

export default defineHandlers({
  'live:session-start': async ({ projectPath, scenarioId, connection, attribution, name }) => {
    const running = activeSession()
    if (running) {
      throw new AppError(
        'CONFLICT',
        `A live session is already running (started ${running.startedAt}). End it before starting another.`,
      )
    }
    return startSession({
      projectPath,
      scenarioId,
      connection,
      attribution,
      ...(name !== undefined ? { name } : {}),
    })
  },

  'live:session-status': async ({ projectPath, scenarioId }) => {
    const root = await requireProject(projectPath)
    return status(root, scenarioId)
  },

  'live:session-end': async ({ projectPath, scenarioId }) => {
    const root = await requireProject(projectPath)
    const ended = await endSession(root, scenarioId)
    // A linked exercise program learns the scenario was run (#424); never blocks the caller.
    void refreshProgramOfProject(root)
    return ended
  },

  'live:lan-addresses': () => listLanAddresses(),

  'live:lan-switch-address': ({ address }) => switchAddress(address),

  'live:firewall-guidance': () => firewallGuidance(process.platform, activeLanPort()),

  'live:release-inject': async ({ projectPath, scenarioId, rowId, targets, showExpected }) =>
    releaseInject(await requireProject(projectPath), scenarioId, {
      rowId,
      ...(targets ? { targets } : {}),
      showExpected,
    }),

  'live:resend-inject': async ({ projectPath, scenarioId, releaseId, targets }) =>
    resendInject(await requireProject(projectPath), scenarioId, releaseId, targets),

  'live:retract-inject': async ({ projectPath, scenarioId, releaseId }) =>
    retractInject(await requireProject(projectPath), scenarioId, releaseId),

  'live:receipts': async ({ projectPath, scenarioId }) =>
    releaseSummaries(await requireProject(projectPath), scenarioId),

  'live:stage-status': async ({ projectPath, scenarioId }) =>
    stageProgress(await requireProject(projectPath), scenarioId),

  'live:threads': async ({ projectPath, scenarioId }) =>
    messageThreads(await requireProject(projectPath), scenarioId),

  'live:thread': async ({ projectPath, scenarioId, channel }) =>
    messageThread(await requireProject(projectPath), scenarioId, channel),

  'live:message-targets': async ({ projectPath, scenarioId }) =>
    messageTargets(await requireProject(projectPath), scenarioId),

  'live:thread-open': async ({ projectPath, scenarioId, channel }) =>
    openMessageThread(await requireProject(projectPath), scenarioId, channel),

  'live:message-send': async ({ projectPath, scenarioId, ...req }) =>
    sendMessage(await requireProject(projectPath), scenarioId, req),

  'live:message-handled': async ({ projectPath, scenarioId, messageId }) =>
    markMessageHandled(await requireProject(projectPath), scenarioId, messageId),

  'live:message-star': async ({ projectPath, scenarioId, messageId, on }) =>
    starMessage(await requireProject(projectPath), scenarioId, messageId, on),

  'live:message-pin': async ({ projectPath, scenarioId, messageId }) =>
    pinMessage(await requireProject(projectPath), scenarioId, messageId),
})
