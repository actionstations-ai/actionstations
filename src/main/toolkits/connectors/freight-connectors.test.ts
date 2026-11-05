// The freight connectors (#810): BTS Supply Chain and Freight Indicators (recorded responses from
// data.bts.gov, real and trimmed) and the Freight Analysis Framework state flows (real FAF rows,
// trimmed, zipped here the way faf.ornl.gov publishes them). The queries they build, what they
// refuse, the fixed hosts and the data they hand back. Live tests: freight-connectors.live.test.ts.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { SeriesFile, TextFile } from '@shared/schemas/case-data'
import {
  btsFafStateFlows,
  csvEntry,
  FAF_DOWNLOAD_BYTES,
  FAF_FILE,
  stateFlows,
  stateOf,
  yearOf,
} from './bts-faf'
import { btsFreightIndicators, indicatorsUrl, indicatorOf } from './bts-freight-indicators'
import type { ConnectorQuery, FetchContext } from './registry'

const fixture = (name: string): Buffer => readFileSync(join(__dirname, '__fixtures__', name))

function recorded(body: Uint8Array | string, status = 200): { ctx: FetchContext; urls: string[] } {
  const urls: string[] = []
  return {
    urls,
    ctx: {
      async get(url) {
        urls.push(url)
        return {
          status,
          data: typeof body === 'string' ? new TextEncoder().encode(body) : body,
        }
      },
    },
  }
}

const berthsQ: ConnectorQuery = {
  range: { start: '2024-01-01T00:00:00Z', end: '2024-01-15T00:00:00Z' },
  area: { label: 'United States' },
  options: { indicator: 'containerships-awaiting-berth' },
}

describe('bts-freight-indicators', () => {
  it('builds a query for one listed indicator and the period', () => {
    const url = new URL(indicatorsUrl(berthsQ))
    expect(url.host).toBe('data.bts.gov')
    expect(url.pathname).toBe('/resource/y5ut-ibwt.json')
    expect(url.searchParams.get('$where')).toBe(
      "indicator='Number of Containerships Awaiting Berths at all U.S. Ports' AND date between '2024-01-01T00:00:00' and '2024-01-15T00:00:00'",
    )
  })

  it('matches a name with a double space through a wildcard', () => {
    const url = new URL(indicatorsUrl({ ...berthsQ, options: { indicator: 'diesel-price' } }))
    expect(url.searchParams.get('$where')).toMatch(
      /^indicator like 'U\.S\. Diesel Sales Prices%\(in Dollars per Gallon\)' AND date between/,
    )
  })

  it('refuses an indicator not on the list, text pasted in its place and a reversed period', () => {
    expect(() => indicatorOf({ ...berthsQ, options: {} })).toThrow(/Pick an indicator/)
    expect(() => indicatorsUrl({ ...berthsQ, options: { indicator: "x' OR 1=1 --" } })).toThrow(
      /Pick an indicator/,
    )
    expect(() => indicatorOf({ ...berthsQ, options: { indicator: 'toString' } })).toThrow()
    expect(() =>
      btsFreightIndicators.estimate({
        ...berthsQ,
        range: { start: berthsQ.range.end, end: berthsQ.range.start },
      }),
    ).toThrow(/ends before/)
  })

  it('estimates without a request', () => {
    const e = btsFreightIndicators.estimate(berthsQ)
    expect(e.requests).toBe(1)
    expect(e.items[0]).toMatchObject({ datasetId: 'bts-containerships-awaiting-berth' })
    expect(e.items[0]!.bytes).toBeGreaterThan(500)
  })

  it('turns per-port rows into one series point per date', async () => {
    const { ctx, urls } = recorded(fixture('bts-freight-awaiting-berths.json'))
    const out = await btsFreightIndicators.fetch(berthsQ, ctx)
    expect(urls.map((u) => new URL(u).host)).toEqual(['data.bts.gov'])
    const points = JSON.parse(String(out.files[0]!.data)) as {
      t: string
      v: Record<string, number>
    }[]
    expect(SeriesFile.safeParse(points).success).toBe(true)
    expect(points).toHaveLength(2)
    expect(points[0]).toEqual({
      t: '2024-01-02T00:00:00Z',
      v: { 'All Other Ports': 28, 'All U.S. Container Ports': 38, 'LA-LB': 0, Savannah: 10 },
    })
    expect(out.datasets[0]).toMatchObject({ kind: 'series', unit: 'Number of vessels' })
    expect(out.citation).toMatch(/Bureau of Transportation Statistics.*MARAD/)
  })

  it('keeps a plain number for a series with no breakdown', async () => {
    const q = { ...berthsQ, options: { indicator: 'container-rate-shanghai-la' } }
    const { ctx } = recorded(fixture('bts-freight-shanghai-la.json'))
    const out = await btsFreightIndicators.fetch(q, ctx)
    const points = JSON.parse(String(out.files[0]!.data)) as { t: string; v: number }[]
    expect(points[0]).toEqual({ t: '2021-06-01T00:00:00Z', v: 8380 })
    expect(points.every((p) => typeof p.v === 'number')).toBe(true)
  })

  it('refuses a response that is not the expected shape', async () => {
    const { ctx } = recorded('{"error": true}')
    await expect(btsFreightIndicators.fetch(berthsQ, ctx)).rejects.toThrow(/unexpected shape/)
  })
})

