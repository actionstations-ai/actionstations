import { describe, expect, it } from 'vitest'
import type { Drill } from '@shared/schemas'
import { latestRedlineVerdict } from './drill-verdict'

const redline = { id: 'r1', source: { criterionIds: ['T-07'] } } as never

const run = (ranAt: string, rating: string, criterionId = 'T-07') => ({
  id: `run-${ranAt}`,
  ranAt,
  documentHashes: {},
  criteria: [
    { rowId: 'I-06', criterionId, rating },
    { rowId: 'I-09', criterionId: 'T-99', rating: 'not_met' },
  ],
  correctiveActions: [],
  programRecorded: false,
})

const drill = (over: Record<string, unknown>): Drill =>
  ({ id: 'd1', title: 'Regression drill', redlineIds: ['r1'], runs: [], ...over }) as never

describe('latestRedlineVerdict (#504)', () => {
  it('is undefined when no drill tested the proposal or none has run', () => {
    expect(latestRedlineVerdict(redline, [])).toBeUndefined()
    expect(latestRedlineVerdict(redline, [drill({ redlineIds: ['other'] })])).toBeUndefined()
    expect(latestRedlineVerdict(redline, [drill({})])).toBeUndefined()
  })

  it('judges the newest run from the criteria the proposal was meant to fix', () => {
    const d = drill({
      runs: [run('2026-02-01T00:00:00Z', 'not_met'), run('2026-03-01T00:00:00Z', 'met')],
    })
    expect(latestRedlineVerdict(redline, [d])).toEqual({
      verdict: 'pass',
      ranAt: '2026-03-01T00:00:00Z',
      drillTitle: 'Regression drill',
    })
  })

  it('takes the newest run across drills and falls back to all criteria without a match', () => {
    const older = drill({ title: 'A', runs: [run('2026-01-01T00:00:00Z', 'met')] })
    const newer = drill({
      id: 'd2',
      title: 'B',
      runs: [run('2026-04-01T00:00:00Z', 'met', 'T-50')],
    })
    const out = latestRedlineVerdict(redline, [older, newer])
    expect(out?.drillTitle).toBe('B')
    expect(out?.verdict).toBe('fail')
  })
})
