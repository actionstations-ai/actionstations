// #165: broad profile nouns ("Unit", "Station", "Zone", "Section") and near-miss names gave
// FACILITY_UNKNOWN_ID false positives in the #156 live runs.
import { describe, expect, it } from 'vitest'
import type { MselRow } from '@shared/schemas'
import { builtinProfile } from '@shared/domains'
import { referenceTexts } from '../../../tests/fixtures/domains/fake-index'
import { categoriesForProfile } from './domain'
import { extractFacilityFacts, factIds, lintRowFacility, unknownFacilityIds } from './facility'
import { editDistance, nearestEntry } from './facility-near-miss'

const row = (id: string, event: string, expectedAction = ''): MselRow => ({
  id,
  phaseId: 'p1',
  time: '0:10',
  from: 'SimCell',
  toRoleIds: ['ops'],
  event,
  expectedAction,
  purposeTag: 'CORE_NARRATIVE',
  citations: [],
  locked: false,
})

const factsFor = (profile: string, texts: string[]) =>
  extractFacilityFacts(texts, categoriesForProfile(builtinProfile(profile)))

const ids = (text: string, facts: ReturnType<typeof factsFor>): string[] =>
  unknownFacilityIds(text, facts).map((u) => `${u.kind}:${u.id}`)

describe('dam generating units (#165)', () => {
  const dam = factsFor('water_dam', referenceTexts('reference/dam'))

  it('still extracts the documented generating units', () => {
    expect(factIds(dam, 'units')).toEqual(expect.arrayContaining(['1', '2']))
    expect(factIds(dam, 'units')).not.toContain('7')
  })

  it('does not lint "Unit 4" / "Unit 7" that are patrol or field units', () => {
    const patrol = row(
      'M-07',
      'Pike County Sheriff Unit 4 reports a vehicle parked at the Dam Access Road gate; Unit 7 is en route from Harlow.',
      'Security Manager asks Unit 4 to hold the scene and checks the gate camera.',
    )
    expect(lintRowFacility(patrol, dam)).toEqual([])
    expect(ids('Patrol Unit 7 and Field Unit 4 sweep the left abutment.', dam)).toEqual([])
  })

  it('still lints an unknown unit in a generation row', () => {
    expect(ids('Unit 4 trips offline in the powerhouse; output drops 20 MW.', dam)).toEqual([
      'generating unit / turbine:4',
    ])
    expect(ids('Generating Unit 3 governor alarm.', dam)).toEqual(['generating unit / turbine:3'])
  })

  it('keeps spillway gates and zones linted in context, not access gates', () => {
    expect(ids('Open Spillway Gate 7 to raise the release.', dam)).toEqual(['spillway gate:7'])
    expect(ids('Gate 6 opens 2 ft; reservoir pool drops.', dam)).toEqual(['spillway gate:6'])
    expect(ids('Security opens Access Gate 9 for the contractor truck.', dam)).toEqual([])
    expect(ids('Sound sirens for Inundation Zone D.', dam)).toEqual([
      'inundation / evacuation zone:D',
    ])
  })
})

describe('context-gated generic nouns in other profiles (#165)', () => {
  it('healthcare: an EMS unit is not a care unit', () => {
    const h = factsFor('healthcare', ['Inpatient beds: Units 4A, 4B and 5 West (med-surg).'])
    expect(ids('EMS Unit 12 arrives at the ambulance bay.', h)).toEqual([])
    expect(ids('Unit 9C reports patient census at 110%.', h)).toEqual(['unit / ward:9C'])
  })

  it('municipal: a fire station is linted, a pump station is not', () => {
    const m = factsFor('municipal', ['Fire Stations 1, 2 and 3 cover the city.'])
    expect(ids('Station 6 crews respond to the fire.', m)).toEqual(['fire / police station:6'])
    expect(ids('The Station 6 lift pump fails.', m)).toEqual([])
  })

  it('transit: State Route 9 is not a bus route', () => {
    const t = factsFor('transit', ['Bus Routes 14, 22 and 41 serve the depot.'])
    expect(ids('Buses detour via State Route 9 around the crash.', t)).toEqual([])
    expect(ids('Route 88 riders face a detour.', t)).toEqual(['bus route:88'])
  })

  it('stadium: a plan section is not a seating section', () => {
    const s = factsFor('stadium_venue', ['Seating Sections 101–130 in the lower bowl.'])
    expect(ids('Per Section 7 of the EAP, notify the county.', s)).toEqual([])
    expect(ids('Fans in Section 140 report smoke.', s)).toEqual(['seating section:140'])
  })

  it('water utility: a zone without pressure context is not a pressure zone', () => {
    const w = factsFor('water_utility', ['Pressure Zones 1, 2 and 3 are fed by booster pumps.'])
    expect(ids('Zone 5 pressure falls below 20 psi.', w)).toEqual(['pressure zone:5'])
    expect(ids('The parking Zone 5 badge reader is down.', w)).toEqual([])
  })
})

describe('near-miss identifiers (#165)', () => {
  const transit = factsFor('transit', [
    'Rail service stops at Confluence Station and the Northside Depot; buses lay over at Riverside Transit Center.',
  ])

  it('suggests the documented name for "Confluence Park Station"', () => {
    const [u] = unknownFacilityIds(
      'Riders crowd Confluence Park Station after the outage.',
      transit,
    )
    expect(u).toMatchObject({ id: 'CONFLUENCE PARK STATION', didYouMean: 'Confluence Station' })
    const [w] = lintRowFacility(row('M-12', 'Crowds build at Confluence Park Station.'), transit)
    expect(w).toMatchObject({ code: 'FACILITY_UNKNOWN_ID', severity: 'warning' })
    expect(w!.message).toContain('did you mean Confluence Station?')
    expect(w!.suggestion).toMatch(/^Did you mean Confluence Station\?/)
  })

  it('keeps a plain unknown when nothing is close', () => {
    const [u] = unknownFacilityIds('Buses stage at the Elm Street Depot.', transit)
    expect(u).toMatchObject({ id: 'ELM STREET DEPOT' })
    expect(u!.didYouMean).toBeUndefined()
    const [w] = lintRowFacility(row('M-13', 'Buses stage at the Elm Street Depot.'), transit)
    expect(w!.message).toContain('the documents list')
  })

  it('never suggests across numbers', () => {
    const byId = new Map([
      ['RTU-01', 'RTU-01'],
      ['RTU-02', 'RTU-02'],
    ])
    expect(nearestEntry('RTU-12', byId)).toBeUndefined()
    expect(nearestEntry('7', new Map([['1', '1']]))).toBeUndefined()
  })

  it('tolerates one typo in a long name word', () => {
    const byId = new Map([['CONFLUENCE STATION', 'Confluence Station']])
    expect(nearestEntry('CONFLUANCE STATION', byId)).toBe('Confluence Station')
    expect(editDistance('CONFLUENCE', 'CONFLUANCE')).toBe(1)
  })
})
