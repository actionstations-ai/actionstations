// classroom:* gradebook export, dashboard and accommodations (#733, #736, #739). Nothing here uses
// the network; the CSV is built in memory and the instructor saves it.
import { AppError } from '../../lib/errors'
import {
  listAccommodations,
  sessionAccommodations,
  setAccommodation,
} from '../../classroom/accommodations'
import { buildDashboard } from '../../classroom/dashboard'
import { scoringView } from '../../classroom/scoring'
import { classroomRoot } from '../../classroom/state'
import { readCourse } from '../../classroom/store'
import { buildGradebook, GRADEBOOK_LAYOUTS } from '../../export/gradebook-csv'
import { listScenarios } from '../../scenario/manage'
import { defineHandlers } from '../registry'

export default defineHandlers({
  'classroom:gradebook': async ({ projectPath, sectionId, ...options }) => {
    const root = await classroomRoot(projectPath)
    const course = await readCourse(root)
    if (!course.sections.some((s) => s.id === sectionId))
      throw new AppError('NOT_FOUND', 'No such section.')
    const sessions = course.sessions.filter((s) => s.sectionId === sectionId)
    const views = await Promise.all(sessions.map((s) => scoringView(root, s.scenarioId, sectionId)))
    const scenarios = await listScenarios(root)
    const result = buildGradebook(course, views, scenarios, { sectionId, ...options })
    return {
      ...result,
      layouts: GRADEBOOK_LAYOUTS.map(({ id, name, note }) => ({ id, name, note })),
    }
  },

  'classroom:dashboard': async ({ projectPath }) =>
    buildDashboard(await classroomRoot(projectPath)),

  'classroom:accommodations': async ({ projectPath }) =>
    listAccommodations(await classroomRoot(projectPath)),

  'classroom:set-accommodation': async ({ projectPath, accommodation }) =>
    setAccommodation(await classroomRoot(projectPath), accommodation),

  'classroom:session-accommodations': async ({ projectPath, scenarioId }) =>
    sessionAccommodations(await classroomRoot(projectPath), scenarioId),
})
