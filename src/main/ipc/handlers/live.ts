import { AppError } from '../../lib/errors'
import { listLanAddresses } from '../../live/transport/lan/addresses'
import { firewallGuidance } from '../../live/transport/lan/firewall'
import {
  activeLanPort,
  activeSession,
  endSession,
  releaseInject,
  releaseSummaries,
  resendInject,
  retractInject,
  stageProgress,
  startSession,
  status,
  switchAddress,
} from '../../live/session'
import { requireProject } from '../../project/guard'
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
    return endSession(root, scenarioId)
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
})
