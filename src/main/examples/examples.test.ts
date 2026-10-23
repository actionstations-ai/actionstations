import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import type { Channel, ChannelRequest, ChannelResponse } from '@shared/ipc'

const documentsDir = mkdtempSync(join(tmpdir(), 'ttx-docs-'))
vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.0.1',
    getPath: (name: string) => (name === 'documents' ? documentsDir : tmpdir()),
  },
  BrowserWindow: { getAllWindows: () => [] },
}))
const rebuildIndex = vi.fn(async () => ({ id: 'job-rebuild' }))
vi.mock('../ingest/pipeline', () => ({ rebuildIndex }))

const { dispatch } = await import('../ipc/registry')
const { default: handlers } = await import('../ipc/handlers/examples')
const { default: projectHandlers } = await import('../ipc/handlers/project')
const { resetSettingsCache, updateSettings } = await import('../settings/store')
const { claimFolder, shouldCopy } = await import('./open')

const FIXTURES = resolve('tests/fixtures/examples')

async function invoke<C extends Channel>(
  channel: C,
  req: ChannelRequest<C>,
): Promise<ChannelResponse<C>> {
  const all = { ...handlers, ...projectHandlers }
  const r = await dispatch(all, channel, req)
  if (!r.ok) throw Object.assign(new Error(r.error.message), { code: r.error.code })
  return r.data as ChannelResponse<C>
}

describe('example projects', () => {
  let parent: string
  beforeEach(() => {
    parent = mkdtempSync(join(tmpdir(), 'ttx-ex-'))
    process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
    process.env.TTX_EXAMPLES_DIR = FIXTURES
    resetSettingsCache()
    rebuildIndex.mockClear()
  })

  it('lists valid examples and skips folders whose manifest does not validate', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const list = await invoke('examples:list', undefined)
    expect(list.map((e) => e.slug)).toEqual(['mini-transit'])
    expect(list[0]).toMatchObject({ domainProfile: 'transit', fictional: true })
    expect(list[0]?.scenarios[0]?.threatFamily).toBe('cyber_physical')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('skipping broken'))
    warn.mockRestore()
  })

  it('returns an empty list when the examples folder is missing', async () => {
    process.env.TTX_EXAMPLES_DIR = join(parent, 'nope')
    expect(await invoke('examples:list', undefined)).toEqual([])
  })

  it('copies the project, writes the marker, gives it a new id and rebuilds the index', async () => {
    const opened = await invoke('examples:open', { slug: 'mini-transit', parentDir: parent })
    expect(opened.path).toBe(join(parent, 'Lakeview-Transit-test-fixture.asproj'))
    expect(opened.project.id).not.toBe('mini-transit-fixture')
    expect(opened.project.name).toBe('Lakeview Transit (fixture)')
    expect(existsSync(join(opened.path, 'documents/doc-ops-plan/text.md'))).toBe(true)
    expect(rebuildIndex).toHaveBeenCalledWith(opened.path)
    const marker = await invoke('examples:marker', { projectPath: opened.path })
    expect(marker).toMatchObject({ slug: 'mini-transit', domainProfile: 'transit' })
    expect(marker?.notice).toMatch(/fictional/)
    // The source is untouched.
    expect(existsSync(join(FIXTURES, 'mini-transit/project/.example.json'))).toBe(false)
  })

  it('never overwrites: a second copy gets a numbered folder and name', async () => {
    const taken = join(parent, 'Lakeview-Transit-test-fixture.asproj')
    mkdirSync(taken)
    writeFileSync(join(taken, 'keep.txt'), 'mine')
    const opened = await invoke('examples:open', { slug: 'mini-transit', parentDir: parent })
    expect(opened.path).toBe(join(parent, 'Lakeview-Transit-test-fixture-2.asproj'))
    expect(opened.project.name).toBe('Lakeview Transit (fixture) (2)')
    expect(readFileSync(join(taken, 'keep.txt'), 'utf8')).toBe('mine')
    expect(existsSync(join(taken, 'project.json'))).toBe(false)
  })

  it('defaults to the projects folder from Settings', async () => {
    await updateSettings((s) => {
      s.defaultProjectsDir = parent
    })
    const opened = await invoke('examples:open', { slug: 'mini-transit' })
    expect(opened.path.startsWith(parent)).toBe(true)
  })

  it('falls back to Documents/Action Stations', async () => {
    const opened = await invoke('examples:open', { slug: 'mini-transit' })
    expect(opened.path.startsWith(join(documentsDir, 'Action Stations') + sep)).toBe(true)
    expect(opened.path.endsWith('.asproj')).toBe(true)
  })

  it('keeps using the pre-rename projects folder while it was not moved (#277)', async () => {
    const home = mkdtempSync(join(tmpdir(), 'ttx-home-'))
    mkdirSync(join(home, 'Documents', 'Tabletop Generator'), { recursive: true })
    process.env.TTX_TEST_HOME = home
    try {
      const opened = await invoke('examples:open', { slug: 'mini-transit' })
      expect(opened.path.startsWith(join(home, 'Documents', 'Tabletop Generator') + sep)).toBe(true)
    } finally {
      delete process.env.TTX_TEST_HOME
    }
  })

  it('refuses slugs that are not plain folder names', async () => {
    for (const slug of ['../mini-transit', 'mini-transit/../..', '.hidden']) {
      await expect(invoke('examples:open', { slug, parentDir: parent })).rejects.toMatchObject({
        code: 'VALIDATION',
      })
    }
    await expect(
      invoke('examples:open', { slug: 'does-not-exist', parentDir: parent }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('skips derived data and symlinks when copying', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ttx-exsrc-'))
    cpSync(join(FIXTURES, 'mini-transit'), join(dir, 'mini-transit'), { recursive: true })
    const src = join(dir, 'mini-transit/project')
    writeFileSync(join(src, 'index.sqlite'), 'stale')
    mkdirSync(join(src, '.cache'))
    symlinkSync('/etc/hosts', join(src, 'hosts-link'))
    expect(await shouldCopy(src, join(src, 'index.sqlite'))).toBe(false)
    expect(await shouldCopy(src, join(src, 'hosts-link'))).toBe(false)
    process.env.TTX_EXAMPLES_DIR = dir
    const opened = await invoke('examples:open', { slug: 'mini-transit', parentDir: parent })
    expect(existsSync(join(opened.path, 'index.sqlite'))).toBe(false)
    expect(existsSync(join(opened.path, '.cache'))).toBe(false)
    expect(existsSync(join(opened.path, 'hosts-link'))).toBe(false)
  })

  it('claims numbered folders in order', async () => {
    const a = await claimFolder(parent, 'Same Name')
    const b = await claimFolder(parent, 'Same Name')
    expect([a.n, b.n]).toEqual([1, 2])
  })

  it('returns null for the marker of an ordinary project', async () => {
    const { path } = await invoke('project:create', { parentDir: parent, name: 'Plain' })
    expect(await invoke('examples:marker', { projectPath: path })).toBeNull()
    expect(rebuildIndex).not.toHaveBeenCalled()
  })

  it('rebuilds the index when an indexed project is opened without index.sqlite', async () => {
    const opened = await invoke('examples:open', { slug: 'mini-transit', parentDir: parent })
    rebuildIndex.mockClear()
    await invoke('project:open', { path: opened.path })
    expect(rebuildIndex).toHaveBeenCalledTimes(1)
    writeFileSync(join(opened.path, 'index.sqlite'), '')
    rebuildIndex.mockClear()
    await invoke('project:open', { path: opened.path })
    expect(rebuildIndex).not.toHaveBeenCalled()
  })
})
