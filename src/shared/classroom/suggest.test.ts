import { describe, expect, it } from 'vitest'
import { keywords, suggestMappings } from './suggest'

const outcome = (id: string, text: string) => ({ id, code: id.toUpperCase(), text })

describe('suggestMappings', () => {
  const objectives = [
    {
      id: 'O-1',
      name: 'Communication',
      text: 'Notify the county emergency operations center of the incident within 30 minutes.',
    },
    { id: 'O-2', name: 'Recovery', text: 'Restore baggage handling after the outage.' },
  ]

  it('proposes pairs that share at least two meaningful words, with the reason', () => {
    const got = suggestMappings(
      [outcome('lo1', 'Communicate incident information to the emergency operations center')],
      objectives,
    )
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ outcomeId: 'lo1', objectiveId: 'O-1' })
    expect(got[0]!.shared).toEqual(['center', 'emergency', 'incident', 'operation'])
  })

  it('proposes nothing for a single shared word', () => {
    expect(
      suggestMappings([outcome('lo2', 'Evaluate baggage security screening')], objectives),
    ).toEqual([])
  })

  it('skips pairs the instructor already mapped and ranks the best match first', () => {
    const outs = [
      outcome('lo1', 'Notify the emergency operations center of the incident'),
      outcome('lo3', 'Restore baggage handling operations after an outage'),
    ]
    const all = suggestMappings(outs, objectives)
    expect(all.map((s) => s.outcomeId).sort()).toEqual(['lo1', 'lo3'])
    expect(all[0]!.score).toBeGreaterThanOrEqual(all[1]!.score)
    const skipped = suggestMappings(outs, objectives, [
      { outcomeId: 'lo1', kind: 'objective', ref: 'O-1' },
    ])
    expect(skipped.some((s) => s.outcomeId === 'lo1')).toBe(false)
  })

  it('drops stop words and short words', () => {
    expect([...keywords('The team will use the plan')]).toEqual(['plan'])
  })
})
