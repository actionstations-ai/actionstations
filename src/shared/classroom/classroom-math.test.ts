// Worked examples for scoring, reliability, equity and rotation (spec 0453 testing section).
import { describe, expect, it } from 'vitest'
import type { ClassroomRubric, ScoreEntry } from '../schemas/classroom'
import { participation } from './equity'
import {
  agreementPairs,
  icc21,
  lowestAgreement,
  reliability,
  weightedKappa,
  type RatingCell,
} from './reliability'
import { planRotation, unplayedRoles } from './rotation'
import {
  effectiveLevel,
  outcomeScores,
  rubricTotal,
  suggestLevel,
  TEAM_STUDENT_ID,
} from './scoring'

const levels = (...points: number[]) =>
  points.map((p) => ({ label: `L${p}`, descriptor: '', points: p }))
const rubric: ClassroomRubric = {
  formatVersion: 1,
  id: 'r1',
  name: 'R',
  role: 'team',
  source: '',
  criteria: [
    {
      id: 'a',
      name: 'A',
      description: '',
      weight: 2,
      levels: levels(0, 2, 4),
      outcomeIds: ['o1'],
      taskIds: [],
    },
    {
      id: 'b',
      name: 'B',
      description: '',
      weight: 1,
      levels: levels(0, 1, 2, 3),
      outcomeIds: ['o1', 'o2'],
      taskIds: [],
    },
  ],
}

describe('suggestLevel', () => {
  it('uses the only piece of evidence when there is one', () => {
    expect(suggestLevel([{ levelIndex: 2 }], 4)).toMatchObject({ levelIndex: 2 })
  })
  it('picks the highest level at least two pieces support', () => {
    // levels 3, 2, 0: level 2 is supported by two (3 and 2); level 3 by one.
    const got = suggestLevel([{ levelIndex: 3 }, { levelIndex: 2 }, { levelIndex: 0 }], 4)
    expect(got).toEqual({
      levelIndex: 2,
      basis: '2 of 3 pieces of evidence are at this level or higher.',
    })
  })
  it('ignores evidence without a level and returns null when none has one', () => {
    expect(suggestLevel([{ levelIndex: undefined }, {}], 4)).toBeNull()
    expect(suggestLevel([{ levelIndex: 1 }, {}], 4)).toMatchObject({ levelIndex: 1 })
  })
})

describe('totals and outcomes', () => {
  it('weights criteria and reports what is missing', () => {
    // A at level 2 (4 points x weight 2 = 8 of 8), B at level 1 (1 point x 1 = 1 of 3).
    const total = rubricTotal(
      rubric,
      new Map([
        ['a', 2],
        ['b', 1],
      ]),
    )
    expect(total).toMatchObject({ points: 9, maxPoints: 11, scored: 2, complete: true })
    expect(total.fraction).toBeCloseTo(9 / 11)
    const partial = rubricTotal(rubric, new Map([['a', 1]]))
    expect(partial).toMatchObject({ points: 4, maxPoints: 11, complete: false })
    expect(rubricTotal(rubric, new Map()).fraction).toBeNull()
  })

  it('scores an outcome from the scored criteria linked to it, null when none', () => {
    const scores = outcomeScores(
      [rubric],
      new Map([
        [
          'r1',
          new Map([
            ['a', 2],
            ['b', 1],
          ]),
        ],
      ]),
      [{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }],
    )
    expect(scores.get('o1')).toBeCloseTo(9 / 11) // a and b both link to o1
    expect(scores.get('o2')).toBeCloseTo(1 / 3) // only b
    expect(scores.get('o3')).toBeNull()
  })

  it('gives team members the team score unless overridden', () => {
    const base = {
      scenarioId: 's',
      rubricId: 'r1',
      criterionId: 'a',
      basis: '',
      comment: '',
      updatedAt: '2026-11-04T00:00:00.000Z',
    }
    const entries: ScoreEntry[] = [
      { ...base, studentId: TEAM_STUDENT_ID, levelIndex: 2, overridden: false },
      { ...base, studentId: 'ada', levelIndex: 0, overridden: true },
      { ...base, studentId: 'bo', levelIndex: 0, overridden: false },
    ]
    const key = { scenarioId: 's', rubricId: 'r1', criterionId: 'a' }
    expect(effectiveLevel(entries, 'cy', key, true)).toBe(2)
    expect(effectiveLevel(entries, 'ada', key, true)).toBe(0)
    expect(effectiveLevel(entries, 'bo', key, true)).toBe(2)
    expect(effectiveLevel(entries, 'bo', key, false)).toBe(0)
  })
})

