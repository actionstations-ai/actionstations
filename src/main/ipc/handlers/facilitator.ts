import { BrowserWindow } from 'electron'
import { AppError } from '../../lib/errors'
import { exists } from '../../lib/fs'
import { readProjectMaps } from '../../maps/project'
import { requireProject } from '../../project/guard'
import { readFacilitatorState, writeFacilitatorState } from '../../facilitator/state'
import { logBranchEntries, publishClock } from '../../live/session'
import { appendBranchingEntries, checkBranchingReplay } from '../../facilitator/branching-log'
import { closePresent, isPresenting, listDisplays, present } from '../../facilitator/present'
import { engagementCacheFile } from '../../render/engagement'
import { scenarioLayout } from '../../scenario/layout'
import { getScenario, requireScenarioDir } from '../../scenario/store'
import { defineHandlers, type HandlerContext } from '../registry'

function ownerWindow(ctx: HandlerContext): BrowserWindow | undefined {
  const sender = ctx.event?.sender
  return sender ? (BrowserWindow.fromWebContents(sender) ?? undefined) : undefined
}

async function requireInject(root: string, scenarioId: string, injectId: string): Promise<void> {
  await requireScenarioDir(root, scenarioId)
  if (!(await exists(scenarioLayout(root, scenarioId).inject(injectId))))
    throw new AppError('NOT_FOUND', `No inject ${injectId} in this scenario`)
}

export default defineHandlers({
  'facilitator:state-get': async ({ projectPath, scenarioId }) => {
    const root = await requireProject(projectPath)
    return readFacilitatorState(root, scenarioId)
  },

  'facilitator:state-save': async ({ projectPath, scenarioId, state }) => {
    const root = await requireProject(projectPath)
    const saved = await writeFacilitatorState(root, scenarioId, state)
    // Devices follow the clock; a failure to tell them never fails the save.
    await publishClock(root, scenarioId, saved).catch((e: unknown) =>
      console.error('[live] clock.state:', (e as Error).message),
    )
    return saved
  },

  'facilitator:branching-append': async ({ projectPath, scenarioId, entries }) => {
    const root = await requireProject(projectPath)
    await requireScenarioDir(root, scenarioId)
    const hashes = await appendBranchingEntries(root, scenarioId, entries)
    await logBranchEntries(root, scenarioId, entries).catch((e: unknown) =>
      console.error('[live] branch log:', (e as Error).message),
    )
    return hashes
  },

  'facilitator:branching-replay': async ({ projectPath, scenarioId }) => {
    const root = await requireProject(projectPath)
    await requireScenarioDir(root, scenarioId)
    return checkBranchingReplay(root, scenarioId)
  },

  'facilitator:displays': () => listDisplays(),

  'facilitator:present': async (
    { projectPath, scenarioId, injectId, assetId, cachePath, displayId },
    ctx,
  ) => {
    const root = await requireProject(projectPath)
    await requireInject(root, scenarioId, injectId)
    const owner = ownerWindow(ctx)
    present(
      {
        projectPath: root,
        scenarioId,
        injectId,
        ...(assetId ? { assetId } : {}),
        ...(cachePath ? { cachePath: engagementCacheFile(root, cachePath) } : {}),
      },
      { ...(displayId !== undefined ? { displayId } : {}), ...(owner ? { owner } : {}) },
    )
  },

  'facilitator:present-decision': async (
    { projectPath, scenarioId, decisionId, displayId },
    ctx,
  ) => {
    const root = await requireProject(projectPath)
    const scenario = await getScenario(root, scenarioId)
    if (!scenario.msel.some((r) => r.decision?.id === decisionId))
      throw new AppError('NOT_FOUND', `No decision ${decisionId} in this scenario`)
    const owner = ownerWindow(ctx)
    present(
      { projectPath: root, scenarioId, decisionId },
      { ...(displayId !== undefined ? { displayId } : {}), ...(owner ? { owner } : {}) },
    )
  },

  'facilitator:present-map': async ({ projectPath, scenarioId, mapId, displayId }, ctx) => {
    const root = await requireProject(projectPath)
    const { maps } = await readProjectMaps(root)
    if (!maps.maps.some((m) => m.id === mapId)) throw new AppError('NOT_FOUND', 'That map is gone')
    const owner = ownerWindow(ctx)
    present(
      { projectPath: root, scenarioId, mapId },
      { ...(displayId !== undefined ? { displayId } : {}), ...(owner ? { owner } : {}) },
    )
  },

  'facilitator:close-present': () => closePresent(),

  'facilitator:present-status': () => ({ open: isPresenting() }),
})
