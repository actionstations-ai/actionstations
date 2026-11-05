// Classroom records (#718, spec 0453, ADR-0090): four JSON files under <project>/classroom/.
// Student names, scores, evidence and accommodations live only here: never in scenario files,
// exercise bundles, pack exports or a duplicated project. Each file is written atomically and
// updates run one at a time per file so two quick taps both land.
import type { z } from 'zod'
import {
  CLASSROOM_DIR,
  ClassroomAccommodationsFile,
  ClassroomCourseFile,
  ClassroomEvidenceFile,
  ClassroomScoresFile,
  CLASSROOM_LIMITS,
  type Student,
} from '@shared/schemas'
import { AppError } from '../lib/errors'
import { newId, nowIso } from '../lib/ids'
import { ensureDir, readJsonOr, safeJoin, writeJsonAtomic } from '../lib/fs'
import { loadProject, updateProject } from '../project/store'

type FileKind = 'course' | 'evidence' | 'scores' | 'accommodations'

const SCHEMAS = {
  course: ClassroomCourseFile,
  evidence: ClassroomEvidenceFile,
  scores: ClassroomScoresFile,
  accommodations: ClassroomAccommodationsFile,
} as const

type FileOf<K extends FileKind> = z.output<(typeof SCHEMAS)[K]>

const pathOf = (root: string, kind: FileKind): string =>
  safeJoin(root, CLASSROOM_DIR, `${kind}.json`)

const empty = <K extends FileKind>(kind: K): FileOf<K> =>
  SCHEMAS[kind].parse({ updatedAt: nowIso() }) as FileOf<K>

export async function readClassroomFile<K extends FileKind>(
  root: string,
  kind: K,
): Promise<FileOf<K>> {
  return (await readJsonOr(pathOf(root, kind), SCHEMAS[kind], () => empty(kind))) as FileOf<K>
}

const queues = new Map<string, Promise<unknown>>()

/** Read-modify-write one file under its queue. The callback may mutate a clone and return it. */
export async function updateClassroomFile<K extends FileKind>(
  root: string,
  kind: K,
  change: (file: FileOf<K>) => FileOf<K> | void,
): Promise<FileOf<K>> {
  const key = `${root}\0${kind}`
  const prev = queues.get(key) ?? Promise.resolve()
  const run = prev
    .catch(() => undefined)
    .then(async () => {
      const current = await readClassroomFile(root, kind)
      const draft = structuredClone(current)
      const next = SCHEMAS[kind].parse({ ...(change(draft) ?? draft), updatedAt: nowIso() })
      await ensureDir(safeJoin(root, CLASSROOM_DIR))
      await writeJsonAtomic(pathOf(root, kind), next)
      return next as FileOf<K>
    })
  queues.set(key, run)
  try {
    return await run
  } finally {
    if (queues.get(key) === run) queues.delete(key)
  }
}

export async function isClassroomOn(root: string): Promise<boolean> {
  return (await loadProject(root)).classroom?.enabled === true
}

/** Throws unless Classroom mode is on (ADR-0090: names exist only in Classroom mode). */
export async function requireClassroom(root: string): Promise<void> {
  if (!(await isClassroomOn(root)))
    throw new AppError('FORBIDDEN', 'Turn on Classroom mode for this project first.')
}

/** Turning it on records the notice acceptance; turning it off keeps the records in place. */
export async function setClassroomEnabled(root: string, enabled: boolean): Promise<void> {
  await updateProject(root, (p) => {
    const was = p.classroom
    p.classroom = {
      enabled,
      noticeAcceptedAt: enabled ? (was?.noticeAcceptedAt ?? nowIso()) : was?.noticeAcceptedAt,
    }
  })
}

export const readCourse = (root: string) => readClassroomFile(root, 'course')

function requireSection(file: FileOf<'course'>, sectionId: string): void {
  if (!file.sections.some((s) => s.id === sectionId))
    throw new AppError('NOT_FOUND', `No such section: ${sectionId}`)
}

export function addStudents(
  root: string,
  sectionId: string,
  students: Array<Pick<Student, 'name' | 'institutionId' | 'email'>>,
): Promise<FileOf<'course'>> {
  return updateClassroomFile(root, 'course', (file) => {
    requireSection(file, sectionId)
    if (file.students.length + students.length > CLASSROOM_LIMITS.students)
      throw new AppError(
        'VALIDATION',
        `A project holds up to ${CLASSROOM_LIMITS.students} students.`,
      )
    for (const s of students) file.students.push({ id: newId(), sectionId, ...s })
  })
}

/**
 * Remove every record about one student (FR-12): roster entry, seat assignments, rotation
 * entries, evidence, scores and accommodations, and the observation links.
 */
export async function deleteStudents(root: string, studentIds: string[]): Promise<void> {
  const gone = new Set(studentIds)
  await updateClassroomFile(root, 'course', (file) => {
    file.students = file.students.filter((s) => !gone.has(s.id))
    for (const session of file.sessions)
      session.seats = Object.fromEntries(
        Object.entries(session.seats).filter(([, student]) => !gone.has(student)),
      )
    for (const plan of file.rotations)
      for (const s of plan.sessions)
        s.assignments = Object.fromEntries(
          Object.entries(s.assignments).filter(([student]) => !gone.has(student)),
        )
  })
  await updateClassroomFile(root, 'evidence', (f) => {
    f.evidence = f.evidence.filter((e) => !gone.has(e.studentId))
  })
  await updateClassroomFile(root, 'scores', (f) => {
    f.scores = f.scores.filter((s) => !gone.has(s.studentId))
  })
  await updateClassroomFile(root, 'accommodations', (f) => {
    f.accommodations = f.accommodations.filter((a) => !gone.has(a.studentId))
  })
}

/** Delete a whole term: every student, then the course record itself. Outcomes and rubrics stay. */
export async function deleteTerm(root: string): Promise<void> {
  const { students } = await readCourse(root)
  await deleteStudents(
    root,
    students.map((s) => s.id),
  )
  await updateClassroomFile(root, 'course', (file) => {
    file.sections = []
    file.sessions = []
    file.rotations = []
    delete file.course
  })
}
