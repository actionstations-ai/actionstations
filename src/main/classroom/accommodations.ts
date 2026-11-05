// Accommodations per student (#739). Stored in classroom/accommodations.json with the other
// student records: never in scenario files, the AAR, shared exports or the dashboard (a count only).
import { describeAccommodation, hasAdjustment } from '@shared/classroom/accommodations'
import type { Accommodation } from '@shared/schemas'
import { AppError } from '../lib/errors'
import { readClassroomFile, readCourse, updateClassroomFile } from './store'

export async function listAccommodations(root: string): Promise<Accommodation[]> {
  return (await readClassroomFile(root, 'accommodations')).accommodations
}

/** Save one student's record; a record that changes nothing removes the entry. */
export async function setAccommodation(root: string, acc: Accommodation): Promise<Accommodation[]> {
  if (!(await readCourse(root)).students.some((s) => s.id === acc.studentId))
    throw new AppError('NOT_FOUND', 'That student is not on the roster.')
  const file = await updateClassroomFile(root, 'accommodations', (f) => {
    f.accommodations = f.accommodations.filter((a) => a.studentId !== acc.studentId)
    if (hasAdjustment(acc)) f.accommodations.push(acc)
  })
  return file.accommodations
}

/** The adjustments to remember at set-up, for the students seated in a session. */
export async function sessionAccommodations(root: string, scenarioId: string) {
  const course = await readCourse(root)
  const seated = new Set(
    Object.values(course.sessions.find((s) => s.scenarioId === scenarioId)?.seats ?? {}),
  )
  const names = new Map(course.students.map((s) => [s.id, s.name]))
  return (await listAccommodations(root))
    .filter((a) => seated.has(a.studentId))
    .map((a) => ({
      studentId: a.studentId,
      name: names.get(a.studentId) ?? a.studentId,
      lines: describeAccommodation(a),
    }))
}
