// compliance:* (#426): the regulations and frameworks a project can use, its switches, and
// the coverage report. Nothing here makes a network call or contacts a regulator.
import { scenarioCoverage } from '../../compliance/coverage'
import {
  copyEnabledFromPacks,
  isEnabled,
  layeredItems,
  profileDefaults,
} from '../../compliance/registry'
import { jobs } from '../../jobs/manager'
import { modelMappingInfo, runSuggestModel } from '../../compliance/suggest-model'
import { requireProject } from '../../project/guard'
import { loadProject, updateProject } from '../../project/store'
import { defineHandlers } from '../registry'

export default defineHandlers({
  'compliance:list': async ({ projectPath }) => {
    const root = await requireProject(projectPath)
    const project = await loadProject(root)
    const defaults = profileDefaults(project)
    const regulations = (await layeredItems(root, 'regulations')).map((l) => ({
      regulation: l.item,
      enabled: isEnabled(project, 'regulations', l.item.id),
      suggested: defaults.regulations.includes(l.item.id),
      source: l.source,
    }))
    const frameworks = (await layeredItems(root, 'frameworks')).map((l) => ({
      framework: l.item,
      enabled: isEnabled(project, 'frameworks', l.item.id),
      suggested: defaults.frameworks.includes(l.item.id),
      source: l.source,
    }))
    return { regulations, frameworks, modelMapping: project.compliance?.modelMapping ?? false }
  },

  'compliance:set': async ({ projectPath, regulations = {}, frameworks = {}, modelMapping }) => {
    const root = await requireProject(projectPath)
    await copyEnabledFromPacks(root, 'regulations', regulations)
    await copyEnabledFromPacks(root, 'frameworks', frameworks)
    const next = await updateProject(root, (p) => {
      p.compliance = {
        regulations: { ...p.compliance?.regulations, ...regulations },
        frameworks: { ...p.compliance?.frameworks, ...frameworks },
        modelMapping: modelMapping ?? p.compliance?.modelMapping ?? false,
      }
    })
    return next.compliance ?? { regulations: {}, frameworks: {}, modelMapping: false }
  },

  'compliance:model-info': async ({ projectPath }) =>
    modelMappingInfo(await requireProject(projectPath)),

  'compliance:suggest-model': async ({ projectPath, scenarioId, rowIds }) => {
    const root = await requireProject(projectPath)
    const job = jobs.start(
      'compliance-map',
      (ctx) => runSuggestModel(root, scenarioId, rowIds, ctx),
      { projectPath: root, scenarioId },
    )
    return { jobId: job.id }
  },

  'compliance:coverage': async ({ projectPath, scenarioId }) => {
    const root = await requireProject(projectPath)
    return scenarioCoverage(root, scenarioId)
  },
})
