import { describe, expect, it } from 'vitest'
import {
  capabilityNotesFor,
  exerciseTagsOf,
  improvementPlanDueDate,
  programTagMarkdown,
  tagsByIds,
} from './evaluation'
import { ToolkitSchema } from './schema'

const tag = (id: string, label = id) => ({
  id,
  label,
  program: 'Program',
  version: 'April 2024',
  source: 'https://example.gov/doc.pdf',
  type: 'discussion' as const,
})

const a = ToolkitSchema.parse({
  id: 'a',
  name: 'A',
  description: 'a',
  capabilities: [
    {
      coreCapability: 'situational_assessment',
      criticalTasks: ['one', 'two'],
      mappings: [{ framework: 'PHEP', ids: ['13'] }],
    },
  ],
  exerciseTags: [tag('t1'), tag('t2')],
})
const b = ToolkitSchema.parse({
  id: 'b',
  name: 'B',
  description: 'b',
  capabilities: [
    {
      coreCapability: 'situational_assessment',
      criticalTasks: ['two', 'three'],
      mappings: [{ framework: 'PHEP', ids: ['6', '13'] }],
    },
  ],
  exerciseTags: [tag('t2', 'ignored duplicate'), tag('t3')],
})

describe('capability notes', () => {
  it('merge tasks and mapping ids across toolkits without repeats', () => {
    const n = capabilityNotesFor([a, b], 'situational_assessment')
    expect(n.criticalTasks).toEqual(['one', 'two', 'three'])
    expect(n.mappings).toEqual([{ framework: 'PHEP', ids: ['13', '6'] }])
    expect(capabilityNotesFor([a, b], 'cybersecurity').criticalTasks).toEqual([])
  })
})

describe('exercise tags', () => {
  it('keep the first definition of an id and skip ids no toolkit offers', () => {
    expect(exerciseTagsOf([a, b]).map((t) => t.id)).toEqual(['t1', 't2', 't3'])
    expect(exerciseTagsOf([a, b]).find((t) => t.id === 't2')!.label).toBe('t2')
    expect(tagsByIds([a, b], ['t3', 'gone', 't1']).map((t) => t.id)).toEqual(['t3', 't1'])
  })

  it('adds the program days to the exercise date', () => {
    expect(improvementPlanDueDate('2026-10-22', { improvementPlanDueDays: 90 })).toBe('2027-01-20')
    expect(improvementPlanDueDate('2026-12-15T10:00:00Z', { improvementPlanDueDays: 30 })).toBe(
      '2027-01-14',
    )
    expect(improvementPlanDueDate(undefined, { improvementPlanDueDays: 90 })).toBeUndefined()
    expect(improvementPlanDueDate('2026-10-22', {})).toBeUndefined()
    expect(improvementPlanDueDate('not a date', { improvementPlanDueDays: 90 })).toBeUndefined()
  })

  it('writes the table with the exercise on every row and escapes pipes', () => {
    const md = programTagMarkdown(
      [{ ...a.exerciseTags[0]!, improvementPlanDueDays: 90 }],
      [
        {
          capability: 'Cap',
          finding: 'a | b',
          action: 'Do it',
          element: 'planning',
          owner: 'Org',
          poc: '',
          start: '',
          due: '2027-03-31',
        },
      ],
      '2026-10-22',
    )
    expect(md).toContain('by 2027-01-20')
    expect(md).toContain(
      '| t1 | April 2024 | Cap | a \\| b | Do it | planning | Org |  |  | 2027-03-31 |',
    )
  })

  it('says there are no actions yet when the plan is empty', () => {
    expect(programTagMarkdown([a.exerciseTags[0]!], [])).toContain('_No corrective actions yet._')
  })
})
