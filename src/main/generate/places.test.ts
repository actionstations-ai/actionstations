// Places in generation (#500): prompt labels, unknown ids dropped, and the rule pass that fills
// a row's places from its event text.
import { describe, expect, it } from 'vitest'
import { Place } from '@shared/schemas'
import { applyMselPhase } from './mappers'
import { knownPlaceIds, placeIdsFor, placeLabels } from './places'
import { Scenario } from '@shared/schemas/scenario'
import fixture from '../../../tests/fixtures/scenarios/scenario-3.json'

const place = (id: string, label: string, factRef?: string): Place =>
  Place.parse({ id, label, ...(factRef ? { factRef } : {}) })

const places = [
  place('bhs', 'BHS room'),
  place('gate-a1', 'Gate A1', 'gates:A1'),
  place('aoc', 'AOC'),
  place('gate-b2', 'North concourse', 'gates:B2'),
]

describe('placeLabels', () => {
  it('lists fact-linked places first and stops at 60', () => {
    expect(placeLabels(places).map((p) => p.id)).toEqual(['gate-a1', 'gate-b2', 'bhs', 'aoc'])
    const many = Array.from({ length: 80 }, (_, i) => place(`p${i}`, `Place ${i}`))
    expect(placeLabels(many)).toHaveLength(60)
  })
})

describe('knownPlaceIds', () => {
  it('drops unknown and repeated ids and keeps at most five', () => {
    expect(knownPlaceIds(['bhs', 'nowhere', 'bhs', 'aoc'], places)).toEqual(['bhs', 'aoc'])
    const many = Array.from({ length: 8 }, (_, i) => place(`p${i}`, `Place ${i}`))
    expect(
      knownPlaceIds(
        many.map((p) => p.id),
        many,
      ),
    ).toHaveLength(5)
  })
})

describe('placeIdsFor', () => {
  it('prefers the model ids when any are known', () => {
    expect(placeIdsFor(['aoc', 'ghost'], 'Gate A1 is closed', places)).toEqual(['aoc'])
  })
  it('falls back to the event text when the model gave none or only unknown ids', () => {
    expect(placeIdsFor(undefined, 'The AOC calls', places)).toEqual(['aoc'])
    expect(placeIdsFor(['ghost'], 'The AOC calls', places)).toEqual(['aoc'])
  })
})

describe('applyMselPhase with places', () => {
  const s = Scenario.parse(fixture)
  const phase = s.phases[1]!
  const row = (id: string, event: string, extra: object = {}) => ({
    id,
    time: phase.startTime,
    from: 'Duty Manager',
    to: ['all'],
    event,
    expectedAction: 'Respond',
    purposeTag: 'CORE_NARRATIVE' as const,
    format: 'phone_call',
    citations: [],
    ...extra,
  })

  it('sets placeIds from the event text and drops unknown model ids', () => {
    const scenario = structuredClone(s)
    const out = {
      rows: [
        row('I-90', 'A fire alarm sounds in the BHS room.'),
        row('I-91', 'Nothing named here.', { placeIds: ['ghost'] }),
        row('I-92', 'Quiet at the gate.', { placeIds: ['aoc'] }),
      ],
    }
    applyMselPhase(scenario, phase, out, [], { places })
    const byId = new Map(scenario.msel.map((r) => [r.id, r]))
    expect(byId.get('I-90')!.placeIds).toEqual(['bhs'])
    expect(byId.get('I-91')!.placeIds).toBeUndefined()
    expect(byId.get('I-92')!.placeIds).toEqual(['aoc'])
  })

  it('leaves placeIds off when no places are passed', () => {
    const scenario = structuredClone(s)
    applyMselPhase(scenario, phase, { rows: [row('I-90', 'Fire in the BHS room.')] }, [])
    expect(scenario.msel.find((r) => r.id === 'I-90')!.placeIds).toBeUndefined()
  })
})
