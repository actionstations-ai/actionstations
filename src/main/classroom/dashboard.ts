// Instructor dashboard (#736, spec 0453 FR-10, FR-13): outcome attainment, score distributions,
// role coverage, practice versus graded runs, missing evidence, reliability and participation.
// Every figure is also a table with a CSV; practice runs write nothing to attainment or
// distributions. Accommodations appear as a count only.
import { participation } from '@shared/classroom/equity'
import { lowestAgreement, reliability, type RatingCell } from '@shared/classroom/reliability'
import { unplayedRoles } from '@shared/classroom/rotation'
import type { ClassroomCourseFile, Evidence } from '@shared/schemas'
import type { Dashboard, DashboardSection, DashboardTable } from '@shared/ipc/classroom-dashboard'
import type { ScoringView } from '@shared/ipc/classroom-scoring'
import { toCsv } from '../export/csv'
import { readClassroomFile, readCourse } from './store'
import { scoringView } from './scoring'

const pct = (n: number | null): string => (n === null ? 'n/a' : `${Math.round(n * 1000) / 10}%`)
const num = (n: number | null): string =>
  n === null ? 'n/a' : (Math.round(n * 100) / 100).toString()

function table(id: string, title: string, header: string[], rows: string[][]): DashboardTable {
  return { id, title, header, rows, csv: toCsv(header, rows) }
}

type Section = ClassroomCourseFile['sections'][number]

async function viewsFor(root: string, course: ClassroomCourseFile, section: Section) {
  const sessions = course.sessions.filter((s) => s.sectionId === section.id)
  const views: ScoringView[] = []
  for (const s of sessions) views.push(await scoringView(root, s.scenarioId, section.id))
  return { graded: views.filter((v) => !v.practice), practice: views.filter((v) => v.practice) }
}

function attainmentRows(course: ClassroomCourseFile, section: Section, graded: ScoringView[]) {
  const students = course.students.filter((s) => s.sectionId === section.id)
  return course.outcomes.map((o) => {
    let assessed = 0
    let attained = 0
    for (const st of students) {
      const fractions = graded.flatMap(
        (v) =>
          v.students.find((x) => x.studentId === st.id)?.outcomes.find((x) => x.outcomeId === o.id)
            ?.fraction ?? [],
      )
      if (fractions.length === 0) continue
      assessed++
      if (fractions.reduce((a, b) => a + b, 0) / fractions.length >= course.attainmentThreshold)
        attained++
    }
    return [o.code, String(assessed), String(attained), pct(assessed ? attained / assessed : null)]
  })
}

function distributionRows(graded: ScoringView[]): string[][] {
  const edges = [0, 0.2, 0.4, 0.6, 0.8, 1.0001]
  const buckets = new Array<number>(5).fill(0)
  const byStudent = new Map<string, number[]>()
  for (const v of graded)
    for (const st of v.students) {
      const fr = st.totals
        .filter((t) => t.complete)
        .map((t) => t.fraction)
        .filter((f): f is number => f !== null)
      if (fr.length) byStudent.set(st.studentId, [...(byStudent.get(st.studentId) ?? []), ...fr])
    }
  for (const fr of byStudent.values()) {
    const mean = fr.reduce((a, b) => a + b, 0) / fr.length
    buckets[edges.findIndex((e, i) => mean >= e && mean < edges[i + 1]!)]!++
  }
  const label = (i: number) => `${i * 20}% to ${i === 4 ? 100 : i * 20 + 20 - 1}%`
  return buckets.map((n, i) => [label(i), String(n)])
}

function missingEvidence(graded: ScoringView[]): number {
  let n = 0
  for (const v of graded)
    for (const st of v.students)
      for (const c of st.cells) if (c.level !== null && c.evidence.length === 0) n++
  return n
}

function sectionRotation(course: ClassroomCourseFile, section: Section): DashboardTable | null {
  const plan = course.rotations.find((r) => r.sectionId === section.id)
  if (!plan) return null
  const rows = course.students
    .filter((s) => s.sectionId === section.id)
    .map((s) => [s.name, unplayedRoles(plan.roles, plan.sessions, s.id).join(', ') || 'None'])
  return table(
    `rotation-${section.id}`,
    'Roles each student has not played in the plan',
    ['Student', 'Not yet played'],
    rows,
  )
}

function sectionParticipation(course: ClassroomCourseFile, section: Section, evidence: Evidence[]) {
  const ids = course.students.filter((s) => s.sectionId === section.id).map((s) => s.id)
  const sessions = new Set(
    course.sessions
      .filter((s) => s.sectionId === section.id && !s.practice)
      .map((s) => s.scenarioId),
  )
  const counts = new Map<string, number>()
  for (const e of evidence)
    if ((e.kind === 'decision' || e.kind === 'hotwash') && sessions.has(e.scenarioId))
      counts.set(e.studentId, (counts.get(e.studentId) ?? 0) + e.count)
  const p = participation(ids, counts)
  const name = new Map(course.students.map((s) => [s.id, s.name]))
  return {
    rows: p.rows.map((r) => ({
      name: name.get(r.studentId) ?? r.studentId,
      count: r.count,
      share: r.share,
      ratio: r.ratio,
      belowHalf: r.belowHalf,
    })),
    belowHalfCount: p.belowHalfCount,
    caveat: p.caveat,
  }
}

