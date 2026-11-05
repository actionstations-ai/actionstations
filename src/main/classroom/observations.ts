// Student-linked observations (#718, ADR-0090). The anonymous observation goes to
// evaluation.json exactly as before; the link to a student is an evidence entry in
// classroom/evidence.json. Everything that reads evaluation.json (the AAR, the live dashboard,
// program snapshots, exports) therefore never sees a student id.
import {
  STUDENT_ID_NEEDS_CLASSROOM,
  type EvaluationRecord,
  type Observation,
} from '@shared/schemas'
import { AppError } from '../lib/errors'
import { newId } from '../lib/ids'
import { removeObservation, upsertObservation } from '../evaluation/store'
import { isClassroomOn, readCourse, updateClassroomFile } from './store'

/** Save an observation; with a `studentId` the project must have Classroom on and know the student. */
export async function observeForStudent(
  root: string,
  scenarioId: string,
  observation: Observation,
): Promise<EvaluationRecord> {
  const { studentId, ...anonymous } = observation
  if (!studentId) return upsertObservation(root, scenarioId, anonymous)
  if (!(await isClassroomOn(root))) throw new AppError('FORBIDDEN', STUDENT_ID_NEEDS_CLASSROOM)
  const { students } = await readCourse(root)
  if (!students.some((s) => s.id === studentId))
    throw new AppError('NOT_FOUND', 'That student is not on the roster.')
  const record = await upsertObservation(root, scenarioId, anonymous)
  await updateClassroomFile(root, 'evidence', (file) => {
    file.evidence = file.evidence.filter(
      (e) => !(e.kind === 'observation' && e.observationId === observation.id),
    )
    file.evidence.push({
      id: newId(),
      kind: 'observation',
      scenarioId,
      studentId,
      criterionId: observation.criterionId,
      observationId: observation.id,
      note: observation.note,
      exerciseTime: observation.exerciseTime,
      injectRef: observation.rowId,
      count: 1,
      at: observation.at,
    })
  })
  return record
}

/** Remove an observation and any student link to it. */
export async function removeObservationAndLinks(
  root: string,
  scenarioId: string,
  observationId: string,
): Promise<EvaluationRecord> {
  const record = await removeObservation(root, scenarioId, observationId)
  if (await isClassroomOn(root))
    await updateClassroomFile(root, 'evidence', (file) => {
      file.evidence = file.evidence.filter(
        (e) => !(e.kind === 'observation' && e.observationId === observationId),
      )
    })
  return record
}
