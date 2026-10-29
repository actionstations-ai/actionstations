// The handbook appendix carries each source's attribution, with the exact OpenFEMA statement.
import { describe, expect, it } from 'vitest'
import { HazardSnapshot } from '@shared/schemas'
import { hazardAppendix } from './appendix'

const at = '2026-10-29T12:00:00.000Z'
const source = (id: string, status = 'ok') => ({ id, status, attribution: 'a', accessedAt: at })
const snapshot = (sources: ReturnType<typeof source>[]) =>
  HazardSnapshot.parse({
    id: 's1',
    fetchedAt: at,
    request: { lat: 1, lon: 2, precision: 0.01 },
    sources,
  })

describe('hazardAppendix', () => {
  it('prints the OpenFEMA statement exactly, the USGS credit and the access date', () => {
    const text = hazardAppendix(snapshot([source('openfema'), source('usgs_recent')]))
    expect(text).toContain(
      "This product uses the Federal Emergency Management Agency's OpenFEMA API, but is not endorsed by FEMA.",
    )
    expect(text).toContain('DisasterDeclarationsSummaries v2')
    expect(text).toContain('Accessed 2026-10-29')
    expect(text).toContain('Credit: U.S. Geological Survey')
  })

  it('says the snapshot is dated and not for operational decisions', () => {
    expect(hazardAppendix(snapshot([source('nws_alerts')]))).toMatch(
      /must not be used for operational/,
    )
  })

  it('names each source once and leaves out sources that failed', () => {
    const text = hazardAppendix(
      snapshot([source('usgs_recent'), source('usgs_historical'), source('firms', 'error')]),
    )
    expect(text.match(/U\.S\. Geological Survey/g)).toHaveLength(1)
    expect(text).not.toContain('FIRMS')
  })

  it('is empty when nothing returned data', () => {
    expect(hazardAppendix(snapshot([source('firms', 'error')]))).toBe('')
  })
})
