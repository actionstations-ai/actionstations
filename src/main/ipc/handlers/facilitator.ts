import { BrowserWindow } from 'electron'
import { AppError } from '../../lib/errors'
import { exists } from '../../lib/fs'
import { requireProject } from '../../project/guard'
import { readFacilitatorState, writeFacilitatorState } from '../../facilitator/state'
import { closePresent, isPresenting, listDisplays, present } from '../../facilitator/present'
import { scenarioLayout } from '../../scenario/layout'
import { requireScenarioDir } from '../../scenario/store'
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
    return writeFacilitatorState(root, scenarioId, state)
  },

  'facilitator:displays': () => listDisplays(),

  'facilitator:present': async ({ projectPath, scenarioId, injectId, assetId, displayId }, ctx) => {
    const root = await requireProject(projectPath)
    await requireInject(root, scenarioId, injectId)
    const owner = ownerWindow(ctx)
    present(
      { projectPath: root, scenarioId, injectId, ...(assetId ? { assetId } : {}) },
      { ...(displayId !== undefined ? { displayId } : {}), ...(owner ? { owner } : {}) },
    )
  },

  'facilitator:close-present': () => closePresent(),

  'facilitator:present-status': () => ({ open: isPresenting() }),
})