async function fafZip(): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file(`${FAF_FILE}.csv`, fixture('faf-state-sample.csv'))
  zip.file('FAF5_metadata.txt', 'metadata')
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

const ohioQ: ConnectorQuery = {
  range: { start: '2023-03-01T00:00:00Z', end: '2023-03-31T00:00:00Z' },
  area: { label: 'Ohio' },
  options: { state: 'oh' },
}

describe('bts-faf-state-flows', () => {
  it('checks the state and year against fixed lists', () => {
    expect(stateOf(ohioQ)).toEqual({ code: 'OH', fips: '39', name: 'Ohio' })
    expect(() => stateOf({ ...ohioQ, options: { state: 'ZZ' } })).toThrow(/two-letter/)
    expect(() => stateOf({ ...ohioQ, options: { state: '../' } })).toThrow(/two-letter/)
    expect(yearOf(ohioQ)).toBe(2023)
    expect(yearOf({ ...ohioQ, range: { ...ohioQ.range, start: '2011-01-01T00:00:00Z' } })).toBe(
      2018,
    )
    expect(() => yearOf({ ...ohioQ, options: { state: 'OH', year: 2031 } })).toThrow(/FAF year/)
  })

  it('tells the user the download size before anything is fetched', () => {
    const e = btsFafStateFlows.estimate(ohioQ)
    expect(e.requests).toBe(1)
    expect(e.items[0]!.bytes).toBe(FAF_DOWNLOAD_BYTES)
    expect(e.items[0]!.label).toMatch(/downloads the 91 MB FAF file, keeps a summary/)
  })

  it('finds the CSV inside the zip and sums the rows for one state', async () => {
    const flows = await stateFlows(csvEntry(await fafZip()), '39', 2023)
    expect(flows.rows).toBe(74)
    expect([...flows.outbound.keys()]).toEqual(
      expect.arrayContaining(['Indiana', 'Kentucky', 'Michigan', 'Pennsylvania']),
    )
    expect([...flows.inbound.keys()]).toEqual(
      expect.arrayContaining(['Illinois', 'Texas', 'Michigan']),
    )
    expect(flows.outbound.has('California')).toBe(false)
    const y = flows.yearly.get(2023)!
    expect(y.outbound).toBeGreaterThan(0)
    expect(y.inbound).toBeGreaterThan(0)
  })

  it('fetches one fixed file and stores small summaries, not the download', async () => {
    const { ctx, urls } = recorded(await fafZip())
    const out = await btsFafStateFlows.fetch(ohioQ, ctx)
    expect(urls).toEqual([`https://faf.ornl.gov/faf5/Data/Download_Files/${FAF_FILE}.zip`])
    const lanes = JSON.parse(String(out.files[0]!.data)) as { title: string; text: string }[]
    expect(TextFile.safeParse(lanes).success).toBe(true)
    expect(lanes.map((l) => l.title)).toEqual([
      'Freight from Ohio by destination state, 2023',
      'Freight into Ohio by origin state, 2023',
      'Freight to, from and within Ohio by mode, 2023',
      'Freight to, from and within Ohio by commodity, 2023',
    ])
    expect(lanes[0]!.text).toMatch(/thousand tons, \$[\d,]+ million/)
    expect(lanes[2]!.text).toMatch(/Truck/)
    const series = JSON.parse(String(out.files[1]!.data))
    expect(SeriesFile.safeParse(series).success).toBe(true)
    expect(series).toHaveLength(7)
    expect(String(out.files[0]!.data).length).toBeLessThan(20_000)
    expect(out.citation).toMatch(/Freight Analysis Framework version 5/)
  })

  it('refuses a file that is not a zip and a failed download', async () => {
    await expect(btsFafStateFlows.fetch(ohioQ, recorded('<html>moved</html>').ctx)).rejects.toThrow(
      /not the expected zip/,
    )
    await expect(btsFafStateFlows.fetch(ohioQ, recorded('', 404).ctx)).rejects.toThrow(/404/)
  })

  it('names only fixed public hosts', () => {
    expect(btsFafStateFlows.hosts).toEqual(['faf.ornl.gov'])
    expect(btsFreightIndicators.hosts).toEqual(['data.bts.gov'])
  })
})
