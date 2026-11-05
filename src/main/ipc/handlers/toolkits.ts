// toolkits:* (ADR-0074, spec 0448): list the toolkits of the enabled packs with a scenario's
// switches and proposals, and change the scenario's or the project's list. No network calls.
import { requireProject } from '../../project/guard'
import { setProjectToolkits, setScenarioToolkits, toolkitList } from '../../toolkits/scenario'
import { defineHandlers } from '../registry'

export default defineHandlers({
  'toolkits:list': async ({ projectPath, scenarioId }) =>
    toolkitList(await requireProject(projectPath), scenarioId),

  'toolkits:set-scenario': async ({ projectPath, scenarioId, toolkits }) =>
    setScenarioToolkits(await requireProject(projectPath), scenarioId, toolkits),

  'toolkits:set-project': async ({ projectPath, toolkits }) =>
    setProjectToolkits(await requireProject(projectPath), toolkits),
})
