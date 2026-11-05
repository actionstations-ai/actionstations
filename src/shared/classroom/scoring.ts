// Scoring (#727, spec 0453 FR-5). Pure functions: a rule-based level suggestion from evidence,
// weighted totals, outcome scores and team-score inheritance. No model decides a grade; the
// suggestion is shown with its basis and the instructor's choice is the score.
import type {
  ClassroomRubric,
  ClassroomRubricCriterion,
  Evidence,
  Outcome,
  ScoreEntry,
} from '../schemas/classroom'

/** The id team-level score entries are stored under. */
export const TEAM_STUDENT_ID = 'team'

export interface LevelSuggestion {
  levelIndex: number
  basis: string
}

/**
 * The highest level supported by at least two pieces of evidence (a piece supports every level at
 * or below its own), or the one piece's level when only one exists. Evidence without a level is
 * ignored. Returns null when no evidence names a level.
 */
export function suggestLevel(
  evidence: Pick<Evidence, 'levelIndex'>[],
  levelCount: number,
): LevelSuggestion | null {
  const levels = evidence
    .map((e) => e.levelIndex)
    .filter((l): l is number => l !== undefined && l < levelCount)
  if (levels.length === 0) return null
  if (levels.length === 1)
    return { levelIndex: levels[0]!, basis: 'Based on the only piece of evidence.' }
  for (let level = levelCount - 1; level >= 0; level--) {
    const supporting = levels.filter((l) => l >= level).length
    if (supporting >= 2)
      return {
        levelIndex: level,
        basis: `${supporting} of ${levels.length} pieces of evidence are at this level or higher.`,
      }
  }
  return null
}

/** Points of the chosen level; undefined when none is chosen or it is out of range. */
export function pointsOf(
  criterion: ClassroomRubricCriterion,
  levelIndex: number | undefined,
): number | undefined {
  return levelIndex === undefined ? undefined : criterion.levels[levelIndex]?.points
}

const topPoints = (c: ClassroomRubricCriterion): number =>
  Math.max(...c.levels.map((l) => l.points))

export interface RubricTotal {
  /** Sum of weight x points over scored criteria. */
  points: number
  /** Sum of weight x top points over every criterion of the rubric. */
  maxPoints: number
  /** points / maxPoints, 0 to 1; null when nothing is scored. */
  fraction: number | null
  scored: number
  criteria: number
  /** True when every criterion has a score. */
  complete: boolean
}

/** Weighted total of one rubric. `levels` maps criterion id to the chosen level index. */
export function rubricTotal(
  rubric: ClassroomRubric,
  levels: ReadonlyMap<string, number | undefined>,
): RubricTotal {
  let points = 0
  let scored = 0
  let maxPoints = 0
  for (const c of rubric.criteria) {
    maxPoints += c.weight * topPoints(c)
    const p = pointsOf(c, levels.get(c.id))
    if (p === undefined) continue
    points += c.weight * p
    scored++
  }
  return {
    points,
    maxPoints,
    fraction: scored === 0 || maxPoints === 0 ? null : points / maxPoints,
    scored,
    criteria: rubric.criteria.length,
    complete: scored === rubric.criteria.length,
  }
}

/**
 * Per outcome: the weighted share of top points over the scored criteria linked to it. Outcomes
 * with no scored criterion are null, never zero.
 */
export function outcomeScores(
  rubrics: ClassroomRubric[],
  levelsByRubric: ReadonlyMap<string, ReadonlyMap<string, number | undefined>>,
  outcomes: Pick<Outcome, 'id'>[],
): Map<string, number | null> {
  const sums = new Map<string, { got: number; max: number }>()
  for (const rubric of rubrics)
    for (const c of rubric.criteria) {
      const p = pointsOf(c, levelsByRubric.get(rubric.id)?.get(c.id))
      if (p === undefined) continue
      for (const id of c.outcomeIds) {
        const s = sums.get(id) ?? { got: 0, max: 0 }
        s.got += c.weight * p
        s.max += c.weight * topPoints(c)
        sums.set(id, s)
      }
    }
  return new Map(
    outcomes.map((o) => {
      const s = sums.get(o.id)
      return [o.id, s && s.max > 0 ? s.got / s.max : null]
    }),
  )
}

type Key = Pick<ScoreEntry, 'scenarioId' | 'rubricId' | 'criterionId'>

/**
 * The level that counts for a student on a criterion: their own entry when it exists and the
 * instructor marked it as set apart from the team, or when the rubric is not a team rubric;
 * otherwise the team entry.
 */
export function effectiveLevel(
  entries: readonly ScoreEntry[],
  studentId: string,
  key: Key,
  isTeamRubric: boolean,
): number | undefined {
  const same = (e: ScoreEntry, id: string) =>
    e.studentId === id &&
    e.scenarioId === key.scenarioId &&
    e.rubricId === key.rubricId &&
    e.criterionId === key.criterionId
  const own = entries.find((e) => same(e, studentId))
  if (!isTeamRubric) return own?.levelIndex
  if (own?.overridden && own.levelIndex !== undefined) return own.levelIndex
  return entries.find((e) => same(e, TEAM_STUDENT_ID))?.levelIndex
}
