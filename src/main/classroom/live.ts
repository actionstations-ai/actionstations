// Classroom in live play (#724, #739, ADR-0090). Three jobs, all on the controller:
//   1. the roster an evaluator device may name (empty unless Classroom is on),
//   2. the student behind a seat, to attribute a reflection and to find that student's time
//      multiplier,
//   3. turning a classroom reflection survey response into evidence for that student.
// A seat maps to a student by the session's seat table (seat id = the role id, one student per
// role), else by the device's display name matching one roster name exactly. A seat that matches
// nobody is not attributed; nothing is guessed.
import type { Survey, SurveyResponse } from '@shared/schemas'
import { newId, nowIso } from '../lib/ids'
import { listAccommodations } from './accommodations'
import { isClassroomOn, readCourse, updateClassroomFile } from './store'

export interface SeatLike {
  roleId?: string
  displayName?: string
}

/** The students an evaluator may attach an observation to, or [] when Classroom is off. */
export async function classroomStudentsFor(
  root: string,
  scenarioId: string,
): Promise<Array<{ id: string; name: string }>> {
  if (!(await isClassroomOn(root))) return []
  const course = await readCourse(root)
  const session = course.sessions.find((s) => s.scenarioId === scenarioId)
  const seated = new Set(Object.values(session?.seats ?? {}))
  const pool = course.students.filter(
    (s) =>
      (!session || s.sectionId === session.sectionId) && (seated.size === 0 || seated.has(s.id)),
  )
  return pool.map((s) => ({ id: s.id, name: s.name }))
}

/** The student a seat stands for, or undefined. */
export async function studentForSeat(
  root: string,
  scenarioId: string,
  seat: SeatLike,
): Promise<string | undefined> {
  if (!(await isClassroomOn(root))) return undefined
  const course = await readCourse(root)
  const session = course.sessions.find((s) => s.scenarioId === scenarioId)
  const mapped = seat.roleId ? session?.seats[seat.roleId] : undefined
  if (mapped && course.students.some((s) => s.id === mapped)) return mapped
  const name = seat.displayName?.trim().toLowerCase()
  if (!name) return undefined
  const pool = course.students.filter((s) => !session || s.sectionId === session.sectionId)
  const same = pool.filter((s) => s.name.trim().toLowerCase() === name)
  return same.length === 1 ? same[0]!.id : undefined
}

/** The time multiplier that applies to one seat's timed responses; 1 when none. */
export async function timeMultiplierForSeat(
  root: string,
  scenarioId: string,
  seat: SeatLike,
): Promise<number> {
  const studentId = await studentForSeat(root, scenarioId, seat)
  if (!studentId) return 1
  const acc = (await listAccommodations(root)).find((a) => a.studentId === studentId)
  return acc?.timeMultiplier ?? 1
}

function answerText(survey: Survey, response: SurveyResponse): string {
  const questions = new Map(
    survey.sections.flatMap((s) => s.questions).map((q) => [q.id, q.text] as const),
  )
  const show = (v: unknown) => (Array.isArray(v) ? v.join(', ') : String(v ?? ''))
  return Object.entries(response.answers)
    .map(([id, v]) => `${questions.get(id) ?? id} ${show(v)}`.trim())
    .join('\n')
    .slice(0, 4000)
}

/** Store a reflection as evidence for the seat's student. Returns false when nobody matched. */
export async function recordReflection(
  root: string,
  scenarioId: string,
  seat: SeatLike,
  survey: Survey,
  response: SurveyResponse,
): Promise<boolean> {
  const studentId = await studentForSeat(root, scenarioId, seat)
  if (!studentId) return false
  await updateClassroomFile(root, 'evidence', (file) => {
    // A changed answer from the same device replaces the earlier reflection for this survey.
    file.evidence = file.evidence.filter(
      (e) =>
        !(e.kind === 'reflection' && e.studentId === studentId && e.observationId === survey.id),
    )
    file.evidence.push({
      id: newId(),
      kind: 'reflection',
      scenarioId,
      studentId,
      note: answerText(survey, response),
      observationId: survey.id,
      count: 1,
      at: nowIso(),
    })
  })
  return true
}
