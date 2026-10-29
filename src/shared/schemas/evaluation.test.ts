// The evaluation schemas are the boundary for observations that arrive from live-play devices
// (#416) and for guides a model writes: every free-text field is capped (#421).
import { describe, expect, it } from 'vitest'
import { CITATION_LIMITS, Citation } from './common'
import {
  CriticalTask,
  Eeg,
  EVALUATION_LIMITS,
  EvaluationRecord,
  Observation,
  ObjectiveCapability,
  RowCriterion,
} from './evaluation'

const citation = {
  documentId: 'tirp',
  documentTitle: 'Terminal Incident Response Plan',
  headingPath: 'TIRP › Section 13 › 13.7 Checklist: Cybersecurity Incident',
}
const task = {
  id: 'T-01',
  capability: 'cybersecurity',
  task: 'Notify the FBI Cyber Task Force and CISA',
  citation,
  rowIds: ['I-09'],
}
const observation = {
  id: 'O-I-09-T-01',
  at: '2026-10-28T14:00:00.000Z',
  rowId: 'I-09',
  taskId: 'T-01',
  criterionId: 'T-01',
  rating: 'met',
}

const long = (n: number) => 'x'.repeat(n)

describe('evaluation schema caps', () => {
  it('accepts text at the cap and refuses one character over', () => {
    const cases: [
      z: { safeParse: (v: unknown) => { success: boolean } },
      value: unknown,
      over: unknown,
    ][] = [
      [
        CriticalTask,
        { ...task, task: long(EVALUATION_LIMITS.task), timing: long(EVALUATION_LIMITS.timing) },
        { ...task, task: long(EVALUATION_LIMITS.task + 1) },
      ],
      [CriticalTask, task, { ...task, timing: long(EVALUATION_LIMITS.timing + 1) }],
      [
        Eeg,
        { capability: 'cybersecurity', target: long(EVALUATION_LIMITS.target) },
        { capability: 'cybersecurity', target: long(EVALUATION_LIMITS.target + 1) },
      ],
      [
        ObjectiveCapability,
        { objectiveId: 'o1', capability: 'planning', why: long(EVALUATION_LIMITS.why) },
        { objectiveId: 'o1', capability: 'planning', why: long(EVALUATION_LIMITS.why + 1) },
      ],
      [
        Observation,
        {
          ...observation,
          note: long(EVALUATION_LIMITS.note),
          evaluator: long(EVALUATION_LIMITS.evaluator),
        },
        { ...observation, note: long(EVALUATION_LIMITS.note + 1) },
      ],
      [
        Observation,
        observation,
        { ...observation, evaluator: long(EVALUATION_LIMITS.evaluator + 1) },
      ],
      [
        Observation,
        observation,
        { ...observation, criterionId: long(EVALUATION_LIMITS.criterionId + 1) },
      ],
      [Observation, observation, { ...observation, rowId: long(EVALUATION_LIMITS.rowId + 1) }],
      [
        RowCriterion,
        { id: 'I-01:expected', rowId: 'I-01', text: long(EVALUATION_LIMITS.criterionText) },
        { id: 'I-01:expected', rowId: 'I-01', text: long(EVALUATION_LIMITS.criterionText + 1) },
      ],
      [
        Citation,
        {
          ...citation,
          documentTitle: long(CITATION_LIMITS.documentTitle),
          quote: long(CITATION_LIMITS.quote),
        },
        { ...citation, headingPath: long(CITATION_LIMITS.headingPath + 1) },
      ],
    ]
    for (const [schema, ok, over] of cases) {
      expect(schema.safeParse(ok).success, JSON.stringify(ok).slice(0, 80)).toBe(true)
      expect(schema.safeParse(over).success, JSON.stringify(over).slice(0, 80)).toBe(false)
    }
  })

  it('caps list sizes: rows per task, tasks per guide, observations per record', () => {
    const rows = Array.from({ length: EVALUATION_LIMITS.refs + 1 }, (_, i) => `I-${i}`)
    expect(CriticalTask.safeParse({ ...task, rowIds: rows }).success).toBe(false)
    expect(CriticalTask.safeParse({ ...task, rowIds: rows.slice(1) }).success).toBe(true)
    const tasks = Array.from({ length: EVALUATION_LIMITS.tasksPerEeg + 1 }, (_, i) => ({
      ...task,
      id: `T-${i}`,
    }))
    expect(Eeg.safeParse({ capability: 'cybersecurity', criticalTasks: tasks }).success).toBe(false)
    const many = Array.from({ length: EVALUATION_LIMITS.observations + 1 }, (_, i) => ({
      ...observation,
      id: `O-${i}`,
    }))
    expect(
      EvaluationRecord.safeParse({ observations: many, updatedAt: observation.at }).success,
    ).toBe(false)
    expect(
      EvaluationRecord.safeParse({ observations: many.slice(1), updatedAt: observation.at })
        .success,
    ).toBe(true)
  })

  it('refuses ids that could escape a path and ratings outside the four HSEEP values', () => {
    expect(Observation.safeParse({ ...observation, id: '../x' }).success).toBe(false)
    expect(Observation.safeParse({ ...observation, taskId: 'T 01' }).success).toBe(false)
    expect(Observation.safeParse({ ...observation, rating: 'excellent' }).success).toBe(false)
    expect(Observation.safeParse({ ...observation, rowId: '' }).success).toBe(false)
    expect(CriticalTask.safeParse({ ...task, objectiveRefs: ['ok-id', 'not ok'] }).success).toBe(
      false,
    )
  })

  it('has no field for a player name and defaults the source to facilitate', () => {
    const parsed = Observation.parse(observation)
    expect(Object.keys(parsed)).not.toContain('player')
    expect(parsed).toMatchObject({ note: '', source: 'facilitate' })
  })
})
