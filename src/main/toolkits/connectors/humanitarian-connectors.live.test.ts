// Opt-in live checks of the humanitarian connectors: LIVE=1 with HDX_APP, HDX_CONTACT (HDX) and
// RELIEFWEB_APPNAME (ReliefWeb) set in the environment. Never runs in CI.
import { describe, expect, it } from 'vitest'
import { hdxOperationalPresence } from './humanitarian-hdx'
import { reliefwebReports } from './humanitarian-reliefweb'
import type { ConnectorQuery, FetchContext } from './registry'

const live = process.env.LIVE === '1'
const ctx: FetchContext = {
  async get(url) {
    const r = await fetch(url)
    return { status: r.status, data: new Uint8Array(await r.arrayBuffer()) }
  },
}
const range = { start: '2025-01-01T00:00:00Z', end: '2025-03-31T00:00:00Z' }

describe.skipIf(!live)('HDX live', () => {
  it('returns operational presence rows with a licence', async () => {
    const q: ConnectorQuery = {
      range,
      area: { label: 'Afghanistan' },
      options: {
        location: 'AFG',
        sector: 'HEA',
        admin1: 'AF01',
        applicationName: process.env.HDX_APP ?? '',
        contactEmail: process.env.HDX_CONTACT ?? '',
      },
    }
    const out = await hdxOperationalPresence.fetch(q, ctx)
    expect(out.files).toHaveLength(2)
    expect(out.citation).toMatch(/Licence read at fetch/)
  }, 60_000)
})

describe.skipIf(!live || !process.env.RELIEFWEB_APPNAME)('ReliefWeb live', () => {
  it('returns report titles for a country', async () => {
    const q: ConnectorQuery = {
      range,
      area: { label: 'Haiti' },
      options: { applicationName: process.env.RELIEFWEB_APPNAME! },
    }
    const out = await reliefwebReports.fetch(q, ctx)
    expect(JSON.parse(String(out.files[0]!.data)).length).toBeGreaterThan(0)
  }, 60_000)
})
