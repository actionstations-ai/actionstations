// The wildfire format checks (spec 0461 FR-6), apart from the rules that wrap them.
import { describe, expect, it } from 'vitest'
import { lintContainment, lintZoneNotice, zoneIdsInText } from './lint'

describe('zoneIdsInText', () => {
  it('reads lists, ranges and single zones', () => {
    expect(zoneIdsInText('Evacuation order for Zones C-1, C-2 and C-3: leave now')).toEqual([
      'C-1',
      'C-2',
      'C-3',
    ])
    expect(zoneIdsInText('Zone H-2 is sheltering in place')).toEqual(['H-2'])
    expect(zoneIdsInText('Zones 4 to 6 and zone 9')).toEqual(['4', '6'])
  })
  it('ignores words that are not zone ids', () => {
    expect(zoneIdsInText('The zone map is online. Zone ID is on the sign.')).toEqual([])
  })
})

describe('lintZoneNotice', () => {
  const zones = [
    { zone: 'C-1', status: 'Evacuation order' },
    { zone: 'C-2', status: 'Evacuation warning' },
  ]
  it('accepts a notice that agrees with its own table', () => {
    expect(
      lintZoneNotice({
        zones,
        headline: 'Evacuation order for Zone C-1 and evacuation warning for Zone C-2',
        text: ['Residents of Zone C-1 leave now.'],
      }),
    ).toEqual([])
  })
  it('flags a zone with two statuses', () => {
    const issues = lintZoneNotice({
      zones: [...zones, { zone: 'C-1', status: 'Evacuation warning' }],
    })
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toMatch(/Zone C-1 is listed with more than one status/)
  })
  it('flags a zone the text names that the table does not list', () => {
    const issues = lintZoneNotice({ zones, text: ['Zone C-7 should also be ready to leave.'] })
    expect(issues.map((i) => i.message)).toEqual([
      expect.stringMatching(/Zone C-7.*not in the zone table/),
    ])
  })
  it('flags a headline status that no zone carries', () => {
    const issues = lintZoneNotice({ zones, headline: 'Shelter in place for Zone C-1' })
    expect(issues.map((i) => i.message)).toEqual([expect.stringMatching(/shelter in place/)])
  })
  it('says nothing about an empty table', () => {
    expect(lintZoneNotice({ zones: [], headline: 'Evacuation order', text: ['Zone C-9'] })).toEqual(
      [],
    )
  })
})

describe('lintContainment', () => {
  it('flags a percent that disagrees with the structured value', () => {
    expect(
      lintContainment({ containmentPct: 25, text: ['The fire is 40 percent contained.'] }),
    ).toHaveLength(1)
  })
  it('flags a percent above 100 and accepts a matching one', () => {
    expect(lintContainment({ text: ['150% contained'] })).toHaveLength(1)
    expect(lintContainment({ containmentPct: 40, text: ['The fire is 40% contained.'] })).toEqual(
      [],
    )
  })
})
