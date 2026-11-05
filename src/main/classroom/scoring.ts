// Evidence and scores (#724, #727). Files: classroom/evidence.json and classroom/scores.json.
// The scoring view joins them with the rubrics; the arithmetic is in @shared/classroom/scoring.
import {
  effectiveLevel,
  outcomeScores,
  rubricTotal,
  suggestLevel,
  TEAM_STUDENT_ID,
} from '@shared/classroom/scoring'
import { planRotation } from '@shared/classroom/rotation'
import type { RotationResultView, ScoringCell, ScoringView } from '@shared/ipc/classroom-scoring'
import type { ClassroomRubric, ClassroomCourseFile, Evidence, ScoreEntry } from '@shared/schemas'
import { AppError } from '../lib/errors'
import { newId, nowIso } from '../lib/ids'
import { readClassroomFile, readCourse, updateClassroomFile } from './store'

type EvidenceInput = Omit<Evidence, 'id' | 'at'> & { id?: string; at?: string }

async function requireStudent(root: string, studentId: string): Promise<void> {
  if (studentId === TEAM_STUDENT_ID) return
  if (!(await readCourse(root)).students.some((s) => s.id === studentId))
    throw new AppError('NOT_FOUND', 'That student is not on the roster.')
}

export async function listEvidence(
  root: string,
  scenarioId: string,
  studentId?: string,
): Promise<Evidence[]> {
  const { evidence } = await readClassroomFile(root, 'evidence')
  return evidence.filter(
    (e) => e.scenarioId === scenarioId && (studentId === undefined || e.studentId === studentId),
  )
}

export async function addEvidence(root: string, input: EvidenceInput): Promise<Evidence[]> {
  await requireStudent(root, input.studentId)
  const entry: Evidence = { ...input, id: input.id ?? newId(), at: input.at ?? nowIso() }
  await updateClassroomFile(root, 'evidence', (file) => {
    file.evidence = [...file.evidence.filter((e) => e.id !== entry.id), entry]
  })
  return listEvidence(root, entry.scenarioId)
}

/** Reflections are the student's own words; they are stored as evidence of kind `reflection`. */
export const addReflection = (root: string, input: Omit<EvidenceInput, 'kind'>) =>
  addEvidence(root, { ...input, kind: 'reflection' })

export async function linkEvidence(
  root: string,
  evidenceId: string,
  link: { rubricId: string; criterionId: string; levelIndex?: number },
): Promise<Evidence[]> {
  const course = await readCourse(root)
  const criterion = course.rubrics
    .find((r) => r.id === link.rubricId)
    ?.criteria.find((c) => c.id === link.criterionId)
  if (!criterion) throw new AppError('NOT_FOUND', 'No such rubric criterion.')
  if (link.levelIndex !== undefined && link.levelIndex >= criterion.levels.length)
    throw new AppError('VALIDATION', 'That level is not on the criterion.')
  let scenarioId = ''
  await updateClassroomFile(root, 'evidence', (file) => {
    const e = file.evidence.find((x) => x.id === evidenceId)
    if (!e) throw new AppError('NOT_FOUND', 'No such evidence.')
    scenarioId = e.scenarioId
    e.rubricId = link.rubricId
    e.criterionId = link.criterionId
    if (link.levelIndex !== undefined) e.levelIndex = link.levelIndex
  })
  return listEvidence(root, scenarioId)
}

export async function removeEvidence(root: string, evidenceId: string): Promise<Evidence[]> {
  let scenarioId = ''
  await updateClassroomFile(root, 'evidence', (file) => {
    scenarioId = file.evidence.find((e) => e.id === evidenceId)?.scenarioId ?? ''
    file.evidence = file.evidence.filter((e) => e.id !== evidenceId)
  })
  return scenarioId ? listEvidence(root, scenarioId) : []
}

