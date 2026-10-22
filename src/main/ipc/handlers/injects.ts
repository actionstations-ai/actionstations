// injects:* (one inject's text, versions, media) and library:* (reusable injects in userData).
// Generation runs as jobs; only one generation job per scenario at a time.
import { defineHandlers } from '../registry'
import {
  assertNotGenerating,
  createEmptyInject,
  deleteFromLibrary,
  deleteInject,
  getInject,
  insertFromLibrary,
  listLibrary,
  restoreInjectVersion,
  runInjectsJob,
  runMediaJob,
  saveToLibrary,
  startInjectJob,
} from '../../generate/injects'
import { AppError } from '../../lib/errors'
import { requireProject } from '../../project/guard'
import { listInjects, saveInject } from '../../scenario/store'

async function requireUnlocked(root: string, scenarioId: string, injectId: string) {
  const inject = await getInject(root, scenarioId, injectId)
  if (inject.locked)
    throw new AppError('VALIDATION', `Inject ${inject.mselRowId} is locked; unlock it first`)
  return inject
}

export default defineHandlers({
  'injects:list': async ({ projectPath, scenarioId }) =>
    listInjects(await requireProject(projectPath), scenarioId),

  'injects:get': async ({ projectPath, scenarioId, injectId }) =>
    getInject(await requireProject(projectPath), scenarioId, injectId),

  'injects:save': async ({ projectPath, scenarioId, inject, note }) => {
    const root = await requireProject(projectPath)
    assertNotGenerating(root, scenarioId)
    const current = await getInject(root, scenarioId, inject.id).catch(() => undefined)
    if (current?.locked && inject.locked) {
      throw new AppError('VALIDATION', `Inject ${inject.mselRowId} is locked; unlock it first`)
    }
    // Media is managed by the media job; a user save never rewrites asset records.
    const next = current ? { ...inject, assets: current.assets } : inject
    return saveInject(root, scenarioId, next, { by: 'user', ...(note ? { note } : {}) })
  },

  'injects:create': async ({ projectPath, scenarioId, mselRowId, type }) => {
    const root = await requireProject(projectPath)
    assertNotGenerating(root, scenarioId)
    return createEmptyInject(root, scenarioId, mselRowId, type)
  },

  'injects:delete': async ({ projectPath, scenarioId, injectId }) => {
    const root = await requireProject(projectPath)
    assertNotGenerating(root, scenarioId)
    await requireUnlocked(root, scenarioId, injectId)
    await deleteInject(root, scenarioId, injectId)
  },

  'injects:regenerate-text': async ({ projectPath, scenarioId, injectId, instructions }) => {
    const root = await requireProject(projectPath)
    const inject = await requireUnlocked(root, scenarioId, injectId)
    const opts = { rowIds: [inject.mselRowId], ...(instructions ? { instructions } : {}) }
    const job = startInjectJob(
      'generate-injects',
      root,
      scenarioId,
      (ctx) => runInjectsJob(root, scenarioId, opts, ctx),
      { injectId, ...opts },
    )
    return { jobId: job.id }
  },

  'injects:regenerate-media': async ({ projectPath, scenarioId, injectId, paths }) => {
    const root = await requireProject(projectPath)
    await getInject(root, scenarioId, injectId)
    const opts = { injectIds: [injectId], ...(paths ? { paths } : {}) }
    const job = startInjectJob(
      'render-media',
      root,
      scenarioId,
      (ctx) => runMediaJob(root, scenarioId, opts, ctx),
      opts,
    )
    return { jobId: job.id }
  },

  'injects:restore-version': async ({ projectPath, scenarioId, injectId, versionIndex }) => {
    const root = await requireProject(projectPath)
    assertNotGenerating(root, scenarioId)
    return restoreInjectVersion(root, scenarioId, injectId, versionIndex)
  },

  'library:list': () => listLibrary(),

  'library:save': async ({ projectPath, scenarioId, injectId, name }) => {
    const root = await requireProject(projectPath)
    return saveToLibrary(await getInject(root, scenarioId, injectId), name)
  },

  'library:delete': ({ id }) => deleteFromLibrary(id),

  'library:insert': async ({ projectPath, scenarioId, libraryId, mselRowId }) => {
    const root = await requireProject(projectPath)
    assertNotGenerating(root, scenarioId)
    return insertFromLibrary(root, scenarioId, libraryId, mselRowId)
  },
})
