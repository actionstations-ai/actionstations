// Connector consent, size limits, path safety and simulated labels (spec 0448 FR-8, FR-10,
// NFR-2, NFR-4, NFR-5). Uses a fake connector and a fake fetch; nothing touches the network.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { Connector } from '../toolkits/connectors/registry'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { planFetch, runFetch, clearPendingFetches } = await import('./acquire')
const { addDatasets, caseDir, readManifest, writeCaseFile, MB } = await import('./store')
const { clearGenerators, registerGenerator, runGenerator } = await import('./generators')
const { clearConnectors, registerConnector } = await import('../toolkits/connectors/registry')

const SCENARIO = 'scn-1'
const QUERY = {
  range: { start: '2024-09-26T12:00:00Z', end: '2024-09-26T18:00:00Z' },
  area: { label: 'Test county' },
}
const NOW = () => new Date('2026-03-02T10:00:00Z')

let root: string
let calls: string[]

/** A connector that fetches one JSON series from its own host. */
function connector(bytes: number, extra: Partial<Connector> = {}): Connector {
  return {
    id: 'test-archive',
    label: 'Test archive',
    source: 'Test Archive',
    terms: 'Public domain',
    hosts: ['archive.example.gov'],
    estimate: () => ({
      requests: 1,
      items: [{ datasetId: 'gauge', label: 'Gauge', kind: 'series', bytes }],
    }),
    async fetch(_q, ctx) {
      const res = await ctx.get('https://archive.example.gov/data?x=secret')
      return {
        datasets: [{ id: 'gauge', kind: 'series', label: 'Gauge', file: 'gauge.json', unit: 'ft' }],
        files: [{ name: 'gauge.json', data: res.data }],
        modified: 'Cropped to the county',
      }
    },
    ...extra,
  }
}

const body = JSON.stringify([{ t: '2024-09-26T12:00:00Z', v: 8 }])
const fakeFetch = (): typeof fetch =>
  vi.fn(async (url: string | URL | Request) => {
    calls.push(String(url))
    return new Response(body, { status: 200 })
  }) as unknown as typeof fetch

const deps = (over: Record<string, unknown> = {}) => ({
  maxMbPerScenario: 500,
  version: '0.0.1',
  now: NOW,
  fetchImpl: fakeFetch(),
  ...over,
})

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ttx-case-'))
  calls = []
  clearConnectors()
  clearPendingFetches()
  clearGenerators()
})
afterEach(() => {
  clearConnectors()
  clearGenerators()
})

