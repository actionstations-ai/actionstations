// classroom:* outcomes, mappings and rubrics (#720, #722). Nothing here uses the network and
// the mapping proposals are word overlap, not a model.
import { suggestMappings } from '@shared/classroom/suggest'
import { exportRubric } from '@shared/classroom/io'
import { AppError } from '../../lib/errors'
import {
  addStarterRubrics,
  deleteRubric,
  importOutcomes,
  importRubricJson,
  outcomesFile,
  saveRubric,
  setMappings,
  setOutcomes,
} from '../../classroom/curriculum'
import { readCourse } from '../../classroom/store'
import { classroomRoot, classroomState } from '../../classroom/state'
import { getScenario } from '../../scenario/store'
import { defineHandlers } from '../registry'

const withState = async (root: string, change: Promise<unknown>) => {
  await change
  return classroomState(root)
}

export default defineHandlers({
  'classroom:set-outcomes': async ({ projectPath, outcomes }) => {
    const root = await classroomRoot(projectPath)
    return withState(root, setOutcomes(root, outcomes))
  },

  'classroom:import-outcomes': async ({ projectPath, json, mode }) => {
    const root = await classroomRoot(projectPath)
    return withState(root, importOutcomes(root, json, mode))
  },

  'classroom:export-outcomes': async ({ projectPath }) =>
    outcomesFile(await readCourse(await classroomRoot(projectPath))),

  'classroom:suggest-mappings': async ({ projectPath, scenarioId }) => {
    const root = await classroomRoot(projectPath)
    const course = await readCourse(root)
    const scenario = await getScenario(root, scenarioId)
    const own = course.mappings.filter((m) => m.scenarioId === scenarioId)
    const names = new Map(scenario.objectives.map((o) => [o.id, o.name || o.text]))
    return suggestMappings(course.outcomes, scenario.objectives, own).map((s) => ({
      ...s,
      objectiveName: names.get(s.objectiveId) ?? s.objectiveId,
    }))
  },

  'classroom:set-mappings': async ({ projectPath, scenarioId, mappings }) => {
    const root = await classroomRoot(projectPath)
    return withState(root, setMappings(root, scenarioId, mappings))
  },

  'classroom:save-rubric': async ({ projectPath, rubric }) => {
    const root = await classroomRoot(projectPath)
    return withState(root, saveRubric(root, rubric))
  },

  'classroom:delete-rubric': async ({ projectPath, rubricId }) => {
    const root = await classroomRoot(projectPath)
    return withState(root, deleteRubric(root, rubricId))
  },

  'classroom:add-starter-rubrics': async ({ projectPath }) => {
    const root = await classroomRoot(projectPath)
    return withState(root, addStarterRubrics(root))
  },

  'classroom:import-rubrics': async ({ projectPath, json }) => {
    const root = await classroomRoot(projectPath)
    return withState(root, importRubricJson(root, json))
  },

  'classroom:export-rubric': async ({ projectPath, rubricId }) => {
    const root = await classroomRoot(projectPath)
    const rubric = (await readCourse(root)).rubrics.find((r) => r.id === rubricId)
    if (!rubric) throw new AppError('NOT_FOUND', 'No such rubric.')
    return { json: exportRubric(rubric), fileName: `${rubric.id}.rubric.json` }
  },
})
