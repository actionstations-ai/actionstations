import { describe, expect, it } from 'vitest'
import { registerWeatherToolkit } from '../weather'
import { getConnector, ConnectorQuery } from '../connectors/registry'
import { planConvectiveReplay, planStormReplay } from './event-finder'

registerWeatherToolkit()

describe('event finder', () => {
  it('plans a convective replay near a place with valid queries for each connector', () => {
    const plan = planConvectiveReplay({
      start: '2024-05-07T19:00:00Z',
      hours: 3,
      lat: 39.42,
      lon: -83.82,
      place: 'Southwest Ohio',
      sounding: 'KILN',
      wfo: 'ILN',
    })
    expect(plan.radars[0]).toMatchObject({ icao: 'KILN', state: 'OH' })
    expect(plan.queries.map((q) => q.connectorId)).toEqual([
      'nexrad-level2',
      'spc-storm-reports',
      'iem-warnings',
      'iem-soundings',
    ])
    for (const q of plan.queries) {
      const parsed = ConnectorQuery.parse(q.query)
      expect(getConnector(q.connectorId).estimate(parsed).items.length).toBeGreaterThan(0)
    }
    expect(plan.queries[0]!.query.range.end).toBe('2024-05-07T22:00:00.000Z')
  })

  it('plans a storm replay from a name and a year', () => {
    const q = planStormReplay({ name: 'Ian', year: 2022, place: 'Gulf coast' })
    const parsed = ConnectorQuery.parse(q.query)
    expect(getConnector(q.connectorId).estimate(parsed).items[0]!.datasetId).toBe('track-ian-2022')
  })
})
