// evaluation:* (#421): observations recorded outside live play and the derived per-row
// criteria. Nothing here leaves the project folder.
import { rowCriteria } from '../../generate/eeg-criteria'
import { observeForStudent, removeObservationAndLinks } from '../../classroom/observations'
import { readEvaluation } from '../../evaluation/store'
import { requireProject } from '../../project/guard'
import { getScenario } from '../../scenario/store'
import { defineHandlers } from '../registry'

export default defineHandlers({
  'evaluation:get': async ({ projectPath, scenarioId }) => {
    const root = await requireProject(projectPath)
    return readEvaluation(root, scenarioId)
  },

  'evaluation:observe': async ({ projectPath, scenarioId, observation }) => {
    const root = await requireProject(projectPath)
    return observeForStudent(root, scenarioId, observation)
  },

  'evaluation:remove': async ({ projectPath, scenarioId, observationId }) => {
    const root = await requireProject(projectPath)
    return removeObservationAndLinks(root, scenarioId, observationId)
  },

  'evaluation:criteria': async ({ projectPath, scenarioId }) => {
    const root = await requireProject(projectPath)
    return rowCriteria(await getScenario(root, scenarioId))
  },
})
