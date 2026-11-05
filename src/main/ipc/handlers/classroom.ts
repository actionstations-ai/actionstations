// classroom:* (#718, ADR-0090): course set-up, roster and seats. Student records stay in
// <project>/classroom/; nothing here uses the network.
import { AppError } from '../../lib/errors'
import { newId } from '../../lib/ids'
import {
  addStudents,
  deleteStudents,
  deleteTerm,
  readCourse,
  setClassroomEnabled,
  updateClassroomFile,
} from '../../classroom/store'
import { previewRoster } from '../../classroom/roster-import'
import { classroomRoot, classroomState } from '../../classroom/state'
import { requireProject } from '../../project/guard'
import { defineHandlers } from '../registry'

export default defineHandlers({
  'classroom:get': async ({ projectPath }) => classroomState(await requireProject(projectPath)),

  'classroom:set-enabled': async ({ projectPath, enabled }) => {
    const root = await requireProject(projectPath)
    await setClassroomEnabled(root, enabled)
    return classroomState(root)
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
    return classroomState(root)
  },

  'classroom:add-student': async ({ projectPath, sectionId, ...student }) => {
    const root = await classroomRoot(projectPath)
    await addStudents(root, sectionId, [student])
    return classroomState(root)
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
    return classroomState(root)
  },

  'classroom:delete-students': async ({ projectPath, studentIds }) => {
    const root = await classroomRoot(projectPath)
    await deleteStudents(root, studentIds)
    return classroomState(root)
  },

  'classroom:delete-term': async ({ projectPath }) => {
    const root = await classroomRoot(projectPath)
    await deleteTerm(root)
    return classroomState(root)
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
    return classroomState(root)
  },
})
