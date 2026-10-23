import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { MselRow, Scenario } from '@shared/schemas'
import {
  compressIds,
  extractFacilityFacts,
  factEntries,
  factIds,
  gateList,
  ipPrefixes,
  facilitySheet,
  foreignPrivateIps,
  lintFacilityIds,
  lintRowFacility,
  unknownFacilityIds,
  withEntries,
  type FacilityFacts,
} from './facility'

const NCIA = resolve('reference/ncia')
const nciaTexts = (): string[] =>
  readdirSync(NCIA)
    .filter((f) => f.endsWith('.md'))
    .map((f) => readFileSync(join(NCIA, f), 'utf8'))

/** The baseline live run from #84 (tests/fixtures/generate/sample-run), before the fix. */
const SAMPLE_RUN = JSON.parse(
  readFileSync(resolve('tests/fixtures/generate/sample-run/scenario.json'), 'utf8'),
) as Scenario

const row = (id: string, event: string, expectedAction = ''): MselRow => ({
  id,
  phaseId: 'p1',
  time: '0:10',
  from: 'Ramp Supervisor',
  toRoleIds: ['ops'],
  event,
  expectedAction,
  purposeTag: 'CORE_NARRATIVE',
  citations: [],
  locked: false,
})

describe('extractFacilityFacts on reference/ncia', () => {
  const facts = extractFacilityFacts(nciaTexts())
  const entries = (id: string) => factEntries(facts, id)
  const gates = factIds(facts, 'gates')

  it('finds the runways, taxiways, gates and concourses the AEP states', () => {
    expect(entries('runways')).toEqual(['5/23', '1/19'])
    expect(factIds(facts, 'runways')).toEqual(
      expect.arrayContaining(['5/23', '1/19', '5', '23', '1', '19']),
    )
    expect(factIds(facts, 'runways')).not.toContain('17')
    expect(entries('taxiways')).toEqual(expect.arrayContaining(['A', 'B', 'C', 'D']))
    for (let n = 1; n <= 8; n++) expect(gates).toContain(`A${n}`)
    for (let n = 1; n <= 10; n++) expect(gates).toContain(`B${n}`)
    // Stored as ranges, so facility-facts.md stays short.
    expect(entries('gates')).toEqual(expect.arrayContaining(['A1–A8', 'B1–B10']))
    expect(gates).not.toContain('C12')
    // terminal-map.md mentions Gate C4 / Gate Z99 only as deliberately non-existent tells.
    expect(gates).not.toContain('Z99')
    expect(gates).not.toContain('C4')
    expect(entries('concourses')).toEqual(['A', 'B'])
    expect(entries('locations')).toEqual(expect.arrayContaining(['Room 104', 'Level 1', 'Level 2']))
  })

  it('finds hostnames, the IP schema, phone numbers and agencies', () => {
    expect(entries('hosts')).toEqual(expect.arrayContaining(['NCIA-PACS-CORE', 'SEC-SVR-01']))
    expect(entries('hosts')).not.toContain('HSPD-5')
    expect(entries('hosts')).not.toContain('AES-256')
    expect(entries('hosts')).not.toContain('MAN-MADE')
    expect(ipPrefixes(facts)).toEqual(expect.arrayContaining(['10.66.0', '10.66.1', '10.66.2']))
    expect(entries('phones')).toContain('(330) 555-2424')
    expect(entries('agencies')).toEqual(expect.arrayContaining(['FBI', 'TSA', 'FAA']))
    expect(facts.documentCount).toBe(4)
  })

  it('renders a compact sheet for the prompts', () => {
    const sheet = facilitySheet(facts)
    expect(sheet.find((l) => l.startsWith('Runways:'))).toBe('Runways: 5/23, 1/19')
    // 38 documented gates: spelled out (a 30B model reads "B17" into "B1–B10" otherwise).
    expect(sheet.find((l) => l.startsWith('Gates'))).toMatch(
      /^Gates \(the complete list\): A1, A2, A3, A4, A5, A6, A7, A8, B1, B2, .*B10, 1, 2, .*20, 24$/,
    )
    expect(sheet.find((l) => l.startsWith('Concourses:'))).toBe('Concourses: A, B')
    expect(sheet.find((l) => l.startsWith('IP ranges:'))).toContain('10.66.0.x')
    const trimmed = withEntries(withEntries(facts, 'runways', []), 'gates', [])
    expect(facilitySheet(trimmed).some((l) => l.startsWith('Runways'))).toBe(false)
  })

  it('flags every invented identifier of the #84 baseline run (the "before" number)', () => {
    const warnings = lintFacilityIds(SAMPLE_RUN, facts)
    const ids = warnings.flatMap((w) => [...w.message.matchAll(/(?:Runway|Taxiway|Gate) \S+/g)])
    const named = new Set(ids.map((m) => m[0]))
    // The issue's examples: Runway 17 and Gate C12. "Taxiway Alpha" is Taxiway A, which the
    // AEP lists. The AEP's perimeter "Gates 1–20" are documented, but "Gate 12 is blocked by a
    // crowd of passengers" is a passenger gate, and those are lettered (A1–A8, B1–B10, #222).
    expect([...named]).toEqual(expect.arrayContaining(['Runway 17', 'Gate C12', 'Gate 12']))
    expect([...named]).not.toContain('Gate B5')
    // Measured: 9 of the 40 baseline rows name an undocumented runway or gate.
    expect(warnings.length).toBe(9)
  })
})

