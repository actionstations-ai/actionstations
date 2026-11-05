// Other domains suggest the earth science toolkits that fit them (#678, FR-17): a hospital gets
// earthquakes, a port earthquakes and tsunamis, an airport ash, a transit agency earthquakes and
// debris flows. Suggestions only; nothing turns on by itself.
import { describe, expect, it } from 'vitest'
import { bundledProfiles } from './index'

const EXPECTED: Record<string, string[]> = {
  healthcare: ['seismic'],
  k12_schools: ['seismic', 'volcanic', 'tsunami'],
  campus: ['seismic', 'tsunami'],
  energy_utility: ['seismic', 'volcanic', 'debris_flow'],
  gas_pipeline: ['seismic', 'debris_flow'],
  water_utility: ['seismic', 'volcanic', 'debris_flow'],
  water_dam: ['seismic', 'debris_flow'],
  transit: ['seismic', 'debris_flow'],
  freight_rail: ['seismic', 'debris_flow'],
  data_center_it: ['seismic'],
  municipal: ['seismic', 'tsunami', 'volcanic', 'debris_flow'],
  port_maritime: ['seismic', 'tsunami'],
  airport: ['seismic', 'volcanic'],
  emergency_communications: ['seismic', 'tsunami', 'volcanic', 'debris_flow'],
}

describe('earth science toolkits suggested to other domains', () => {
  for (const [domain, toolkits] of Object.entries(EXPECTED))
    it(`${domain} suggests ${toolkits.join(', ')}`, () => {
      const profile = bundledProfiles().find((p) => p.id === domain)
      expect(profile, domain).toBeDefined()
      for (const t of toolkits) expect(profile!.suggestedToolkits).toContain(t)
    })

  it('keeps the suggestions that were already there', () => {
    const airport = bundledProfiles().find((p) => p.id === 'airport')!
    expect(airport.suggestedToolkits).toContain('media_environment')
  })
})
