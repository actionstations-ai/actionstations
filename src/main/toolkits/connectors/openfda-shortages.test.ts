// The openFDA shortage connector (#902): a recorded response (a real response, trimmed), the
// query it builds, what it refuses and the datasets it hands back. The live test runs only with
// LIVE=1 and never in CI.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TextFile } from '@shared/schemas/case-data'
import { createCaseGet } from '../../case-data/http'
import { boardStatus, shortageBoardFields } from '../pharmacy/shortage-board'
import {
  fdaDate,
  openfdaShortages,
  recordText,
  shortageSearch,
  shortageUrl,
} from './openfda-shortages'
import type { ConnectorQuery, FetchContext } from './registry'

const FIXTURE = readFileSync(
  join(__dirname, '__fixtures__', 'openfda-shortages-sodium-chloride.json'),
  'utf8',
)

const q = (options: ConnectorQuery['options']): ConnectorQuery => ({
  range: { start: '2026-11-04T00:00:00Z', end: '2026-11-05T00:00:00Z' },
  area: { label: 'United States' },
  options,
})

function recorded(status = 200): { ctx: FetchContext; urls: string[] } {
  const urls: string[] = []
  return {
    urls,
    ctx: {
      async get(url) {
        urls.push(url)
        return {
          status,
          data: new TextEncoder().encode(
            status === 200 ? FIXTURE : '{"error":{"code":"NOT_FOUND"}}',
          ),
        }
      },
    },
  }
}

describe('openfda-shortages query', () => {
  it('searches a drug name or a class as a quoted phrase on the fixed host', () => {
    const s = shortageSearch(q({ drug: 'sodium chloride' }))
    expect(s).toEqual({ field: 'generic_name', term: 'sodium chloride' })
    expect(shortageUrl(s, 0)).toBe(
      'https://api.fda.gov/drug/shortages.json?search=generic_name:%22sodium+chloride%22&limit=100&skip=0',
    )
    expect(shortageUrl(shortageSearch(q({ class: 'Renal' })), 100)).toContain(
      'therapeutic_category:%22Renal%22&limit=100&skip=100',
    )
  })

  it('refuses both or neither of drug and class, and text that is not a name', () => {
    expect(() => shortageSearch(q({}))).toThrow(/either a drug/)
    expect(() => shortageSearch(q({ drug: 'a', class: 'b' }))).toThrow(/either a drug/)
    for (const drug of ['x" OR 1:1', 'a&limit=1000', 'drop;table', '', 'a'])
      expect(() => shortageSearch(q({ drug })), drug).toThrow()
  })

  it('reads the endpoint date format', () => {
    expect(fdaDate('08/03/2026')).toBe('2026-08-03T00:00:00Z')
    expect(fdaDate('2026-08-03')).toBeUndefined()
  })
})

describe('openfda-shortages fetch', () => {
  it('estimates without a request and names both datasets', () => {
    const e = openfdaShortages.estimate(q({ drug: 'sodium chloride' }))
    expect(e.items.map((i) => i.datasetId)).toEqual(['fda-shortage-records', 'fda-shortage-board'])
    expect(e.items.every((i) => i.bytes > 0)).toBe(true)
  })

  it('returns the records as published, dated, with the disclaimer in the citation', async () => {
    const { ctx, urls } = recorded()
    const r = await openfdaShortages.fetch(q({ drug: 'sodium chloride' }), ctx)
    expect(urls).toHaveLength(1)
    expect(r.datasets.map((d) => d.id)).toEqual(['fda-shortage-records', 'fda-shortage-board'])
    const records = TextFile.parse(JSON.parse(String(r.files[0]!.data)))
    expect(records).toHaveLength(4)
    expect(records[0]!.t).toBe('2026-08-03T00:00:00Z')
    expect(records[0]!.text).toContain('Package NDC: 0941-0427-52')
    expect(records[0]!.text).toContain('FDA status: To Be Discontinued')
    expect(r.citation).toMatch(/data last updated 2026-11-04/)
    expect(r.citation).toMatch(/not to rely on this data for medical decisions/)
    expect(r.modified).toMatch(/4 of 24 matching records/)
  })

  it('returns empty datasets when the endpoint finds no match (it answers 404)', async () => {
    const r = await openfdaShortages.fetch(q({ drug: 'no such drug' }), recorded(404).ctx)
    expect(JSON.parse(String(r.files[0]!.data))).toEqual([])
  })

  it('fails with the status when the service errors', async () => {
    await expect(
      openfdaShortages.fetch(q({ drug: 'sodium chloride' }), recorded(503).ctx),
    ).rejects.toThrow(/503/)
  })

  it('refuses any host but its own', async () => {
    const get = createCaseGet({
      hosts: [...openfdaShortages.hosts],
      version: 't',
      maxBytes: () => 1,
      onResponse: () => undefined,
    })
    await expect(get('https://example.com/x')).rejects.toThrow()
  })
})

describe('shortage board from FDA records', () => {
  const records = JSON.parse(FIXTURE).results
  it('maps a record to a status word', () => {
    expect(boardStatus({ status: 'To Be Discontinued' })).toBe('Out')
    expect(boardStatus({ availability: 'Limited Availability', status: 'Current' })).toBe('Limited')
    expect(boardStatus({ status: 'Resolved' })).toBe('Available')
  })

  it('quotes the record, applies fictional stock and states days on hand as on hand over usage', () => {
    const fields = shortageBoardFields({
      records,
      stock: [{ match: 'dianeal pd-2', onHand: 600, usagePerDay: 150, tier: 'Dialysis first' }],
      organization: 'Harbor Point Health pharmacy (fictional)',
      asOf: '11/05/2026 08:00',
      retrievedOn: '2026-11-05',
      dataUpdated: '2026-11-04',
    })
    const rows = fields.rows as Record<string, unknown>[]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      ndc: '0941-0427-52',
      onHand: 600,
      usagePerDay: 150,
      daysOnHand: 4,
      status: 'Out',
      tier: 'Dialysis first',
    })
    expect(String(rows[0]!.recovery)).toContain('A business decision was made')
    expect(String(fields.sourceNote)).toMatch(/retrieved 2026-11-05/)
    expect(String(fields.sourceNote)).toMatch(/not to use this data for medical decisions/)
  })

  it('leaves out stock with no matching record and stock that uses nothing', () => {
    const fields = shortageBoardFields({
      records,
      stock: [
        { match: 'nothing like this', onHand: 1, usagePerDay: 1 },
        { match: 'dianeal', onHand: 5, usagePerDay: 0 },
      ],
      organization: 'x',
      asOf: 'y',
      retrievedOn: '2026-11-05',
    })
    expect(fields.rows).toEqual([])
  })

  it('writes record text a person can quote', () => {
    expect(recordText(records[0])).toContain('Contact: 800-284-4060')
  })
})
