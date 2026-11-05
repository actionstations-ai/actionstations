import { describe, expect, it } from 'vitest'
import { WARNING_FORM } from '@shared/decisions/fixtures'
import type { DecisionRecord } from '@shared/schemas/decisions'
import {
  allDecisions,
  decisionSummary,
  EMPTY_ENTRY,
  entryProblems,
  entryRequest,
} from './decision-model'

const record = (id: string, time: string, over: Partial<DecisionRecord> = {}): DecisionRecord => ({
  id,
  time,
  kind: 'warning',
  formId: 'issue-warning',
  title: 'Issue a warning',
  fields: { level: 'warning', people: 40 },
  area: { id: 'harbor', name: 'Harbor' },
  seat: { kind: 'facilitator' },
  source: 'facilitator',
  ...over,
})

describe('entry', () => {
  it('names the required fields that are empty', () => {
    expect(entryProblems(WARNING_FORM, EMPTY_ENTRY)).toEqual({
      level: 'Level is required',
      area: 'Area is required',
    })
  })

  it('builds the request with numbers as numbers and the role when one is chosen', () => {
    const draft = {
      values: { level: 'watch', people: '12', note: ' ' },
      areaId: 'north',
      roleId: 'ops',
    }
    expect(entryProblems(WARNING_FORM, draft)).toEqual({})
    expect(entryRequest(WARNING_FORM, draft)).toEqual({
      formId: 'issue-warning',
      fields: { level: 'watch', people: 12 },
      area: { areaId: 'north' },
      roleId: 'ops',
    })
  })
})

describe('allDecisions', () => {
  it('merges the session and the file once each, newest first', () => {
    const a = record('a', '2026-11-04T10:00:00.000Z')
    const b = record('b', '2026-11-04T10:10:00.000Z')
    expect(allDecisions([a], [a, b]).map((r) => r.id)).toEqual(['b', 'a'])
    expect(allDecisions([], undefined)).toEqual([])
  })
})

describe('decisionSummary', () => {
  it('reads choices by label, the area by name and numbers with their unit', () => {
    expect(decisionSummary(record('a', 't'), WARNING_FORM)).toBe('Warning · Harbor · 40 people')
  })

  it('still says something when the form is no longer available', () => {
    expect(decisionSummary(record('a', 't'), undefined)).toBe('Harbor · warning · 40')
  })
})