async function buildSection(
  root: string,
  course: ClassroomCourseFile,
  section: Section,
  evidence: Evidence[],
  accommodationCount: number,
): Promise<DashboardSection> {
  const { graded, practice } = await viewsFor(root, course, section)
  const students = course.students.filter((s) => s.sectionId === section.id)
  const scored = new Set(
    graded.flatMap((v) =>
      v.students.filter((s) => s.cells.some((c) => c.level !== null)).map((s) => s.studentId),
    ),
  )
  const part = sectionParticipation(course, section, evidence)
  const tables = [
    table(
      `attainment-${section.id}`,
      `Outcome attainment (threshold ${Math.round(course.attainmentThreshold * 100)}% of top points)`,
      ['Outcome', 'Students assessed', 'At or above threshold', 'Share'],
      attainmentRows(course, section, graded),
    ),
    table(
      `distribution-${section.id}`,
      'Score distribution (mean score per student, completely scored rubrics only)',
      ['Range', 'Students'],
      distributionRows(graded),
    ),
    table(
      `participation-${section.id}`,
      'Participation against an even share (instructor aid, not a grade)',
      ['Student', 'Contributions', 'Share', 'Ratio to even share'],
      part.rows.map((r) => [r.name, String(r.count), pct(r.share), num(r.ratio)]),
    ),
  ]
  const rotation = sectionRotation(course, section)
  if (rotation) tables.push(rotation)
  return {
    sectionId: section.id,
    name: section.name,
    students: students.length,
    gradedRuns: graded.length,
    practiceRuns: practice.length,
    accommodations: accommodationCount,
    noScore: students.filter((s) => !scored.has(s.id)).map((s) => s.name),
    missingEvidence: missingEvidence(graded),
    participation: part,
    tables,
  }
}

function ratingCells(course: ClassroomCourseFile, evidence: Evidence[]) {
  const graded = new Set(course.sessions.filter((s) => !s.practice).map((s) => s.scenarioId))
  const all: RatingCell[] = []
  const byCriterion = new Map<string, RatingCell[]>()
  for (const e of evidence) {
    if (e.kind !== 'observation' || e.levelIndex === undefined || !e.evaluator || !e.criterionId)
      continue
    if (!graded.has(e.scenarioId)) continue
    const cell = {
      raterId: e.evaluator,
      itemId: `${e.studentId}|${e.scenarioId}|${e.criterionId}`,
      level: e.levelIndex,
    }
    all.push(cell)
    byCriterion.set(e.criterionId, [...(byCriterion.get(e.criterionId) ?? []), cell])
  }
  return { all, byCriterion }
}

function buildReliability(
  course: ClassroomCourseFile,
  evidence: Evidence[],
): Dashboard['reliability'] {
  const { all, byCriterion } = ratingCells(course, evidence)
  const levelCount = Math.max(
    3,
    ...course.rubrics.flatMap((r) => r.criteria.map((c) => c.levels.length)),
  )
  const r = reliability(all, levelCount)
  const nameOf = (id: string) =>
    course.rubrics.flatMap((x) => x.criteria).find((c) => c.id === id)?.name ?? id
  const lowest = lowestAgreement(byCriterion).map((l) => ({
    criterion: nameOf(l.criterionId),
    exact: l.exact,
    pairs: l.pairs,
  }))
  const header = ['Measure', 'Value']
  const rows = [
    ['Raters', String(r.raters)],
    ['Paired ratings', String(r.pairs)],
    ['Exact agreement', pct(r.exact)],
    ['Within one level', pct(r.withinOne)],
    ['Weighted kappa (two raters)', num(r.kappa)],
    ['Intraclass correlation (three or more raters)', num(r.icc)],
    ...lowest.map((l) => [
      `Lowest agreement: ${l.criterion}`,
      `${pct(l.exact)} over ${l.pairs} pairs`,
    ]),
  ]
  return {
    raters: r.raters,
    pairs: r.pairs,
    exact: r.exact,
    withinOne: r.withinOne,
    kappa: r.kappa,
    icc: r.icc,
    caveat: r.caveat,
    lowest,
    table: table('reliability', 'Rubric reliability between evaluators', header, rows),
  }
}

export async function buildDashboard(root: string): Promise<Dashboard> {
  const course = await readCourse(root)
  const { evidence } = await readClassroomFile(root, 'evidence')
  const { accommodations } = await readClassroomFile(root, 'accommodations')
  const sections: DashboardSection[] = []
  for (const section of course.sections) {
    const ids = new Set(course.students.filter((s) => s.sectionId === section.id).map((s) => s.id))
    const count = accommodations.filter((a) => ids.has(a.studentId)).length
    sections.push(await buildSection(root, course, section, evidence, count))
  }
  return {
    threshold: course.attainmentThreshold,
    sections,
    reliability: buildReliability(course, evidence),
  }
}
