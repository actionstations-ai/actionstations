// The sector domain packs of #322 (batch B) extract the identifiers their documents state:
// one short fictional plan per domain, run through the domain's own fact categories, and the
// lint flags an identifier of the same kind that the plan does not list.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { builtinProfile } from '../../../../src/shared/domains'
import { categoriesForProfile } from '../../../../src/main/generate/domain'
import {
  extractFacilityFacts,
  factEntries,
  factIds,
  unknownFacilityIds,
  type FacilityFacts,
} from '../../../../src/main/generate/facility'

const BANNER = 'EXERCISE MATERIAL — for training use.'

function factsFor(domain: string): { text: string; facts: FacilityFacts } {
  const text = readFileSync(join(__dirname, `${domain}.md`), 'utf8')
  const profile = builtinProfile(domain)
  expect(profile.id).toBe(domain)
  return { text, facts: extractFacilityFacts([text], categoriesForProfile(profile)) }
}

const unknownIds = (text: string, facts: FacilityFacts): string[] =>
  unknownFacilityIds(text, facts).map((u) => u.id)

describe('sector fixture documents', () => {
  it.each([
    'k12_schools',
    'commercial_facilities',
    'food_agriculture',
    'telecom',
    'data_center_it',
    'financial_services',
  ])('%s opens with the exercise marking', (domain) => {
    expect(factsFor(domain).text.startsWith(BANNER)).toBe(true)
  })
})

describe('k12_schools facts', () => {
  const { facts } = factsFor('k12_schools')

  it('extracts schools, bus routes, doors and reunification sites', () => {
    expect(factEntries(facts, 'schools')).toEqual(
      expect.arrayContaining([
        'Lincoln Elementary',
        'Maple Grove Elementary School',
        'Washington Middle School',
        'Central High School',
      ]),
    )
    expect(factIds(facts, 'bus_routes')).toEqual(expect.arrayContaining(['14', '22', '31', '40']))
    expect(factIds(facts, 'buses')).toContain('22')
    expect(factIds(facts, 'doors')).toEqual(expect.arrayContaining(['1', '7', '12']))
    expect(factIds(facts, 'wings')).toEqual(expect.arrayContaining(['B']))
    expect(factIds(facts, 'rooms')).toContain('112')
    expect(factEntries(facts, 'reunification_sites')).toEqual(
      expect.arrayContaining(['Riverside Community Church', 'Harbor Valley Sports Complex']),
    )
    expect(factEntries(facts, 'agencies').join(' ')).toMatch(/REMS TA Center/)
  })

  it('flags a school, route and door the plan does not list', () => {
    const unknown = unknownIds(
      'Lockdown at Jefferson Middle School; Bus Route 55 is held; Door 19 is propped open at Central High School.',
      facts,
    )
    expect(unknown).toEqual(expect.arrayContaining(['JEFFERSON MIDDLE SCHOOL', '55', '19']))
    expect(unknown).not.toContain('CENTRAL HIGH SCHOOL')
  })
})

describe('commercial_facilities facts', () => {
  const { facts } = factsFor('commercial_facilities')

  it('extracts towers, pits, garages, entrances and stores', () => {
    expect(factEntries(facts, 'towers')).toEqual(
      expect.arrayContaining(['North Tower', 'South Tower']),
    )
    expect(factIds(facts, 'pits')).toEqual(expect.arrayContaining(['1', '3', '6']))
    expect(factIds(facts, 'slot_banks')).toEqual(expect.arrayContaining(['10', '48']))
    expect(factIds(facts, 'garages')).toEqual(expect.arrayContaining(['A', 'B', '4']))
    expect(factIds(facts, 'entrances')).toEqual(expect.arrayContaining(['1', '3', '5']))
    expect(factIds(facts, 'stores')).toContain('1142')
    expect(factIds(facts, 'tenant_spaces')).toContain('214')
    expect(factEntries(facts, 'agencies').join(' ')).toMatch(/Gaming Control Board/)
  })

  it('flags a tower, pit and entrance the plan does not list', () => {
    const unknown = unknownIds(
      'Smoke reported in the East Tower; the dealer in Pit 9 saw it; guests leave by Entrance 7 and the North Tower stays put.',
      facts,
    )
    expect(unknown).toEqual(expect.arrayContaining(['EAST TOWER', '9', '7']))
    expect(unknown).not.toContain('NORTH TOWER')
  })
})

describe('food_agriculture facts', () => {
  const { facts } = factsFor('food_agriculture')

  it('extracts lines, elevators, bins, the establishment number and lot codes', () => {
    expect(factIds(facts, 'lines')).toEqual(expect.arrayContaining(['1', '2', '3']))
    expect(factIds(facts, 'sites')).toEqual(expect.arrayContaining(['1', '2', '4']))
    expect(factIds(facts, 'bins')).toEqual(expect.arrayContaining(['11', '18', '3']))
    expect(factEntries(facts, 'establishments')).toEqual(['4127'])
    expect(factEntries(facts, 'lot_codes')).toContain('24A118')
    expect(factIds(facts, 'tanks')).toContain('6')
    expect(factIds(facts, 'barns')).toEqual(expect.arrayContaining(['1', '6']))
    expect(factIds(facts, 'cold_rooms')).toEqual(expect.arrayContaining(['2', '5']))
    expect(factEntries(facts, 'agencies').join(' ')).toMatch(/FSIS/)
  })

  it('flags a line, elevator and establishment the plan does not list', () => {
    const unknown = unknownIds(
      'Packaging Line 7 is down; trucks divert from Elevator 9; FSIS retains product from Est. 9911.',
      facts,
    )
    expect(unknown).toEqual(expect.arrayContaining(['7', '9', '9911']))
  })
})

