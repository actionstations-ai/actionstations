import { describe, expect, it } from 'vitest'
import {
  Aar,
  aarStatus,
  CorrectiveAction,
  EvidenceRef,
  ExerciseRecord,
  Finding,
  improvementPlanRows,
  recordIsEmpty,
  recordRefs,
} from './aar'

const NOW = '2026-10-28T18:00:00.000Z'

describe('AAR schemas', () => {
  it('accepts the record refs of every source and rejects other shapes', () => {
    for (const ref of [
      'note:I-09',
      'note:general',
      'obs:O-I-06-T-07',
      'hw:hw_anon_boards_000000',
      'dec:dec-1',
      'vote:v1',
      'msg:m1',
      'survey:SRV1:q1',
      'log:12',
    ])
      expect(EvidenceRef.safeParse(ref).success, ref).toBe(true)
    for (const ref of ['I-09', 'name:Dana', 'note:', 'note:a b', 'obs:../x'])
      expect(EvidenceRef.safeParse(ref).success, ref).toBe(false)
  })

  it('requires evidence on a finding and fills the person-typed fields of an action with blanks', () => {
    expect(Finding.safeParse({ id: 'f', title: 't', analysisMd: 'a', evidence: [] }).success).toBe(
      false,
    )
    const action = CorrectiveAction.parse({ id: 'a', action: 'Do it', element: 'training' })
    expect(action).toMatchObject({ ownerOrganization: '', poc: '', status: 'open', locked: false })
    expect(CorrectiveAction.safeParse({ id: 'a', action: 'x', element: 'budget' }).success).toBe(
      false,
    )
  })

  it('defaults an Aar and keeps unknown keys (loose, ADR-0016)', () => {
    const aar = Aar.parse({ createdAt: NOW, updatedAt: NOW, futureField: 1 })
    expect(aar.capabilities).toEqual([])
    expect(aar.sourcesUsed).toEqual([])
    expect((aar as Record<string, unknown>).futureField).toBe(1)
    expect(aarStatus(aar)).toBe('reviewed')
  })

  it('is a draft while any capability has no confirmed rating', () => {
    const capability = {
      capability: 'planning',
      observationCounts: { met: 0, partial: 0, not_met: 0, not_observed: 0 },
    }
    expect(
      aarStatus(Aar.parse({ createdAt: NOW, updatedAt: NOW, capabilities: [capability] })),
    ).toBe('draft')
    expect(
      aarStatus(
        Aar.parse({
          createdAt: NOW,
          updatedAt: NOW,
          capabilities: [{ ...capability, rating: 'P' }],
        }),
      ),
    ).toBe('reviewed')
  })

  it('flattens the improvement plan to one row per corrective action', () => {
    const aar = Aar.parse({
      createdAt: NOW,
      updatedAt: NOW,
      capabilities: [
        {
          capability: 'planning',
          areasForImprovement: [
            {
              id: 'f',
              title: 'Gap',
              analysisMd: '',
              evidence: ['note:general'],
              correctiveActions: [
                { id: 'a', action: 'A', element: 'planning' },
                { id: 'b', action: 'B', element: 'training' },
              ],
            },
          ],
        },
      ],
    })
    expect(improvementPlanRows(aar).map((r) => r.action.action)).toEqual(['A', 'B'])
    expect(improvementPlanRows(aar)[0]!.finding.title).toBe('Gap')
  })

  it('knows an empty record and lists the refs of a full one', () => {
    const empty = ExerciseRecord.parse({
      sources: { facilitator: false, evaluation: false, live: false, surveys: false },
      delivered: [],
      notes: [],
      hotwash: [],
      decisions: [],
      observations: [],
      votes: [],
      messages: [],
      messageCounts: [],
      surveys: [],
    })
    expect(recordIsEmpty(empty)).toBe(true)
    expect(recordRefs(empty).size).toBe(0)
    const some = { ...empty, notes: [{ ref: 'note:general', text: 'x' }] }
    expect(recordIsEmpty(some)).toBe(false)
    expect([...recordRefs(some)]).toEqual(['note:general'])
  })

  it('refuses a message or decision that carries a name field', () => {
    const base = { ref: 'msg:1', fromRole: 'PIO', text: 'hello' }
    expect(
      ExerciseRecord.shape.messages.element.safeParse({ ...base, displayName: 'Dana' }).success,
    ).toBe(true)
    // Unknown keys are stripped (strict object output), so a name never survives parsing.
    expect(
      ExerciseRecord.shape.messages.element.parse({ ...base, displayName: 'Dana' }),
    ).not.toHaveProperty('displayName')
  })
})