/** One tap adds one contribution: a single tally entry per student and scenario counts them. */
export async function tallyHotwash(
  root: string,
  scenarioId: string,
  studentId: string,
  note?: string,
): Promise<Evidence> {
  await requireStudent(root, studentId)
  let result!: Evidence
  await updateClassroomFile(root, 'evidence', (file) => {
    const found = file.evidence.find(
      (e) => e.kind === 'hotwash' && e.scenarioId === scenarioId && e.studentId === studentId,
    )
    if (found) {
      found.count += 1
      if (note) found.note = [found.note, note].filter(Boolean).join('; ').slice(0, 4000)
      result = found
    } else {
      result = {
        id: newId(),
        kind: 'hotwash',
        scenarioId,
        studentId,
        note: note ?? '',
        count: 1,
        at: nowIso(),
      }
      file.evidence.push(result)
    }
  })
  return result
}

const sameKey = (
  a: ScoreEntry,
  b: Pick<ScoreEntry, 'scenarioId' | 'studentId' | 'rubricId' | 'criterionId'>,
) =>
  a.scenarioId === b.scenarioId &&
  a.studentId === b.studentId &&
  a.rubricId === b.rubricId &&
  a.criterionId === b.criterionId

export async function setScore(
  root: string,
  input: {
    scenarioId: string
    studentId: string
    rubricId: string
    criterionId: string
    levelIndex: number
    comment: string
    scoredBy?: string
  },
): Promise<void> {
  await requireStudent(root, input.studentId)
  const course = await readCourse(root)
  const rubric = course.rubrics.find((r) => r.id === input.rubricId)
  const criterion = rubric?.criteria.find((c) => c.id === input.criterionId)
  if (!rubric || !criterion) throw new AppError('NOT_FOUND', 'No such rubric criterion.')
  if (input.levelIndex >= criterion.levels.length)
    throw new AppError('VALIDATION', 'That level is not on the criterion.')
  const evidence = (await listEvidence(root, input.scenarioId, input.studentId)).filter(
    (e) => e.criterionId === input.criterionId,
  )
  const suggestion = suggestLevel(evidence, criterion.levels.length)
  await updateClassroomFile(root, 'scores', (file) => {
    const entry: ScoreEntry = {
      scenarioId: input.scenarioId,
      studentId: input.studentId,
      rubricId: input.rubricId,
      criterionId: input.criterionId,
      levelIndex: input.levelIndex,
      suggestedLevelIndex: suggestion?.levelIndex,
      basis: suggestion?.basis ?? '',
      comment: input.comment,
      scoredBy: input.scoredBy,
      // A student's own entry on a team rubric sets them apart from the team score.
      overridden: rubric.role === 'team' && input.studentId !== TEAM_STUDENT_ID,
      updatedAt: nowIso(),
    }
    file.scores = [...file.scores.filter((s) => !sameKey(s, entry)), entry]
  })
}

export async function clearScore(
  root: string,
  key: { scenarioId: string; studentId: string; rubricId: string; criterionId: string },
): Promise<void> {
  await updateClassroomFile(root, 'scores', (file) => {
    file.scores = file.scores.filter((s) => !sameKey(s, key))
  })
}

function cellFor(
  rubric: ClassroomRubric,
  criterionId: string,
  studentId: string,
  scenarioId: string,
  evidence: Evidence[],
  scores: ScoreEntry[],
): ScoringCell {
  const criterion = rubric.criteria.find((c) => c.id === criterionId)!
  const isTeam = rubric.role === 'team'
  const key = { scenarioId, rubricId: rubric.id, criterionId }
  const own = scores.find((s) => sameKey(s, { ...key, studentId }))
  const level = effectiveLevel(scores, studentId, key, isTeam)
  const mine = evidence.filter((e) => e.studentId === studentId && e.criterionId === criterionId)
  const suggestion = suggestLevel(mine, criterion.levels.length)
  return {
    rubricId: rubric.id,
    criterionId,
    evidence: mine,
    suggestedLevel: suggestion?.levelIndex ?? null,
    basis: suggestion?.basis ?? '',
    level: level ?? null,
    fromTeam: isTeam && level !== undefined && !own?.overridden,
    overridden: own?.overridden ?? false,
    comment: own?.comment ?? '',
  }
}

