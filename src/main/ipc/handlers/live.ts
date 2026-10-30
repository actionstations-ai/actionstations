import { AppError } from '../../lib/errors'
import { readFacilitatorState, writeFacilitatorState } from '../../facilitator/state'
import { connectionTest } from '../../live/test'
import { forgetServer, listServers, recordServerTest, saveServer } from '../../live/servers'
import { listLanAddresses } from '../../live/transport/lan/addresses'
import { firewallGuidance } from '../../live/transport/lan/firewall'
import {
  activeLanPort,
  ringInjectAsCall,
  activeSession,
  closeVote,
  askEvaluator,
  evaluationCoverage,
  setEvaluatorWatch,
  showExpectedToEvaluators,
  closeHotwash,
  endSession,
  hotwashBoard,
  markMessageHandled,
  messageTargets,
  messageThread,
  messageThreads,
  openMessageThread,
  openHotwash,
  pinMessage,
  getVote,
  listVotes,
  openVote,
  recordVote,
  reopenVote,
  voteScope,
  promoteHotwash,
  releaseInject,
  releaseSummaries,
  resendInject,
  setHotwashReview,
  retractInject,
  sendMessage,
  starMessage,
  stageProgress,
  startSession,
  status,
  unpromoteHotwash,
  updateHotwash,
  switchAddress,
} from '../../live/session'
import { BrowserWindow } from 'electron'
import { present } from '../../facilitator/present'
import { requireProject } from '../../project/guard'
import { refreshProgramOfProject } from '../../program/snapshot'
import { defineHandlers, type HandlerContext } from '../registry'

/** A saved server remembers when it was last tested and what went wrong. */
async function noteServerTest(
  connection: Parameters<typeof connectionTest>[0],
  result: Awaited<ReturnType<typeof connectionTest>>,
): Promise<void> {
  if (connection.kind !== 'self-hosted') return
  const failed = result.checks.find((c) => c.status === 'fail')
  await recordServerTest(connection.url, failed?.detail)
}

export default defineHandlers({
  'live:session-start': async ({
    projectPath,
    scenarioId,
    connection,
    attribution,
    name,
    surveyOnly,
  }) => {
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
      ...(surveyOnly ? { surveyOnly } : {}),
    })
  },

  'live:connection-test': async ({ connection, serverKey }) => {
    const result = await connectionTest(connection, serverKey ? { serverKey } : {})
    await noteServerTest(connection, result)
    return result
  },

  'live:consent': async ({ projectPath, scenarioId, kind }) => {
    const root = await requireProject(projectPath)
    const state = await readFacilitatorState(root, scenarioId)
    const consented = new Set(state.live?.consented ?? [])
    consented.add(kind)
    await writeFacilitatorState(root, scenarioId, {
      ...state,
      live: { ...state.live, consented: [...consented] },
    })
  },

  'live:servers-list': () => listServers(),
  'live:server-save': (req) => saveServer(req),
  'live:server-forget': ({ url }) => forgetServer(url),

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

  'live:eval-coverage': async ({ projectPath, scenarioId }) =>
    evaluationCoverage(await requireProject(projectPath), scenarioId),

  'live:eval-watch': async ({ projectPath, scenarioId, clientRef, watch }) =>
    setEvaluatorWatch(await requireProject(projectPath), scenarioId, clientRef, watch),

  'live:eval-ask': async ({ projectPath, scenarioId, clientRef, text }) =>
    askEvaluator(await requireProject(projectPath), scenarioId, clientRef, text),

  'live:eval-show-expected': async ({ projectPath, scenarioId, on }) =>
    showExpectedToEvaluators(await requireProject(projectPath), scenarioId, on),

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
  'live:vote-open': async ({ projectPath, scenarioId, definition, rowId }) =>
    openVote(await requireProject(projectPath), scenarioId, definition, rowId),

  'live:vote-close': async ({ projectPath, scenarioId, voteId }) =>
    closeVote(await requireProject(projectPath), scenarioId, voteId),

  'live:vote-reopen': async ({ projectPath, scenarioId, voteId }) =>
    reopenVote(await requireProject(projectPath), scenarioId, voteId),

  'live:votes': async ({ projectPath, scenarioId }) =>
    listVotes(await requireProject(projectPath), scenarioId),

  'live:vote-scope': async ({ projectPath, scenarioId, targets, k }) =>
    voteScope(await requireProject(projectPath), scenarioId, targets, k),

  'live:vote-record': async ({ projectPath, scenarioId, voteId }) =>
    recordVote(await requireProject(projectPath), scenarioId, voteId),

  'live:vote-present': async ({ projectPath, scenarioId, voteId, displayId }, ctx) => {
    const root = await requireProject(projectPath)
    getVote(root, scenarioId, voteId)
    present(
      { projectPath: root, scenarioId, voteId },
      { ...(displayId !== undefined ? { displayId } : {}), ...ownerOf(ctx) },
    )
  },

  'live:inject-call': async ({ projectPath, scenarioId, rowId }) =>
    ringInjectAsCall(await requireProject(projectPath), scenarioId, rowId),

  'live:hotwash-open': async ({ projectPath, scenarioId, review, text }) =>
    openHotwash(await requireProject(projectPath), scenarioId, review, text),

  'live:hotwash-close': async ({ projectPath, scenarioId }) =>
    closeHotwash(await requireProject(projectPath), scenarioId),

  'live:hotwash-board': async ({ projectPath, scenarioId }) =>
    hotwashBoard(await requireProject(projectPath), scenarioId),

  'live:hotwash-review': async ({ projectPath, scenarioId, review }) =>
    setHotwashReview(await requireProject(projectPath), scenarioId, review),

  'live:hotwash-update': async ({ projectPath, scenarioId, ...req }) =>
    updateHotwash(await requireProject(projectPath), scenarioId, req),

  'live:hotwash-promote': async ({ projectPath, scenarioId, id }) =>
    promoteHotwash(await requireProject(projectPath), scenarioId, id),

  'live:hotwash-unpromote': async ({ projectPath, scenarioId, id }) =>
    unpromoteHotwash(await requireProject(projectPath), scenarioId, id),

  'live:hotwash-present': async ({ projectPath, scenarioId, displayId }, ctx) => {
    const root = await requireProject(projectPath)
    hotwashBoard(root, scenarioId)
    present(
      { projectPath: root, scenarioId, hotwash: true },
      { ...(displayId !== undefined ? { displayId } : {}), ...ownerOf(ctx) },
    )
  },
})

function ownerOf(ctx: HandlerContext): { owner?: BrowserWindow } {
  const sender = ctx.event?.sender
  const owner = sender ? BrowserWindow.fromWebContents(sender) : null
  return owner ? { owner } : {}
}