describe('consent before any network call', () => {
  it('estimates without calling the network', async () => {
    registerConnector(connector(2000))
    const f = fakeFetch()
    const plan = await planFetch(root, SCENARIO, 'test-archive', QUERY, {
      maxMbPerScenario: 500,
      now: NOW,
    })
    expect(plan.totalBytes).toBe(2000)
    expect(plan.exceedsLimit).toBe(false)
    expect(plan.hosts).toEqual(['archive.example.gov'])
    expect(f).not.toHaveBeenCalled()
    expect(calls).toEqual([])
  })

  it('refuses to fetch without consent, and without a prior estimate', async () => {
    registerConnector(connector(2000))
    const plan = await planFetch(root, SCENARIO, 'test-archive', QUERY, {
      maxMbPerScenario: 500,
      now: NOW,
    })
    const d = deps()
    await expect(runFetch(root, SCENARIO, plan.estimateId, false, d)).rejects.toThrow(/consent/)
    await expect(runFetch(root, SCENARIO, 'made-up-id', true, d)).rejects.toThrow(/estimate/)
    expect(d.fetchImpl).not.toHaveBeenCalled()
  })

  it('does not honour an estimate shown for another scenario or twice', async () => {
    registerConnector(connector(2000))
    const plan = await planFetch(root, SCENARIO, 'test-archive', QUERY, {
      maxMbPerScenario: 500,
      now: NOW,
    })
    await expect(runFetch(root, 'other', plan.estimateId, true, deps())).rejects.toThrow(/estimate/)
    await runFetch(root, SCENARIO, plan.estimateId, true, deps())
    await expect(runFetch(root, SCENARIO, plan.estimateId, true, deps())).rejects.toThrow(
      /estimate/,
    )
  })

  it('saves the data as historical with provenance the connector cannot choose', async () => {
    registerConnector(connector(2000))
    const plan = await planFetch(root, SCENARIO, 'test-archive', QUERY, {
      maxMbPerScenario: 500,
      now: NOW,
    })
    const manifest = await runFetch(root, SCENARIO, plan.estimateId, true, deps())
    const [d] = manifest.datasets
    expect(d?.provenance).toMatchObject({
      origin: 'historical',
      source: 'Test Archive',
      retrieved: '2026-03-02T10:00:00.000Z',
      terms: 'Public domain',
      modified: 'Cropped to the county',
    })
    expect(d?.bytes).toBe(Buffer.byteLength(body))
    expect(
      JSON.parse(readFileSync(join(caseDir(root, SCENARIO), 'gauge.json'), 'utf8')),
    ).toHaveLength(1)
    expect((await readManifest(root, SCENARIO))?.datasets).toHaveLength(1)
  })

  it('logs each request without the query string', async () => {
    registerConnector(connector(2000))
    const plan = await planFetch(root, SCENARIO, 'test-archive', QUERY, {
      maxMbPerScenario: 500,
      now: NOW,
    })
    await runFetch(root, SCENARIO, plan.estimateId, true, deps())
    const lines = readFileSync(join(caseDir(root, SCENARIO), 'fetch-log.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as Record<string, unknown>)
    expect(lines[0]).toMatchObject({
      connector: 'test-archive',
      url: 'https://archive.example.gov/data',
      status: 200,
    })
    expect(JSON.stringify(lines)).not.toContain('secret')
    expect(lines.at(-1)).toMatchObject({ done: true, datasets: ['gauge'] })
  })
})

describe('size limits', () => {
  it('flags an estimate over the room and refuses the fetch before any request', async () => {
    registerConnector(connector(3 * MB))
    const plan = await planFetch(root, SCENARIO, 'test-archive', QUERY, {
      maxMbPerScenario: 2,
      now: NOW,
    })
    expect(plan.exceedsLimit).toBe(true)
    const d = deps({ maxMbPerScenario: 2 })
    await expect(runFetch(root, SCENARIO, plan.estimateId, true, d)).rejects.toThrow(/limit/)
    expect(d.fetchImpl).not.toHaveBeenCalled()
    expect(existsSync(join(caseDir(root, SCENARIO), 'gauge.json'))).toBe(false)
  })

  it('counts what the scenario already holds', async () => {
    registerConnector(connector(MB))
    await writeCaseFile(root, SCENARIO, 'old.json', 'x'.repeat(MB + 10))
    const plan = await planFetch(root, SCENARIO, 'test-archive', QUERY, {
      maxMbPerScenario: 1,
      now: NOW,
    })
    expect(plan.roomBytes).toBe(0)
    expect(plan.exceedsLimit).toBe(true)
  })

  it('stops a response that is larger than its estimate once the room is used', async () => {
    registerConnector(connector(10))
    const plan = await planFetch(root, SCENARIO, 'test-archive', QUERY, {
      maxMbPerScenario: 1,
      now: NOW,
    })
    const big = vi.fn(
      async () => new Response('x'.repeat(2 * MB), { status: 200 }),
    ) as unknown as typeof fetch
    await expect(
      runFetch(
        root,
        SCENARIO,
        plan.estimateId,
        true,
        deps({ maxMbPerScenario: 1, fetchImpl: big }),
      ),
    ).rejects.toThrow(/larger than/)
  })
})

describe('where a connector may go', () => {
  it('refuses a host the connector did not declare', async () => {
    registerConnector(
      connector(10, {
        async fetch(_q, ctx) {
          await ctx.get('https://evil.example.com/data')
          return { datasets: [], files: [] }
        },
      }),
    )
    const plan = await planFetch(root, SCENARIO, 'test-archive', QUERY, {
      maxMbPerScenario: 500,
      now: NOW,
    })
    await expect(runFetch(root, SCENARIO, plan.estimateId, true, deps())).rejects.toThrow(
      /not an archive/,
    )
    expect(calls).toEqual([])
  })

  it('refuses plain http and refuses a redirect to another host', async () => {
    registerConnector(
      connector(10, {
        async fetch(_q, ctx) {
          await ctx.get('http://archive.example.gov/data')
          return { datasets: [], files: [] }
        },
      }),
    )
    const plan = await planFetch(root, SCENARIO, 'test-archive', QUERY, {
      maxMbPerScenario: 500,
      now: NOW,
    })
    await expect(runFetch(root, SCENARIO, plan.estimateId, true, deps())).rejects.toThrow(/https/)

    clearConnectors()
    clearPendingFetches()
    registerConnector(connector(10))
    const p2 = await planFetch(root, SCENARIO, 'test-archive', QUERY, {
      maxMbPerScenario: 500,
      now: NOW,
    })
    const redirect = vi.fn(
      async () =>
        new Response(null, { status: 302, headers: { location: 'https://other.example.org/x' } }),
    ) as unknown as typeof fetch
    await expect(
      runFetch(root, SCENARIO, p2.estimateId, true, deps({ fetchImpl: redirect })),
    ).rejects.toThrow(/not an archive/)
  })

  it('does not register a connector with a private, loopback or numeric host', () => {
    for (const host of ['localhost', '127.0.0.1', '192.168.1.5', 'printer.local', 'example'])
      expect(() => registerConnector(connector(1, { hosts: [host] }))).toThrow()
  })

  it('refuses a duplicate id and a bad id', () => {
    registerConnector(connector(1))
    expect(() => registerConnector(connector(1))).toThrow(/already/)
    expect(() => registerConnector(connector(1, { id: 'Bad Id' }))).toThrow(/Invalid/)
  })

  it('refuses a result whose dataset names a file that was not fetched', async () => {
    registerConnector(
      connector(10, {
        async fetch() {
          return {
            datasets: [{ id: 'gauge', kind: 'series', label: 'G', file: 'missing.json' }],
            files: [],
          }
        },
      }),
    )
    const plan = await planFetch(root, SCENARIO, 'test-archive', QUERY, {
      maxMbPerScenario: 500,
      now: NOW,
    })
    await expect(runFetch(root, SCENARIO, plan.estimateId, true, deps())).rejects.toThrow(
      /not fetched/,
    )
  })
})

describe('files stay inside the case folder', () => {
  it.each([
    '../escape.json',
    '/abs.json',
    'a/b/c.json',
    '..',
    'sub/../../x.json',
    'evil.exe',
    'noext',
  ])('refuses %s', async (name) => {
    await expect(writeCaseFile(root, SCENARIO, name, '{}')).rejects.toThrow()
  })

  it('refuses an image that is not one', async () => {
    await expect(writeCaseFile(root, SCENARIO, 'a.png', new Uint8Array([1, 2, 3]))).rejects.toThrow(
      /not a valid PNG/,
    )
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])
    await expect(writeCaseFile(root, SCENARIO, 'a.png', png)).resolves.toBe(8)
  })

  it('refuses to write through a symlinked folder that leaves case/', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'ttx-outside-'))
    mkdirSync(caseDir(root, SCENARIO), { recursive: true })
    symlinkSync(outside, join(caseDir(root, SCENARIO), 'link'))
    await expect(writeCaseFile(root, SCENARIO, 'link/x.json', '{}')).rejects.toThrow(/leave/)
    expect(existsSync(join(outside, 'x.json'))).toBe(false)
  })

  it('writes the manifest only after the files', async () => {
    await expect(
      addDatasets(
        root,
        SCENARIO,
        [],
        [
          { name: 'ok.json', data: '[]' },
          { name: '../bad.json', data: '[]' },
        ],
      ),
    ).rejects.toThrow()
    expect(await readManifest(root, SCENARIO)).toBeUndefined()
  })
})