function rosterFor(course: ClassroomCourseFile, scenarioId: string, sectionId?: string) {
  const session = course.sessions.find((s) => s.scenarioId === scenarioId)
  const section = sectionId ?? session?.sectionId
  const seated = new Set(Object.values(session?.seats ?? {}))
  const inSection = course.students.filter((s) => !section || s.sectionId === section)
  const students = seated.size > 0 ? inSection.filter((s) => seated.has(s.id)) : inSection
  return { session, section: section ?? null, students }
}

export async function scoringView(
  root: string,
  scenarioId: string,
  sectionId?: string,
): Promise<ScoringView> {
  const course = await readCourse(root)
  const { evidence } = await readClassroomFile(root, 'evidence')
  const { scores } = await readClassroomFile(root, 'scores')
  const forScenario = evidence.filter((e) => e.scenarioId === scenarioId)
  const scenarioScores = scores.filter((s) => s.scenarioId === scenarioId)
  const { session, section, students } = rosterFor(course, scenarioId, sectionId)
  const chosen = session?.rubricIds ?? []
  const rubrics = course.rubrics.filter((r) => chosen.length === 0 || chosen.includes(r.id))
  const cellsOf = (id: string) =>
    rubrics.flatMap((r) =>
      r.criteria.map((c) => cellFor(r, c.id, id, scenarioId, forScenario, scenarioScores)),
    )
  return {
    scenarioId,
    sectionId: section,
    practice: session?.practice ?? false,
    rubricIds: rubrics.map((r) => r.id),
    students: students.map((s) => {
      const cells = cellsOf(s.id)
      const levelsByRubric = new Map(
        rubrics.map((r) => [
          r.id,
          new Map(
            cells
              .filter((c) => c.rubricId === r.id)
              .map((c) => [c.criterionId, c.level ?? undefined] as const),
          ),
        ]),
      )
      return {
        studentId: s.id,
        name: s.name,
        cells,
        totals: rubrics.map((r) => {
          const t = rubricTotal(r, levelsByRubric.get(r.id)!)
          return {
            rubricId: r.id,
            points: t.points,
            maxPoints: t.maxPoints,
            fraction: t.fraction,
            complete: t.complete,
          }
        }),
        outcomes: [...outcomeScores(rubrics, levelsByRubric, course.outcomes)].map(
          ([outcomeId, fraction]) => ({ outcomeId, fraction }),
        ),
        unlinked: forScenario.filter((e) => e.studentId === s.id && !e.criterionId),
      }
    }),
    team: rubrics
      .filter((r) => r.role === 'team')
      .flatMap((r) =>
        r.criteria.map((c) =>
          cellFor(r, c.id, TEAM_STUDENT_ID, scenarioId, forScenario, scenarioScores),
        ),
      ),
  }
}

export function setReflectionPrompts(
  root: string,
  prompts: string[],
): Promise<ClassroomCourseFile> {
  return updateClassroomFile(root, 'course', (file) => {
    file.reflectionPrompts = prompts
  })
}

export async function saveRotation(
  root: string,
  input: {
    sectionId: string
    roles: string[]
    sessions: number
    locked?: Record<string, Record<string, string>>
  },
): Promise<typeof RotationResultView._output> {
  const course = await readCourse(root)
  if (!course.sections.some((s) => s.id === input.sectionId))
    throw new AppError('NOT_FOUND', 'No such section.')
  const students = course.students.filter((s) => s.sectionId === input.sectionId).map((s) => s.id)
  const locked = Object.fromEntries(
    Object.entries(input.locked ?? {}).map(([i, a]) => [Number(i), a]),
  )
  const result = planRotation({ students, roles: input.roles, sessions: input.sessions, locked })
  const plan = {
    id: course.rotations.find((r) => r.sectionId === input.sectionId)?.id ?? newId(),
    sectionId: input.sectionId,
    roles: input.roles,
    sessions: result.sessions,
  }
  await updateClassroomFile(root, 'course', (file) => {
    file.rotations = [...file.rotations.filter((r) => r.sectionId !== input.sectionId), plan]
  })
  return { plan, problems: result.problems }
}