// A 3x3 table of two raters' levels (rows rater 1, columns rater 2), n = 30:
//   10  2  0
//    3  8  1
//    0  2  4
// Row totals 12 12 6, column totals 13 12 5. Po(linear) = 0.8667, Pe = 0.6052; kappa_w = 0.661.
const table = [
  [10, 2, 0],
  [3, 8, 1],
  [0, 2, 4],
]
const pairsOf = (t: number[][]): Array<[number, number]> =>
  t.flatMap((row, i) =>
    row.flatMap((n, j) => Array.from({ length: n }, () => [i, j] as [number, number])),
  )

describe('reliability', () => {
  it('computes linear weighted kappa on a worked example', () => {
    expect(weightedKappa(pairsOf(table), 3)).toBeCloseTo(0.661, 3)
  })
  it('equals plain kappa for two categories (Cohen 20/5/10/15 example is 0.4)', () => {
    const t2 = [
      [20, 5],
      [10, 15],
    ]
    expect(weightedKappa(pairsOf(t2), 2)).toBeCloseTo(0.4, 6)
  })
  it('computes ICC(2,1) for the Shrout and Fleiss (1979) example', () => {
    const data = [
      [9, 2, 5, 8],
      [6, 1, 3, 2],
      [8, 4, 6, 8],
      [7, 1, 2, 6],
      [10, 5, 6, 9],
      [6, 2, 4, 7],
    ]
    expect(icc21(data)).toBeCloseTo(0.29, 2)
  })
  it('counts exact and within-one agreement over every rater pair', () => {
    const cells: RatingCell[] = [
      { raterId: 'a', itemId: 'x', level: 2 },
      { raterId: 'b', itemId: 'x', level: 2 },
      { raterId: 'c', itemId: 'x', level: 3 },
      { raterId: 'a', itemId: 'y', level: 0 },
      { raterId: 'b', itemId: 'y', level: 3 },
    ]
    // x: ab exact, ac and bc within one. y: ab apart by 3. Four pairs.
    expect(agreementPairs(cells)).toEqual({ pairs: 4, exact: 1, within: 3 })
  })
  it('reports kappa for two raters, ICC for three, and the small-sample caveat', () => {
    const two = pairsOf(table).flatMap(([a, b], i) => [
      { raterId: 'a', itemId: `i${i}`, level: a },
      { raterId: 'b', itemId: `i${i}`, level: b },
    ])
    const r2 = reliability(two, 3)
    expect(r2).toMatchObject({ items: 30, pairs: 30, raters: 2, icc: null, caveat: null })
    expect(r2.kappa).toBeCloseTo(0.661, 3)
    expect(r2.exact).toBeCloseTo(22 / 30)
    expect(r2.withinOne).toBe(1)
    const three = reliability(
      [0, 1, 2].flatMap((i) =>
        ['a', 'b', 'c'].map((r, k) => ({ raterId: r, itemId: `i${i}`, level: i + (k % 2) })),
      ),
      4,
    )
    expect(three.icc).not.toBeNull()
    expect(three.kappa).toBeNull()
    expect(three.caveat).toMatch(/unstable/)
  })
  it('lists the criteria with the lowest agreement first', () => {
    const by = new Map<string, RatingCell[]>([
      [
        'good',
        [
          { raterId: 'a', itemId: '1', level: 1 },
          { raterId: 'b', itemId: '1', level: 1 },
        ],
      ],
      [
        'poor',
        [
          { raterId: 'a', itemId: '1', level: 0 },
          { raterId: 'b', itemId: '1', level: 3 },
        ],
      ],
      ['alone', [{ raterId: 'a', itemId: '1', level: 0 }]],
    ])
    expect(lowestAgreement(by).map((r) => r.criterionId)).toEqual(['poor', 'good'])
  })
})

