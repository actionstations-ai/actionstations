// Gradebook CSV export (#733, spec 0453 FR-8). One row per student of a section; columns for the
// points per assignment, optional per-outcome and per-criterion columns, optional short comments.
// Layouts are data (gradebook-layouts.json). Only the generic layout ships: a layout named for a
// learning management system is added only after its current import rules have been checked.
// Practice runs are excluded. Nothing is sent anywhere; the CSV is an export the instructor
// saves (grades are education records held by the institution).
import type { ClassroomCourseFile } from '@shared/schemas'
import type { ScoringView } from '@shared/ipc/classroom-scoring'
import layoutFile from './gradebook-layouts.json'
import { toCsv } from './csv'

export interface GradebookLayout {
  id: string
  name: string
  note: string
  columns: Record<
    'identifier' | 'name' | 'email' | 'assignment' | 'total' | 'outcome' | 'criterion' | 'comment',
    string
  >
}

export const GRADEBOOK_LAYOUTS: GradebookLayout[] = layoutFile.layouts

export interface GradebookOptions {
  sectionId: string
  layoutId: string
  includeOutcomes: boolean
  includeCriteria: boolean
  includeComments: boolean
}

export type GradebookWarning =
  | { kind: 'no-score'; student: string; scenario: string }
  | { kind: 'missing-id'; student: string }
  | { kind: 'practice-excluded'; scenario: string }
  | { kind: 'no-students' }

export interface GradebookExport {
  header: string[]
  rows: string[][]
  csv: string
  warnings: GradebookWarning[]
  fileName: string
}

const fill = (template: string, values: Record<string, string>): string =>
  template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '')

const round1 = (n: number): string => (Math.round(n * 10) / 10).toString()

type Titled = { id: string; title: string }

export function buildGradebook(
  course: ClassroomCourseFile,
  views: ScoringView[],
  scenarios: Titled[],
  options: GradebookOptions,
): GradebookExport {
  const layout = GRADEBOOK_LAYOUTS.find((l) => l.id === options.layoutId) ?? GRADEBOOK_LAYOUTS[0]!
  const title = (id: string) => scenarios.find((s) => s.id === id)?.title ?? id
  const warnings: GradebookWarning[] = []
  const graded = views.filter((v) => {
    if (v.practice) warnings.push({ kind: 'practice-excluded', scenario: title(v.scenarioId) })
    return !v.practice
  })
  const students = course.students.filter((s) => s.sectionId === options.sectionId)
  if (students.length === 0) warnings.push({ kind: 'no-students' })
  const header = headerFor(layout, course, graded, title, options)
  const rows = students.map((s) => rowFor(s, layout, course, graded, title, options, warnings))
  return {
    header,
    rows,
    csv: toCsv(header, rows),
    warnings,
    fileName: `gradebook-${options.sectionId}.csv`,
  }
}

function headerFor(
  layout: GradebookLayout,
  course: ClassroomCourseFile,
  views: ScoringView[],
  title: (id: string) => string,
  o: GradebookOptions,
): string[] {
  const c = layout.columns
  const header = [c.identifier, c.name, c.email]
  for (const v of views) {
    header.push(fill(c.assignment, { title: title(v.scenarioId) }))
    if (o.includeCriteria)
      for (const r of usedRubrics(course, v))
        for (const k of r.criteria)
          header.push(
            fill(c.criterion, { rubric: r.name, criterion: k.name }) + ` [${title(v.scenarioId)}]`,
          )
    if (o.includeComments) header.push(fill(c.comment, { title: title(v.scenarioId) }))
  }
  header.push(c.total)
  if (o.includeOutcomes)
    for (const out of course.outcomes) header.push(fill(c.outcome, { code: out.code }))
  return header
}

const usedRubrics = (course: ClassroomCourseFile, v: ScoringView) =>
  course.rubrics.filter((r) => v.rubricIds.includes(r.id))

function rowFor(
  student: ClassroomCourseFile['students'][number],
  layout: GradebookLayout,
  course: ClassroomCourseFile,
  views: ScoringView[],
  title: (id: string) => string,
  o: GradebookOptions,
  warnings: GradebookWarning[],
): string[] {
  if (!student.institutionId) warnings.push({ kind: 'missing-id', student: student.name })
  const row = [student.institutionId ?? '', student.name, student.email ?? '']
  let total = 0
  let anyScore = false
  const outcomeFractions = new Map<string, number[]>()
  for (const v of views) {
    const sv = v.students.find((x) => x.studentId === student.id)
    const scored = sv?.cells.some((c) => c.level !== null) ?? false
    const points = sv ? sv.totals.reduce((s, t) => s + t.points, 0) : 0
    row.push(scored ? String(points) : '')
    if (scored) {
      total += points
      anyScore = true
    } else warnings.push({ kind: 'no-score', student: student.name, scenario: title(v.scenarioId) })
    if (o.includeCriteria) row.push(...criterionCells(course, v, sv))
    if (o.includeComments)
      row.push(
        (
          sv?.cells
            .map((c) => c.comment)
            .filter(Boolean)
            .join(' ') ?? ''
        ).slice(0, 500),
      )
    for (const out of sv?.outcomes ?? [])
      if (out.fraction !== null)
        outcomeFractions.set(out.outcomeId, [
          ...(outcomeFractions.get(out.outcomeId) ?? []),
          out.fraction,
        ])
  }
  row.push(anyScore ? String(total) : '')
  if (o.includeOutcomes)
    for (const out of course.outcomes) {
      const f = outcomeFractions.get(out.id)
      row.push(f?.length ? round1((f.reduce((a, b) => a + b, 0) / f.length) * 100) : '')
    }
  return row
}

function criterionCells(
  course: ClassroomCourseFile,
  v: ScoringView,
  sv: ScoringView['students'][number] | undefined,
): string[] {
  return usedRubrics(course, v).flatMap((r) =>
    r.criteria.map((k) => {
      const cell = sv?.cells.find((c) => c.rubricId === r.id && c.criterionId === k.id)
      return cell?.level == null ? '' : String(k.levels[cell.level]?.points ?? '')
    }),
  )
}
