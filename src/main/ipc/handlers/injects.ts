// injects:* (one inject's text, versions, media) and library:* (reusable injects in userData).
// Generation runs as jobs; only one generation job per scenario at a time.
import { defineHandlers } from '../registry'
import {
  assertNotGenerating,
  clearFixedFieldWarnings,
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
import { getScenario, listInjects, saveInject, updateScenario } from '../../scenario/store'
import { contextFor, regroundScenario, sameGrounding } from '../../grounding/project'

/** Labels after an edit (#423, FR-6): written only when a result changed; never blocks the save. */
async function groundSavedInject(root: string, scenarioId: string): Promise<void> {
  try {
    const scenario = await getScenario(root, scenarioId)
    const ctx = await contextFor(root, scenario)
    const grounding = await regroundScenario(scenario, ctx, await listInjects(root, scenarioId))
    if (sameGrounding(scenario.grounding, grounding)) return
    await updateScenario(
      root,
      scenarioId,
      (s) => {
        s.grounding = grounding
      },
      { by: 'user', snapshot: false, note: 'source check' },
    )
  } catch {
    // Labels are recomputed on the next grounding:scenario.
  }
}

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
    const saved = await saveInject(root, scenarioId, next, {
      by: 'user',
      ...(note ? { note } : {}),
    })
    await clearFixedFieldWarnings(root, scenarioId, saved)
    await groundSavedInject(root, scenarioId)
    return saved
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