describe('unknownFacilityIds / lintRowFacility', () => {
  const facts: FacilityFacts = {
    ...extractFacilityFacts([
      'Runways 5/23 and 1/19. Taxiways A–D. Main Terminal Ramp: 18 gates (A1–A8, B1–B10). Concourse A and Concourse B. AOC: Room 104.',
    ]),
  }

  it('accepts documented identifiers, and never judges rooms or levels', () => {
    expect(unknownFacilityIds('Runway 23, Taxiway Bravo, Gate B10, Concourse A', facts)).toEqual([])
    expect(
      unknownFacilityIds('Fire alarm on Level 3 of the parking deck, Room 212', facts),
    ).toEqual([])
  })

  it('reports the unknown ones with what the documents list instead', () => {
    const u = unknownFacilityIds('Lights on Runway 17 and Taxiway Echo near Gate C12', facts)
    expect(u.map((x) => `${x.kind}:${x.id}`)).toEqual(['runway:17', 'taxiway:E', 'gate:C12'])
    expect(u[0]!.known).toBe('5/23, 1/19')
    expect(u[2]!.known).toBe(
      'A1, A2, A3, A4, A5, A6, A7, A8, B1, B2, B3, B4, B5, B6, B7, B8, B9, B10',
    )
  })

  it('checks a bare-number gate in a flight context against the concourse gates (#222)', () => {
    const withPerimeter = extractFacilityFacts([
      'Main Terminal Ramp: 18 gates (A1–A8, B1–B10). Control access points to the airfield (Gates 1–20).',
    ])
    const flight = unknownFacilityIds('AC 444 to Toronto now boards at Gate 14.', withPerimeter)
    expect(flight.map((x) => `${x.kind}:${x.id}`)).toEqual(['gate:14'])
    expect(
      unknownFacilityIds('Police close perimeter Gate 14 to vehicle traffic.', withPerimeter),
    ).toEqual([])
    expect(unknownFacilityIds('UA 2401 departs from Gate B6.', withPerimeter)).toEqual([])
    // Without per-concourse gates a documented bare number is a gate like any other.
    const bare = extractFacilityFacts(['The terminal has Gates 1–20.'])
    expect(unknownFacilityIds('Flight 12 boards at Gate 14.', bare)).toEqual([])
  })

  it('skips categories the documents never mention', () => {
    const none = extractFacilityFacts(['The terminal has two levels.'])
    expect(unknownFacilityIds('Runway 17, Gate Z99', none)).toEqual([])
  })

  it('does not flag an identifier the row frames as fake data', () => {
    const fake = row(
      'I-06',
      'FIDS lists UA 666 to PURGATORY at Gate Z99.',
      'Ops notes there is no such gate; Gate Z99 does not exist.',
    )
    expect(lintRowFacility(fake, facts)).toEqual([])
    const real = row('I-02', 'Lights on Runway 17 are cycling.')
    expect(lintRowFacility(real, facts)[0]).toMatchObject({
      code: 'FACILITY_UNKNOWN_ID',
      rowId: 'I-02',
      severity: 'warning',
    })
    expect(lintRowFacility(real, facts)[0]!.message).toContain('Runway 17 (the documents list')
  })

  it('reports private addresses outside the documented /16 as foreign', () => {
    const f = extractFacilityFacts(['AODB server 10.66.0.10; PACS 10.66.1.11'])
    expect(foreignPrivateIps('from 10.66.4.9 and 192.168.1.55 and 104.244.177.192', f)).toEqual([
      '192.168.1.55',
    ])
    expect(foreignPrivateIps('10.200.1.47', extractFacilityFacts(['no addresses']))).toEqual([])
  })

  it('compresses gate lists into ranges, used only when the list is long', () => {
    expect(compressIds(['A1', 'A2', 'A3', 'A5', 'B1', 'B2', '24', 'Z99'])).toBe(
      'A1–A3, A5, B1–B2, 24, Z99',
    )
    const many = Array.from({ length: 60 }, (_, i) => `C${i + 1}`)
    expect(gateList(many)).toBe('C1–C60')
    expect(gateList(['A1', 'A2'])).toBe('A1, A2')
  })
})
