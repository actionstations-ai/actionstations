// The UAS organization document set (#157) must give the unmanned_systems profile the
// identifiers its scenarios are built from: flight sites, tails, ground control stations,
// link frequencies, hangars, hosts, networks and agencies — and the set's "does not exist"
// tells must lint as unknown.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { builtinProfile } from '../../../../src/shared/domains'
import { categoriesForProfile } from '../../../../src/main/generate/domain'
import {
  extractFacilityFacts,
  factEntries,
  factIds,
  unknownFacilityIds,
} from '../../../../src/main/generate/facility'
import { referenceFiles } from '../fake-index'

const BANNER = 'EXERCISE MATERIAL — for training use.'
const PLAN_FILES = referenceFiles('reference/uas-ops').filter((f) => !f.endsWith('SOURCES.md'))
const texts = PLAN_FILES.map((f) => readFileSync(f, 'utf8'))
const facts = extractFacilityFacts(texts, categoriesForProfile(builtinProfile('unmanned_systems')))

describe('reference/uas-ops with the unmanned_systems profile', () => {
  it('ships four plans that each open with the exercise marking and name no real organization', () => {
    expect(PLAN_FILES).toHaveLength(4)
    for (const text of texts) {
      expect(text.split('\n').slice(0, 4).join('\n')).toContain(BANNER)
      expect(text).not.toMatch(/\bRIT\b|Rochester|Tait|Carlson|Monroe|universit|laborator/i)
    }
  })

  it('extracts the flight sites, tails and ground control stations', () => {
    expect(factEntries(facts, 'flight_sites')).toEqual(
      expect.arrayContaining([
        'Horton Field',
        'Lakeshore Flight Area',
        'Quarry Flight Area',
        'Birch Hollow Range',
      ]),
    )
    expect(factIds(facts, 'airframes')).toEqual(
      expect.arrayContaining(['UAS-01', 'UAS-03', 'UAS-11', 'UAS-12']),
    )
    expect(factIds(facts, 'gcs_hosts')).toEqual(
      expect.arrayContaining(['GCS-01', 'GCS-02', 'GCS-03', 'GCS-04']),
    )
  })

  it('extracts links, airspace, hangars and the generic categories', () => {
    expect(factEntries(facts, 'frequencies').join(' ')).toMatch(/915 MHz/)
    expect(factEntries(facts, 'airspace').join(' ')).toMatch(/Class C/)
    expect(factEntries(facts, 'hangars')).toEqual(
      expect.arrayContaining(['Hangar 1', 'Hangar 2', 'Hangar 3']),
    )
    expect(factEntries(facts, 'hosts')).toEqual(expect.arrayContaining(['HUOG-NAS01']))
    expect(factEntries(facts, 'networks').join(' ')).toMatch(/10\.17\.40/)
    expect(factEntries(facts, 'agencies').join(' ')).toMatch(/FAA/)
  })

  it('flags the data-integrity tells as unknown identifiers', () => {
    const unknown = unknownFacilityIds(
      'Launch UAS-13 from GCS-07 in Hangar 4 while UAS-02 holds at Horton Field',
      facts,
    ).map((u) => u.id)
    expect(unknown).toEqual(expect.arrayContaining(['UAS-13', 'GCS-07', 'HANGAR 4']))
    expect(unknown).not.toContain('UAS-02')
  })
})
