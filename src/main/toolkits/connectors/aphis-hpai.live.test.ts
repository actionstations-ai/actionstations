// Opt-in live check of the APHIS dashboard export (LIVE=1): the columns the connector expects.
// Never run in CI; one small request.
import { describe, expect, it } from 'vitest'
import { createCaseGet } from '../../case-data/http'
import { aphisHpai } from './aphis-hpai'

const live = process.env.LIVE === '1'

describe.skipIf(!live)('live APHIS dashboard export', () => {
  it('answers with monthly rows by flock type', async () => {
    const now = new Date()
    const out = await aphisHpai.fetch(
      {
        range: {
          start: new Date(now.getTime() - 120 * 86_400_000).toISOString(),
          end: now.toISOString(),
        },
        area: { label: 'United States' },
        options: {},
      },
      {
        get: createCaseGet({
          hosts: [...aphisHpai.hosts],
          version: 'live-test',
          maxBytes: () => 1_000_000,
          onResponse: () => undefined,
        }),
      },
    )
    const rows = JSON.parse(String(out.files[0]!.data)) as { v: Record<string, number> }[]
    expect(rows.length).toBeGreaterThan(0)
    expect(Object.keys(rows[0]!.v).length).toBeGreaterThan(0)
  })
})
