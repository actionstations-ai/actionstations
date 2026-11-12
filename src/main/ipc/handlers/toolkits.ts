// toolkits:* (ADR-0074, spec 0448): list the toolkits of the enabled packs with a scenario's
// switches and proposals, change the scenario's or the project's list, and show the simulated
// clinical downtime in Facilitate. No network calls.
import { requireProject } from '../../project/guard'
import { setProjectToolkits, setScenarioToolkits, toolkitList } from '../../toolkits/scenario'
import { defineHandlers } from '../registry'
import { downtimeStatus, downtimeView } from '../../toolkits/clinical-systems/play'

export default defineHandlers({
  'toolkits:list': async ({ projectPath, scenarioId }) =>
    toolkitList(await requireProject(projectPath), scenarioId),

  'toolkits:set-scenario': async ({ projectPath, scenarioId, toolkits }) =>
    setScenarioToolkits(await requireProject(projectPath), scenarioId, toolkits),

  'toolkits:set-project': async ({ projectPath, toolkits }) =>
    setProjectToolkits(await requireProject(projectPath), toolkits),

  'toolkits:clinical-downtime': async ({ projectPath, scenarioId, decisions }) => {
    const status = await downtimeStatus(await requireProject(projectPath), scenarioId, decisions)
    return status ? downtimeView(status) : null
  },
})
