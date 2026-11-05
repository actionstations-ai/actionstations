// classroom:* (#718, ADR-0090): course set-up, roster and seats. Student records stay in
// <project>/classroom/; nothing here uses the network.
import { CLASSROOM_NOTICE } from '@shared/schemas'
import { AppError } from '../../lib/errors'
import { newId } from '../../lib/ids'
import {
  addStudents,
  deleteStudents,
  deleteTerm,
  readCourse,
  requireClassroom,
  setClassroomEnabled,
  updateClassroomFile,
} from '../../classroom/store'
import { previewRoster } from '../../classroom/roster-import'
import { loadProject } from '../../project/store'
import { requireProject } from '../../project/guard'
import { defineHandlers } from '../registry'

async function state(root: string) {
  const project = await loadProject(root)
  return {
    enabled: project.classroom?.enabled === true,
    noticeAcceptedAt: project.classroom?.noticeAcceptedAt,
    notice: CLASSROOM_NOTICE,
    course: await readCourse(root),
  }
}

/** Every handler except get and set-enabled needs Classroom on. */
async function classroomRoot(projectPath: string): Promise<string> {
  const root = await requireProject(projectPath)
  await requireClassroom(root)
  return root
}

export default defineHandlers({
  'classroom:get': async ({ projectPath }) => state(await requireProject(projectPath)),

  'classroom:set-enabled': async ({ projectPath, enabled }) => {
    const root = await requireProject(projectPath)
    await setClassroomEnabled(root, enabled)
    return state(root)
  },

  'classroom:set-course': async ({ projectPath, name, term, sections }) => {
    const root = await classroomRoot(projectPath)
    await updateClassroomFile(root, 'course', (file) => {
      const next = sections.map((s) => ({ id: s.id ?? newId(), name: s.name }))
      const kept = new Set(next.map((s) => s.id))
      const orphaned = file.students.some((st) => !kept.has(st.sectionId))
      if (orphaned)
        throw new AppError('VALIDATION', 'Move or delete a section’s students before removing it.')
      file.course = { id: file.course?.id ?? newId(), name, term }
      file.sections = next
    })
    return state(root)
  },

  'classroom:add-student': async ({ projectPath, sectionId, ...student }) => {
    const root = await classroomRoot(projectPath)
    await addStudents(root, sectionId, [student])
    return state(root)
  },

  'classroom:roster-preview': async ({ projectPath, csv }) => {
    const root = await classroomRoot(projectPath)
    const { students } = await readCourse(root)
    return previewRoster(csv, students)
  },

  'classroom:roster-import': async ({ projectPath, sectionId, csv }) => {
    const root = await classroomRoot(projectPath)
    const { students } = await readCourse(root)
    const preview = previewRoster(csv, students)
    await addStudents(root, sectionId, preview.rows)
    return state(root)
  },

  'classroom:delete-students': async ({ projectPath, studentIds }) => {
    const root = await classroomRoot(projectPath)
    await deleteStudents(root, studentIds)
    return state(root)
  },

  'classroom:delete-term': async ({ projectPath }) => {
    const root = await classroomRoot(projectPath)
    await deleteTerm(root)
    return state(root)
  },

  'classroom:set-session': async ({ projectPath, session }) => {
    const root = await classroomRoot(projectPath)
    await updateClassroomFile(root, 'course', (file) => {
      const known = new Set(file.students.map((s) => s.id))
      if (!file.sections.some((s) => s.id === session.sectionId))
        throw new AppError('NOT_FOUND', 'No such section.')
      if (Object.values(session.seats).some((id) => !known.has(id)))
        throw new AppError('VALIDATION', 'A seat names a student who is not on the roster.')
      file.sessions = [...file.sessions.filter((s) => s.scenarioId !== session.scenarioId), session]
    })
    return state(root)
  },
})
