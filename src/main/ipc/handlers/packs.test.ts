// packs:* catalog and download channels through the IPC dispatcher (#267), against a local
// http server on 127.0.0.1, plus the guarantee that registering IPC fetches nothing.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import http from 'node:http'
import https from 'node:https'
import {
  bytes,
  catalogBody,
  catalogEntry,
  json,
  sha256,
  stall,
  startServer,
  type TestServer,
} from '../../packs/test-server'

const ipcHandle = vi.hoisted(() => vi.fn())
vi.mock('electron', () => ({
  app: { on: vi.fn(), getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: ipcHandle },
}))

const { dispatch } = await import('../registry')
const handlers = (await import('./packs')).default
const { resetSettingsCache, updateSettings } = await import('../../settings/store')
const { jobs } = await import('../../jobs/manager')

async function call<T = unknown>(channel: string, req?: unknown): Promise<T> {
  const res = await dispatch(handlers, channel, req)
  if (!res.ok) throw Object.assign(new Error(res.error.message), { code: res.error.code })
  return res.data as T
}

let server: TestServer
const archive = randomBytes(64 * 1024)
beforeAll(async () => {
  server = await startServer()
  server.route('/p.aspack', bytes(archive))
  server.route('/slow.aspack', stall(archive.subarray(0, 512)))
  server.route(
    '/index.json',
    json(
      catalogBody([
        catalogEntry({
          url: server.url('/p.aspack'),
          size: archive.length,
          sha256: sha256(archive),
        }),
        catalogEntry({
          version: '1.0.1',
          url: server.url('/p.aspack'),
          size: archive.length,
          sha256: 'c'.repeat(64),
        }),
        catalogEntry({ version: '2.0.0', url: server.url('/slow.aspack'), size: archive.length }),
        catalogEntry({ id: 'BAD' }),
      ]),
    ),
  )
})
afterAll(() => server.close())
beforeEach(() => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
})

describe('packs catalog channels', () => {
  it('add, list, refresh, read cached entries, remove', async () => {
    const url = server.url('/index.json')
    expect(await call('packs:catalogs')).toEqual([])
    await call('packs:catalogAdd', { url })
    await expect(call('packs:catalogAdd', { url })).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(await call('packs:catalogEntries')).toEqual([])

    expect(await call('packs:catalogRefresh', {})).toEqual([
      { url, ok: true, entries: 3, skipped: 1 },
    ])
    const [view] =
      await call<{ name: string; entries: unknown[]; skipped: number }[]>('packs:catalogEntries')
    expect(view).toMatchObject({ name: 'Test Catalog', skipped: 1 })
    expect(view!.entries).toHaveLength(3)
    expect(await call('packs:catalogs')).toMatchObject([{ url, name: 'Test Catalog' }])

    expect(await call('packs:catalogRemove', { url })).toEqual([])
    expect(await call('packs:catalogEntries')).toEqual([])
  })

  it('refuses a plain-http catalog off loopback at the request schema', async () => {
    await expect(
      call('packs:catalogAdd', { url: 'http://packs.example.org/index.json' }),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
  })
})

describe('packs:download', () => {
  async function withCatalog(): Promise<string> {
    const url = server.url('/index.json')
    await call('packs:catalogAdd', { url })
    await call('packs:catalogRefresh', { url })
    return url
  }

  it('downloads a catalog entry as a job and returns the staged path', async () => {
    const catalogUrl = await withCatalog()
    const { jobId } = await call<{ jobId: string }>('packs:download', {
      source: 'catalog',
      catalogUrl,
      id: 'org.example.rail',
      version: '1.0.0',
    })
    const job = await jobs.wait(jobId)
    expect(job).toMatchObject({ kind: 'pack-download', status: 'done', progress: 1 })
    const result = job.result as { path: string; sha256: string; catalogUrl: string }
    expect(result.sha256).toBe(sha256(archive))
    expect(result.catalogUrl).toBe(catalogUrl)
    expect(readFileSync(result.path).equals(archive)).toBe(true)
  })

  it('fails the job on a sha256 mismatch with the catalog', async () => {
    const catalogUrl = await withCatalog()
    const { jobId } = await call<{ jobId: string }>('packs:download', {
      source: 'catalog',
      catalogUrl,
      id: 'org.example.rail',
      version: '1.0.1',
    })
    const job = await jobs.wait(jobId)
    expect(job.status).toBe('error')
    expect(job.error).toMatch(/does not match the expected sha256/)
  })

  it('cancels through jobs:cancel', async () => {
    const catalogUrl = await withCatalog()
    const { jobId } = await call<{ jobId: string }>('packs:download', {
      source: 'catalog',
      catalogUrl,
      id: 'org.example.rail',
      version: '2.0.0',
    })
    await vi.waitFor(() => expect(jobs.get(jobId).status).toBe('running'))
    await new Promise((r) => setTimeout(r, 50))
    jobs.cancel(jobId)
    expect((await jobs.wait(jobId)).status).toBe('cancelled')
  })

  it('refuses entries that are not in an added catalog, before any job starts', async () => {
    await expect(
      call('packs:download', {
        source: 'catalog',
        catalogUrl: server.url('/index.json'),
        id: 'org.example.rail',
        version: '1.0.0',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    const catalogUrl = await withCatalog()
    await expect(
      call('packs:download', {
        source: 'catalog',
        catalogUrl,
        id: 'org.example.x',
        version: '9.9.9',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('Install from URL takes an optional sha256', async () => {
    const { jobId } = await call<{ jobId: string }>('packs:download', {
      source: 'url',
      url: server.url('/p.aspack'),
    })
    const job = await jobs.wait(jobId)
    expect((job.result as { sha256: string }).sha256).toBe(sha256(archive))
    const bad = await call<{ jobId: string }>('packs:download', {
      source: 'url',
      url: server.url('/p.aspack'),
      sha256: 'd'.repeat(64),
    })
    expect((await jobs.wait(bad.jobId)).status).toBe('error')
  })
})

describe('no network at startup', () => {
  it('registering IPC with catalogs configured fetches nothing', async () => {
    await updateSettings((s) => {
      s.packs.catalogs = [
        { url: 'https://actionstations.ai/packs/index.json', addedAt: new Date().toISOString() },
        { url: server.url('/index.json'), addedAt: new Date().toISOString() },
      ]
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const httpSpy = vi.spyOn(http, 'request')
    const httpsSpy = vi.spyOn(https, 'request')
    const hitsBefore = server.hits.length

    const { registerIpc, handlers: all } = await import('../index')
    registerIpc(() => true)
    expect(ipcHandle).toHaveBeenCalledWith('packs:catalogRefresh', expect.any(Function))
    expect(all['packs:catalogRefresh']).toBeDefined()
    // Reading settings and the cached catalogs is fine; neither touches the network.
    await call('packs:catalogs')
    await call('packs:catalogEntries')
    await new Promise((r) => setTimeout(r, 100))

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(httpSpy).not.toHaveBeenCalled()
    expect(httpsSpy).not.toHaveBeenCalled()
    expect(server.hits.length).toBe(hitsBefore)
    expect(existsSync(join(process.env.TTX_USER_DATA!, 'packs', 'catalogs'))).toBe(false)
    fetchSpy.mockRestore()
    httpSpy.mockRestore()
    httpsSpy.mockRestore()
  })
})