describe('telecom facts', () => {
  const { facts } = factsFor('telecom')

  it('extracts central offices, cell sites, rings, hubs, PSAPs and ASNs', () => {
    expect(factEntries(facts, 'central_offices')).toEqual(
      expect.arrayContaining([
        'Riverside Central Office',
        'Kingsley Central Office',
        'RVSDMOXA01T',
        'KNGSMOXA02T',
      ]),
    )
    expect(factEntries(facts, 'cell_sites')).toEqual(expect.arrayContaining(['4417', '4418']))
    expect(factIds(facts, 'rings')).toContain('3')
    expect(factEntries(facts, 'cables')).toEqual(['CBL-0442'])
    expect(factEntries(facts, 'hubs')).toEqual(
      expect.arrayContaining(['Headend North', 'Hub 7', 'Node 3B-14']),
    )
    expect(factEntries(facts, 'psaps')).toEqual(
      expect.arrayContaining(['Lake County 911', 'Harbor City 911']),
    )
    expect(factEntries(facts, 'asns')).toEqual(expect.arrayContaining(['AS64500', 'AS64501']))
    expect(factEntries(facts, 'pops')).toEqual(expect.arrayContaining(['MTSO East', 'POP DEN1']))
    expect(factEntries(facts, 'agencies').join(' ')).toMatch(/FCC/)
  })

  it('flags a PSAP, cell site and ASN the plan does not list', () => {
    const unknown = unknownIds(
      'Cell Site 5120 is down and calls to Pine County 911 fail; routes from AS65010 appear; Lake County 911 is fine.',
      facts,
    )
    expect(unknown).toEqual(expect.arrayContaining(['5120', 'PINE COUNTY 911', 'AS65010']))
    expect(unknown).not.toContain('LAKE COUNTY 911')
  })

  it('does not take "Dial 911" or "Next Generation 911" for a PSAP', () => {
    expect(unknownIds('Dial 911 still works. Next Generation 911 is unaffected.', facts)).toEqual(
      [],
    )
  })
})

describe('data_center_it facts', () => {
  const { facts } = factsFor('data_center_it')

  it('extracts sites, halls, power and cooling equipment and clusters', () => {
    expect(factEntries(facts, 'sites')).toEqual(expect.arrayContaining(['DC1', 'DC2']))
    expect(factIds(facts, 'halls')).toEqual(expect.arrayContaining(['1', '2']))
    expect(factEntries(facts, 'cages')).toEqual(expect.arrayContaining(['Cage 14', 'Rack F12']))
    expect(factEntries(facts, 'power')).toEqual(
      expect.arrayContaining(['MSB-1', 'ATS-1', 'ATS-2', 'GEN-1', 'GEN-3', 'UPS-1A', 'UPS-1B']),
    )
    expect(factEntries(facts, 'cooling')).toEqual(
      expect.arrayContaining(['CRAH-07', 'CRAH-08', 'CH-1', 'CH-2']),
    )
    expect(factEntries(facts, 'clusters')).toEqual(
      expect.arrayContaining(['Cluster PROD-01', 'esx-node-14', 'DS-SAN-03']),
    )
    expect(factEntries(facts, 'tickets')).toEqual(expect.arrayContaining(['INC0012345']))
    expect(factEntries(facts, 'agencies').join(' ')).toMatch(/DIBNet/)
  })

  it('flags a hall, generator and cooling unit the plan does not list', () => {
    const unknown = unknownIds(
      'Data Hall 4 is at 35 C after CRAH-11 tripped; GEN-5 failed to start; DC1 runs on GEN-1.',
      facts,
    )
    expect(unknown).toEqual(expect.arrayContaining(['4', 'CRAH-11', 'GEN-5']))
    expect(unknown).not.toContain('GEN-1')
    expect(unknown).not.toContain('DC1')
  })
})

describe('financial_services facts', () => {
  const { facts } = factsFor('financial_services')

  it('extracts branches, ATMs, the routing number and the charter', () => {
    expect(factEntries(facts, 'branches')).toEqual(
      expect.arrayContaining(['Main Office', 'Riverside Branch', 'Oak Hill Branch', 'Branch 7']),
    )
    expect(factEntries(facts, 'atms')).toEqual(
      expect.arrayContaining(['ATM 0412', 'ATM 0415', 'ITM 3']),
    )
    expect(factEntries(facts, 'routing')).toEqual(['011000999'])
    expect(factEntries(facts, 'charter')).toEqual(['58231'])
    expect(factIds(facts, 'drawers')).toEqual(expect.arrayContaining(['1', '6', 'A']))
    expect(factEntries(facts, 'agencies').join(' ')).toMatch(/FDIC/)
  })

  it('flags a branch, ATM and routing number the plan does not list', () => {
    const unknown = unknownIds(
      'The Elm Street Branch reports ATM 0999 empty; wires went to routing number 021000555; the Riverside Branch is open.',
      facts,
    )
    expect(unknown).toEqual(expect.arrayContaining(['ELM STREET BRANCH', 'ATM 0999', '021000555']))
    expect(unknown).not.toContain('RIVERSIDE BRANCH')
  })
})
