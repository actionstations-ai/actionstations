// Opt-in live checks of the humanitarian connectors: LIVE=1, optionally with HDX_APP and
// HDX_CONTACT (HDX; the app's own identity is used without them) and RELIEFWEB_APPNAME
// (ReliefWeb, skipped without it). The key figures and aid worker security checks need nothing
// else. Never runs in CI.
import { describe, expect, it } from 'vitest'
import { caseUserAgent } from '../../case-data/http'
import { awsdIncidentCounts } from './humanitarian-awsd'
import { hdxKeyFigures } from './humanitarian-hapi-figures'
import { hdxOperationalPresence } from './humanitarian-hdx'
import { reliefwebReports } from './humanitarian-reliefweb'
import type { ConnectorQuery, FetchContext } from './registry'

const live = process.env.LIVE === '1'
const ctx: FetchContext = {
  async get(url) {
    const r = await fetch(url, { headers: { 'User-Agent': caseUserAgent('live-test') } })
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

describe.skipIf(!live)('HDX key figures live', () => {
  it('returns needs, refugees, displacement and appeal figures for Sudan', async () => {
    const q: ConnectorQuery = {
      range: { start: '2024-12-01T00:00:00Z', end: '2024-12-31T00:00:00Z' },
      area: { label: 'Sudan' },
      options: { location: 'SDN' },
    }
    const out = await hdxKeyFigures.fetch(q, ctx)
    const entries = JSON.parse(String(out.files[0]!.data)) as { text: string }[]
    expect(entries[0]!.text).toMatch(/All sectors: .*in need/)
    expect(entries[3]!.text).toMatch(/requirements US\$/)
    expect(out.citation).toMatch(/Licence read at fetch/)
  }, 60_000)
})

describe.skipIf(!live)('Aid Worker Security Database live', () => {
  it('returns yearly counts for one country', async () => {
    const q: ConnectorQuery = { range, area: { label: 'Sudan' }, options: { country: 'SD' } }
    const out = await awsdIncidentCounts.fetch(q, ctx)
    const series = JSON.parse(String(out.files[0]!.data)) as { v: { incidents: number } }[]
    expect(series.some((p) => p.v.incidents > 0)).toBe(true)
  }, 60_000)
})
