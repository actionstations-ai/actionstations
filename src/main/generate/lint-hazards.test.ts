// A hazard snapshot's alert, magnitude or declaration number shown as current in an exercise
// dated well after the snapshot (#439 FR-20).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HazardSnapshot, type Scenario } from '@shared/schemas'
import { HAZARD_AS_CURRENT, lintHazardCurrency } from './lint-realism'

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, '../../../tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Scenario

const SNAPSHOT = HazardSnapshot.parse({
  id: 'snap1',
  fetchedAt: '2026-10-29T12:00:00.000Z',
  request: { lat: 41.88, lon: -87.63, precision: 0.01 },
  alerts: [
    {
      event: 'Flood Watch',
      severity: 'Moderate',
      headline: 'Flood Watch issued October 28 until October 30',
      effective: '2026-10-28',
      areaDesc: 'Cook',
    },
  ],
  earthquakes: {
    recent: [{ id: 'a', mag: 4.6, place: 'x', time: '2026-10-01T00:00:00.000Z', distanceKm: 20 }],
    historical: [],
  },
  declarations: [
    {
      disasterNumber: 4749,
      declarationType: 'DR',
      declarationDate: '2023-07-14',
      incidentType: 'Flood',
      declarationTitle: 'Flooding',
      designatedArea: 'Cook',
    },
  ],
})

function scenario(startDate: string | undefined, event: string): Scenario {
  const s = structuredClone(FIXTURE)
  if (startDate) s.brief.startDate = startDate
  else delete s.brief.startDate
  const row = s.msel.find((r) => r.purposeTag !== 'STARTEX' && r.purposeTag !== 'ENDEX')!
  row.event = event
  return s
}

describe('lintHazardCurrency', () => {
  it('flags a magnitude from the snapshot in an exercise set months later', () => {
    const w = lintHazardCurrency(
      scenario('2027-03-12', 'A M4.6 earthquake is felt at the plant.'),
      SNAPSHOT,
    )
    expect(w.map((x) => x.code)).toEqual([HAZARD_AS_CURRENT])
    expect(w[0]!.message).toContain('magnitude 4.6')
  })

  it('flags an alert headline and a declaration number', () => {
    const alert = scenario(
      '2027-03-12',
      'Radio: Flood Watch issued October 28 until October 30 is in effect.',
    )
    const decl = scenario('2027-03-12', 'The county cites declaration DR-4749 for the response.')
    expect(lintHazardCurrency(alert, SNAPSHOT)).toHaveLength(1)
    expect(lintHazardCurrency(decl, SNAPSHOT)).toHaveLength(1)
  })

  it('stays quiet within 30 days, without a start date, or without a snapshot', () => {
    const text = 'A M4.6 earthquake is felt at the plant.'
    expect(lintHazardCurrency(scenario('2026-11-20', text), SNAPSHOT)).toEqual([])
    expect(lintHazardCurrency(scenario(undefined, text), SNAPSHOT)).toEqual([])
    expect(lintHazardCurrency(scenario('2027-03-12', text), undefined)).toEqual([])
  })

  it('stays quiet when the row only names a kind of hazard', () => {
    const s = scenario('2027-03-12', 'Heavy rain floods the lower level of the plant.')
    expect(lintHazardCurrency(s, SNAPSHOT)).toEqual([])
  })
})