describe('simulated data is labeled simulated', () => {
  const ramp = {
    id: 'example-ramp',
    label: 'Example ramp',
    params: z.object({ steps: z.number().int().min(1).max(100), top: z.number() }),
    generate: ({ steps, top }: { steps: number; top: number }) => [
      {
        id: 'ramp',
        label: 'Ramp',
        kind: 'series' as const,
        unit: 'ft',
        data: Array.from({ length: steps }, (_, i) => ({
          t: new Date(Date.parse('2024-09-26T12:00:00Z') + i * 3_600_000).toISOString(),
          v: (top * (i + 1)) / steps,
        })),
      },
    ],
  }

  it('records the generator, calls it simulated and gives it no retrieval date', async () => {
    registerGenerator(ramp)
    const manifest = await runGenerator(
      root,
      SCENARIO,
      'example-ramp',
      { steps: 4, top: 20 },
      {
        maxMbPerScenario: 500,
      },
    )
    const [d] = manifest.datasets
    expect(d?.provenance.origin).toBe('simulated')
    expect(d?.provenance.generator).toBe('example-ramp')
    expect(d?.provenance.retrieved).toBeUndefined()
    expect(d?.provenance.terms).toMatch(/Not a record of a real event/)
  })

  it('is deterministic: the same parameters give the same file', async () => {
    registerGenerator(ramp)
    const run = async (id: string) => {
      const r = mkdtempSync(join(tmpdir(), `ttx-gen-${id}-`))
      await runGenerator(
        r,
        SCENARIO,
        'example-ramp',
        { steps: 3, top: 9 },
        { maxMbPerScenario: 500 },
      )
      return readFileSync(join(caseDir(r, SCENARIO), 'ramp.json'), 'utf8')
    }
    expect(await run('a')).toBe(await run('b'))
  })

  it('validates parameters and the generated data, and respects the size limit', async () => {
    registerGenerator(ramp)
    await expect(
      runGenerator(root, SCENARIO, 'example-ramp', { steps: 0, top: 1 }, { maxMbPerScenario: 500 }),
    ).rejects.toThrow()
    registerGenerator({
      ...ramp,
      id: 'broken',
      generate: () => [
        { id: 'bad', label: 'Bad', kind: 'series' as const, data: [{ t: 'x', v: 1 }] },
      ],
    })
    await expect(
      runGenerator(root, SCENARIO, 'broken', { steps: 1, top: 1 }, { maxMbPerScenario: 500 }),
    ).rejects.toThrow(/not valid series data/)
    await expect(
      runGenerator(root, SCENARIO, 'missing', {}, { maxMbPerScenario: 500 }),
    ).rejects.toThrow(/No generator/)
  })
})
