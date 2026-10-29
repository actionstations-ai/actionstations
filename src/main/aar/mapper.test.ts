// The aar stage mapper (#419): evidence refs checked against the record (a finding with none is
// dropped), citation keys resolved to retrieved or scenario sections, role keys to ids, ratings
// proposed only where evidence exists, and a person's decisions in the previous draft kept.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { FacilitatorState } from '@shared/ipc/facilitator'
import { Scenario, type Aar, type AarOutput, type SearchHit } from '@shared/schemas'
import type { RetrievedChunk } from '../generate/retrieval'
import { applyAar, observationCounts, scenarioCitations, type ApplyContext } from './mapper'
import { assembleRecord } from './record'

const scenario = Scenario.parse(
  JSON.parse(readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8')),
)
const facilitator: FacilitatorState = {
  elapsedMin: 0,
  delivered: {},
  notes: { 'I-06': 'PA silenced in four minutes.', 'I-09': 'Go Dark decided in the IT room.' },
  generalNotes: 'Late start.',
  hotwash: [{ id: 'hw-1', kind: 'improvement', text: 'Whiteboards had no owner.', at: 'x' }],
  decisions: [],
}
const record = assembleRecord(scenario, {
  facilitator,
  evaluation: {
    formatVersion: 1,
    updatedAt: '2026-10-28T17:00:00.000Z',
    observations: [
      {
        id: 'O-1',
        at: '2026-10-28T14:20:00.000Z',
        rowId: 'I-06',
        taskId: 'T-07',
        rating: 'partial',
        note: '',
        source: 'facilitate',
      },
      {
        id: 'O-2',
        at: '2026-10-28T14:21:00.000Z',
        rowId: 'I-09',
        taskId: 'T-07',
        rating: 'met',
        note: '',
        source: 'facilitate',
      },
      {
        id: 'O-3',
        at: '2026-10-28T14:22:00.000Z',
        rowId: 'I-09',
        taskId: 'T-13',
        rating: 'not_met',
        note: '',
        source: 'facilitate',
      },
    ],
  },
})

const hit: SearchHit = {
  chunkId: 7,
  documentId: 'tirp',
  documentTitle: 'Terminal Incident Response Plan',
  headingPath: 'TIRP › Section 13 › 13.7 Checklist: Cybersecurity Incident',
  page: 44,
  text: 'Notify the FBI Cyber Task Force and CISA.',
  score: 1,
}
const retrieved: RetrievedChunk[] = [{ key: 'C1', hit }]

let n = 0
const ctx = (previous: Aar | null = null): ApplyContext => ({
  scenario,
  record,
  retrieved,
  scenarioCitations: scenarioCitations(scenario),
  previous,
  newId: () => `id-${++n}`,
})

const area = (
  over: Partial<AarOutput['capabilities'][number]['areasForImprovement'][number]> = {},
) => ({
  title: 'Go Dark decided apart',
  analysisMd: 'IT decided alone.',
  evidence: ['note:I-09'],
  citations: ['S1'],
  recommendation: 'Make it a joint call.',
  correctiveActions: [
    { action: 'Revise TIRP 13.6', element: 'planning' as const, ownerRole: 'ops-director' },
  ],
  ...over,
})

const output = (over: Partial<AarOutput['capabilities'][number]> = {}): AarOutput => ({
  executiveSummaryMd: 'Summary.',
  capabilities: [
    {
      capability: 'operational_coordination',
      proposedRating: 'S',
      ratingRationale: 'Mostly worked.',
      strengths: [
        {
          title: 'PA silenced fast',
          analysisMd: 'Four minutes.',
          evidence: ['[note:I-06]', 'obs:O-1'],
          citations: ['C1', 'S2', 'C9'],
        },
        {
          title: 'Invented',
          analysisMd: 'No evidence.',
          evidence: ['note:I-99', 'obs:nope'],
          citations: [],
        },
      ],
      areasForImprovement: [area()],
      ...over,
    },
  ],
})

describe('scenarioCitations', () => {
  it('keys the sections the scenario already cites, each once', () => {
    const list = scenarioCitations(scenario)
    expect(list[0]!.key).toBe('S1')
    expect(list.map((c) => c.key)).toEqual(list.map((_, i) => `S${i + 1}`))
    const ids = list.map(
      (c) => `${c.citation.documentId}|${c.citation.headingPath}|${c.citation.page ?? ''}`,
    )
    expect(new Set(ids).size).toBe(ids.length)
    expect(list.some((c) => c.citation.headingPath.includes('13.6'))).toBe(true)
  })
})

describe('applyAar', () => {
  it('keeps findings with evidence, drops unsupported ones and unknown refs', () => {
    const r = applyAar(output(), ctx())
    const cap = r.capabilities[0]!
    expect(cap.strengths.map((f) => f.title)).toEqual(['PA silenced fast'])
    expect(cap.strengths[0]!.evidence).toEqual(['note:I-06', 'obs:O-1'])
    expect(r.unsupported).toEqual([{ capability: 'operational_coordination', title: 'Invented' }])
    expect(r.unknownRefs).toEqual(['note:I-99', 'obs:nope'])
  })

  it('resolves retrieved and scenario citation keys and drops unknown ones', () => {
    const r = applyAar(output(), ctx())
    const strength = r.capabilities[0]!.strengths[0]!
    expect(strength.citations.map((c) => c.headingPath)).toEqual([
      hit.headingPath,
      scenarioCitations(scenario)[1]!.citation.headingPath,
    ])
    expect(strength.citations[0]!.quote).toContain('FBI')
    expect(r.droppedCitations).toEqual(['C9'])
    const areaFinding = r.capabilities[0]!.areasForImprovement[0]!
    expect(areaFinding.citations[0]!.headingPath).toBe(
      scenarioCitations(scenario)[0]!.citation.headingPath,
    )
  })

  it('maps corrective actions with role ids and empty owner fields for a person to fill', () => {
    const r = applyAar(
      output({
        areasForImprovement: [
          area({
            correctiveActions: [
              { action: 'Revise TIRP 13.6', element: 'planning', ownerRole: 'ops-director' },
              { action: 'Train the agents', element: 'training', ownerRole: 'mayor' },
              { action: '   ', element: 'equipment' },
            ],
          }),
        ],
      }),
      ctx(),
    )
    const actions = r.capabilities[0]!.areasForImprovement[0]!.correctiveActions
    expect(actions).toHaveLength(2)
    expect(actions[0]).toMatchObject({
      ownerRole: 'ops-director',
      ownerOrganization: '',
      poc: '',
      status: 'open',
      locked: false,
    })
    expect(actions[1]!.ownerRole).toBeUndefined()
    expect(r.unknownRoles).toEqual(['mayor'])
  })

  it('counts observations per capability and fills objective refs from the scenario', () => {
    expect(observationCounts(record, scenario, 'operational_coordination')).toEqual({
      met: 1,
      partial: 1,
      not_met: 0,
      not_observed: 0,
    })
    expect(observationCounts(record, scenario, 'cybersecurity')).toEqual({
      met: 0,
      partial: 0,
      not_met: 1,
      not_observed: 0,
    })
    const cap = applyAar(output(), ctx()).capabilities[0]!
    expect(cap.observationCounts).toEqual({ met: 1, partial: 1, not_met: 0, not_observed: 0 })
    expect(cap.objectiveRefs).toEqual(['obj-decision'])
    expect(cap.proposedRating).toBe('S')
    expect(cap.rating).toBeUndefined()
  })

  it('omits a proposed rating when the capability has no evidence at all', () => {
    const r = applyAar(
      {
        executiveSummaryMd: '',
        capabilities: [
          {
            capability: 'public_information_and_warning',
            proposedRating: 'P',
            ratingRationale: '',
            strengths: [],
            areasForImprovement: [],
          },
          {
            capability: 'not_a_capability' as never,
            ratingRationale: '',
            strengths: [],
            areasForImprovement: [],
          },
          {
            capability: 'operational_coordination',
            proposedRating: 'M',
            ratingRationale: 'Rated.',
            strengths: [],
            areasForImprovement: [],
          },
          {
            capability: 'operational_coordination',
            proposedRating: 'P',
            ratingRationale: 'Twice.',
            strengths: [],
            areasForImprovement: [],
          },
        ],
      },
      ctx(),
    )
    expect(r.capabilities.map((c) => c.capability)).toEqual([
      'public_information_and_warning',
      'operational_coordination',
    ])
    expect(r.capabilities[0]!.proposedRating).toBeUndefined()
    expect(r.capabilities[0]!.ratingRationale).toMatch(/Not enough evidence/)
    // Observations exist for this capability, so the proposal stands; the duplicate is skipped.
    expect(r.capabilities[1]!.proposedRating).toBe('M')
    expect(r.unknownCapabilities).toEqual(['not_a_capability'])
  })

  it('keeps confirmed ratings, locked findings and typed owner fields from the previous draft', () => {
    const first = applyAar(output(), ctx())
    const previous: Aar = {
      formatVersion: 1,
      createdAt: '2026-10-28T18:00:00.000Z',
      updatedAt: '2026-10-28T18:00:00.000Z',
      executiveSummaryMd: '',
      sourcesUsed: ['facilitator'],
      capabilities: [
        {
          ...first.capabilities[0]!,
          rating: 'M',
          strengths: [
            {
              ...first.capabilities[0]!.strengths[0]!,
              title: 'PA silenced fast',
              analysisMd: 'Edited by hand.',
              locked: true,
            },
          ],
          areasForImprovement: [
            {
              ...first.capabilities[0]!.areasForImprovement[0]!,
              correctiveActions: [
                {
                  ...first.capabilities[0]!.areasForImprovement[0]!.correctiveActions[0]!,
                  ownerOrganization: 'Airport Operations',
                  poc: 'Duty manager',
                  dueDate: '2027-03-31',
                  status: 'in_progress',
                },
                {
                  id: 'kept',
                  action: 'Buy whiteboards',
                  element: 'equipment',
                  ownerOrganization: 'Facilities',
                  poc: '',
                  status: 'open',
                  locked: true,
                },
              ],
            },
            {
              id: 'lf',
              title: 'Locked area',
              analysisMd: 'Kept.',
              citations: [],
              evidence: ['hw:hw-1'],
              objectiveRefs: [],
              recommendation: 'Keep.',
              correctiveActions: [],
              locked: true,
            },
          ],
        },
        {
          capability: 'cybersecurity',
          rating: 'U',
          ratingRationale: '',
          observationCounts: { met: 0, partial: 0, not_met: 1, not_observed: 0 },
          objectiveRefs: [],
          strengths: [],
          areasForImprovement: [],
        },
      ],
      participantFeedbackMd: '',
      participatingOrganizations: [],
      acronyms: [],
      provenance: [],
    }
    const r = applyAar(output(), ctx(previous))
    const cap = r.capabilities[0]!
    expect(cap.rating).toBe('M')
    expect(cap.proposedRating).toBe('S')
    expect(cap.strengths[0]!.analysisMd).toBe('Edited by hand.')
    expect(cap.strengths[0]!.locked).toBe(true)
    const actions = cap.areasForImprovement[0]!.correctiveActions
    expect(actions[0]).toMatchObject({
      ownerOrganization: 'Airport Operations',
      poc: 'Duty manager',
      dueDate: '2027-03-31',
      status: 'in_progress',
      locked: false,
    })
    expect(actions[1]).toMatchObject({ id: 'kept', locked: true })
    expect(cap.areasForImprovement[1]!.title).toBe('Locked area')
    // A capability the model dropped but a person rated stays in the report.
    expect(r.capabilities[1]).toMatchObject({ capability: 'cybersecurity', rating: 'U' })
    expect(r.keptRatings).toBe(1)
    expect(r.keptLocked).toBe(3)
  })
})
