// Opt-in live checks of the freight connectors (LIVE=1). Every listed BTS indicator must still
// return rows under its exact name, and the FAF file must still be at its address (this one
// downloads about 91 MB). Never runs in CI.
import { describe, expect, it } from 'vitest'
import { caseUserAgent } from '../../case-data/http'
import { btsFafStateFlows } from './bts-faf'
import { btsFreightIndicators, FREIGHT_INDICATORS } from './bts-freight-indicators'
import type { ConnectorQuery, FetchContext } from './registry'

const live = process.env.LIVE === '1'
const ctx: FetchContext = {
  async get(url) {
    const r = await fetch(url, { headers: { 'User-Agent': caseUserAgent('live-test') } })
    return { status: r.status, data: new Uint8Array(await r.arrayBuffer()) }
  },
}
const range = { start: '2024-01-01T00:00:00Z', end: '2024-06-30T00:00:00Z' }

describe.skipIf(!live)('BTS freight indicators live', () => {
  for (const indicator of Object.keys(FREIGHT_INDICATORS))
    it(`returns points for ${indicator}`, async () => {
      const q: ConnectorQuery = { range, area: { label: 'United States' }, options: { indicator } }
      const out = await btsFreightIndicators.fetch(q, ctx)
      expect(JSON.parse(String(out.files[0]!.data)).length).toBeGreaterThan(0)
    }, 60_000)
})

describe.skipIf(!live)('FAF live', () => {
  it('reads the state file and sums Ohio', async () => {
    const q: ConnectorQuery = { range, area: { label: 'Ohio' }, options: { state: 'OH' } }
    const out = await btsFafStateFlows.fetch(q, ctx)
    const lanes = JSON.parse(String(out.files[0]!.data)) as { text: string }[]
    expect(lanes[0]!.text).toMatch(/Indiana|Michigan|Pennsylvania|Kentucky/)
  }, 300_000)
})