describe('participation', () => {
  it('compares each share to an even share and counts students below half', () => {
    // 20 contributions, 4 students: even share 25%. Counts 12, 6, 2, 0.
    const p = participation(
      ['a', 'b', 'c', 'd'],
      new Map([
        ['a', 12],
        ['b', 6],
        ['c', 2],
      ]),
    )
    expect(p.total).toBe(20)
    expect(p.rows.map((r) => r.ratio)).toEqual([2.4, 1.2, 0.4, 0])
    expect(p.rows.map((r) => r.belowHalf)).toEqual([false, false, true, true])
    expect(p.belowHalfCount).toBe(2)
    expect(p.caveat).toBeNull()
  })
  it('flags nobody when nothing was counted and warns on small samples', () => {
    const p = participation(['a', 'b'], new Map())
    expect(p.belowHalfCount).toBe(0)
    expect(p.caveat).toMatch(/unstable/)
  })
})

describe('planRotation', () => {
  const roles = ['IC', 'PIO', 'Analyst', 'Evaluator']
  it('has each of four students play each of four roles once over four sessions', () => {
    const { sessions, problems } = planRotation({
      students: ['a', 'b', 'c', 'd'],
      roles,
      sessions: 4,
    })
    expect(problems).toEqual([])
    for (const s of sessions) expect(new Set(Object.values(s.assignments))).toEqual(new Set(roles))
    for (const id of ['a', 'b', 'c', 'd']) expect(unplayedRoles(roles, sessions, id)).toEqual([])
  })
  it('covers every role each session with extra students and repeats nothing before all are played', () => {
    const students = ['a', 'b', 'c', 'd', 'e', 'f']
    const { sessions, problems } = planRotation({ students, roles, sessions: 4 })
    expect(problems).toEqual([])
    for (const s of sessions) expect(new Set(Object.values(s.assignments))).toEqual(new Set(roles))
    for (const id of students) {
      const seq = sessions.map((s) => s.assignments[id])
      expect(new Set(seq).size).toBe(4)
    }
  })
  it.each([4, 5, 6, 7, 8, 9, 12, 13])('rotates %i students through four roles', (n) => {
    const students = Array.from({ length: n }, (_, i) => `s${i}`)
    const { sessions, problems } = planRotation({ students, roles, sessions: 4 })
    expect(problems).toEqual([])
    for (const s of sessions) expect(new Set(Object.values(s.assignments))).toEqual(new Set(roles))
    for (const id of students) expect(unplayedRoles(roles, sessions, id)).toEqual([])
  })
  it('reports too few students and keeps hand-locked assignments', () => {
    expect(planRotation({ students: ['a', 'b'], roles, sessions: 1 }).problems[0]).toMatch(
      /at least 4 students/,
    )
    const { sessions } = planRotation({
      students: ['a', 'b', 'c', 'd'],
      roles,
      sessions: 2,
      locked: { 0: { a: 'Evaluator' } },
    })
    expect(sessions[0]!.assignments.a).toBe('Evaluator')
    expect(new Set(Object.values(sessions[0]!.assignments))).toEqual(new Set(roles))
    expect(sessions[1]!.assignments.a).not.toBe('Evaluator')
  })
  it('respects earlier history', () => {
    const { sessions, problems } = planRotation({
      students: ['a', 'b', 'c', 'd'],
      roles,
      sessions: 1,
      history: { a: ['IC'], b: ['PIO'], c: ['Analyst'], d: ['Evaluator'] },
    })
    expect(problems).toEqual([])
    expect(sessions[0]!.assignments.a).not.toBe('IC')
    expect(sessions[0]!.assignments.d).not.toBe('Evaluator')
  })
  it('reports a session that cannot be covered without a repeat', () => {
    const { problems } = planRotation({
      students: ['a', 'b'],
      roles: ['IC', 'PIO'],
      sessions: 1,
      history: { a: ['IC', 'IC', 'PIO'], b: ['IC', 'IC', 'PIO'] },
    })
    // Both have played PIO once and IC twice, so only PIO is allowed: IC cannot be covered.
    expect(problems.join(' ')).toMatch(/cannot|no student/i)
  })
})
