// Limits from the facility facts (#347 item 7): a 15-ton chlorine release from a site whose
// largest container is a 1-ton cylinder, a district run above its MAOP.
import { describe, expect, it } from 'vitest'
import type { MselRow, Scenario } from '@shared/schemas'
import { lintFacilityIds, type FacilityFacts } from './facility'
import {
  factLimits,
  overLimit,
  parseLimit,
  QUANTITY_OVER_LIMIT,
  quantities,
} from './facility-limits'
import { parseFacilityFile } from './facility-file'

const FACTS: FacilityFacts = parseFacilityFile(`# Facility facts

## Limits
<!-- category: limits -->

- Chlorine, largest container: 1 ton
- Pressure District 7 MAOP: 2 psig
`)

const row = (id: string, event: string): MselRow => ({
  id,
  phaseId: 'p1',
  time: '0:30',
  from: 'Plant Operator',
  toRoleIds: ['ops'],
  event,
  expectedAction: 'Ops responds.',
  purposeTag: 'CORE_NARRATIVE',
  citations: [],
  locked: false,
})

const scenario = (rows: MselRow[]): Scenario => ({ msel: rows }) as unknown as Scenario

describe('parsing limits', () => {
  it('reads key words and the bound in base units', () => {
    expect(parseLimit('Chlorine, largest container: 1 ton')).toMatchObject({
      keywords: ['chlorine'],
      max: { kind: 'mass', base: 2000 },
    })
    expect(parseLimit('Pressure District 7 MAOP: 2 psig')?.keywords).toEqual([
      'pressure',
      'district',
      '7',
    ])
    expect(parseLimit('Gate 7')).toBeUndefined()
    expect(factLimits(FACTS)).toHaveLength(2)
  })

  it('converts units and skips rates', () => {
    expect(quantities('about 1,100 lb and 15 tons and 30 in. w.c.').map((q) => q.kind)).toEqual([
      'mass',
      'mass',
      'pressure',
    ])
    expect(quantities('releasing 40 lb a minute, 5 tons/hour')).toEqual([])
  })
})

describe('QUANTITY_OVER_LIMIT', () => {
  it('flags a 15-ton chlorine release when the largest container is 1 ton', () => {
    const s = scenario([
      row('I-07', 'Memo: an estimated 15 tons of chlorine have been released from the cylinder.'),
      row('I-08', 'Memo: about 1,100 lb of chlorine released so far.'),
      row('I-09', 'Field Report: 15 tons of sand delivered for the berm.'),
    ])
    const w = lintFacilityIds(s, FACTS).filter((x) => x.code === QUANTITY_OVER_LIMIT)
    expect(w.map((x) => x.rowId)).toEqual(['I-07'])
    expect(w[0]!.message).toContain('15 tons')
  })

  it('compares pressures across units only for the named district', () => {
    const limits = factLimits(FACTS)
    expect(overLimit('Pressure District 7 reads 1.8 psig at RS-22.', limits)).toBeUndefined()
    expect(overLimit('Pressure District 7 reads 90 in. w.c. at RS-22.', limits)?.q.text).toBe(
      '90 in. w.c.',
    )
    expect(overLimit('The transmission line runs at 300 psig.', limits)).toBeUndefined()
  })

  it('is silent when the facts state no limits', () => {
    const s = scenario([row('I-07', 'Memo: 15 tons of chlorine released.')])
    expect(lintFacilityIds(s, { categories: [], documentCount: 0 })).toEqual([])
  })
})
