// prep:* (spec 0455 FR-10, #782): coverage of the PREP core components and the exercise record.
import { prepCoverage, writePrepRecord } from '../../exercises/prep'
import { requireProject } from '../../project/guard'
import { defineHandlers } from '../registry'

export default defineHandlers({
  'prep:coverage': async ({ projectPath, scenarioId }) =>
    prepCoverage(await requireProject(projectPath), scenarioId),

  'prep:record': async ({ projectPath, scenarioId }) =>
    writePrepRecord(await requireProject(projectPath), scenarioId),
})
