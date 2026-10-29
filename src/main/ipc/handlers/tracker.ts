// tracker:* (spec 0428): the report of answered injects and kept commitments.
import { trackerReport } from '@shared/facilitator/tracker'
import { readFacilitatorState } from '../../facilitator/state'
import { requireProject } from '../../project/guard'
import { getScenario } from '../../scenario/store'
import { defineHandlers } from '../registry'

export default defineHandlers({
  'tracker:report': async ({ projectPath, scenarioId }) => {
    const root = await requireProject(projectPath)
    const [scenario, state] = await Promise.all([
      getScenario(root, scenarioId),
      readFacilitatorState(root, scenarioId),
    ])
    return trackerReport({ msel: scenario.msel, state, minutes: 0 })
  },
})
