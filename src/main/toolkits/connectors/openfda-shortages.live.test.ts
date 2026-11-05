// Opt-in live check of the openFDA shortages endpoint (LIVE=1): the response shape the connector
// expects. Never run in CI; one small request, within the service's rate limits (no key).
import { describe, expect, it } from 'vitest'
import { createCaseGet } from '../../case-data/http'
import { openfdaShortages } from './openfda-shortages'

const live = process.env.LIVE === '1'

describe.skipIf(!live)('live openFDA shortages', () => {
  it('answers a drug name with records that parse', async () => {
    const r = await openfdaShortages.fetch(
      {
        range: { start: '2026-11-01T00:00:00Z', end: '2026-11-05T00:00:00Z' },
        area: { label: 'United States' },
        options: { drug: 'sodium chloride' },
      },
      {
        get: createCaseGet({
          hosts: [...openfdaShortages.hosts],
          version: 'live-test',
          maxBytes: () => 5_000_000,
          onResponse: () => undefined,
        }),
      },
    )
    expect(r.datasets.map((d) => d.id)).toContain('fda-shortage-records')
    expect(JSON.parse(String(r.files[0]!.data)).length).toBeGreaterThan(0)
  }, 60_000)
})
