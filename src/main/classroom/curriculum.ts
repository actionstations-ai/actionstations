// Outcomes, mappings and rubrics of a course (#720, #722). Pure edits of classroom/course.json
// under the store's queue; the IPC handlers stay thin.
import type { ClassroomCourseFile, ClassroomRubric, Outcome, OutcomeMapping } from '@shared/schemas'
import {
  exportOutcomeSet,
  importOutcomeSet,
  importRubrics,
  STARTER_RUBRICS,
} from '@shared/classroom/io'
import { AppError } from '../lib/errors'
import { newId } from '../lib/ids'
import { updateClassroomFile } from './store'

type Course = ClassroomCourseFile

/** Remove everything that points at an outcome that no longer exists. */
function dropDanglingOutcomeRefs(file: Course): void {
  const ids = new Set(file.outcomes.map((o) => o.id))
  file.mappings = file.mappings.filter((m) => ids.has(m.outcomeId))
  for (const rubric of file.rubrics)
    for (const c of rubric.criteria) c.outcomeIds = c.outcomeIds.filter((id) => ids.has(id))
}

function checkCodes(outcomes: Outcome[]): void {
  const codes = new Set<string>()
  for (const o of outcomes) {
    const code = o.code.toLowerCase()
    if (codes.has(code)) throw new AppError('VALIDATION', `Two outcomes use the code ${o.code}.`)
    codes.add(code)
  }
}

export function setOutcomes(
  root: string,
  outcomes: Array<Omit<Outcome, 'id'> & { id?: string }>,
): Promise<Course> {
  const next = outcomes.map((o) => ({ ...o, id: o.id ?? newId() }))
  checkCodes(next)
  return updateClassroomFile(root, 'course', (file) => {
    file.outcomes = next
    dropDanglingOutcomeRefs(file)
  })
}

export function importOutcomes(
  root: string,
  json: string,
  mode: 'replace' | 'add',
): Promise<Course> {
  const set = parseOr(() => importOutcomeSet(json))
  return updateClassroomFile(root, 'course', (file) => {
    const taken = new Set(file.outcomes.map((o) => o.code.toLowerCase()))
    const incoming =
      mode === 'replace'
        ? set.outcomes
        : set.outcomes.filter((o) => !taken.has(o.code.toLowerCase()))
    file.outcomes = (mode === 'replace' ? [] : file.outcomes).concat(
      incoming.map((o) => ({ ...o, id: newId() })),
    )
    checkCodes(file.outcomes)
    dropDanglingOutcomeRefs(file)
  })
}

export const outcomesFile = (file: Course) => ({
  json: exportOutcomeSet(file.course?.name ?? 'Outcomes', file.outcomes),
  fileName: 'learning-outcomes.json',
})

/** Mappings belonging to one scenario are replaced; others are kept. */
export function setMappings(
  root: string,
  scenarioId: string,
  mappings: OutcomeMapping[],
): Promise<Course> {
  return updateClassroomFile(root, 'course', (file) => {
    const ids = new Set(file.outcomes.map((o) => o.id))
    if (mappings.some((m) => !ids.has(m.outcomeId)))
      throw new AppError('VALIDATION', 'A mapping names an outcome that is not in the course.')
    file.mappings = [
      ...file.mappings.filter((m) => m.scenarioId !== scenarioId),
      ...mappings.map((m) => ({ ...m, scenarioId })),
    ]
  })
}

function checkRubric(file: Course, rubric: ClassroomRubric): void {
  const ids = new Set(file.outcomes.map((o) => o.id))
  for (const c of rubric.criteria)
    if (c.outcomeIds.some((id) => !ids.has(id)))
      throw new AppError(
        'VALIDATION',
        `Criterion “${c.name}” names an outcome that is not in the course.`,
      )
  const criterionIds = new Set(rubric.criteria.map((c) => c.id))
  if (criterionIds.size !== rubric.criteria.length)
    throw new AppError('VALIDATION', 'Two criteria share an id.')
}

export function saveRubric(root: string, rubric: ClassroomRubric): Promise<Course> {
  return updateClassroomFile(root, 'course', (file) => {
    checkRubric(file, rubric)
    file.rubrics = [...file.rubrics.filter((r) => r.id !== rubric.id), rubric]
  })
}

export function deleteRubric(root: string, rubricId: string): Promise<Course> {
  return updateClassroomFile(root, 'course', (file) => {
    file.rubrics = file.rubrics.filter((r) => r.id !== rubricId)
    for (const s of file.sessions) s.rubricIds = s.rubricIds.filter((id) => id !== rubricId)
  })
}

/** Add rubrics from a list; an id already in the course gets a new one so nothing is overwritten. */
function addRubrics(file: Course, rubrics: ClassroomRubric[]): void {
  const taken = new Set(file.rubrics.map((r) => r.id))
  for (const r of rubrics) {
    const id = taken.has(r.id) ? newId() : r.id
    taken.add(id)
    file.rubrics.push({
      ...structuredClone(r),
      id,
      criteria: r.criteria.map((c) => ({ ...c, outcomeIds: [] })),
    })
  }
}

export function addStarterRubrics(root: string): Promise<Course> {
  return updateClassroomFile(root, 'course', (file) => {
    const have = new Set(file.rubrics.map((r) => r.id))
    addRubrics(
      file,
      STARTER_RUBRICS.filter((r) => !have.has(r.id)),
    )
  })
}

export function importRubricJson(root: string, json: string): Promise<Course> {
  const rubrics = parseOr(() => importRubrics(json))
  return updateClassroomFile(root, 'course', (file) => addRubrics(file, rubrics))
}

function parseOr<T>(run: () => T): T {
  try {
    return run()
  } catch (e) {
    throw new AppError('VALIDATION', (e as Error).message)
  }
}
