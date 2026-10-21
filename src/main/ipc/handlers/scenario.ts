import type { LintWarning, Scenario } from '@shared/schemas'
import { ScenarioBrief } from '@shared/schemas'
import { defineHandlers } from '../registry'
import { requireProject } from '../../project/guard'
import {
  createScenario,
  getScenario,
  readScenarioDoc,
  saveScenario,
  writeScenarioDoc,
} from '../../scenario/store'
import {
  deleteScenario,
  duplicateScenario,
  listHistory,
  listScenarios,
  restoreHistory,
} from '../../scenario/manage'

type LintModule = { lintScenario?: (s: Scenario) => LintWarning[] | Promise<LintWarning[]> }

// The linter is built by the pipeline workstream; a glob keeps main building without it.
const lintModules = import.meta.glob<LintModule>('../../generate/lint.ts')

/** Fresh lint when the linter exists, otherwise the warnings stored on the scenario. */
export async function lintOrStored(scenario: Scenario): Promise<LintWarning[]> {
  const load = Object.values(lintModules)[0]
  const mod = load ? await load() : undefined
  if (!mod?.lintScenario) return scenario.warnings
  return mod.lintScenario(scenario)
}

export default defineHandlers({
  'scenarios:list': async ({ projectPath }) => listScenarios(await requireProject(projectPath)),

  'scenarios:get': async ({ projectPath, scenarioId }) =>
    getScenario(await requireProject(projectPath), scenarioId),

  'scenarios:save': async ({ projectPath, scenario, note }) => {
    const root = await requireProject(projectPath)
    return saveScenario(root, scenario, { by: 'user', ...(note ? { note } : {}) })
  },

  'scenarios:create-empty': async ({ projectPath, title, brief }) => {
    const root = await requireProject(projectPath)
    return createScenario(root, { title, brief: ScenarioBrief.parse(brief ?? {}) })
  },

  'scenarios:delete': async ({ projectPath, scenarioId }) => {
    const root = await requireProject(projectPath)
    await deleteScenario(root, scenarioId)
  },

  'scenarios:duplicate': async ({ projectPath, scenarioId, title }) =>
    duplicateScenario(await requireProject(projectPath), scenarioId, title),

  'scenarios:lint': async ({ projectPath, scenarioId }) => {
    const root = await requireProject(projectPath)
    return lintOrStored(await getScenario(root, scenarioId))
  },

  'scenarios:doc-get': async ({ projectPath, scenarioId, kind }) => {
    const root = await requireProject(projectPath)
    return { markdown: await readScenarioDoc(root, scenarioId, kind) }
  },

  'scenarios:doc-save': async ({ projectPath, scenarioId, kind, markdown, note }) => {
    const root = await requireProject(projectPath)
    await writeScenarioDoc(root, scenarioId, kind, markdown, {
      by: 'user',
      ...(note ? { note } : {}),
    })
  },

  'scenarios:history': async ({ projectPath, scenarioId, artifact }) =>
    listHistory(await requireProject(projectPath), scenarioId, artifact),

  'scenarios:history-restore': async ({ projectPath, scenarioId, artifact, entryId }) => {
    const root = await requireProject(projectPath)
    await restoreHistory(root, scenarioId, artifact, entryId)
  },
})
